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
- [x] Admin — user management (list + provisioning form) — see Brand & Landing Pass below

## Brand & Landing Pass (2026-08-18)
> Talal supplied two client documents this session: the **FrieslandCampina Corporate Identity
> Guidelines** PDF (65pp) and the **Trade Octane KT Compilation** docx. Four deliverables:
> adopt the brand palette, build Admin user provisioning, split Dashboard/Workspace, and
> apply colour across the shell. `npx ng build` and `npx ng lint` both pass; the whole pass
> was walked in the browser (login → dashboard → admin list → provisioning → create →
> workspace deep-link), in light and dark mode, as RSM / Admin / Distributor.

### Brand adoption
- [x] `_tokens.scss` rewritten on the real palette — Sky Blue `#0094d9` primary, Cool Grey
      `#6e6f72` body, five support colours mapped to semantic + data-viz roles. Split-token
      rule (brand hex for marks, darkened variant for text) with contrast noted per token.
- [x] `prime-preset.ts` primary ramp rebuilt around Sky Blue; surface ramp re-derived.
- [x] Shell — 2px Sky Blue→Magenta rail pinned across the top bar; brand mark on gradient.
- [x] Sidebar — full-height solid accent rail on the active item (was a floating pip);
      pending-count badges finally rendered (`badgeKey` existed in the model but nothing
      consumed it), shrinking to a dot in the 48px icon rail.
- [x] Login — deep Sky Blue panel with a single Magical magenta bloom; Together green bullets.
- [x] Page header — 48px Sky Blue segment under every page title, repeated app-wide.
- [x] Status pill — saturated brand-hex dot per status; **overdue split off from rejected**
      (they were visually identical) onto Magical magenta.
- [x] Headroom bar — Cool grey committed / Sky blue pending / Passion red overrun.

### Dashboard ↔ Workspace split
- [x] `features/dashboard/*` moved to `features/workspace/` → `WorkspaceComponent` at
      `/workspace`, titled "My Workspace". Accepts `?tab=` so dashboard tiles deep-link
      into the tab they summarise.
- [x] New `/dashboard` landing page — permission-filtered tiles, charts and "needs
      attention" cards; every tile drills into its workspace. Landing route for `''`.
- [x] `to-bar-chart` + `to-donut-chart` — hand-built, no charting dependency.
- [x] `FormatService.formatCompact` / `formatPkrCompact` for tile and chart labels.

### Admin user provisioning
- [x] `admin-user.model.ts` — three user types, permission catalogue, access templates,
      structured city list (closes the legacy free-text city gap).
- [x] `AdminUsersService` + mock store with AD directory lookup and SAP distributor search.
- [x] `user-list` — type tabs, search, revoke/restore, temporary-expiry notice.
- [x] `user-form` — one screen, three decisions, live `to-access-summary` with click counter.
- [x] `to-permission-matrix` extracted as reusable (edit-user and role screens will want it).

## Density & Vibrancy Pass (2026-08-20)
> Talal supplied `public/assets/logo.png` (the FrieslandCampina lockup) and
> `public/assets/dashboard_mock.png` (a KeenThemes-style reference), with four asks: add the
> logo, make the dashboard practical rather than four big number cards, push brand colour
> further using modern CSS, and turn the clustered user-creation form into a wizard with
> success animation. Build and lint pass; walked in the browser in both themes as RSM,
> Admin and Distributor.

