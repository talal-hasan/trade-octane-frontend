// Live-backend development. Selected by `npm run start:live` (the `live` build
// configuration in angular.json), so switching between mock data and the real API is a
// command, never an edit to a tracked file.
//
// `apiBase` stays empty on purpose: the dev-server proxy in proxy.conf.js makes
// `/api/v1/...` same-origin, so there is no host here to get stale or to leak into a
// commit. Point the proxy at the VM instead:
//
//   $env:TO_API_TARGET='http://10.20.30.40:5000'; npm run start:live
export const environment = {
  production: false,
  useMocks: false,
  apiBase: '',
};
