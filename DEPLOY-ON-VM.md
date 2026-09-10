# Publishing the portal on the VM

How to stop running `npm run start:live` and have Trade Octane served as a real
application that survives a reboot and that other people can open.

`npm run start:live` is a **development server**. It recompiles on every keystroke, serves
unminified code, binds only to that logged-in desktop session, and dies when the terminal
closes or the RDP session ends. It is not a way to host anything.

---

## What actually gets deployed

An Angular production build is **static files** — HTML, JS, CSS, images. There is no Node
process, no service, nothing to keep running. Node is needed to *build*, never to *serve*.

That makes the whole job:

1. run the build,
2. copy the output folder onto the web server,
3. tell IIS about it.

IIS is already on the VM hosting both the legacy app and the API, so it is the obvious
place to put this. Nothing new needs installing except one IIS module.

---

## The one decision: where it sits relative to the API

This matters more than anything else, because of one line in `environment.prod.ts`:

```ts
apiBase: '',
```

Empty means **same-origin** — the app asks for `/api/v1/...` on whatever host it was
served from. Get the hosting shape right and that keeps working with no code change, no
CORS, and no API modification. Get it wrong and you are editing backend configuration to
allow a cross-origin caller, which is avoidable work and a wider security surface.

Recall how the VM is laid out (from `RUN-ON-VM.md`):

| Site | Physical path | Binding | What it is |
|---|---|---|---|
| `Default Web Site` | `C:\inetpub\wwwroot` | `*:80` | the legacy ASP.NET Web Forms app |
| `TradeOctaneWebAPI` | `C:\inetpub\wwwroot\TradeWebAPI` | `10.10.30.17:443` | the API, at the site root |

### Recommended: a sub-application under the API site

Put the portal at `https://10.10.30.17/portal`. The API stays at
`https://10.10.30.17/api/v1/...`. Same scheme, same host, same port — **same origin**.

- The browser sends the auth header without a preflight.
- The API needs no CORS policy and no redeployment.
- `apiBase: ''` is already correct.
- IIS routes `/portal` to the child application *before* the API's catch-all handler sees
  it, so the two do not fight.

The cost is one build flag (`--base-href /portal/`), which `npm run build:vm` already
carries.

### The alternative, if the API site is off limits

A separate IIS site for the portal, with **URL Rewrite + Application Request Routing**
reverse-proxying `/api/*` through to the API site. The browser still sees one origin, so
`apiBase` still stays empty and CORS is still not needed — but it adds a proxy hop and
requires installing ARR. Sketched at the end of this document.

**What not to do:** host the portal on its own port and point `apiBase` at
`https://10.10.30.17`. That is cross-origin. It forces a CORS policy onto the API, a
preflight on every authenticated call, and it is the shape most likely to work in testing
and fail the moment credentials or custom headers are involved.

---

## Prerequisites on the VM

### 1. IIS URL Rewrite module — required, and not installed by default

This is the single most common way this deployment fails. Angular is a single-page app:
`/portal/admin/users/jdoe` is a route that exists only in the browser. On the server the
only real file is `index.html`. Without a rewrite rule, IIS looks for a folder called
`admin`, does not find it, and returns **404 on every page refresh and every shared link**
— while the app itself appears to work fine until someone presses F5.

`public/web.config` in this repo contains the rule. It needs the module to interpret it.

Check whether it is already there:

```powershell
Get-WebGlobalModule | Where-Object Name -like '*Rewrite*'
```

Empty output means it is missing. Install it from
<https://www.iis.net/downloads/microsoft/url-rewrite> (`rewrite_amd64_en-US.msi`), or:

```powershell
winget install Microsoft.IIS.URLRewrite
```

Then `iisreset`.

> If the module is missing and the `web.config` is deployed anyway, IIS answers **HTTP
> 500.19** for the whole application, not a helpful message about a missing module.
> A 500.19 immediately after deploying is nearly always this.

### 2. Static Content feature

Usually already enabled, but a hardened Windows Server image sometimes omits it, and the
symptom is a 404 for every `.js` file while `index.html` loads fine:

```powershell
Get-WindowsFeature Web-Static-Content
```

Install with `Install-WindowsFeature Web-Static-Content` if `Install State` is `Available`.

### 3. Node — only to build

