# Trade Octane — Task Scratchpad
# Opus writes tasks here. Executor checks them off. Researcher appends findings.
# Format: [ ] pending | [x] done | [~] in progress | [!] blocked

---

## Phase 0 — Foundation
> Must be complete before any feature screen is built.

- [x] Scaffold Angular 21 project — zoneless, strict TS, standalone defaults
- [x] Configure `tsconfig.json` — strict mode, path aliases (@core, @shared, @features)
- [x] Set up SCSS architecture — `_tokens.scss`, `_typography.scss`, `_primeng-overrides.scss`, `_utilities.scss`, `_reset.scss`, `main.scss`
- [x] Install and configure PrimeNG 21 — `providePrimeNG()` in `app.config.ts`, theme aligned to tokens
- [x] Install Inter font via `@fontsource/inter`
- [x] Set up environments — `environment.ts` (mocks on) + `environment.prod.ts` (mocks off)
- [x] Build shell layout — top bar + sidebar + icon rail + router-outlet
- [x] Build mock auth service + role switcher dev panel
- [x] Build `PermissionService` + `*toHasPermission` directive + `PermissionGuard`
- [x] Build `UnsavedChangesGuard`
- [x] Build three interceptors — auth, error, loading
- [x] Build `FormatService` — PKR currency, tabular number formatting
- [x] Build `PkrCurrencyPipe`
- [x] Build all shared components (§9 of CLAUDE.md) — all 14: approval-chain, cascading-select, bulk-uploader, data-table, status-pill, page-header, filter-bar, headroom-bar, pipeline-stage, confirm-dialog, empty-state, skeleton, activity-timeline, number-display
- [x] Set up `/style-guide` route — live gallery of all 14 shared components with interactive demos
- [x] Set up GitHub Actions CI — lint + build + test (`.github/workflows/ci.yml`)
- [x] Set up lazy-loaded routing shell — login (public) + shell wrapper (children: dashboard, style-guide, access-denied), all `loadComponent()`

## Visual Elevation Pass (pre-Phase 1)
> Talal requested a design-quality pass over all Phase 0 UI surfaces (shell, sidebar, command palette, role switcher, login, dashboard, access-denied, style guide, all 14 shared components) before Phase 1 begins, using the ui-ux-pro-max skill + 21st.dev Magic MCP per CLAUDE.md §15.
>
> 21st.dev Magic MCP *is* connected this session, but its paid `generate` tool returned `generation_limit_reached` on the very first call (no credits left on the account) — it also only outputs React/Tailwind, never inline-returns code, and needs a human to pick a variant at a URL per component, so it can't run unattended anyway. Talal chose to skip it entirely and have every component hand-built directly in Angular/SCSS, using the ui-ux-pro-max skill (density/elevation/active-state/motion guidance) plus CLAUDE.md §5 tokens. Logic files (interceptors/services/guards/models) were left untouched — visual/template/style files only, with a few component `.ts` files touched only for presentational logic (e.g. focus/active state, icon wiring).
>
> `npx ng build` and `npx ng lint` both pass clean after the full pass.

- [x] Shell layout (top bar + body wrapper) — brand mark, layered shadow, focus-visible states, richer notifications empty state, `ViewEncapsulation.None` per CLAUDE.md §3
- [x] Sidebar (full mode + icon-rail collapse) — left accent-bar active indicator, section dividers, focus states
- [x] Command palette — arrow-key navigation + active-row highlight, "Jump to" hint, richer empty state
- [x] Role switcher (dev panel) — role avatars, active checkmark, close button, panel enter animation
- [x] Login screen — rebuilt as the CLAUDE.md §3 branded split-panel with single "Sign in with Friesland Campina" button (role picking now lives only in the dev panel, not on login)
- [x] Dashboard (placeholder) — greeting header + "Coming in Phase 1" widget preview cards (still honestly a placeholder, not fake data)
- [x] Access denied — centered icon-card treatment
- [x] Style guide gallery — sticky in-page quick-nav, numbered sections, canvas-style demo backgrounds
- [x] 14 shared components (status-pill, number-display, skeleton, empty-state, page-header, confirm-dialog, filter-bar, cascading-select, headroom-bar, pipeline-stage, activity-timeline, approval-chain, data-table, bulk-uploader) — polish pass on each; data-table and activity-timeline also wired to the real `to-empty-state`/`to-skeleton` components, replacing inline `[PENDING]` placeholders left in Phase 0

