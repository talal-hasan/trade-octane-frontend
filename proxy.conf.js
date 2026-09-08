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
 *   npm run start:live                                        → target below
 *   $env:TO_API_TARGET='http://10.20.30.40:5000'; npm run start:live   (PowerShell)
 *   TO_API_TARGET=http://10.20.30.40:5000 npm run start:live           (bash)
 *
 * Set the target to the **origin only** — scheme, host, port. No `/api/v1`, no `/swagger`.
 * If Swagger UI is at `http://10.20.30.40:5000/swagger/index.html`, the target is
 * `http://10.20.30.40:5000`.
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

const target = process.env['TO_API_TARGET'] || 'http://localhost:5000';

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
