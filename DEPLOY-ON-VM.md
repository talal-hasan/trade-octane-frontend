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
dist\trade-octane-frontend\
├── browser\                  ←  THIS folder's CONTENTS are the deployable
│   ├── index.html
│   ├── web.config
│   ├── assets\  media\  chunk-*.js  ...
├── 3rdpartylicenses.txt      ←  build metadata, do not deploy
└── prerendered-routes.json   ←  build metadata, do not deploy
```

**Deploy the contents of `browser\`, not the folder above it.** Copying
`dist\trade-octane-frontend\*` puts `index.html` and `web.config` one level too deep, and
IIS — pointed at a directory containing only a `browser` folder — answers
[403.14](#http-error-40314--forbidden-on-the-application-root). It is the single easiest
mistake to make here, because the wrong folder looks plausible in Explorer.

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

Deploy to a folder of its own, **outside `C:\inetpub\wwwroot`**:

```
C:\inetpub\TradeOctanePortal
```

Two concrete reasons, neither of them about config inheritance:

1. **`C:\inetpub\wwwroot` is the legacy site's document root.** Anything placed there is
   also served by `Default Web Site` on port 80. A copy at
   `C:\inetpub\wwwroot\TradeOctanePortal` is therefore reachable at
   `http://10.10.30.17/TradeOctanePortal/` as plain static files — a second, subtly broken
   instance of the app: no SPA rewrite, so deep links 404, and a different origin from the
   API, so every call fails CORS. It looks like the portal and behaves like a bug report.
2. **An API redeployment can delete it.** If the portal sits inside the API's own folder, a
   `dotnet publish` or a "clean the target directory" copy takes the portal with it.

