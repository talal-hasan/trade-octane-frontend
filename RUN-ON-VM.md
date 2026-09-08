# Running the frontend against the live API on the VM

## Why this exists

The API lives on the VM at `10.10.30.17` (IIS, port 80). A developer laptop **cannot reach
that address at all** — and the reason is worth understanding, because it looks like a
firewall problem and is not.

`10.10.30.17` is the VM's *internal* address, valid only inside the remote network.
Remote Desktop does not reach it directly: it connects to a **public NAT gateway on a
single forwarded port**, which the gateway maps to the VM's RDP. Confirmed by inspecting
the live `mstsc` connection — the established socket goes to a public IP, not to
`10.10.30.17:3389`.

Consequences:

- The laptop's routing table has **no entry for `10.10.30.0/24`**, so every packet to the
  VM's internal address is dropped.
- Only the one RDP port is forwarded on the gateway. Common HTTP ports (80, 443, 8080,
  8000, 5001, 5002) were probed and none are open.
- Therefore the dev-server proxy (`proxy.conf.js`) **cannot** reach the API from a laptop,
  and no amount of Windows Firewall configuration on the VM changes that.

Two ways forward:

1. **Run the frontend on the VM** — everything below. Works today, no permission needed.
2. **Ask for a second port forward on the gateway** (see the end of this document). Better
   developer loop, but needs whoever administers that gateway.

Re-test at any time:

```powershell
Test-NetConnection -ComputerName 10.10.30.17 -Port 80
```

`TcpTestSucceeded : True` means a route now exists and you can develop on the laptop
instead, with `$env:TO_API_TARGET='http://10.10.30.17'; npm run start:live`.

> **Note on network details.** The gateway's public address and forwarded port are
> deliberately not written down here. This repository is shared, and a public IP paired
> with "this port is RDP" is reconnaissance material. Read them off your own live
> connection when needed:
> `Get-NetTCPConnection -OwningProcess (Get-Process mstsc).Id`

---

## One-time setup on the VM

### 1. Node

Angular 21 requires **Node 20.19+**, 22.12+ or 24+. Check, and install if needed:

```powershell
node -v
```

If it is missing or too old, install the current LTS from https://nodejs.org (or
`winget install OpenJS.NodeJS.LTS`). A VM without outbound internet needs the MSI copied
across.

### 2. Get the code

```powershell
git clone https://github.com/talal-hasan/trade-octane-frontend.git
cd trade-octane-frontend
git checkout feature/phase-1-flows
npm ci
```

`npm ci` (not `npm install`) — it installs exactly the lockfile, so the VM cannot silently
drift to different dependency versions from the laptop.

If the VM has no internet access, `npm ci` will fail. In that case zip the project
**including `node_modules`** on the laptop and copy it over; the tree is
platform-independent apart from optional native binaries, and Angular's toolchain here is
pure JS plus esbuild, which ships prebuilt per platform. If esbuild complains about its
binary, run `npm rebuild esbuild` on the VM.

---

## Running it

```powershell
$env:TO_API_TARGET = 'http://localhost'
npm run start:live
```

Then open **http://localhost:4200** in the VM's own browser.

- `TO_API_TARGET` is the **origin only** — no `/api/v1`, no `/swagger`. The API is on port
  80, so no port is needed in the URL.
- If IIS uses host-header bindings, `http://localhost` may not match a site. Use
  `http://10.10.30.17` instead.
- `start:live` selects `environment.live.ts` (`useMocks: false`), so the app talks to the
  real API rather than the captured fixtures. Plain `npm start` stays on mocks.

### Verify the API before blaming the app

```powershell
curl.exe http://localhost/api/v1/identity/login/sso
```

Expect `{"enabled":true}` or `{"enabled":false}`. A 404 means the API is hosted under a
path prefix and `ApiClient`'s base needs adjusting. A connection error means IIS is not
serving on that binding.

---

## Alternative: serve the built app from the same IIS site

Better for a demo, and closer to how this eventually deploys. Same-origin, so no proxy and
no CORS at all:

```powershell
npm run build          # writes dist/trade-octane-frontend/browser
```

Copy `dist/trade-octane-frontend/browser/*` into a sub-application of the existing IIS
site (for example `/portal`), then:

- Set `environment.prod.ts` → `apiBase: ''` (already the case) so requests go to
  `/api/v1/...` on the same origin.
- Add a URL Rewrite rule so deep links (`/portal/admin/users/jdoe`) fall back to
  `index.html` — without it, refreshing any route returns an IIS 404. Angular is a
  single-page app; IIS has to serve `index.html` for anything that is not a real file.
- If the app is served from a sub-path rather than the site root, rebuild with
  `--base-href /portal/`.

No hot reload, so this is for demonstrating, not developing.

---

## The better fix: one more port forward

The gateway already forwards a public port to the VM's RDP. Adding a second forward to the
VM's **port 80** would let the whole team develop from their laptops with hot reload,
against live data, with no RDP in the loop.

The ask, for whoever administers the gateway:

> Please forward one additional public TCP port to `10.10.30.17:80` (the Trade Octane API
> on IIS). Any spare port is fine. This is for frontend development against the live API;
> it exposes the same Swagger endpoint already reachable from inside the network.

Worth raising the security trade-off honestly when asking: this publishes the API to the
internet on that port. Reasonable mitigations, in order of preference:

- **Source-IP restriction** on the forward, to the office egress address. Best option —
  keeps the benefit, removes the exposure.
- **A VPN route** to `10.10.30.0/24` instead of a NAT forward. Cleanest of all, and it
  makes `10.10.30.17` work directly with no port juggling.
- If neither is available, running on the VM (above) stays the safe default.

Once a forward exists:

```powershell
$env:TO_API_TARGET = 'http://<gateway-ip>:<new-port>'
npm run start:live
```

Nothing else changes. `proxy.conf.js` and the `live` configuration already handle it, and
because the dev server proxies same-origin, **the API does not need CORS changes** for
this to work.
