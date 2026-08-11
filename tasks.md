# Trade Octane — Task Scratchpad
# Opus writes tasks here. Executor checks them off. Researcher appends findings.
# Format: [ ] pending | [x] done | [~] in progress | [!] blocked

---

## Phase 0 — Foundation
> Must be complete before any feature screen is built.

- [ ] Scaffold Angular 21 project — zoneless, strict TS, standalone defaults
- [ ] Configure `tsconfig.json` — strict mode, path aliases (@core, @shared, @features)
- [ ] Set up SCSS architecture — `_tokens.scss`, `_typography.scss`, `_primeng-overrides.scss`, `_utilities.scss`, `_reset.scss`, `main.scss`
- [ ] Install and configure PrimeNG 21 — `providePrimeNG()` in `app.config.ts`, theme aligned to tokens
- [ ] Install Inter font via `@fontsource/inter`
- [ ] Set up environments — `environment.ts` (mocks on) + `environment.prod.ts` (mocks off)
- [ ] Build shell layout — top bar + sidebar + icon rail + router-outlet
- [ ] Build mock auth service + role switcher dev panel
- [ ] Build `PermissionService` + `*toHasPermission` directive + `PermissionGuard`
- [ ] Build `UnsavedChangesGuard`
- [ ] Build three interceptors — auth, error, loading
- [ ] Build `FormatService` — PKR currency, tabular number formatting
- [ ] Build `PkrCurrencyPipe`
- [ ] Build all shared components (§9 of CLAUDE.md)
- [ ] Set up `/style-guide` route
- [ ] Set up GitHub Actions CI — lint + build + test
- [ ] Set up lazy-loaded routing shell

## Phase 1 — POC Priority Screens
> [PENDING: final list from Adil. Confirmed starters below.]

- [ ] Login screen with mock role switcher
- [ ] Dashboard / approvals inbox
- [ ] Budget list view
- [ ] Budget initiation form
- [ ] Budget approval detail
- [ ] Scheme list — BRD
- [ ] Scheme list — Trade Offer
- [ ] Scheme form — BRD
- [ ] Scheme form — Trade Offer
- [ ] Scheme bulk uploader
- [ ] Claims list
- [ ] Claims detail + approval
- [ ] Distribution — distributor list
- [ ] Distribution — distributor detail form
- [ ] Reports — budget consumed/unconsumed
- [ ] Reports — gross profit
- [ ] Admin — user management

## Phase 2 — Full Screen Count
> Populated as KT sessions complete and Saima's specs arrive.

---

## Findings Log
> Researcher appends here. Dated entries.

*(empty — populated as researcher runs tasks)*

---

## Decisions Log
> Opus logs any judgment calls made during execution.

*(empty — populated during build)*
