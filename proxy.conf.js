/**
 * Dev-server proxy — routes the app's API calls to the real backend.
 *
 * Why a proxy rather than pointing `environment.apiBase` at the VM directly:
 *
 *   1. **No CORS.** The browser sees every request as same-origin (`/api/v1/...` on
 *      localhost:4200), so the backend does not need to allow our dev origin. Pointing
 *      `apiBase` at `http://<vm>:5000` instead means the API must send
 *      `Access-Control-Allow-Origin` for our origin *and* answer the preflight for the
 *      `Authorization` header — a backend change requested purely so we can develop.
 *   2. **No code change to switch environments.** `environment.apiBase` stays `''`
 *      (same-origin) everywhere, which is what `ApiClient` already assumes.
 *   3. **Auth headers and cookies pass through unmodified.**
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   npm start              mock data. No backend needed. Top bar shows "MOCK DATA".
 *   npm run start:live     the real API at DEFAULT_TARGET below. No badge.
 *
 * Override the target when the API moves:
 *
 *   $env:TO_API_TARGET='http://10.20.30.40:5000'; npm run start:live   (PowerShell)
 *   TO_API_TARGET=http://10.20.30.40:5000 npm run start:live           (bash)
 *
 * The target is the **origin only** — scheme, host, port. No `/api/v1`, no `/swagger`.
 * Swagger UI at `http://10.10.30.17/swagger/` means the target is `http://10.10.30.17`;
 * the API itself is served from `/api/v1/...` on that same origin.
 *
 * ── A note on option names ───────────────────────────────────────────────────
 *
 * Angular 21's dev server is Vite-based, so this file is read as **Vite `server.proxy`**
 * config — which takes `http-proxy` options. It does *not* take the `http-proxy-middleware`
 * options (`logLevel`, `onError`, `pathRewrite`) that older Angular proxy examples use;
 * those are silently ignored. Vite already logs proxy failures clearly, e.g.
 *
 *   [vite] http proxy error: /api/v1/identity/login/sso
 *   Error: connect ECONNREFUSED 10.20.30.40:5000
 *
 * which is the message that tells you the request left the dev server and the backend
 * refused it — as opposed to never having been proxied at all.
 */

/**
 * The Trade Octane API VM (IIS, port 80 — hence no port in the URL).
 *
 * **The `/TradeOctane` suffix is required.** The API is not at the site root: IIS hosts it
 * as a sub-application (`Get-WebApplication` reports `/TradeOctane` →
 * `C:\inetpub\wwwroot\TradeOctane`). The OpenAPI document declares no `servers` block and
 * its paths begin at `/api/v1/...`, so it *assumes* the root — which is why requesting
 * `http://10.10.30.17/api/v1/identity/login_old` returns an IIS 404.
 *
 * `http-proxy` prepends the target's path, so this is handled entirely here and no part of
 * the application needs to know about the prefix. Verified end to end against an echo
 * server: the browser requests `/api/v1/identity/login/sso` and upstream receives
 * `/TradeOctane/api/v1/identity/login/sso`.
 *
 * Baked in rather than left to an environment variable because `npm run start:live` then
 * works with nothing to remember or mistype over an RDP session.
 *
 * `10.10.30.17` rather than `localhost`: it works from the VM either way, and keeps working
 * if IIS is bound to a host header that `localhost` does not match.
 */
const DEFAULT_TARGET = 'http://10.10.30.17/TradeOctane';

const target = process.env['TO_API_TARGET'] || DEFAULT_TARGET;

// Printed once at startup. Without it there is no way to tell from the terminal which
// backend the dev server is proxying to, and "why is my data wrong" becomes a guess.
// eslint-disable-next-line no-console -- dev-server startup diagnostic
console.log(`[proxy] /api/* -> ${target}`);

module.exports = {
  '/api': {
    target,
    // Rewrites the Host header to the target. Needed whenever the backend inspects Host
    // for routing or for generating links, and harmless when it does not.
    changeOrigin: true,
    // VMs commonly serve HTTPS with a self-signed development certificate. Without this,
    // the proxy rejects the cert and every call fails with a socket error that reads like
    // the API is down. Dev-server only — this never ships.
    secure: false,
  },
};
