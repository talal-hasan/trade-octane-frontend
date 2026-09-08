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
npm run start:live
```

Then open **http://localhost:4200** in the VM's own browser.

**Use `start:live`, not `start`.** This is the one thing that catches people:

| Command | Data source | Top bar |
|---|---|---|
| `npm start` | `public/assets/response_menu.json` and the other mock services | shows **MOCK DATA** |
| `npm run start:live` | the real API at `http://10.10.30.17` | no badge |

If you see the amber **MOCK DATA** badge in the top bar, you are on `npm start` — stop the
server and rerun with `start:live`. Nothing else distinguishes the two at a glance, because
the mock deliberately serves a *real* captured menu payload.

The dev server prints its backend on startup, so you can confirm without guessing:

```
[proxy] /api/* -> http://10.10.30.17
```

The target defaults to `http://10.10.30.17/TradeOctane` (see `proxy.conf.js`); override it
with `$env:TO_API_TARGET` only if the API moves.

**The `/TradeOctane` suffix is deliberate.** The API is an IIS sub-application, not the site
root, so `http://10.10.30.17/api/v1/...` returns a 404 from IIS. The proxy prepends the
prefix; never put `/api/v1` or `/swagger` in the target yourself.

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

---

## Troubleshooting: "the Network tab shows localhost:4200, not the VM"

That is correct and expected. The **browser** always talks to `localhost:4200`; the **dev
server** forwards to the API server-side, where the browser cannot see it. The invisibility
is the point — it is what makes every call same-origin and removes the CORS requirement.

To prove a response really came from the VM, look at the **response headers** of the failing
call:

```
Server:       Microsoft-IIS/10.0
X-Powered-By: ASP.NET
```

The Angular dev server is Node/Vite and can never emit those. If you see them, the request
reached IIS and IIS produced the answer — including if that answer was a 404.

## Troubleshooting: 404 on `/api/v1/...` from IIS

The proxy is reaching IIS, but the API is not at the path we are asking for. The OpenAPI
document declares no `servers` block and its paths start at `/api/v1/...`, so it assumes the
API is at the **root** of its host. If IIS 404s, the API is almost certainly hosted in a
**virtual directory or sub-application** instead.

Find the real base. On the VM:

```powershell
foreach ($p in '/api/v1/identity/login/sso','/swagger/index.html','/swagger/v1/swagger.json') {
  $u = "http://10.10.30.17$p"
  try   { "$((Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 10).StatusCode)  $u" }
  catch { "$($_.Exception.Response.StatusCode.value__)  $u" }
}
```

If you have IIS rights, this answers it outright:

```powershell
Import-Module WebAdministration
Get-Website     | Select-Object Name, State, @{n='Bindings';e={$_.bindings.Collection -join ', '}}
Get-WebApplication | Select-Object Path, ApplicationPool, PhysicalPath
```

A `Path` such as `/TradeOctaneApi` means the API lives under that prefix, and the real
endpoint is `http://10.10.30.17/TradeOctaneApi/api/v1/identity/login_old`.

**The fix is the proxy target, not the code.** `http-proxy` prepends a path on the target,
so point it at the sub-application:

```powershell
$env:TO_API_TARGET = 'http://10.10.30.17/TradeOctaneApi'
npm run start:live
```

`ApiClient` keeps requesting `/api/v1/...` and the proxy prepends the prefix. Nothing in the
application needs to know.

Also worth reading the Swagger page's own base: open `http://10.10.30.17/swagger/` on the
VM, and in DevTools → Network find the request for `swagger.json`. Its URL shows the prefix
the API is really mounted under.