### Logo
- [x] Top bar — logo + hairline + product name (client owns the software, Trade Octane is
      the product; the guidelines' product-endorsement section wants them distinct).
- [x] Login — full lockup on the white panel, with an entrance animation.
- [x] **The PNG has a solid white background, not alpha.** On dark surfaces it renders as a
      white block, so both placements use a white keeper plate (padding + radius) rather
      than filtering the mark, which the guidelines forbid.

### Dashboard rebuild (against the client's mock)
- [x] `to-stat-tile` — compact (~84px vs the old ~170px) with a period-over-period delta.
      Four now fit in less space than one old card and say more.
- [x] Utilisation hero — headline committed spend, delta, segmented composition meter,
      breakdown row per region with its own movement. Modelled on the mock's "Highlights".
- [x] `to-trend-chart` — area + smooth line, hover readout, draw-on animation.
- [x] `to-segmented-meter` — polychrome composition bar.
- [x] Needs-attention converted from stacked cards to a real table with a brand-tinted
      header and severity rails.
- [x] Asymmetric two-column rows, replacing the uniform card grid that read as empty.

### Colour techniques
- [x] Tinted glows (`--to-glow-*`), brand gradients, spectrum hairline, `color-mix()`
      derived tints, `table-head()` and `lift-on-hover()` mixins.
- [x] Applied globally in `_primeng-overrides.scss` so every PrimeNG button/table/toast
      picks it up, not just components we author templates for.

### User creation wizard
- [x] `to-wizard-steps` + three-step split (Identity / Access / Scope).
- [x] **Auto-advance** so the wizard costs zero extra clicks — verified still 1 search +
      3 clicks end-to-end, same as the single-page version.
- [x] `to-success-panel` — drawn checkmark, grant receipt, "Add another user" reset.
- [x] Step entrance transitions; all motion collapses under `prefers-reduced-motion`.

### Not built (flagged, see CLAUDE.md §14 items 7–11)
- [ ] Edit an existing user's access. The `:id` route was deliberately **not** wired — it
      would have rendered an empty create form under an edit URL. Needs: hydrate the form
      from the user, lock identity + user type, swap submit to `update`. Both extracted
      sub-components (`to-access-summary`, `to-permission-matrix`) are already reusable for it.
- [ ] Drag-and-drop approval-hierarchy designer (Admin 2.0; this pass covers user → role →
      permission only)
- [ ] Password policy screen, bulk user import, per-user audit trail

## Pastel Canvas & Brand Presence Pass (2026-08-24)
> Talal: "make the theme aggressive… colours in the menu and the main shell… a beautiful
> pastel gradient using the brand's colours… change the favicon to the company logo… the
> logo in the shell is very small, enlarge it or move it… remove the 'Trade Octane' wording."
> Reference supplied: `public/assets/possible look.png` — a tinted page with white cards
> and a diagonal pastel wash inside the hero card.

- [x] `--to-canvas-*` token family in `_theme.scss` — page, rail, top bar, card, hero, plus
      `--to-border-canvas`. Light and dark. Four soft radial pools of the brandmark's own
      hues (sky TL, magenta TR, lime BR, grass BL) over a tinted base.
- [x] `pastel-card()` and `canvas()` mixins in `_utilities.scss`.
- [x] Shell relaid out: **full-height sidebar** with the top bar and content stacked to its
      right (was a full-width top bar per CLAUDE.md §6). The spectrum hairline moved to
      3px across the whole application width.
- [x] Brand block at the top of the sidebar — lockup at ~156px on a Milk White keeper
      plate; the collapsed 48px rail shows the star alone at 26px.
- [x] "Trade Octane" wordmark and its divider removed from the shell top bar.
- [x] Sidebar rail, top bar and page canvas all painted from the pastel tokens; page canvas
      is `background-attachment: fixed` so the pools stay in their corners while content
      scrolls.
- [x] Sidebar active item upgraded from a 6% tint to a filled Sky Blue gradient + white
      label + tinted glow + Together-green rail. A pale tint is invisible on a pastel rail.
- [x] `logo-mark.png` (256px, alpha), `favicon.ico` (16/32/48), `favicon-192/512.png`,
      `apple-touch-icon.png` — star isolated from the supplied lockup, wired into
      `index.html` with a `#0094d9` theme-color.
- [x] Dashboard hero switched to `--to-canvas-hero` (the full pastel bloom).
- [x] Login: "TO" monogram placeholder replaced with the real brandmark; right panel put
      on the pastel canvas; lockup given the keeper plate in **both** themes.
- [x] **`_tokens.scss` split into `_tokens.scss` (SCSS vars, emits nothing) +
      `_theme.scss` (the `:root` custom properties, imported once by `main.scss`).**
- [ ] Sweep remaining feature screens for surfaces that should opt into `pastel-card()`
      (only the dashboard hero uses it so far — deliberately).
- [ ] `scheme-status-board` (8.85 kB) and `user-form` (11.19 kB) component stylesheets are
      still over the 8 kB warning budget on their own merits. Worth a split.

## Phase 2 — Full Screen Count
> Populated as KT sessions complete and Saima's specs arrive.

---

## Findings Log
> Researcher appends here. Dated entries.

*(empty — populated as researcher runs tasks)*

---

## Decisions Log
> Opus logs any judgment calls made during execution.

- 2026-08-24: **`_tokens.scss` was being stamped into every component stylesheet.** Sass
  emits a copy of every real rule into each compilation unit that `@use`s it, and each
  Angular component stylesheet is its own unit — so the `:root { --to-* }` block was
  duplicated ~60 times at 8,008 bytes each. It had been silently inflating every component
  budget all along; adding the canvas tokens is what finally pushed `user-form` (18.40 kB)
  and `scheme-status-board` (16.06 kB) past the 16 kB **error** ceiling and broke
  `ng build --configuration production`. Fixed by splitting the emitting CSS into
  `_theme.scss` (imported once, by `main.scss`) and leaving `_tokens.scss` as compile-time
  SCSS variables only. Both files dropped ~7.2 kB; two other warnings disappeared outright.
  **Rule: no component may `@use 'theme'`.**
- 2026-08-24: **Full-height sidebar, deviating from the CLAUDE.md §6 shell diagram.** The
  brief was to enlarge the logo, and inside a 48px top bar there is nowhere for it to go —
  the lockup is 2.18:1, so 28px of bar height caps it at 61px wide and renders the wordmark
  ~8px tall. Moving the brand into a 200px-wide block at the top of the sidebar takes it to
  ~156px wide with the wordmark legible, and matches the Linear/Vercel/Stripe references
  §5 already names. Top bar stays 48px; the icon rail stays 48px.
- 2026-08-24: **Pastel goes on chrome, never on data.** Page, rail, top bar and the one
  hero card carry the mesh; tables, forms and charts stay on flat `--to-bg-1`. Tinting the
  surface under a status pill or a currency column would change what the colour *means*.
- 2026-08-24: **A mesh, not a linear ramp.** A two-stop blue gradient reads as "a blue
  panel" and dates immediately. Four soft radial pools placed outside the corners never
  resolve into a shape, so the surface stays quiet at 100% zoom and still carries colour.
  The pool order quotes the brandmark star: sky, magenta, lime, grass.
- 2026-08-24: **Active nav item had to get *louder*, not softer.** On a pastel rail the old
  6%-tint active state was indistinguishable from the background wash. It is now a filled
  Sky Blue gradient with a white label. The 3px rail is retained because it is the app's
  shared state language and it is the only thing that survives the collapse to icon rail.
- 2026-08-24: **The star was isolated from the lockup, not redrawn or recoloured.** Largest
  8-connected non-white component, then un-premultiplied against white to recover a real
  alpha channel — composited back over white it is pixel-exact. This is asset preparation,
  not the filtering/recolouring CLAUDE.md §5 forbids. The full lockup PNG is untouched.
- 2026-08-24: **The lockup's white background is now visible, so the keeper plate is
  unconditional.** It used to be dark-mode-only, which was fine while every surface behind
  it was pure white. On the pastel panel the un-plated login logo rendered as a hard white
  rectangle. One treatment in both themes beats a theme fork.
- 2026-08-24: **Login's "TO" monogram replaced with the real brandmark.** An invented mark
  sitting next to a real one is the fastest way for a POC to look unfinished.
- 2026-08-24: **Fixed a phantom second scrollbar.** The `.to-sr-only` span in the dashboard
  table header had no positioned ancestor, so it resolved against the initial containing
  block, escaped the scrolling content area and stretched the document by ~170px. Pre-existing;
  it only became obvious next to the restructured shell.

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
### Brand & Landing Pass (2026-08-18)
- 2026-08-18: **Brand palette is now sourced, not invented.** The slate blue `#3b6fd4` in
  CLAUDE.md §5 was always a placeholder pending item #1. Replaced with FrieslandCampina Sky
  Blue `#0094d9` (pms 3005) read straight from the Corporate Identity Guidelines PDF §3.
  Item #1 is closed.
- 2026-08-18: **Split-token rule for brand colour.** The brand hexes are print values and
  several fail WCAG AA as text — Sky Blue is 3.4:1 on white, Grass Green 2.7:1. Rather than
  alter the brand colours (which would break identity) or ship failing contrast, every hue
  now has a `-solid` token (the untouched brand hex, for fills/dots/rails/chart marks) and a
  darkened base token (for text, AA-verified). **If you add a colour, follow this split** —
  do not reach for a brand hex to colour body text.
- 2026-08-18: **Aggressive ≠ heavier type.** The client asked for an aggressive, minimal,
  modern look. CLAUDE.md §5 caps font weight at 500 and fixes the radius scale, both locked
  decisions, so the register is carried instead by: saturated brand colour in small
  deliberate marks, hard-edged accent rails (top bar, sidebar, page header, tiles, summary
  panel), square-capped chart bars and butt-capped donut arcs, and wide-tracked uppercase
  micro-labels (`--to-tracking-label`). Flagged as pending item #9 in case they want
  weight 600 unlocked for KPI figures — do not unlock it unilaterally.
- 2026-08-18: **Guideline tensions flagged, not silently resolved.** The guidelines say
  support colours are used "never more than one at a time" and name Verdana as the digital
  typeface. Multi-series charts inherently break the first; we ship Inter, not Verdana. Both
  are now pending items #7 and #8 for Noor's corporate-comms sign-off rather than quiet
  deviations. The guidelines' white-space discipline was respected — the login panel is the
  only full-bleed colour surface in the product.
- 2026-08-18: **Dashboard vs Workspace is a real split, not a rename.** The old approvals
  inbox moved wholesale to `features/workspace/` (component, models, services) and the new
  `/dashboard` is a read-only overview. The two must never diverge: dashboard counts are
  computed from the same live signal stores the workspaces read (claims, schemes), never a
  parallel summary endpoint, so approving anywhere updates tile + sidebar badge with no
  refetch. Only the aggregate figures that no store owns (volume in litres, budget by
  region, scheme mix, ageing) come from `DashboardService`.
- 2026-08-18: **Charts hand-built, no charting library.** `to-bar-chart` and
  `to-donut-chart` are CSS/inline-SVG. Avoids a dependency on a locked stack, lets marks
  read `--to-viz-*` directly, and at 3–6 categorical marks a library is pure weight.
- 2026-08-18: **Two RBAC bugs caught in the browser, not by the compiler.** (1) The
  dashboard's approvals tile was gated on a single permission, which hid it from a Trade
  Category Manager who approves schemes but never sees claims — tiles now carry
  `requiredAnyOf: string[]`. (2) A Distributor saw "Awaiting my approval — 10" despite
  holding no approve permission; the tile now relabels to "My open items" and counts only
  what the user can actually act on. Both were only visible by switching roles in the dev
  panel and looking. **Do that when touching anything permission-gated.**
- 2026-08-18: **Provisioning UX researched before designing.** Entra ID's four-tab wizard,
  Okta's three-screen flow, AWS IAM Identity Center's permission sets, ServiceNow/SAP's
  reference-user copy. Took the permission-set and copy-user ideas, dropped the wizard: one
  screen, three decisions, and the "Review" tab turned into a live always-visible summary.
  The click counter in that panel is the client's acceptance criterion made measurable —
  **do not remove it**; if a change pushes the count up, that is the signal it is wrong.
- 2026-08-18: **`user-form` split into sub-components on a budget failure, and it was the
  right call anyway.** The stylesheet hit 17.19kB against a 16kB error budget. Rather than
  bump the budget a third time, extracted `to-access-summary` and `to-permission-matrix` —
  both genuinely reusable by the forthcoming edit-user and role-definition screens.
  `anyComponentStyle` error budget was still raised 12kB→16kB because
  `scheme-status-board.component.scss` (12.21kB, untouched this session) was **already
  failing the build before any of this work** — worth knowing that build was red on arrival.
- 2026-08-18: **`:id` edit route deliberately not wired.** Pointing it at
  `UserFormComponent` would render an empty create form under an edit URL. Left absent
  until hydration + identity-lock + update-submit exist.
- 2026-08-18: **Form signal wiring.** `user-form` mirrors the reactive form into signals via
  `toSignal(form.valueChanges)`. The user-type reset therefore must **not** use
  `{ emitEvent: false }` — suppressing it leaves the access summary showing the previous
  type's grant. Directory/distributor searches also guard against out-of-order responses by
  discarding any result whose query no longer matches the box.
### Density & Vibrancy Pass (2026-08-20)
- 2026-08-20: **The logo resolved the polychrome question.** Pending item #8 asked whether
  multi-series charts violated the guidelines' "support colours, never more than one at a
  time". The supplied brandmark is a star combining orange, lime, grass green, sky blue and
  magenta *simultaneously* — the palette is designed to co-occur, and the one-at-a-time rule
  governs decorative accent on print collateral, not categorical encoding. Item #8 closed.
  `--to-gradient-spectrum` reproduces the star's exact sequence.
- 2026-08-20: **The first dashboard was honestly not good enough** and Talal was right to
  say so. Four full-width cards, each carrying one integer and a sentence, occupied most of
  the viewport for four facts. The rebuild takes three things from the client's mock:
  compact tiles in a 2×2 block, a delta on *every* figure, and one hero panel that expands a
  single number into a composition. Density came from the layout, not from shrinking type.
- 2026-08-20: **`Delta.good` is separate from `Delta.direction`** and must stay that way.
  Rising volume is good; rising SLA breaches is not. Colour follows meaning, the arrow
  follows direction. Wiring colour to the arrow would make every "down 33% in SLA breaches"
  render as a failure.
- 2026-08-20: **Trend chart Y axis is floored at zero, not at the series minimum.** Scaling
  to the minimum turns small movements into cliffs — a well-known way to mislead with a
  trend line, and not something a spend dashboard should do.
- 2026-08-20: **Colour was added by *technique*, not by more fill.** Tinted shadows in the
  element's own hue, gradient buttons, `color-mix()` derived tints, a spectrum hairline that
  quotes the brandmark. The restraint that makes it work: the resting page stays white space
  and hairlines; colour appears on interaction, on severity, and at identity moments. If
  every card glowed, none would.
- 2026-08-20: **Global-first application.** Button gradients, table headers and toast rails
  live in `_primeng-overrides.scss` (unlayered, so they beat PrimeNG's `@layer primeng`)
  rather than being repeated per component. One edit re-themes every table in the app.
- 2026-08-20: **The wizard had to not cost clicks.** A stepper normally adds one click per
  stage, directly against the client's stated requirement, and the previous design was built
  around minimising them. Solved with auto-advance: any choice that can only mean "and
  continue" moves on by itself and does *not* increment the counter. Verified end-to-end at
  1 search + 3 clicks, unchanged. Picking a distributor deliberately does **not**
  auto-advance — a city is still required on that step.
- 2026-08-20: **Angular animations are still not installed** (deprecated in v21, and the
  project never took the dependency). All motion is CSS. Wizard step transitions work
  because `@if` destroys and recreates the section, so the entrance keyframes replay for
  free with no state tracking.
- 2026-08-20: **Reduced-motion needs the offset reset, not just the animation removed.**
  Suppressing the success checkmark's animation without also setting `stroke-dashoffset: 0`
  leaves an invisible mark. Same trap applies to the trend line's draw-on.
- 2026-08-20: **Do not round-trip source files through PowerShell `Get-Content`/`Set-Content`.**
  Used it for a quick regex replace on a template and it mangled every non-ASCII character
  (PS 5.1 reads as ANSI, writes as something else). Had to rewrite the file. Use the Edit
  tool, or `python` if a bulk replace is genuinely needed.
- 2026-08-20: **Two layout defects only visible in the browser.** Stat labels truncated to
  "AWAITING M…" once four tiles sat in a narrow column — fixed by giving the label its own
  full-width grid row instead of sharing a row with the value. And the top-bar logo at 20px
  rendered the wordmark ~8px tall, illegible; 28px is the floor inside a 48px bar. Neither
  was visible from the build.
- 2026-08-12: **Partial browser verification (extension recovered, then flaky).** Confirmed visually: login, the approvals inbox sourcing 6 store claims (tabs All 11 / Budgets 3 / Schemes 2 / Claims 6) with the budget detail (headroom + chain), the claims list (type tags + pipeline column + status pills), and the claim form's reactive Damage→document-required validation + submit-disabled. The extension dropped before the submit→list and detail→approve interactions could be walked; those remain build/lint-verified only. Static prod serve left on `http://localhost:4302` for a manual walk-through of the full flow.

---

## Administration 1.0 — real API integration (2026-09-07)

The `TradeOctaneSwagger.json` contract (81 paths / 102 operations / 156 schemas) landed,
plus a captured `GET /identity/menu` response. Built the foundation and the four core
Administration screens against it. `ng lint` clean, `ng build` green, 12/12 tests pass.

### The finding that shaped everything

**The API authorises on menu grants, not permission strings.** `GET /admin/users/{id}/access`
is explicit that `effectiveMenuIds` "is what actually authorizes requests". There is no
permission catalogue in the contract at all — `BUDGET_VIEW`, `ADMIN_USER_MANAGE` and
`ACCESS_TEMPLATES` were invented from KT notes and have no server counterpart. So the
frontend access model was re-based onto the set the server itself uses.

### Menu revamp — decided and built

Approved: club the legacy menu rather than render it as-is. Verified against the real
payload — **95 granted menu rows → 28 nav destinations, 0 unmapped, 0 near-misses.**
Administration's 15 rows fold to 6 destinations; Users alone absorbs 7 rows as 6 tabs.

- `core/menu/menu-blueprint.ts` — `menuId → { route, tab, navLabel, group }`
- `core/menu/menu-transform.ts` — pure fold, no Angular, testable on a captured payload
- `core/menu/menu-transform.spec.ts` — 12 specs, the project's first

### Corrections to the initial analysis (verified against the real payload)

- **`catalog` is not a page path.** It is `"1"` / `"2"` — the Octane discriminator, as a
  string. There is no page path anywhere in `/identity/menu`.
- **The join key is `menuId`.** Names are not unique — "Perfect Store" is both menuId 76
  (a root module) and menuId 85 (a screen under Dashboard). The name fallback is guarded
  against exactly this.
- **The menu is the whole legacy product**, not just Admin: 20 root modules, 95 nodes,
  exactly two levels.

### Three bugs the harness/tests caught before they shipped

1. **Unmapped children were promoted, not folded** — produced an 88-item sidebar, worse
   than the legacy menu the fold exists to improve on. Now a child folds into its mapped
   parent, and an unmapped child folds into its unmapped parent's fallback.
2. **A destination vanished when the row that *names* it was not granted.** Someone with
   "Re-Route Scheme" but not "Hierarchy" lost Approval Routing entirely. Sidebar absence
   now requires an explicit `hidden: true`; a group-less destination falls back to "More".
3. **Duplicate names stole blueprint entries.** Row 85 name-matched row 76's entry. The
   fallback now only fires when the entry's own menuId is absent from the payload.

### Contract issues raised with Zeeshan

- **`UserRoleWriteRequest` carries a scalar `roleId`** but is the body for "set a user's
  roles to exactly this set", whose response reports `added[]`/`removed[]`/`unchanged[]`.
  Every sibling write takes an array. `AdminRolesApi.replaceUserRoles` composes the set
  write from DELETE + POST meanwhile; swap it for one PUT when the contract grows `roleIds`.
- **`UserRoleAssignmentResponse.assigned` is returned as a bare object, not an array**,
  when the user holds exactly one role — `"assigned": { "roleId": 2, ... }`. Same root
  cause as the scalar `roleId` above: the backend models "a user's role" as singular in
  some places and plural in others. This is the defect that made the Roles tab render
  *nothing*: `assigned.map(...)` threw inside the subscribe callback, which aborted the
  handler before it cleared the loading flag, so the screen went blank with no error
  shown. Compiles clean, fails only at runtime, and only for users with one role.

  Normalised by `asList` in `AdminRolesApi` (both the GET and the embedded assignment on
  the POST/DELETE write responses). `UserRoleAssignmentWire` documents the real shape;
  delete it and the normalisers together once the backend sends a one-element array.

  **The general lesson, worth applying beyond roles:** a collection field that is
  serialised from a scalar is invisible to TypeScript and to the build. Normalise
  list-shaped fields at the API boundary rather than trusting the declared type — and
  when a screen renders blank, suspect a throw inside a subscriber before suspecting the
  template.
- **No `PUT /admin/users/{userId}`.** Profile edits go through the password endpoint with
  `newPassword: null` (supported — `profileUpdated` is reported separately). Wrapped as
  `AdminUsersApi.updateProfile` so call sites read as intent.
- **`POST /admin/users` and `POST /admin/menus` declare no response body.**
- **`LoginRequest.failedAttemptCount` is client-supplied** and trivially spoofable.
- **"Add Menu" and "Frequency Configuration"** have 8 endpoints each and no menu row, so
  they cannot be gated on a grant — gated on holding any Administration row instead.
- **menuId stability across environments** is the blueprint's one hard dependency.

### Decisions worth keeping

- **Integers are `number | string` on the wire.** The contract declares int fields as
  `["integer","string"]` and `/dashboard/tiles` returns every count as a string. Typing
  them as `number` compiles and then fails silently the first time the server sends `"42"`
  — `Set<number>.has("42")` is false, and an access check that quietly returns false is the
  worst failure mode here. Hence `ApiInt` + `int()` / `intSet()` on every read.
- **Cursor pagination, so Prev/Next — not numbered pages.** A cursor is only valid for the
  filters that issued it and cannot be computed for an arbitrary page. `to-data-table`
  paginates by page number and is therefore *not* used on these grids; `CursorPager` holds
  a remembered cursor stack and resets on every filter change.
- **The access tree binds to `directMenuIds`, never `effectiveMenuIds`.** A role-granted row
  is shown granted and locked, because `PUT …/access` cannot remove role-derived access —
  binding to the effective set produces a tick that refuses to clear.
- **The mock identity serves the *real* captured menu payload.** The fold, the nav and every
  gate run on production-shaped data during POC demos, so a mapping gap shows up on Talal's
  screen rather than on day one against a live backend.
- **Native checkboxes in the access tree**, not `p-checkbox`: PrimeNG's needs `ngModel` or a
  form control, the tree is driven by a signal set, and template-driven forms are banned.

### Built

Foundation: `core/api/*` (types, client, cursor pager, identity + admin models),
`core/menu/*`, `MenuAccessService`, `MenuGuard` / `MenuTabGuard`, `*toHasMenu`, real
`AuthService` (login_old + SSO + the three `LoginStatus` outcomes), sidebar driven by the
fold, 41 icons added to the registry.

Screens: Users list, Users detail (6 folded tabs), Create user (with the legacy Check
lookup), Roles, Role access (with blast-radius confirm), Access Explorer (5 grids → 1),
Menus, My Account (doubles as the forced password change), legacy placeholder.

### Next

- Approval Routing (Hierarchy + Re-Route), Ownership Transfers (Budget + Activity),
  Activity Logs, Scheme Frequency, Integration — routes and nav exist, screens do not.
- Retire `PermissionService` as each POC module moves onto its real contract. Both gates
  coexist in `app.routes.ts` today, and the split is commented there.
- `features/admin/user-management/` (the old invented-model screens) is superseded by
  `features/admin/users/` and should be deleted once Adil has signed off on the switch.

---

## Administration 1.0 — complete, live-wired, reviewed (2026-09-08 → 09-10)

Branch `feature/phase-1-flows`, pushed through `1ba9259`. `ng lint` clean, `ng build`
warning-free, 45 tests passing.

### How to run it

The API is **not reachable from a developer laptop** — see `RUN-ON-VM.md` for why (the VM's
`10.10.30.17` is internal; RDP reaches it through a NAT gateway that forwards one port).
Work happens on the VM:

```powershell
git pull
npm run start:live      # NOT `npm start` — that is mocks, and shows a MOCK DATA badge
```

`proxy.conf.js` defaults to `https://10.10.30.17`. Two dead ends already ruled out, do not
retry them: `http://10.10.30.17` is the **legacy Web Forms site**, and
`http://10.10.30.17/TradeOctane` is that app's folder (returns `Handler: StaticFile`, i.e.
IIS never routed to ASP.NET). The API is a separate IIS site, `TradeOctaneWebAPI`, on
**HTTPS 443**, identified by its app pool reporting a blank managed runtime.

### Screens

All fifteen legacy Administration menu rows now have a built screen, folded to nine
destinations: Users (7 rows as tabs), Roles, Role access, Access Explorer (5 grids in one),
Menus + Add/Edit Menu, Approval Routing, Ownership Transfers (budget + activity tabs),
Activity Logs, Scheme Frequency, Integration, My Account.

### Contract facts that cost time — do not rediscover

- **The deployment wraps responses in `{ data: … }`** where the contract declares the object
  directly (`login_old`, `/identity/menu`). `unwrapData()` handles it and unwraps **only**
  when `data` is the sole property — `UserPageResponse` is `{ data: [...], nextCursor, … }`
  and unwrapping that would silently drop the cursor.
- **Errors are RFC 7807** (`detail` / `title` / `errors`), never `.message`. Reading
  `.message` made every failure render as a generic apology.
- **Wire integers may be strings.** `["integer","string"]` in the contract, and
  `/dashboard/tiles` returns every count as a string. Always `int()` / `intSet()`.
- **`UserRoleWriteRequest` carries a scalar `roleId`** for a documented set-write.
  `replaceUserRoles` composes DELETE + POST instead; swap for one PUT when fixed.
- **No `PUT /admin/users/{id}`** — profile edits go through the password endpoint with
  `newPassword: null` (`AdminUsersApi.updateProfile`).
- **`UserRoleAssignmentResponse.available` came back empty** from the live API, so the Roles
  tab loads the full catalogue alongside and merges.
- Grids are **keyset-paginated** (Prev/Next via `CursorPager`), except **Activity Logs**,
  which is offset-paged and gets real page numbers.

### UI rules established

- **`_admin.scss` and `_theme.scss` emit CSS and are imported by `main.scss` only.** A
  component that `@use`s them stamps another copy into its own bundle.
- **Any PrimeNG internal must be styled globally** in `_primeng-overrides.scss`. Emulated
  encapsulation tags only elements in our templates, so a component rule targeting
  PrimeNG's inner `<input>` matches nothing — silently. This bit the password field twice.
- **Table cells are single-line by default** (`.to-adm__td`), with opt-in `--wrapable` /
  `--truncate` / `--stacked`. Wrapping cells produce ragged row heights, which is the single
  biggest "unfinished" signal on a data screen.
- Long option lists use `to-multi-select-picker`, not a chipset. A chipset is right for
  3–12 options; 60 scheme types filled half the viewport.
- Select-all always acts on what is **visible**, and says "shown" while filtered.

### Guided tours

`core/tours/tour-registry.ts` maps route → walkthrough for every screen; the shell
auto-starts unseen ones and renders the single help button. A screen needs only `data-tour`
attributes. Three bugs already fixed here, all found by opening a browser:

1. `startIfUnseen` reads the running state, so calling it in an `effect` made the effect
   depend on it — closing reopened it. Needs `untracked`.
2. Dismissal must hold for the **session**; a tab change writes a query param, which is a
   navigation, which re-offered the tour.
3. `measure()` must never scroll. Smooth `scrollIntoView` emits scroll events that
   re-entered it and pegged the renderer — Frequency froze the tab outright.

### Open with Zeeshan

- `UserRoleWriteRequest` scalar vs array (above).
- No `servers` block in the OpenAPI document — three rounds were lost to finding the base.
- `LoginResponse` documented unwrapped, returned wrapped.
- `POST /admin/users` and `POST /admin/menus` declare no response body.
- 500 returned for an invalid bearer token; should be 401.
- **menuId stability across dev/UAT/prod** — the blueprint's one hard dependency.

### Not done

- Resignation tab, and the Approval Hierarchy half of Approval Routing, are still legacy.
- POC screens (budget, schemes, claims) remain on `PermissionGuard` + invented permission
  strings; retire `PermissionService` as each moves to its real contract.
- `features/admin/user-management/` is superseded by `features/admin/users/` — delete once
  Adil signs off.
- Visual review covered Users, User detail, Approval Routing, Frequency, Integration.
  Access Explorer, Menus, Activity Logs, Menu form and Account were **not** re-checked after
  the layout pass.

---

## Administration 2.0 — Create Distributor (2026-09-17)

First Administration 2.0 screen on the frontend. Legacy `CPS_CreateDistributor.aspx`, menuId 87
under "Administration 2.0" (92, catalog `"2"`), over `/api/v1/admin2/distributors`.

### Built

- `core/api/admin2.models.ts` — 2.0 contracts, kept apart from `admin.models.ts` (Promo_2 is a
  different population; a 2.0 "role" is not a 1.0 role).
- `features/admin2/services/admin2-distributors.api.ts` — the eight endpoints. The catalogue
  (business types + region → area → territory) is cached for the session; candidates are not.
- `features/admin2/services/distributor-accounts.store.ts` — the directory held as signals.
  ~520 accounts, no cursor, so it loads once with `status=All`; tabs, business type, search,
  sort and 50-row paging are all in memory. Returning from the form shows rows instantly and
  revalidates behind them; writes patch the returned row.
- `/admin2/distributors` — grid: status segments with counts (Active default, as legacy),
  business type filter, search, sortable ID / name / type / location / city, Edit, Lock or
  Unlock, Deactivate (confirmed). Rows whose stored region or territory no longer resolves are
  flagged. The row just saved is brought into view and marked (`?saved=<id>`).
- `/admin2/distributors/new` and `/:distributorId` — one form. Virtual-scrolled picker of
  master distributors without an account (resigned ones last and flagged), business type
  chips, cascading region → area → territory (a change clears below; a single choice fills
  itself), live password rules, and a summary that lists every pending change on edit.
  `UnsavedChangesGuard` on both routes.
- `shared/validators/` — `legacyPasswordValidator` + `passwordRuleChecks`,
  `legacyEmailValidator`, `contactNumberValidator`: the server's exact rules, with specs.
- Menu blueprint: `NAV_GROUP_ADMIN_2`. Row 87 → Distributors; the eleven unported 2.0 rows
  fold into one "Legacy screens" destination at `/legacy/92`. `BLUEPRINT_BY_NAME` is now
  first-entry-wins. Tours for the list and the create form.

### Contract facts worth keeping

- **Lock is SSO-only.** The password sign-in's lock check is commented out in
  `Proc_Authentication`; the UI says so on the button, the toast and the tour. Deactivate is
  what stops every sign-in, and there is **no reactivation** endpoint — the confirm says so.
- **Passwords are never returned.** Edit leaves the field blank; blank keeps the password.
- **The API re-checks location only when part of it changes**, and some stored codes no longer
  resolve. The form offers the stored region / area / territory as "Current · …" options so
  such an account can still be edited without being forced to move.
- `changedFields: []` means nothing was written — reported as info, never as success.
- Master `REGION` is a bare number ("18"), not a region name, so picking a distributor cannot
  pre-fill the region.

### Fixed in passing

- Without 2.0 blueprint entries, a user holding 2.0 "Access Control" (97) but not 1.0's (19)
  had it name-matched onto the Users screen's Access tab. Covered by a spec now.

### Not done

- Visual pass against live data — needs a signed-in session in the browser.
- The other 2.0 screens (backend exists for Roles, Level Of Authorities, Approval
  Hierarchy, User Mapping, Distributor Access, Access Control, Access Control | By Role).
- The mock identity fixture (`public/assets/response_menu.json`) has no 2.0 rows, so the
  screen is reachable only with `npm run start:live`.

---

## Administration 2.0 — Create Role (2026-09-17)

Legacy `CPS_Role.aspx`, menuId 88, over `/api/v1/admin2/roles` (Promo_Management_2 `Roles` —
not the 1.0 role catalogue: four claim flags, no menu seeding, no delete).

### Built

- `/admin2/roles` — a table, not the 1.0 screen's cards: one column per claim flag so a
  permission can be compared across roles, plus "In use" (accounts, menu grants, approval
  steps, authority levels — the reach of an edit, which legacy never showed). Active /
  Inactive / All with counts, search, sort by ID, name or usage. Edit; Activate straight
  through; Deactivate confirmed with that role's own numbers.
- `/admin2/roles/new` and `/:roleId` — abbreviation and description (the legacy
  letters/digits/spaces/underscores rule, 100 chars), a taken name flagged as it is typed
  against every role, inactive included, and the four flags as cards that each say what they
  do. Summary aside lists pending changes and where the role is used.
- `features/admin2/services/keyed-collection.store.ts` — the session-cached collection store
  both 2.0 screens now extend (Distributors was refactored onto it).
- `_admin.scss` "Builder forms" block (`.to-adm__form-*`, `.to-adm__summary*`,
  `.to-adm__changes`, `.to-adm__alert`, `.to-adm__facts`) — the form chrome both 2.0 forms
  share. New 2.0 forms should use it rather than restating it.
- `shared/validators/unique-name.validator.ts`, with spec.
- Nav: built screens sort before placeholders within a group, so "Legacy screens" sits last.

### Contract facts worth keeping

- **Deactivating revokes nothing.** No legacy procedure reads `Roles.Status`; it only hides
  the role from pickers and refuses it for *new* user mappings, approval steps and authority
  levels. The confirm, toast and tour all say so.
- **`canUpdateAmount` and `isReadDetail` are read by nothing today** — labelled "Not read
  today" on the form. The legacy edit silently reset both; PUT requires all four flags.
- **Needs `db/migrations/004_octane2_role_status.sql`** on the target database — every 2.0
  role read selects `Status`.

### Not done

- Visual pass against live data — needs a signed-in session in the browser.

---

## Administration 2.0 — Level Of Authorities (2026-09-17)

Legacy `CPS_Level_Of_Authorities.aspx`, menuId 89, over `/api/v1/admin2/level-of-authorities`
(Promo_Management_2 `Authority_Level`; 63 rows = 9 business type × claim nature pairs × 7 roles).

### Built

- `/admin2/level-of-authorities` — **one screen, not list + form routes.** A band only makes
  sense beside its neighbours (GM's From is a decision about where Director's starts), so the
  pair's roles stay in view while one is edited in the side panel.
- Business type chips and claim nature segments, each with counts; the pair is remembered in
  the store for the session. The pair's bands are listed lowest threshold first, with
  "In the approval of: Every claim / PKR X and above".
- Panel, default mode — **Try a claim amount**: type PKR N and see which roles it brings in,
  using `joinsApprovalCycle`, which is `Proc_Claim_Create`'s own test.
- Panel, New/Edit: business type, claim nature, role (roles already set for the pair and
  deactivated roles greyed out), From/To as PKR `p-inputnumber`; live range and
  duplicate checks (with "Edit it" jump), a one-sentence preview of the band's effect, pending
  changes, and a warning when an edit moves a role out of its current pair. Switching rows
  with unsaved edits asks first; the route has `UnsavedChangesGuard`.
- `shared/validators/number-range.validator.ts`, `unique-combination.validator.ts`, and
  `level-of-authority.util.spec.ts`.

### Contract facts worth keeping

- **Amount To never keeps a role out.** `Proc_Claim_Create` brings a role in when the amount
  is between From and To, *or above To*, or both are 0 — i.e. from From upwards. The panel,
  table and tour all say so; most people read a band as a range that stops.
- Deactivated roles are refused for a *new* level (400); an existing row may keep its role.
- No delete (legacy hid it): removing a row changes who approves money.
- Edits affect claims raised from now on, not approval cycles already built.

### Not done

- Visual pass against live data — needs a signed-in session in the browser.

---

## Administration 2.0 — User Mapping (2026-09-17)

Legacy `CPS_User_Mapping.aspx`, menuId 91, over `/api/v1/admin2/user-mapping`. One Promo_2
account holds **one role** and N business types, N regions and N areas (540 accounts; up to
15 regions and 68 areas per account).

### Built

- `/admin2/user-mapping` — one route, two tabs in the query string (`?tab=regions`,
  `?user=<login>`), so a mapping can be linked to.
- **Map a user** (queue mode): accounts on the left (search; All / Needs mapping / Active /
  Inactive with counts, all in memory), the editor in the middle, the pending changes on the
  right. The editor opens on what the account holds — legacy opened an empty form. Role is a
  single searchable select; business types are toggle chips; regions expand to their areas
  with All / None, and unticking a region takes its areas. Held codes the catalogue no longer
  has stay visible, flagged. Areas held without their region are called out with remove
  buttons, since the API refuses them.
- Save goes through `planSave` (spec'd): a complete mapping is one `PUT`; a mapping that only
  takes a whole category away (e.g. no role left) is applied as the per-item DELETEs; an
  incomplete mapping that adds something is blocked with the reason. A role change is
  confirmed (it moves the account in claim approval routing).
- **Roles by region** (analysis mode, the client's request): census (accounts, regions and
  roles in use, and the two gaps — without a region / without a role — as buttons), accounts
  per role across all regions as chips, and a row per region with its account count, a bar
  relative to the busiest region, and its top roles. **Every count opens a drawer** with the
  accounts behind it (the same filters on `/region-roles/users`, so they agree), narrowable by
  role, paged, each one link to its mapping.
- Tour registry matchers now receive the query string, so a query-param tab resolves its own
  tour (the shell re-resolves tours on every navigation).

### Contract facts worth keeping

- **`/region-roles/users` returns one row per account per region**, while `roleTotals` counts
  each account once. A drawer spanning regions (a role, or "Without a role") therefore loads
  every row (200 per request, following `nextPage`), folds them by account with
  `groupRowsByAccount`, and pages by account. First shipped paging rows: RSM read "31 accounts"
  over a list "of 40" (MIS: 57 vs 416). A region drawer is already one row per account and
  stays server-paged.

### Not done

- Visual pass against live data — needs a signed-in session in the browser.
- Legacy 2.0 rows "User Roles" (232) and "User Regions" (233) are still in the Legacy
  screens fold; Roles by region may cover what they were for — confirm with the business.

---

## Administration 2.0 — Claim Hierarchy (2026-09-17)

Legacy `CPS_Claim_Hierarchy.aspx` ("Approval Hierarchy"), menuId 90, over
`/api/v1/admin2/claim-hierarchies` (Promo_Management_2 `Claim_Hierarchy`: 7 business types,
4–17 steps each, 34 roles).

### Built

- `/admin2/claim-hierarchy?businessType=<id>` — one screen, builder mode: business type chips
  with step counts; **Roles** (Role ID and name, as legacy) | **Approval order** | summary.
- The order holds only the roles that approve. Drag a role in from the list (or Add → last
  step); drag steps by the handle or use the arrows; remove with × or by dragging back.
  Deactivated roles cannot be added (a stored one can stay, move or go — the API's rule).
  Built on `@angular/cdk/drag-drop`, which PrimeNG's own OrderList uses; no new dependency.
- Stored ties and gaps are called out (FSD, Dairy and MT store two roles as step 7); Save is
  allowed with no other change so it can renumber 1, 2, 3.
- Summary: steps (was N), added, removed, before → after chain when reordered, and warnings
  when RMC (role 3, claim step-back) or role 7 (claim final approval) is removed, and that
  documents waiting on a removed role are no longer handed to it. Clearing the whole order is
  confirmed. One `PUT` per save; the Roles store is refreshed so approval-step counts move.
- All hierarchies are fetched once (selected first, the rest 3 at a time), so switching
  business type is instant. `claim-hierarchy.util.ts` (ties/gaps, diff, move/insert) is spec'd.

### Contract facts worth keeping

- The order is read at **every** approval step by the claim, payment recovery, vehicle
  maintenance, promotion calculator and CCC procedures: a save reaches documents already in
  approval.
- The delete endpoint is not used: removals are part of the draft and saved by the one `PUT`.

### Not done

- Visual pass against live data — needs a signed-in session in the browser.

---

## Administration 2.0 — Activity Logs (2026-09-17)

Legacy `Activity_Logs_Report_Promo2.aspx`, menuId 230, over `/api/v1/admin2/activity-logs`.

### Built

- `/admin2/activity-logs` is **the Administration 1.0 Activity Logs component**, not a copy.
  The backend serves both with the same report handlers (validation, 31-day range, 100-user
  cap, offset paging, 25,000-row CSV) and differs only in the table and the group rules, so
  the route passes `data: { activityLogSource: 'admin2' }` and `AdminOperationsApi`'s three
  activity-log calls take an `ActivityLogSource` (`'admin'` default). Breadcrumb, subtitle and
  CSV filename follow the source; the tour is shared.
- Both screens now show a log entry's full description on hover (it is truncated to a line).

### Contract facts worth keeping

- 2.0 groups: **Admins** are Promo_2 accounts with `Role_ID` 13; **Users** every other account,
  including accounts with no role (legacy left those out of every group); **Systems** names
  matching no account or distributor; **Distributors**.
- **4,090 of 1,352,921 rows in `Promo_Management_2.dbo.Activity_Logs` carry password text in
  `Description`** (distributor create/update and forgotten-password rows written by legacy,
  2019-03-14 → 2026-08-08). The API returns it unredacted in the list and the CSV. Needs a
  server-side redaction decision; not masked in the UI, which would leave the export exposed.

### Not done

- Visual pass against live data — needs a signed-in session in the browser.

---

## Administration 2.0 — Access Control By Role (2026-09-17)

Legacy `CPS_Access_Rights_RoleWise.aspx`, menuId 154, over `/api/v1/admin2/roles/{roleId}/access`
(Octane 2 menu items, `Promo_Management_2.dbo.MenuItems_Mapping_ByRole_O2`; 49 items, 46 active;
Admin holds 25).

### Built

- `/admin2/roles/:roleId/access` is **the Administration 1.0 role access screen** (reach banner,
  filterable menu tree, confirm-before-save naming how many active users it affects). The
  backend serves the same handlers with an Octane 2 menu scope. `AdminApiRoot` + `adminApiRootOf`
  (`core/api/api.types.ts`) now select `/admin` or `/admin2` for shared screens — Activity Logs
  moved onto the same `data: { adminApiRoot: 'admin2' }` key.
- 2.0 difference, handled: the access path does not read a 2.0 role's status, so a deactivated
  role still opens its screens. The response always says active; the screen takes the status
  from `Octane2RolesStore` and says exactly that.
- Roles list: a sortable **Menu access** column ("25 menu items ›") and an **Access** row action.
  Role form: "N menu items · Menu access" under Where it is used. Creating a role now lands on
  its menu access — a new role opens nothing until given screens.
- Nav: row 154 folds into the Roles destination as tab `access`, Create Role (88) as `details`.
  `MenuTabGuard` keeps a holder of one out of the other's routes, and the list hides New/Edit/
  Activate/Deactivate or Access accordingly (locally, 3 users hold 88 directly, 2 hold 154).

### Not done

- Visual pass against live data — needs a signed-in session in the browser.
- The cross-role grant grid and its CSV (`/api/v1/admin2/role-menus`) are not surfaced; 1.0
  shows its equivalent in Access Explorer, which is not on the 2.0 branch's nav.

---

## Administration 2.0 — Access Control per user (2026-09-17)

Legacy `CPS_Access_Rights.aspx`, menuId 97, over `/api/v1/admin2/users/{userId}/access`. Added
to User Mapping as a view of the selected account, since both screens start by finding a person.

### Built

- `features/admin/shared/user-access-panel/` — the Administration 1.0 user Access tab, lifted
  out of `user-detail` into a component with `userId` and `apiRoot` inputs. 1.0 renders it with
  the default `admin`; User Mapping renders it with `admin2`. No copy of the tree, counters or
  save logic. Also handles the 404 the 2.0 accounts can produce (see below) and now has a
  Discard button.
- User Mapping: **Mapping | Menu access** switch on the selected account, with the view in the
  query string (`?view=access`). Menu access hides the mapping summary column and widens the
  panel. Switching views keeps the mapping draft and asks before dropping unsaved access ticks;
  the route guard covers both.
- Nav: row 97 folds into User Mapping as tab `access`, row 91 as `mapping`. A holder of only 97
  sees the account list and Menu access, without Roles by region or the mapping editor.

### Contract facts worth keeping

- The 2.0 access endpoints read users from **`Promo_Management.dbo.USERS`**, while User Mapping
  lists `Promo_Management_2` accounts: **8 of the 540 have no 1.0 user record**, so the access
  call 404s for them. The panel says why rather than showing an error.
- Direct Octane 2 grants live in `Promo_Management.dbo.MenuItems_Mapping` (121 users, 672 rows);
  role-derived access comes from `MenuItems_Mapping_ByRole_O2` and the Promo_2 `Role_ID`, which
  is what the sidebar is built from. A save here only ever touches the direct Octane 2 grants.

### Not done

- Visual pass against live data — needs a signed-in session in the browser.
- The cross-user grant grid and CSV (`/api/v1/admin2/user-menus`) are not surfaced.

### Performance pass (2026-09-17)

Measured first: every query behind User Mapping runs in 2–31 ms locally (accounts picker 31 ms,
catalogue 3 ms, one account's mapping 2 ms), and the production chunk is 88.8 kB / 19.7 kB
transferred — so the cost was in the client, not the database or the payload.

- **The account list is virtual-scrolled** (`cdk-virtual-scroll-viewport`, fixed 54 px rows):
  about a dozen rows in the DOM instead of 540, on first paint and on every keystroke.
- **`KeyedCollectionStore.ensureFresh()`** — a collection loaded less than a minute ago is not
  re-fetched when a screen is re-opened; writes already patch their own row. Distributors,
  Roles, Levels of Authority and User Mapping open from memory. Try again still forces a load.
- **The Menu access panel is kept alive** once opened, so switching Mapping ↔ Menu access
  neither re-fetches nor loses unsaved ticks.

Note for testing: `npm run start:live` serves unminified lazy chunks and compiles them on
demand, so the first visit to a screen is always slower there than in a production build.

---

## Administration 2.0 — Distributor Access (2026-09-18)

Legacy `CPS_Access_Control.aspx`, menuId 93, over `/api/v1/admin2/distributor-access`. One
screen at `/admin2/distributor-access`: the distributor grid is the picker, and the portal
menu tree beside it is what every ticked distributor will hold.

The "Legacy screens" item (`/legacy/92`) is gone from the Administration 2.0 sidebar: its
helper and the three rows still on it — Claim KPI (100), User Roles (232), User Regions
(233) — are commented out of the blueprint. Those rows are active and granted locally (100
to 3 users directly and 1 role; 232 and 233 to 1 role each), and an unmapped granted row is
never dropped, so for those holders each one now renders on its own under **More**.

### Built

- `features/admin2/distributor-access/` — the screen, plus `menu-grant-tree/` and a pure
  `distributor-access.util.ts` (menu index, cascade, orphan/unknown detection, union,
  intersection, save impact) with 22 specs.
- `services/admin2-distributor-access.api.ts` and `services/distributor-access-catalogue.store.ts`.
  The store extends `KeyedCollectionStore` for the distributors and stashes the menu tree
  off the same response, since the server builds both from one command.
- **The tree is ticked with what is stored.** Legacy's load of current grants was commented
  out, so every save there started from an empty tree and revoked whatever was not
  re-ticked. Selecting one distributor shows exactly its set.
- **The effect is stated before the write.** The panel lists which distributors change and
  what each gains and loses, computed from their loaded grants — not a restatement of the
  request. The confirm dialog repeats it, and turns danger when the ticked set is empty.
- **Orphans cannot be created and are not hidden.** Ticking cascades both ways (a child
  grants its parents, unticking a parent revokes its children). Grants already stored that
  way are flagged `hidden` on their row, with one-click *Grant the parents* / *Untick them*;
  a save that keeps one passes `allowOrphanedGrants=true`, so an untouched distributor is
  never refused.
- **Multi-select is honest about disagreement.** Up to 25 distributors, each one's grants are
  fetched (6 at a time, cached for the visit) and a row only some of them hold shows the
  spread — `3 of 7` — with *Any of them* / *All of them* to resolve it. Over 25, the grants
  are not fetched: the tree starts empty and an alert says the save replaces whatever each
  of them holds. The tree opens on the intersection, never the union.
- Grid: select-all / none over the whole filtered set (capped at the server's 1,000 per
  write), status and access segmented filters, business type, search, six sortable columns,
  50 rows a page — all in memory. Row actions are **Access**, **Edit** (the account form) and
  **Delete**, which is the legacy Delete: deactivate, with the dialog saying the record,
  its claims and its menu grants are kept.

### Contract facts worth keeping

- Verified locally: **520** distributors (388 active), **23** menu items of which 8 are
  children of just two parents (One Window 19, ROI Reports 25), **8,807** grants, and every
  distributor holds at least one — so the census's "Hold nothing" reads 0 today.
- **200 distributors hold exactly one orphaned grant**, so the hidden-grant banner is a
  common sight rather than an edge case. No grant points at a menu id the catalogue lost,
  so the "no longer has" notice is defensive only.
- The grid's business type, territory and city come from `DistributorAccountsStore`, shared
  with the Distributors screen. The join is skipped rather than fatal when it fails: someone
  holding 93 without 87 must still be able to read and fix access.

### Not done

- Visual pass against live data — needs a signed-in session in the browser.
- The panel sits to the right of the grid and stacks under it below 1100px, rather than
  always below it as in legacy. Sticky keeps the tree and the save in view while rows are
  ticked; say so if it should always sit underneath.

---

## Administration 1.0 — Employee Resignation (2026-09-20)

Legacy `UpdateResignation.aspx`, menuId 133, over `/api/v1/admin/resignations`. Built as
the **Resignation tab of a user**, replacing the placeholder that pointed at the legacy
portal. The blueprint row is now `ported: true`; it stays `hidden` in the sidebar (the
client's 2026-09-18 decision) and is reached through Create User, which is where it
belongs: legacy made you find the same person twice, once in a dropdown and once in a grid
underneath it.

### Built

- `features/admin/users/user-resignation/` — the panel (`to-user-resignation`), with a
  `userId` input and a `changed` output that keeps the identity strip above it in step.
- `services/admin-resignations.api.ts` — `get` / `set` / `clear`, the per-account verbs.
- `shared/validators/resignation-date.validator.ts` (+ 11 specs) — mirrors the server's
  bounds (year ≥ 2000, ≤ 730 days ahead) so a typo costs no round trip, and carries
  `toIsoDate`, which uses the **local** calendar: `toISOString()` shifts the day in PKT.
- **The date is never text.** `type="date"`, so the browser renders it in the
  administrator's own locale while its value is always `yyyy-MM-dd`. That is the bug this
  screen exists to close: legacy pasted `dd-MM-yyyy` into the SQL and let the server read
  it under the connection's `DATEFORMAT` (`mdy`), so a day above 12 failed loudly and a day
  of 12 or below was stored transposed, silently — 5 March became 3 May.
- **Dates already stored are flagged, not trusted.** When `dateFormatSuspect` is set the
  panel shows both readings side by side with a one-click correction. It stops showing once
  a different date is in the field — by then it is warning about a value being replaced.
- **A stamped date is distinguished from a typed one.** Deactivating an account stamps
  `getdate()` into the same column, which is when the account was switched off, not the day
  the person left. The card says which it is, and shows the time for a stamped one.
- **Clearing exists**, behind a confirm dialog, and the toast names the value that went.
  Legacy had no way to remove a date: an empty box wrote `''`, which SQL Server stores as
  1900-01-01, so the only way to clear a wrong date was to store a different wrong one.
- Two facts stated under the form rather than left to be discovered: the account **stays
  active**, and **reactivating it erases this date**.
- Own tour (`user-resignation`), matched on `?tab=resignation` ahead of the user-detail one.
- The identity strip's "Resigned" fact now formats the value instead of printing the raw
  `2026-09-11T09:42:14.86` the column returns.

### Fast by construction

One GET when the tab is opened, and none after a write: `PUT` and `DELETE` both return the
resulting row, so the panel and the header update from the response. The tab is only
instantiated when it is active, and the parent's tab-switch guard now covers a half-typed
date as well as unsaved access ticks.

### Not done

- Visual pass against live data — needs a signed-in session in the browser.
- **No directory-wide view.** `GET /admin/resignations` and `/export` are built on the
  server and answer the two questions legacy's grid could not — "who has left and has not
  been recorded" (`recorded=NotRecorded`) and "which stored dates may be transposed"
  (`suspectOnly=true`, with the alternative reading in its own CSV column) — plus
  `totalCount` / `recordedCount` / `suspectCount`. Nothing calls them: the Users list
  already carries a Resignation column, and the tab is per-user by design. Worth a screen
  if the suspect-date cleanup is going to be done as a batch.

---

## Dashboard scope — "0 regions · 0 brands" (2026-09-20)

Reported against a live sign-in: the dashboard greeted `t_SufyaM01` with "0 regions · 0
brands" for an account mapped to **9 regions and 23 brands**.

### Cause

`AuthService.syncPermissionContext` hardcoded `regions: []` / `brands: []`. It had to: the
context is composed from `/identity/me`, `/identity/menu` and `/admin/account`, and **none
of the three carried scope**. The only reader of those mappings was
`GET /admin/users/{id}/regions`, behind the user-admin policy — so a client asking for its
*own* scope had to be an administrator to get an answer.

The zero was the visible half. The damaging half was that every consumer treats an empty
list as *no filter* (`MockDashboardService`: `regions.length === 0 || regions.includes(…)`),
so the charts rendered the whole country under a chip reading **"Live · your scope only"**.

### Fixed

- **Backend** (`E:\trade-octane-backend`, Identity module): `/identity/menu` now returns
  `regions[]` and `brands[]` — names, not the tilde-path codes. `AccessSql.UserRegions` /
  `UserBrands` left-join `GEO_LEVEL6` / `PROD_LEVEL6` in `Centegy_SnDPro_DR` and fall back
  to the raw code, so an orphaned mapping is surfaced rather than dropped (t_SufyaM01 has
  one). Predicate is user id alone — what the legacy scoping procs use; the mapping's own
  `Active` column is `'1'` on all 6,861 rows and legacy never filters it.
- Batched with the existing roles query as three result sets on **one** round trip.
- `UserAccessProvider` no longer skips that query when the menu is empty: holding no menu
  is not holding no scope, and `/dashboard` needs no grant, so the 40 grant-less accounts
  were exactly the ones being told "0 regions".
- **Frontend**: `syncPermissionContext` reads them (`?? []` for an older API). The subtitle
  reports an empty dimension as **"All regions"**, not "0 regions" — empty means unfiltered
  everywhere it is consumed. The chip reads "Live · all data" and turns amber when the
  account is mapped to nothing, so it stops claiming a scope it is not applying.
- **POC chart data realigned to real names.** `MockDashboardService` filters by name, and
  its fictional geography ("Punjab-North", "Sindh") matches nothing a real account holds —
  so feeding it real scope would have silently emptied every live user's charts. Regions are
  now the five most widely held (South, Lahore, Central Punjab, Islamabad, KPK) and brands
  are Olper's / Tarang / Dairy Omung. `MOCK_USERS` follows, so the role switcher still
  demonstrates scoping. Figures are still invented; only the names are real.

### Not done

- **The API must be restarted** for this to take effect — it was running from Visual Studio
  during the change, so only the copy-to-`bin` step failed (0 compile errors).
- Verified the batched SQL directly against the local database: 1 role, 9 regions, 23
  brands for `t_SufyaM01`, with the orphaned brand falling back to its code. Not yet
  verified through the running API.

---

## Re-Route Scheme — same role for Current User and New User (2026-09-21)

Client requirement: the new screen must apply the legacy rule that the current holder and
the new holder share a role.

### What legacy actually did

`Re_Route_Role_Based.aspx.cs` → `ddl_user_role_SelectedIndexChanged` calls
`clsInterface.GetUserRoles(roleId)` **once** and binds the **same DataTable** to both
`ddl_cur_user` and `ddl_new_user`. So the rule was never a check — a mismatched pair was
simply unreachable. The query behind it:

```sql
select USERS.FULL_NAME, USERS.USER_ID, User_Role_Mapping.ROLE_ID
from USERS left join User_Role_Mapping on USERS.USER_ID = User_Role_Mapping.USER_ID
where ACTIVE = 1 and ROLE_ID = '<roleid>'
```

### Why it could not be applied as-is

The new screen starts from a queue, not a role picker, and it deliberately surfaces holders
legacy could never select — its Current User list was `ACTIVE = 1`, so a deactivated
account or a placeholder was unreachable. Measured on `Scheme_Approvals`:

| Current holder | Pending rows | Role? |
|---|---|---|
| `<-- FORWARD TO -->`, `Please Select`, `SELECT NEW USER` | 13,940 | not a user |
| 5 real accounts with no role mapping | 142 | no |
| 4 accounts whose role no other active user holds | 382 | yes, list empty |
| 67 holders with a usable same-role list | 1,345 | yes |

A strict rule would have made **91% of the backlog un-re-routable** — the rows this screen
exists to clear. Confirmed with the user (2026-09-21): apply the rule where there is a role
to match, fall back where there is not.

### Built

- **Backend**: `GET /api/v1/admin/re-route/eligible-holders?currentHolder=…` →
  `EligibleHoldersResponse { roleConstrained, currentHolderIsUser, currentHolderRoles,
  candidates }`. `ReRouteSql.SharesRoleWithCurrentHolder` is the legacy set expressed as
  "shares a role with the holder"; `AllActiveHolders` is the fallback. No menu condition,
  unlike `BudgetOwnershipSql.SharesBudgetRole` — legacy's re-route had none.
- `POST /admin/re-route` enforces the same test (`ReRouteErrors.RoleMismatch`), and the
  test rides in the **same statement** as the existence/active lookup so a role mapping
  edited between two reads cannot let a write through.
- **Frontend**: "Move to" was a free-text datalist over *all 200 active users*, cached for
  the life of the screen — it let a queue go to anyone. It is now a select over the
  eligible list, re-read per selection, with the role named under it.
- Three distinct states, because they need different remedies: **constrained** ("Same role
  as the current holder — RSM. 5 users can take this queue"); **rule inapplicable** (amber,
  names the placeholder, lists everyone); **constrained but empty** ("No other active user
  holds the RTM role … grant that role to someone first" — widening would hand work to a
  role that cannot action it).

### Verified against the local database

- `Abbas.Zia` → RSM → other active RSMs (Ather Hussain Changazi, Faisal Iqbal Ghouri, …).
- `MaqsoM01` → RTM → **0** eligible; the 322-row queue now says why, instead of offering
  everyone.
- `<-- FORWARD TO -->` → not a user, 0 roles → fallback list of 194 active users.

### Not done

- **The API must be restarted** to pick this up.
- The grid rows do not show each holder's role. It would mean joining `User_Role_Mapping`
  into a census that already scans three unindexed heaps; the role is shown in the panel,
  where the choice is actually made. Say so if the client wants it on every row.

---

## Inactive users are read-only, in both Administration apps (2026-09-21)

Client business rule: **an inactive user cannot be edited in Administration 1.0 or 2.0 —
activate it first, then edit.**

### What it replaced

Nothing enforced it. `AccountCommandHandler` had an explicit comment the other way:
"Inactive and resigned accounts are not refused… an accident of the picker rather than a
rule." That judgement is now overridden by the client.

Legacy had in fact enforced it almost everywhere, by construction rather than by design:
`clsLogin.Get_AllUser` (`select * from Users Where ACTIVE = 1`) fed the pickers on Change
User Details, Assign Role, User Region Mapping, User Brand Mapping and Update Resignation,
so an inactive account could not be selected. The one exception was `Access_Rights.aspx`,
which used `clsInterface.GetAllUsers` — no filter. Treated here as the inconsistency it
looks like: the rule is applied uniformly, menu access included.

353 of 547 accounts are inactive, so this is not an edge case.

### Administration 1.0 — one filter, not a check per slice

`Infrastructure/ActiveAccountFilter.cs` is an `IEndpointFilter` reading the `{userId}`
route value against the resident directory. Applied to every per-user **write**: profile
and password, roles, regions, brands, menu access, resignation. Reads are untouched — an
admin must be able to see what they are about to reactivate.

- **A filter rather than six copies of a check**, because a rule pasted into six handlers
  is a rule that will be missing from the seventh.
- **Activate is deliberately not covered** — it is the only way out of the state. Deactivate
  and unlock are not either.
- **The snapshot is safe to read**: activate/deactivate call `IUserDirectory.Invalidate()`
  synchronously, so an admin who has just clicked Activate is never told it is still off.
- An unknown login name passes through, so the handler still answers 404 rather than the
  filter reporting "deactivated" for something that was never an account.
- 409, not 403: the caller is allowed, the *account* is in a state that forbids it.

### Administration 2.0 — the rule needed an Activate to exist first

Distributors had deactivate, lock and unlock but **no way back** — legacy had no
reactivation either. Applying the rule without one would have frozen every deactivated
distributor permanently. So this adds `POST /api/v1/admin2/distributors/{id}/activate`
(`IsActive = 1, IsDeleted = 0`, the exact inverse of deactivate), and only then refuses the
edit (`DistributorWriteOutcome.Inactive`), decided **inside the write transaction** on the
row the UPDATE is about to touch.

### Frontend

- User detail: a `readOnly` computed drives an amber banner above the tabs and disables
  every save, the role checkboxes, the access tree and the resignation field. Stated once
  rather than as a tooltip per control. Activate stays live in the header.
- The resignation date input is `disable()`d, not merely unsaveable — typing into a field
  that can never submit is a worse way to learn the account is off.
- Distributor list: Edit is replaced by an inert label with the reason, and the old
  column-width placeholder becomes the **Activate** button. The deactivate dialog no longer
  says "there is no screen to reactivate it — that needs a database change", which was true
  until today.

### Not done

- **The API must be restarted.**
- ~~Admin 2.0 User Mapping writes are not gated~~ — **closed the same day**, see the entry
  below: the client confirmed the rule covers 2.0 menu access and User Mapping too.

---

## Region and brand chips drop the code (2026-09-21)

Client: the region card in the Regions tab of Create User should not show the region code —
then the same for brands.

Both codes are tilde-joined paths from the Centegy geography and product hierarchies —
`1000~4000~1000~0040~0002~0015` — so the card was spending its second line on a string that
identifies nothing to the person reading it.

- Removed from both chips. The markers stay: **retired** on a region, **no SKU** on a brand.
- The code is still the value sent back on save, and `filterByName` still matches it, so
  pasting a code into the search box works — it just is not printed on the card.
- `.to-ud__chip-code` and a duplicated `.to-ud__chip--on .to-ud__chip-meta` rule that
  restated the base rule are now dead and removed.
- Chips are `justify-content: center`. The grid is `grid-auto-rows: 1fr`, so with most chips
  now one line, a single retired region would otherwise leave every other name top-aligned
  above a gap.

---

## The inactive-user rule reaches Admin 2.0 menu access and User Mapping (2026-09-21)

Client, extending the rule the same day: **in Administration 2.0, an inactive user's menus
(access) and User Mapping cannot be edited either.** This closes the gap flagged above.

### Why it needed a second filter

`ActiveAccountFilter` reads the resident `Promo_Management` directory. Administration 2.0
users are `Promo_Management_2.dbo.USERS` — a different table holding different people — so
neither filter can stand in for the other. `Octane2ActiveAccountFilter` is the 2.0 form:

- **A query, not a snapshot.** The 2.0 slices deliberately read straight from SQL rather
  than holding a directory, so there is nothing cached to consult. One seek on the clustered
  key, on a path that opens a transaction immediately afterwards.
- **`Active` is `bit null`, and NULL is not active** — legacy's own `Proc_GetMenuItem`
  applies a user's Octane 2 role grants only when `Active = 1`, so an account whose flag was
  never set already reaches nothing. Treating NULL as editable would let an admin maintain
  access for an account the legacy app does not serve.
- Its own error code, `administration2.users.account_inactive`, rather than sharing the 1.0
  one: the two name accounts in different databases, and a shared code would send a caller
  to activate a user that may not exist in the table they are looking at.
- An unknown login name passes through, so the handler still answers 404.

Applied to `PUT|POST|DELETE /api/v1/admin2/users/{userId}/access` (3 verbs) and every
`/api/v1/admin2/user-mapping/users/{userId}` verb (5). Reads untouched.

### Frontend

`mapping-editor` gained a `readOnly` computed off `UserMappingResponse.userIsActive`. It
disables Save and Discard, passes `[editable]="!readOnly()"` into the shared access panel —
which already had that input from the 1.0 work — and shows one amber banner **above** the
Mapping / Menu access switch, since the rule governs both views rather than one.

**255 of 540 Promo_2 accounts are inactive**, so this is the common case, not an edge.

### Not done

- **The API must be restarted.**
- Distributor Access (MenuID 93) is not gated. Its subject is a distributor, not a 2.0 user,
  and distributors are in neither `USERS` table — so neither filter applies and it would
  need a third check against `Promo_Management_2.dbo.Distributor.IsActive`. Say so if the
  client means that screen too.

---

## Re-Route Scheme — rebuilt from scratch (2026-09-21)

User request: rebuild Administration 1.0 "Re-Route Scheme" from the ground up — fast,
optimised, and in the new frontend's UI/UX — against the five `/api/v1/admin/re-route`
endpoints. The old `features/admin/approval-routing/` screen is **deleted**; the new one is
`features/admin/re-route/` at **`/admin/re-route`**. `/admin/approval-routing` redirects
there, and the blueprint row for menu 22 is now labelled "Re-Route Scheme" (no `tab`).

### What the data says (local copy)

- The whole census is **100 queues across 87 approvers** holding 19,644 pending approvals.
  75 approvers hold one queue, 11 hold two, one holds three.
- Scheme · Level 2 alone is 13,690 of them. `<-- FORWARD TO -->` (7,250) and
  `Please Select` (6,663) are the two biggest "approvers".
- **`SELECT NEW USER` holds 27 rows** — the legacy Re-Route screen's own placeholder, saved
  whenever Re-Route was clicked without picking a new user. The panel says so.
- **A blank approver holds 27 rows in two queues.** Every endpoint refuses a blank holder,
  so it is listed (the backlog adds up) but not selectable, with the reason on hover.

### Shape

- **Status tiles** (All / Needs re-routing / Deactivated / Not a user / Active) are the
  status filter; each shows pending + approvers.
- **Toolbar** = the old dropdowns as filters: search, Table chips, Level chips, **Role**
  (the old first dropdown — `/admin/user-roles?roleId=` fetched only when picked, cached).
  Budget + RMC chips disable each other (no such columns).
- **Left**: one row per approver (not per queue), every table/level they hold, oldest wait,
  amber rail when stuck. Sort by pending / waiting longest / A–Z. Arrow keys walk it.
- **Right, nothing selected**: `to-re-route-overview` — table × level heat grid (click a cell
  = Table + Level filter) and the three steps.
- **Right, approver selected**: who (status, login, roles from eligible-holders), a callout
  explaining why it is stuck, then **1 · What moves** (every queue, ticked by default — or
  only those matching the Table/Level filter), **2 · Who takes them** (eligible list; each
  candidate shows what they already hold; merge warning when the target already holds that
  table/level), **3 · Check the rows** (preview per queue, 50 a page), and a sticky action
  bar that states the count and route, or why the button is off.
- **Run**: ticked queues re-route one after another, each with its own previewed
  `expectedCount`. `to-re-route-receipt` reports each line — moved N / changed since you
  looked (parsed from the 409's detail) / failed with the server's reason — plus the moved
  keys (first 500 each), "Open <recipient>" and "Back to this approver".
- Filters and the approver are in the URL: `?view=&table=&stage=&role=&holder=`.

### Why it is fast

- **One census request per visit** (`AdminOperationsApi.approvalQueueCensus`, page size 200,
  follows the cursor only if the census ever outgrows a page). Each census request is eleven
  heap scans; the old screen re-ran it on every filter click and page.
- All filtering, facets, grouping, sorting and the matrix are computed signals in memory
  (`re-route.util.ts`, pure, 24 specs).
- Previews go **one at a time** through a `concatMap` queue, are cached per queue for the
  visit, and a queued preview for an approver the admin has already left is dropped unsent.
- **Export is built client-side** from the census already loaded, so it matches the screen
  exactly (Role filter and search included) and costs no scans. `/queues/export` is kept in
  the service but no longer called.

### Shared changes

- `error.interceptor`: new `FailureNotice` `'silent'` + `refusalsSilent()` — 4xx left to the
  caller, 5xx/401 still toast. Used by `reRoute` so a multi-queue run does not stack toasts
  over the lines that explain them. 2 specs.
- `to-confirm-dialog`: optional `details` (label/value rows) and `note` (amber caution).
  Backwards compatible.
- `AdminRolesApi.roleMemberIds(roleId)`.

### Not done

- **Not visually checked against the live API yet** — the in-app browser needs someone
  signed in. Build, lint and 175 specs pass.
- `re-route.component.scss` is 10.9 kB, over the 8 kB warning (under the 16 kB error), like
  Approval Hierarchy. The overview and receipt were split out to get it there.
