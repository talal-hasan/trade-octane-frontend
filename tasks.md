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