Node is already on the VM (you have been running `npm run start:live`). It plays no part in
serving. If you ever build elsewhere and copy the output across, the VM does not need Node
at all.

---

## Deploying

### Step 1 — build

On the VM, in the repo:

```powershell
git pull
npm ci
npm run build:vm
```

`npm ci` rather than `npm install`: it installs exactly the lockfile, so a deployed build
cannot quietly differ from a tested one.

`build:vm` is `ng build --base-href /portal/`. `ng build` defaults to the **production**
configuration — optimised, minified, content-hashed filenames, `useMocks: false`.

Output lands in:

```
dist\trade-octane-frontend\browser\
```

That folder — its whole contents, including `web.config` — is what gets deployed.

> **Run this in PowerShell, not Git Bash.** Git Bash rewrites anything that looks like a
> Unix path, so `--base-href /portal/` silently becomes
> `--base-href C:/Program Files/Git/portal/`, and every script tag in the deployed
> `index.html` points at a directory that does not exist. Always check the result:
>
> ```powershell
> Select-String -Path dist\trade-octane-frontend\browser\index.html -Pattern '<base href'
> ```
>
> It must read `<base href="/portal/">`. (If you must use Git Bash, prefix the command with
> `MSYS_NO_PATHCONV=1`.)

### Step 2 — put the files somewhere IIS can read

Deploy **beside** the API's folder, not inside it — a child application nested in the
parent's physical directory invites the parent's `web.config` to apply to it.

```powershell
$target = 'C:\inetpub\TradeOctanePortal'
New-Item -ItemType Directory -Force $target | Out-Null

# Wipe first. Old content-hashed bundles from a previous release are dead weight, and a
# stale index.html is worse than no index.html.
Remove-Item "$target\*" -Recurse -Force -ErrorAction SilentlyContinue

Copy-Item 'dist\trade-octane-frontend\browser\*' $target -Recurse -Force
```

Confirm `web.config` made it — the copy is the step where it gets missed:

```powershell
Test-Path "$target\web.config"   # must be True
```

### Step 3 — create the IIS application

Once only. A dedicated app pool with **no managed code** (this is static content; there is
no .NET runtime to load):

```powershell
Import-Module WebAdministration

New-WebAppPool -Name 'TradeOctanePortal'
Set-ItemProperty 'IIS:\AppPools\TradeOctanePortal' -Name managedRuntimeVersion -Value ''

New-WebApplication -Site 'TradeOctaneWebAPI' `
                   -Name 'portal' `
                   -PhysicalPath 'C:\inetpub\TradeOctanePortal' `
                   -ApplicationPool 'TradeOctanePortal'
```

Grant the pool identity read access:

```powershell
icacls 'C:\inetpub\TradeOctanePortal' /grant 'IIS AppPool\TradeOctanePortal:(OI)(CI)(RX)' /T
```

### Step 4 — verify

From the VM's own browser: **<https://10.10.30.17/portal/>**

Work through all four, in order — each one fails differently:

1. **The app loads and you can sign in.** If sign-in fails, the API is not being reached;
   check the Network tab for the `/api/v1/identity/login_old` call and confirm its URL is
   `https://10.10.30.17/api/v1/...` with no `/portal` in it.
2. **No amber `MOCK DATA` badge in the top bar.** If it is there, the build picked up the
   development environment file. Rebuild with `npm run build:vm`.
3. **Navigate to a user, then press F5.** This is the URL Rewrite test. A 404 here means
   the rewrite is not working — the app itself is fine.
4. **Open `https://10.10.30.17/portal/admin/users` in a fresh tab.** Deep links are how
   people share screens with each other; this is the same test from a cold start.

---

## Redeploying a change

Steps 1 and 2 only. IIS picks up new static files immediately — no `iisreset`, no app pool
recycle.

```powershell
git pull
npm ci
npm run build:vm
Remove-Item 'C:\inetpub\TradeOctanePortal\*' -Recurse -Force
Copy-Item 'dist\trade-octane-frontend\browser\*' 'C:\inetpub\TradeOctanePortal' -Recurse -Force
```

Users do not need to clear their cache. `web.config` marks `index.html` as uncacheable, and
every JS and CSS file carries a content hash in its name, so a new release is fetched
whether or not the browser wanted to.

---

## Things that will come up

### The certificate warning