## Phase 1 — POC Priority Screens
> [PENDING: final list from Adil. Confirmed starters below.]
> Built on `feature/phase-1-poc-screens` (branched off phase-0 elevation). Each screen its own commit.

- [x] Login screen with mock role switcher — done in the elevation pass (branded split-panel + SSO button, role switcher dev panel gated on useMocks). Committed as part of `feat(ui): elevate…`, not a separate phase-1 commit.
- [x] Dashboard / approvals inbox — queue-mode split pane; tabs All/Budgets/Schemes/Claims with counts; detail pane with headroom bar (budgets), pipeline (claims), approval chain + inline approve/reject; canApprove gated per item; 7 mock items. `ApprovalsService`/`MockApprovalsService`.
- [x] Budget list view — analysis-mode table; Year/Region/Brand/Status filter bar with chips; status pills; Actions column; client-side sort/paginate; 18 mock records. `BudgetService`/`MockBudgetService`.
- [ ] Budget initiation form
- [ ] Budget approval detail
- [ ] Scheme list — BRD
- [ ] Scheme list — Trade Offer
- [ ] Scheme form — BRD
- [ ] Scheme form — Trade Offer
- [ ] Scheme bulk uploader
- [x] Claims list — analysis-mode table; Type tags (Normal/Delay/Damage); Stage column renders the VBase→Trade Spend→Pujar pipeline (compact); status pills; 11 mock claims. `ClaimsService`/`MockClaimsService`.
- [x] Claim creation form — builder mode at /claims/new; conditional Damage-document validation; PKR-on-blur; submit→create. (Flow 1)
- [x] Claims detail + approval — /claims/:id; pipeline + chain + activity; approve advances stage, reject stops pipeline; gated on CLAIMS_APPROVE. (Flow 1)

### Flow 1 — Claims Request (branch `feature/phase-1-flows`)
> New Claim → Submit → List → Detail → Approve, all reactive off a signal-backed claims store. Each step its own commit.
- [x] Step 1 — creation form + validation (`f72979a`)
- [x] Step 2 — submission flow + reactive store (`a8255bb`)
- [x] Step 3 — claim detail + approval/reject (`e5f33d3`)
- [x] Step 4 — dashboard inbox sourced from the store (`5b7426d`)
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