> **Correcting something stated in an earlier revision of this document:** the reason is
> *not* that physical nesting causes the parent's `web.config` to apply. IIS merges
> configuration along the **virtual** path — site → application → virtual directory — so
> the API site's root `web.config` applies to a `/portal` child application wherever its
> files physically live. That inheritance is real, and it is the
> [500.19 case](#http-50019-right-after-deploying), but moving folders does not affect it.

If access rights on the VM only permit writing inside `wwwroot`, deploying there does work
— the application is still created under the API's site and is still same-origin at
`/portal`. Just know that the port-80 duplicate exists, and prefer moving it when rights
allow:

```powershell
Move-Item 'C:\inetpub\wwwroot\TradeOctanePortal' 'C:\inetpub\TradeOctanePortal'
```

Substitute your actual folder for `$target` below and everywhere it appears in Step 3.

```powershell
$target = 'C:\inetpub\TradeOctanePortal'
New-Item -ItemType Directory -Force $target | Out-Null

# Wipe first. Old content-hashed bundles from a previous release are dead weight, and a
# stale index.html is worse than no index.html.
Remove-Item "$target\*" -Recurse -Force -ErrorAction SilentlyContinue

Copy-Item 'dist\trade-octane-frontend\browser\*' $target -Recurse -Force
```

Confirm the copy landed at the right level. **Both must be `True`**, and they are only
`True` when the contents of `browser\` — rather than its parent — were copied:

```powershell
Test-Path "$target\index.html"   # must be True
Test-Path "$target\web.config"   # must be True
Test-Path "$target\browser"      # must be False — if True, you copied one level too high
```

To correct a copy that went in one level too deep, without rebuilding:

```powershell
Move-Item "$target\browser\*" $target -Force
Remove-Item "$target\browser" -Recurse -Force
Remove-Item "$target\3rdpartylicenses.txt", "$target\prerendered-routes.json" `
            -Force -ErrorAction SilentlyContinue
```

### Step 3 — create the IIS application

Once only. Two objects: an **application pool** (the process identity and settings) and an
**application** (the URL-to-folder mapping). Do them in that order — the application form
asks for a pool that must already exist.

Either route below produces the same result. Both need **administrator rights on the VM**.
If you do not have them, this step belongs to whoever administers the machine; nothing here
can work around it.

<details open>
<summary><b>Route A — IIS Manager (the GUI)</b></summary>

#### Open IIS Manager elevated

Press <kbd>Win</kbd>+<kbd>R</kbd>, type `inetmgr`, and press
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> to launch it as administrator. (Or Start
menu → type "IIS" → right-click *Internet Information Services (IIS) Manager* → **Run as
administrator**.)

Opening it without elevation is a trap worth naming: it starts normally and shows the tree,
but the *Add Application* and *Add Application Pool* commands are missing or fail on save.
If those commands are absent, you are not elevated.

#### Confirm URL Rewrite is installed

In the left-hand **Connections** pane, click the **server node** — the top entry, named
after the machine. The middle **Features View** pane should contain a **URL Rewrite** icon.

No icon means the module is missing, and the application will answer **HTTP 500.19** for
every request once `web.config` is in place. Install it before continuing — see
[Prerequisites](#1-iis-url-rewrite-module--required-and-not-installed-by-default). After
installing, close and reopen IIS Manager; the icon does not appear in a running instance.

#### Create the application pool

1. In **Connections**, expand the server node and click **Application Pools**.
2. In the right-hand **Actions** pane, click **Add Application Pool…**.
3. Fill the dialog:
   - **Name:** `TradeOctanePortal`
   - **.NET CLR version:** **No Managed Code**
   - **Managed pipeline mode:** `Integrated`
   - **Start application pool immediately:** ticked
4. **OK**.

**"No Managed Code" is the setting that matters.** This application is static files — HTML,
JS, CSS. There is no .NET code to run, and loading a CLR to serve static content wastes
memory and invites the parent site's ASP.NET handlers to take an interest in requests that
are none of their business. It is also how the `TradeOctaneWebAPI` pool is configured, and
for the same reason.

The new pool should now be listed with **Status: Started**. If it shows *Stopped*, select it
and click **Start** in the Actions pane.

#### Create the application

1. In **Connections**, expand **Sites**, and find **TradeOctaneWebAPI** — the site bound to
   `10.10.30.17:443`. This is the API's site, and putting the portal inside it is what makes
   the two same-origin.

   > Not `Default Web Site`. That is the legacy ASP.NET Web Forms app on port 80. Deploying
   > there would put the portal on a different origin from the API, which is the shape
   > [described earlier as the one to avoid](#the-one-decision-where-it-sits-relative-to-the-api).

2. **Right-click** the `TradeOctaneWebAPI` site → **Add Application…**.
3. Fill the dialog:
   - **Alias:** `portal`
   - **Application pool:** click **Select…**, choose `TradeOctanePortal`, **OK**
   - **Physical path:** `C:\inetpub\TradeOctanePortal`
     — or wherever Step 2 actually put the files. Use the **…** browse button rather than
     typing it; a path that does not exist is accepted here and fails later as a 404 with
     no obvious cause.
   - **Pass-through authentication:** leave as-is (do not set *Connect as…*)

   **The alias must be exactly `portal`, lower-case.** It becomes the URL segment, and it
   has to match the `--base-href /portal/` the app was built with. An alias of `Portal` will
   work on a case-insensitive path but leaves `index.html` requesting its bundles from
   `/portal/`, which on some configurations does not resolve — a blank page whose cause is
   invisible.

4. Click **Test Settings…**. *Path* and *Authentication* should both show a green tick. An
   amber warning on **Authorization** ("cannot verify access to path") is normal with
   pass-through authentication and is resolved by the permissions step below.
5. **OK**.

`portal` now appears under the site with a globe-and-gear icon, which is IIS's marker for an
application as opposed to a plain virtual directory.

#### Grant the pool read access to the folder

The application pool runs as a virtual account, `IIS AppPool\TradeOctanePortal`, which must
be able to read the deployed files.

1. Open **File Explorer** at `C:\inetpub`.
2. Right-click the **TradeOctanePortal** folder → **Properties** → **Security** tab.
3. **Edit…** → **Add…**.
4. **Click *Locations…* first and select the local computer** — the machine's own name, not
   the domain. This is the step people miss: on a domain-joined VM the picker defaults to
   the domain, where an IIS virtual account does not exist, and the name will not resolve no
   matter how correctly it is typed.
5. In the name box type:

   ```
   IIS AppPool\TradeOctanePortal
   ```

   Click **Check Names**. It should resolve and underline as `TradeOctanePortal`. If it does
   not, the pool was not created, or its name differs — check the spelling against Step 3.
6. **OK**. With the new entry selected, ensure **Read & execute**, **List folder contents**
   and **Read** are ticked under *Allow*. Leave *Write* and *Modify* unticked — the web
   server has no business writing to its own content.
7. **OK** → **OK**.

> This may already be satisfied by inheritance: `C:\inetpub` typically grants `IIS_IUSRS`
> read access, which covers the pool identity. Setting it explicitly costs nothing and
> removes a variable if the app later returns **HTTP 401.3** or **500.19 – cannot read
> configuration file**, both of which are this permission.

#### Open it

Right-click the `portal` application → **Manage Application** → **Browse**. IIS opens the
correct URL in the VM's browser, which also confirms the binding it thinks it is serving on.

</details>

<details>
<summary><b>Route B — PowerShell</b></summary>

```powershell
Import-Module WebAdministration

New-WebAppPool -Name 'TradeOctanePortal'
Set-ItemProperty 'IIS:\AppPools\TradeOctanePortal' -Name managedRuntimeVersion -Value ''

New-WebApplication -Site 'TradeOctaneWebAPI' `
                   -Name 'portal' `
                   -PhysicalPath 'C:\inetpub\TradeOctanePortal' `
                   -ApplicationPool 'TradeOctanePortal'

icacls 'C:\inetpub\TradeOctanePortal' /grant 'IIS AppPool\TradeOctanePortal:(OI)(CI)(RX)' /T
```

`managedRuntimeVersion = ''` is how "No Managed Code" is expressed in the API — an empty
string, not the string `'None'`.

Run in an elevated session. If script execution is blocked by policy, these are all cmdlets
rather than a script file, so pasting them into an elevated prompt usually still works;
otherwise use Route A.

</details>

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

### `HTTP Error 403.14 — Forbidden` on the application root

```
Module  DirectoryListingModule   Handler  StaticFile   Error Code  0x00000000
```

IIS found the folder, found **no default document** (`index.html`) in it, and directory
browsing is off — so it refused rather than listing the contents.

This is almost always the `browser\` level: `dist\trade-octane-frontend\*` was copied
instead of `dist\trade-octane-frontend\browser\*`, leaving the real application one folder
deeper than IIS is looking. Check with:

```powershell
Get-ChildItem 'C:\inetpub\TradeOctanePortal' -Name
```

A `browser` entry in that listing confirms it. The fix — moving the contents up a level — is
in [Step 2](#step-2--put-the-files-somewhere-iis-can-read).

**Do not "fix" this by enabling Directory Browsing.** That turns a clear error into a
file listing of the deployment, and still does not serve the app.

Pointing the application's physical path at the `browser` sub-folder also works, but leave
the layout matching Step 2 instead — the redeploy commands, and everyone else following
this document, assume the app is at the folder root.

### `HTTP Error 404.0` with `Handler: StaticFile` on a route like `/login`

The tell is the handler, and it is worth learning to read:

```
Module     IIS Web Core          Handler     StaticFile
Notification MapRequestHandler   Error Code  0x80070002
```

`StaticFile` + `0x80070002` means IIS looked for a **literal file named `login` on disk**,
did not find one, and never involved the rewrite rule at all. The app is fine; the request
was never routed to `index.html`.

Three causes, in the order worth checking:

1. **`web.config` is not in the deployed folder.** The most common. Without it there is no
   rewrite rule, so every route 404s exactly like this.

   ```powershell
   Test-Path 'C:\inetpub\wwwroot\TradeOctanePortal\web.config'
   ```

2. **URL Rewrite is not installed.** Usually this announces itself as 500.19 rather than
   404 — IIS cannot parse a `<rewrite>` section it has no module for — so a 404 points at
   cause 1. Check anyway, since it is one command:

   ```powershell
   Get-WebGlobalModule | Where-Object Name -like '*Rewrite*'
   ```

3. **The URL is outside the application.** `/login` is the *site root*, not the `/portal`
   application. If the app is at `/portal` and its rewrite rule lives in the app's
   `web.config`, a request to `/login` is handled by whatever sits at the site root — which
   has its own configuration, or none. Load `https://<host>/portal/` and let the app route
   itself rather than typing a bare route.

### The portal was created as its own site instead of an application

Symptom in IIS Manager: `TradeOctanePortal` appears under **Sites**, at the same level as
`Default Web Site` and `TradeOctaneWebAPI`, rather than as an entry *inside*
`TradeOctaneWebAPI`.

It will appear to work, and it defeats the reason the hosting shape was chosen. A separate
site is a **separate origin** — different binding, so `apiBase: ''` now resolves `/api/v1/...`
against the portal's own site, where the API does not exist. Every call 404s, and making it
work means putting a host in `apiBase` and a CORS policy on the API: exactly the
[cross-origin shape described as the thing to avoid](#the-one-decision-where-it-sits-relative-to-the-api).

Browsing `https://localhost/...` is the same mistake wearing a different hat: `localhost`
resolves to whichever site holds that binding, and the API is bound to `10.10.30.17:443`
specifically.

To correct it, in IIS Manager:

1. **Sites** → right-click the **`TradeOctanePortal` site** → **Remove**. Confirm you are
   removing the site you created, not `TradeOctaneWebAPI`. Removing a site deletes the IIS
   configuration entry only — the files on disk are untouched, and any applications nested
   inside it go with it.
2. Right-click **`TradeOctaneWebAPI`** → **Add Application…**, exactly as in
   [Step 3](#step-3--create-the-iis-application).
3. Browse **`https://10.10.30.17/portal/`** — not `localhost`, and with the trailing slash.

> **While you are in there, check for stray applications.** An application pointed at a
> checked-out repository serves the *whole working tree* over HTTP — `src/`, `node_modules/`,
> and `.git/`, which contains the full history. Remove any application whose physical path
> is a source folder rather than `dist\...\browser`. Only the build output is meant to be
> published.

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