The API's HTTPS binding almost certainly uses a self-signed certificate — that is why the
dev proxy sets `secure: false` and why `curl` needs `-k`. Serving the portal from the same
site means **every user gets a browser warning and has to click through it** before the app
loads.

Tolerable for a demo. Not tolerable for UAT, where it trains people to dismiss certificate
warnings. Fix it properly by issuing a certificate from the internal CA for the name people
will actually type, and binding that. Worth raising with whoever runs the domain before UAT
rather than after.

### HTTP 500.19 right after deploying

Two causes, in order of likelihood:

1. **URL Rewrite is not installed.** See prerequisites above.
2. **The API's `web.config` is leaking into the child application.** IIS applies a parent
   `web.config` to child applications unless told not to. If the API's config is not
   wrapped in `<location path="." inheritInChildApplications="false">`, its ASP.NET Core
   handler is inherited by `/portal`, which then tries to hand static files to a .NET
   runtime that is not there.

   Current `dotnet publish` emits that wrapper automatically, so this is likelier on an
   older or hand-edited config. Check `C:\inetpub\wwwroot\TradeWebAPI\web.config` — if
   `<system.webServer>` is not inside a `<location path="." inheritInChildApplications="false">`
   element, that is the bug. **That file belongs to the API team — ask Zeeshan rather than
   editing it**, since a mistake there takes the API down, not just the portal.

### A blank page with 404s for the JS files

The base href is wrong. Check `index.html` as in Step 1 — it must be `/portal/`, matching
the application name in IIS exactly, with the trailing slash. Deploying a `/portal/` build
to an application named `/Portal` will also do this on some configurations.

### The app loads but every API call 404s

The portal is reaching IIS but the API is not where the app expects. Confirm the API
independently, from the VM:

```powershell
curl.exe -k https://10.10.30.17/api/v1/identity/login/sso
```

If that works and the app's calls do not, compare the failing request's URL in the Network
tab against it. `RUN-ON-VM.md` has the full diagnosis for a mis-mounted API base, including
what `Handler: StaticFile` means in an IIS error page.

### It works for you and not for a colleague

Check the binding actually accepts their traffic:

```powershell
Get-Website | Select-Object Name, State, @{n='Bindings';e={$_.bindings.Collection -join ', '}}
Get-NetFirewallRule -DisplayGroup 'World Wide Web Services' | Select-Object DisplayName, Enabled
```

The API site is bound to `10.10.30.17:443` specifically, not `*:443`, so it answers on that
address only. Anyone reaching the VM by a different name or address will not get through.

---

## What this deployment deliberately does not include

Stated so nobody assumes otherwise:

- **No CI/CD.** Deployment is the manual sequence above. Fine for UAT; worth automating
  before there are multiple environments to keep in step.
- **No health check or uptime monitoring.** IIS serves static files; there is no process to
  crash, but there is also nothing watching that the site is up.
- **No environment separation.** There is one `environment.prod.ts` and it assumes
  same-origin. A second environment on a different host needs a build-time configuration,
  not a runtime switch.
- **No `<meta http-equiv="Content-Security-Policy">`.** Worth adding before this faces
  anything wider than UAT, but it needs testing against PrimeNG's inline styles rather than
  being pasted in blind.

---

## Appendix: the separate-site shape

Only if the portal cannot be an application under the API site.

Install **URL Rewrite** *and* **Application Request Routing**
(<https://www.iis.net/downloads/microsoft/application-request-routing>), then enable
proxying at the server level — this is a global switch and is off by default:

```powershell
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
  -Filter 'system.webServer/proxy' -Name 'enabled' -Value 'True'
```

Create a site for the portal on its own binding, deploy the build to it, and build with
`ng build` (no `--base-href`, since it is now at a site root). Then add a rule *above* the
Angular deep-link rule that forwards API traffic to the API site:

```xml
<rule name="Proxy API" stopProcessing="true">
  <match url="^api/(.*)" />
  <action type="Rewrite" url="https://10.10.30.17/api/{R:1}" />
</rule>
```

The browser still sees a single origin, so `apiBase` stays empty and the API still needs no
CORS policy. The trade-offs against the sub-application shape: an extra network hop per
call, a second place where a URL can be wrong, and ARR's own certificate validation to deal
with while the API's certificate is self-signed.