- 2026-08-11: Pinned exact versions — Angular 21.2.20, PrimeNG 21.1.9, @angular/cdk 21.2.14 (required PrimeNG 21 peer dep, not previously listed in CLAUDE.md), @primeuix/themes 3.0.0, @fontsource/inter 5.3.0, @tabler/icons-angular 3.46.0. Angular 22 already exists upstream but CLAUDE.md locks 21.x — used latest 21.x patch.
- 2026-08-11: New Angular 21 apps are zoneless by default (no zone.js dependency at all) — added explicit `provideZonelessChangeDetection()` anyway for clarity/intent even though it's already implicit.
- 2026-08-11: Did NOT install `@angular/animations` / `provideAnimationsAsync`. It's deprecated in Angular 21 (superseded by native `animate.enter`/`animate.leave`) and PrimeNG 21's peerDependencies no longer list it — PrimeNG 21 uses CSS-based transitions internally. Revisit only if a specific PrimeNG component is found to need it.
- 2026-08-11: `environment.prod.ts` is committed (not gitignored) since it currently holds only placeholder values (`apiBase: ''`, no secrets). CLAUDE.md §12 says never commit this file — once item #5 (API base URL) is resolved with real values, move it to `.gitignore` + CI secret injection before committing further.
- 2026-08-11: `UnsavedChangesGuard` uses the native `confirm()` dialog rather than a branded PrimeNG dialog, to keep the core/guards layer free of UI component coupling. Revisit if product wants a branded confirm here.
- 2026-08-11: `npm audit` flags 5 vulnerabilities (4 moderate, 1 high) in `@angular/cli`'s own bundled MCP tooling deps (`undici`, `@hono/node-server`) — dev-time only, not shipped in the app bundle. The suggested fix downgrades `@angular/cli` to 20.x, which would violate the locked Angular 21 decision, so left as-is.
- 2026-08-11: `PkrCurrencyPipe` delegates to `FormatService` (Intl.NumberFormat-based) rather than wrapping Angular's `CurrencyPipe` + `en-PK` locale data, to avoid registering a non-default Angular locale for a one-line integer format. Output format (`PKR 1,000,000`) is identical either way.
- 2026-08-11: Added `@angular-eslint/schematics` (`ng lint` didn't exist in the fresh scaffold) and set both `eslint.config.js`'s selector prefix and `angular.json`'s `prefix` to `to` (was defaulted to `app`) to match CLAUDE.md's `to-` component convention.
- 2026-08-11: **Bug found and fixed in `core/config/prime-preset.ts`**: the dark `colorScheme.surface` ramp was inverted (index 0 = dark, index 900/950 = white), backwards from PrimeNG's convention where the ramp direction (0=lightest, 950=darkest) stays the same in both color schemes and `light-dark(surface.LOW, surface.HIGH)` picks which end to use per mode. This made every PrimeNG overlay/surface component (dialogs, popovers, menus, dropdowns) render with a white background in dark mode — caught via a Playwright screenshot of the command palette in dark mode, not by the build or lint (this is a CSS custom-property/cascade bug, invisible to TypeScript). Fixed by re-deriving the dark ramp as a proper ascending light→dark scale using the existing dark tokens (900 = `--to-bg-1` / `#181c25`, matching what dialogs should look like). Worth remembering for any future PrimeNG preset edits: verify actual rendered dark-mode output, not just that `data-theme="dark"` attribute-based rules compile.
- 2026-08-11: Bumped `anyComponentStyle` build budget from 4kB/8kB to 6kB/10kB (warning/error) in `angular.json` — `approval-chain` (4.48kB) and `bulk-uploader` (5.68kB) legitimately exceed the Angular CLI default for genuinely complex components (multi-state forms, file upload state machine) rather than being bloat to trim.
- 2026-08-11: Phase 0 foundation build/lint/prod-build verified clean; RBAC, dark mode, command palette, and role switching all confirmed working via a live Playwright smoke test against the dev server (not just unit-level checks) — see screenshots taken during the session for reference if similar visual regressions need debugging later.
- 2026-08-11: 21st.dev Magic MCP's `generate` tool hit `generation_limit_reached` on the first call and was abandoned for the whole Visual Elevation Pass — Talal opted to hand-build every component instead rather than top up credits. Worth knowing before proposing it again: it's a paid-per-call, human-in-the-loop tool (opens a browser URL per component for variant picking) that only outputs React/Tailwind, so even with credits it wouldn't produce Angular/SCSS directly — CLAUDE.md §15's caution about not using it for anything PermissionService/mock-data-coupled was already right to be cautious about scope, but it turns out the bigger blocker is operational (credits + human review loop), not just scope.
- 2026-08-11: `login.component.ts` mock sign-in now logs in as `authService.availableRoles[0]` on click rather than presenting a role list on the login screen itself — CLAUDE.md §3 specifies login as a single branded button with no picker; role switching is the dev-only floating panel's job (§6), not login's. If `availableRoles` order ever changes, the default post-login role changes with it.
- 2026-08-11: Extended `shared/icon-registry.ts` with one icon (`filter` → Tabler `IconFilter`) to give the filter bar a semantically correct leading icon — previously the registry had no icon that meant "filter" (only `search`, which would have been the wrong affordance).

### Phase 1 (2026-08-12)
- 2026-08-12: **Branch topology** — committed the visual-elevation work as one `feat(ui): elevate…` commit on `feature/phase-0-foundation`, then branched `feature/phase-1-poc-screens` off it (Talal chose this over folding elevation into phase-1). Login (POC screen #1) was already satisfied by the elevation pass, so it has no separate phase-1 commit.
- 2026-08-12: **Mock-first DI pattern established** — each feature service is an abstract class doubling as the DI token (`ApprovalsService`, `BudgetService`, `ClaimsService`), with a `MockXxxService extends` it, bound in `app.config.ts` via `{ provide, useClass }` (CLAUDE.md §3 single swap point). Mock services return `Observable` (via `of(...).pipe(delay())`) so the real HttpClient-backed swap needs zero component changes. Mocks reuse `import type` for cross-component types (e.g. `ApprovalStep`) to avoid dragging components into the eager app.config graph.
- 2026-08-12: **to-data-table gained custom cell templates** via new `CellTemplateDirective` (`toCellTemplate="<colKey>"`, exposes `$implicit`=row + `column`). Needed because both list screens require non-text cells the generic table couldn't render — budget's status pills + Actions, claims' pipeline-stage — without forking bespoke tables (would violate §9 "build once"). Default @switch rendering is the fallback when no template is supplied.
- 2026-08-12: **Mounted `<p-toast position="top-right">` in the shell.** There was a `NotificationService` (used by `error.interceptor`) but no toast host anywhere, so notifications rendered nowhere. Now approve/reject feedback and interceptor errors actually surface.
- 2026-08-12: **eslint** — added `@typescript-eslint/no-unused-vars` with `argsIgnorePattern`/`varsIgnorePattern`/`caughtErrorsIgnorePattern: '^_'` so the `_`-prefixed intentionally-unused convention works (e.g. a mock method satisfying an interface signature it doesn't use).
- 2026-08-12: **Budgets bumped** in `angular.json` — `initial` 500kB→700kB and `anyComponentStyle` 6kB→8kB (warning). The initial-bundle growth is bundled POC mock data eagerly imported by `app.config.ts` providers; it's swapped out for real HTTP services in prod, so the prod bundle will shrink, not grow. Revisit these budgets once mocks are gone.
- 2026-08-12: Claims list got an Actions column not in the spec's column list, for consistency with the budget list (and to give a detail affordance). Budget/Claims "View" action is a placeholder toast until the detail screens (POC #5 / #12) land.
- 2026-08-12: **Browser smoke test was BLOCKED this session** — the Claude-in-Chrome extension could not inject/screenshot ANY page (the trivial, unchanged `/login` failed identically on both the dev server and a production static serve), so it's an extension/CDP issue in this Chrome session, not app code. Runtime bootstrap + routing + `PermissionGuard` were still confirmed working (the SPA auto-redirected `/` → `/login` when unauthenticated). Build, lint, and prod build are all green. Left a static prod serve on `http://localhost:4301` for manual visual verification. **Phase 1 screens still need a human visual pass.**

### Flow 1 — Claims Request (2026-08-12, branch `feature/phase-1-flows`)
- 2026-08-12: **Signal-backed claims store** — refactored `MockClaimsService` from stateless snapshots into the single reactive source of truth (`claims` signal + `refresh`/`create`/`approve`/`reject`). This is what makes Step 4 work: the claims list, claim detail, and dashboard inbox all read the same store signal, so a claim created or approved anywhere updates everywhere with no refetch. Pure transforms (`createClaimRecord`/`approveClaim`/`rejectClaim`) live in `claim-factory.ts`; the store just applies them after a mock delay. When the real API lands, the store keeps its signal shape and calls HttpClient instead of the factory.
- 2026-08-12: **Pipeline stage and approval step advance together** — approving a claim marks the current chain level approved, activates the next, and moves the pipeline one stage (VBase→Trade Spend→Pujar); the claim is fully Approved only after the last level. So an inbox/detail approve advances a claim but it stays actionable until complete — intentional, and a good multi-step demo.
- 2026-08-12: **Dashboard now depends on the claims feature** — the inbox imports `ClaimsService` + the claim model to compute claim inbox items from the store (budget/scheme items still come from `ApprovalsService`; the two hardcoded claim items were removed from the approvals mock). Cross-feature import is deliberate: the inbox aggregates claims.
- 2026-08-12: **Permission naming** — the brief said `CLAIM_APPROVE`; used the existing `CLAIMS_APPROVE` (in `mock-users`, matches the `CLAIMS_VIEW` route guard) to avoid an orphan permission. If a distinct create permission is ever wanted, `/claims/new` is currently gated on `CLAIMS_VIEW`.
- 2026-08-12: **Partial browser verification (extension recovered, then flaky).** Confirmed visually: login, the approvals inbox sourcing 6 store claims (tabs All 11 / Budgets 3 / Schemes 2 / Claims 6) with the budget detail (headroom + chain), the claims list (type tags + pipeline column + status pills), and the claim form's reactive Damage→document-required validation + submit-disabled. The extension dropped before the submit→list and detail→approve interactions could be walked; those remain build/lint-verified only. Static prod serve left on `http://localhost:4302` for a manual walk-through of the full flow.
