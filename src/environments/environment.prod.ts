// Production build. Selected by `ng build` (the default configuration).
//
// `apiBase` is empty on purpose, and this is load-bearing rather than unfinished: the app
// is deployed as an IIS application under the API's own site, so `/api/v1/...` resolves to
// the API on the same scheme, host and port. Same-origin means no CORS policy on the API,
// no preflight on authenticated calls, and no host name that can go stale between
// environments.
//
// Putting a host here would make every call cross-origin and force a backend change.
// See DEPLOY-ON-VM.md before changing it.
export const environment = {
  production: true,
  useMocks: false,
  apiBase: '',
};
