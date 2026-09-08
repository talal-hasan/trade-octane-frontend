# Trade Octane — Frontend Master Context
> Read this file completely before taking any action. Every decision in this file is final unless you see a `[PENDING]` marker. Do not re-derive or second-guess locked decisions.

---

## 1. Project Brief

**Client:** Friesland Campina (Pakistan operations)
**Product:** Trade Octane — trade marketing platform
**Scope:** Full frontend rebuild of a legacy ASP.NET Web Forms monolith
**Our stack:** Angular 21 (frontend) + .NET Core (backend, separate team)
**Our role:** Frontend only. Backend is owned by Zeeshan Aameer's team.
**Deadline:** September 10–15, 2026
**Immediate deliverable:** 20–30 screen POC/MVP running on mock data for client vetting. Build this as the real Angular app — not Figma, not a prototype tool. What the client vets is what ships.

---

## 2. Team

| Role | Name |
|---|---|
| Frontend Lead | Talal (you speak to him) |
| Product Owner | Adil Saeed |
| Project / Backend Lead | Zeeshan Aameer |
| Backend Developer | Moiz Khan |
| Backend Developer | Hassan Arif |
| Business Analyst | Saima Aslam |
| QA | Sana Tariq |

---

## 3. Locked Technical Decisions

Every item below is final. Do not propose alternatives unless Talal explicitly asks.

### Framework & Language
- **Angular 21.x** — latest stable at project start. Zoneless change detection enabled. Standalone components everywhere — no NgModules.
- **TypeScript strict mode** — `strict: true` in `tsconfig.json`. No `any`, no `// @ts-ignore`. If a type is hard, solve it properly.
- **Control flow syntax** — use `@if`, `@for`, `@switch`, `@defer`. Never `*ngIf`, `*ngFor`, `*ngSwitch`.

### UI Component Library
- **PrimeNG 21** — the only component library. Do not introduce Angular Material, Ng-Zorro, or any other UI library.
- PrimeNG theming via `providePrimeNG()` in `app.config.ts`. Custom theme tokens override in `_primeng-overrides.scss`.
- PrimeNG components are imported individually per component — never barrel-imported wholesale.

### Styling
- **SCSS** throughout. No plain CSS files, no inline styles, no Tailwind.
- All design tokens defined as CSS custom properties in `src/styles/_theme.scss` and as SCSS variables in `src/styles/_tokens.scss`. Components reference tokens only — never hardcoded values. See §5 Stylesheet split for why the two are separate files.
- Component stylesheets use `@use '../../../styles/tokens' as t`.
- Dark mode via `[data-theme="dark"]` on `<html>`. Token overrides in `_theme.scss` under that selector. Zero component-level dark mode logic.
- BEM naming for custom component classes: `.to-approval-chain__step--active`.
- `ViewEncapsulation.None` only on layout/shell components. Feature components use default encapsulation.

### State Management
- **Angular Signals** for all state — `signal()`, `computed()`, `effect()`. No RxJS `BehaviorSubject` for state.
- RxJS only for: HTTP streams, event streams (fromEvent), and operators that have no signal equivalent. Always `takeUntilDestroyed()` — never manual unsubscribe.
- No NgRx, no Akita, no NGXS.

### Forms
- **Reactive Forms everywhere.** No template-driven forms, no exception.
- `FormBuilder` with `nonNullable: true` as default.
- Validators are pure functions in `src/app/shared/validators/`. No inline validator logic in components.

### HTTP & API Layer
- One service per feature module in `src/app/features/[module]/services/`.
- All HTTP calls go through the feature service — never `HttpClient` directly in a component.
- Three interceptors in `src/app/core/interceptors/`:
  - `auth.interceptor.ts` — attaches Bearer token
  - `error.interceptor.ts` — maps errors to toast notifications
  - `loading.interceptor.ts` — drives the global loading indicator
- **Mock-first development:** every feature service has a `MockXxxService` that implements the same interface. `environment.useMocks = true` during POC phase. Swap to real service by changing the provider in `app.config.ts` — zero component changes.

### Auth
- Auth is currently mocked. Real implementation will be OIDC (Keycloak or Microsoft EntraID — TBD by client).
- Use `angular-auth-oidc-client` when real auth lands — it covers both.
- Login screen: branded split-panel. **Revised 2026-09-07** — the contract requires a
  username/password form (`login_old`), and `GET /identity/login/sso` reports whether SSO is
  configured *on this deployment*, so the SSO button is conditional and cannot be assumed.
  Sign-in has three outcomes, not two: `Authenticated`, `PasswordChangeRequired` (hard gate
  → `/account?force=1`) and `PasswordExpiryWarning` (the server's own notice, then through).
- **Role switcher in mock auth** — critical for POC client vetting. Talal must be able to switch roles (RSM, Admin, Head of Sales, Distributor, MIS, Trade Category) without logging out. Implement as a floating dev panel visible only when `environment.useMocks = true`.

### Routing
- Feature modules are lazy-loaded via `loadComponent()` / `loadChildren()`.
- Every route has a `canActivate` guard using `PermissionGuard`.
- Route data carries `{ requiredPermission: 'BUDGET_VIEW' }` — guard checks against `PermissionService`.

---

## 4. RBAC — Role-Based Access Control

This is the most complex part of the system. Get it right from the start.

> **SUPERSEDED IN PART (2026-09-07).** The permission-string model below (`BUDGET_VIEW`,
> `ACCESS_TEMPLATES`, `*toHasPermission`, `PermissionGuard`) was designed from KT notes
> before the API contract existed. **The contract has no permission concept at all.** The
> server authorises on menu grants — `GET /admin/users/{id}/access` states that
> `effectiveMenuIds` "is what actually authorizes requests":
>
> ```
> user → roles → menu grants  ∪  user → direct menu grants  =  effectiveMenuIds
> ```
>
> The real model lives in `core/services/menu-access.service.ts`, gated by `MenuGuard` and
> `*toHasMenu`. **New screens use it.** The permission model survives only for the POC
> screens (budget, schemes, claims) until each moves onto its real contract; the split is
> commented in `app.routes.ts`. See §4.1 and `tasks.md` (2026-09-07).

### 4.1 Menu-driven navigation (added 2026-09-07)

`GET /identity/menu` returns the legacy tree as Administration 1.0 renders it — 95 nodes,
20 root modules, exactly two levels, **one entry per action**. Rendering it as-is would put
fifteen siblings under Administration, seven of which are facets of a single noun.

The API is already shaped the other way (`/admin/users/{id}/roles`, `/regions`, `/brands`,
`/access`, `/password`). The blueprint lets the navigation catch up with the contract:
**95 granted rows fold to 28 destinations**, Administration's 15 to 6, with Users absorbing
7 rows as 6 tabs. Verified against a captured real payload; 0 unmapped, 0 near-misses.

| File | Role |
|---|---|
| `core/menu/menu-blueprint.ts` | `menuId → { route, tab, navLabel, group }`. The map. |
| `core/menu/menu-transform.ts` | The fold. Pure — no Angular, no signals. |
| `core/menu/menu-transform.spec.ts` | 12 specs against real menuIds. |
| `core/services/menu-access.service.ts` | State, gating, nav sections, ⌘K aliases. |

**The join key is `menuId`.** Not the name — "Perfect Store" is both menuId 76 and 85. Not
`catalog`, which is `"1"`/`"2"`, the Octane discriminator, as a string. There is no page
path in the payload.

Four rules keep the blueprint safe to be incomplete:

1. **An unmapped row is never dropped.** It renders under "More" pointing at the legacy
   placeholder, and is reported by `MenuAccessService.unmapped()` in dev.
2. **Access stays server-truth.** A tab renders only if its menuId was granted. Folding the
   navigation did not widen anyone's access — someone holding only "User Brand Mapping"
   gets the Users screen with exactly one tab.
3. **Sidebar absence must be explicit** (`hidden: true`). A destination can be group-less by
   accident when the row that names it is not granted; hiding it then would lose a screen
   the user legitimately holds.
4. **Legacy names stay findable.** Every folded label becomes a ⌘K alias, so a UAT user
   trained on "Re-Route Scheme" still lands in the right place.

### 4.2 Wire integers are `number | string` (added 2026-09-07)

The contract declares integer fields as `["integer","string"]`, and `/dashboard/tiles`
returns every count as a string. Typing them as `number` compiles and then fails at runtime
the first time the server sends `"42"`: `Set<number>.has("42")` is false, and an access
check that silently returns false is the worst failure mode in this module. Every wire
integer is `ApiInt`, and every read goes through `int()` / `intSet()` (`core/api/api.types.ts`).

### 4.3 Administration grids are cursor-paginated (added 2026-09-07)

A cursor is valid only for the filters, sort and direction that issued it, and cannot be
computed for an arbitrary page. So the Administration grids use **Prev / Next over a
remembered cursor stack** (`core/api/cursor-pager.ts`) and reset on every filter change.
**`to-data-table` is deliberately not used on them** — it paginates by page number, which a
keyset API cannot honour without fetching every intervening page.

### Roles
`RSM` | `RMC` | `HEAD_OF_SALES` | `ADMIN` | `MIS` | `TRADE_CATEGORY` | `DISTRIBUTOR`

Users can hold **multiple roles** and have **multi-region, multi-brand** assignments simultaneously.

### Permission Model
- After login (or mock login), `AuthService` resolves a `UserContext` object:

```typescript
interface UserContext {
  userId: string;
  name: string;
  roles: Role[];
  regions: string[];
  brands: string[];
  permissions: string[]; // e.g. ['BUDGET_VIEW', 'BUDGET_APPROVE', 'SCHEME_CREATE']
}
```

- `PermissionService` holds the current `UserContext` as a signal and exposes:
  - `canAccess(permission: string): boolean`
  - `hasRole(role: Role): boolean`
  - `hasAnyRole(roles: Role[]): boolean`

- `*toHasPermission` structural directive — hides DOM elements based on permission:
```html
<button *toHasPermission="'BUDGET_APPROVE'">Approve</button>
```

- Route guard checks `canAccess()` before any navigation — never flash a screen then redirect.

### Screen-Level Access
Access is enforced at the individual screen level, not just module level. Every route definition includes `requiredPermission`. The nav/menu is generated dynamically from what the current user can access — never hardcoded.

### User Provisioning (Admin only, added 2026-08-18)

`/admin/user-management` — gated on `ADMIN_USER_MANAGE`. Three user types, matching the
legacy system (KT Meeting 2 §3): **AD** (identity from Active Directory), **Distributor**
(credentials in the Trade Octane DB, identity from the SAP master list), **Temporary**
(naming convention + mandatory end date, nightly auto-disable).

**Design brief was "fewest clicks possible".** Researched against how enterprise IAM
products actually do it, then took the two good ideas and dropped the wizard:

| Product | Pattern | Verdict |
|---|---|---|
| Microsoft Entra ID | Tabbed wizard: Basics → Properties → Assignments → Review + create | Rejected — a click per tab, and you never see the whole grant until the end |
| Okta | Add Person, then assign groups, then assign admin role | Rejected — three screens for one mental task |
| AWS IAM Identity Center | **Permission sets** — a named reusable access bundle attached in one action | **Adopted** as `ACCESS_TEMPLATES` |
| ServiceNow / SAP GRC | **Copy roles from user** / reference-user derivation | **Adopted** as "mirror an existing user" |

Resulting shape — **a three-step wizard with a live summary** (`to-wizard-steps`):

1. **Identity** — AD directory search; pick a person and name, email and home region fill
   themselves. Distributor picks from the SAP list. Temporary generates its username.
2. **Access** — one-click access template (roles + permissions + default scope), or mirror a
   peer. `to-permission-matrix` is collapsed behind "fine-tune" for the exceptions.
3. **Scope** — region and brand chips. Empty brands = all brands.

**Auto-advance is what makes the wizard free.** A wizard normally costs a click per step,
which is the opposite of the requirement. So any choice that can only mean "and continue"
advances by itself and does **not** increment the click counter: picking a person completes
Identity, applying a template or mirroring a user completes Access. `Continue` is the
fallback for genuinely incomplete steps (typing a temporary username, hand-picking roles).
Picking a *distributor* deliberately does not auto-advance — a city is still required on
that step, and skipping past it would hide a mandatory field.

Measured end-to-end for a company user on a standard template: **one search + 3 clicks**
(pick person → pick template → Create) — identical to the single-page version it replaced.

`to-access-summary` stays visible at every step — the plain-English grant, the counts,
where the access came from, and a **live click counter**. The counter is not decoration: it
is the client's stated acceptance criterion, kept on screen so it cannot quietly regress.
**If a change pushes that number up, the change is wrong.**

Templates are a starting point, never a lock — every field stays editable, and the summary
flags "· edited" once the admin drifts from the template they applied.

Creation lands on `to-success-panel` (drawn checkmark, receipt of what was granted, and
"Add another user" / "Back to user list") rather than redirecting. Onboarding happens in
batches, and handing someone financial-approval rights deserves more acknowledgement than
a toast that vanishes in four seconds.

---

## 5. Design System

### Target Aesthetic
Modern enterprise. Reference: Linear, Vercel dashboard, Stripe dashboard. High craft at enterprise data density. Not consumer-app large-padding aesthetics — this is a data-heavy tool used all day.

### Typography
- **Font:** Inter (self-hosted via `@fontsource/inter`)
- **Scale (rem):** 0.6875 / 0.75 / 0.8125 / 0.9375 / 1.125 / 1.5
  (11px / 12px / 13px / 15px / 18px / 24px at 16px root)
- **Weights:** 400 (regular) and 500 (medium) only. Never 600, 700, or bold.
- **Line height:** 1.5 body, 1.3 headings, 1 for single-line data labels
- **Tabular numerals everywhere financial data appears:**
  ```scss
  .to-numeric { font-variant-numeric: tabular-nums; }
  ```
  Applied automatically to: currency columns, quantity inputs, percentage displays, budget headroom bars.

### Color Tokens

**Source of truth: FrieslandCampina Corporate Identity Guidelines §3 "our colours".**
The provisional slate-blue palette was replaced on 2026-08-18 once the guidelines PDF
arrived (this resolves §14 pending item #1). `src/styles/_theme.scss` carries the full
set and the per-token contrast notes; the summary is:

| Brand colour | Hex | Reference | Role in the product |
|---|---|---|---|
| Milk white | `#ffffff` | — | Card/panel surfaces, white space |
| **Sky blue** | `#0094d9` | pms 3005 / ral 5015 | **Primary accent** — rails, fills, focus, charts |
| Cool grey | `#6e6f72` | pms Cool Grey 10c | Body copy (`--to-text-secondary`), consumed bars |
| Magical magenta | `#ec008c` | pms magenta | Escalation / overdue, second chart series |
| Passion red | `#ed1c24` | pms 485 | Danger, budget overrun |
| Vibrant orange | `#f7931e` | pms 144 | Warning, pending, SLA amber |
| Together green | `#d7df23` | pms 584 | Login accent, sixth chart series |
| Grass green | `#39b54a` | pms 362 | Success, active status |

**The split-token rule.** Every brand hex is kept unmodified where it is *seen* as colour
and darkened only where it must be *read* as text:

- `--to-accent` (`#0094d9`) — the brand hex. Rails, fills, icons, focus rings, chart marks.
  3.4:1 on white: fine for UI, **never** for small text.
- `--to-accent-strong` (`#0076ae`) — button fill; white label reads 5.0:1.
- `--to-accent-text` (`#00567f`) — links and active labels, 7.9:1.

The same pattern applies to every semantic pair: `--to-success` (text, AA) /
`--to-success-solid` (brand hex, marks) / `--to-success-subtle` (tint).

**Do not** hand-pick a brand hex for body text. Use the `-solid` token for a mark and the
bare token for text; that is the whole point of the split.

**Data visualisation** uses `--to-viz-1…6` in that order (Sky blue leads).

The print guidelines say support colours are used "never more than one at a time", which
initially looked like it forbade multi-series charts. **The supplied logo settles it:** the
FrieslandCampina star runs orange → lime → grass green → sky blue → magenta *simultaneously*.
The palette is designed to be seen together; the one-at-a-time rule governs support colour
as a decorative accent on print collateral, not categorical encoding. `--to-gradient-spectrum`
reproduces the star's sequence deliberately.

**Logo assets** live in `public/assets/`:

- `logo.png` — the supplied full lockup, **untouched**. Solid white background, **not
  alpha**, so on *any* surface that is not pure white it needs a white keeper plate
  (padding + radius + hairline). Since the pastel canvas landed that means everywhere:
  the sidebar brand block and the login card both plate it, in **both** themes. Never
  filter or recolour the mark to work around this.
- `logo-mark.png` — the star alone, 256px, **with a real alpha channel**. Derived from the
  lockup by isolating the largest 8-connected non-white component and un-premultiplying it
  against white; composited back over white it is pixel-exact. This is asset preparation,
  not recolouring. Use wherever the lockup will not fit: the collapsed icon rail, the login
  brand panel, favicons.
- `public/favicon.ico` (16/32/48), `favicon-192.png`, `favicon-512.png`,
  `apple-touch-icon.png` — all the star, wired up in `index.html`.

Regenerate the derived assets only from `logo.png`; never from a screenshot or a resized copy.

Dark mode overrides live under `[data-theme="dark"]` in `_theme.scss` (see §5 Stylesheet split).

### Stylesheet split — `_tokens.scss` vs `_theme.scss` (2026-08-24)

**Sass emits a copy of every real CSS rule into each compilation unit that `@use`s it, and
every Angular component stylesheet is its own compilation unit.** So a partial that
contains `:root { --to-*: … }` gets stamped, in full, into every component that imports it.
It was costing ~8 kB per component across ~60 components and it broke the production
per-component style budget.

| Partial | Contains | Who imports it |
|---|---|---|
| `_tokens.scss` | SCSS `$to-*` variables only. **Emits nothing.** | Every component: `@use '…/styles/tokens' as t;` |
| `_theme.scss` | The `:root`, `[data-theme='dark']` and `[data-density='compact']` custom-property blocks. **Emits CSS.** | `main.scss`, once, and nothing else |
| `_utilities.scss` | Mixins only. Emits nothing. | Any component |

**No component may ever `@use 'theme'`.** Components consume the runtime values through
`var(--to-*)`, which needs no import. The same rule applies to any future partial that
contains real rules rather than variables or mixins.

### Spacing
4px base unit. Use only: 4 / 8 / 12 / 16 / 24 / 32 / 48px. No arbitrary values.

### Border Radius
- 6px — controls (inputs, buttons, badges)
- 8px — cards, panels, dropdowns
- 12px — modals, large surface containers
- 9999px — pills / tags only

### Motion
- **150ms ease-out** remains the default for *state changes* — hover, focus, colour, width.
  Use the `motion()` mixin. Transitions on opacity, transform, background-color,
  border-color only.
- **Entrances** (added 2026-08-20) use `enter()` with `--to-motion-enter` (320ms) or
  `--to-motion-enter-slow` (520ms) and `--to-ease-out-quint`. Scoped to: wizard step
  transitions, the provisioning success mark, chart draw-on, dashboard tile arrival.
  This is a deliberate relaxation of the old "no decorative animation" rule — motion here
  shows continuity between steps and confirms completed actions. It is not licence to
  animate idle surfaces.
- **One looping animation exists** in the whole product: the "live" dot on the dashboard
  scope chip. Adding a second needs a reason as good.
- Respect `prefers-reduced-motion` — `motion()` shortens to 0ms, `enter()` removes the
  animation entirely. When suppressing a `stroke-dashoffset` draw, reset the offset too,
  or the mark stays invisible.

### Brand colour techniques (2026-08-20)

Beyond flat tokens, these are the sanctioned ways colour enters the UI. All are token-driven.

| Technique | Token | Where |
|---|---|---|
| **Tinted shadow / glow** | `--to-glow-accent`, `-sm`, `-success/warning/danger/critical` | Primary buttons, hovered cards, current wizard step, chart readout. The element glows in its own hue instead of casting grey. **Interactive/elevated things only** — never a resting surface. |
| **Gradient fill** | `--to-gradient-accent`, `-vivid` | Primary buttons, step markers, wizard progress fill |
| **Spectrum hairline** | `--to-gradient-spectrum` | 2px accents only. Runs orange→lime→green→sky→magenta, matching the star in the brandmark. Used on the shell top bar and the dashboard hero. |
| **Pastel canvas** | `--to-canvas-page`, `-rail`, `-topbar`, `-card`, `-hero` | The application chrome — page, sidebar, top bar, hero card. See below. |
| **Surface wash** | `--to-gradient-surface` | Legacy single-hue wash; prefer `--to-canvas-*` |
| **Derived tint** | `color-mix(in srgb, <hue> N%, var(--to-bg-1))` | Icon chips, table header, row hover, delta chips. Tracks light/dark automatically — one declaration, both themes. Prefer this over a second hardcoded hex. |
| **Table header** | `table-head()` mixin | Every table. Brand tint + 2px Sky Blue underline. |
| **Hover lift** | `lift-on-hover()` mixin | Stat tiles and other clickable cards |

### Pastel canvas (2026-08-24)

The chrome of the application is a **mesh** of the brandmark's own five hues held at 3–13%
alpha (roughly double that in dark mode) over a tinted near-white ground. Four soft radial
pools sit outside the viewport corners in the star's own order — sky top-left, magenta
top-right, lime bottom-right, grass bottom-left — so the surface never resolves into a
nameable shape or a gradient "panel", but the page is unmistakably coloured.

| Token | Surface |
|---|---|
| `--to-canvas-page` | The scrolling content area. `background-attachment: fixed` so the pools stay in their corners while content scrolls past. |
| `--to-canvas-rail` | Sidebar. Vertical run sky → lime → magenta. |
| `--to-canvas-topbar` | Top bar. Horizontal sky → magenta. |
| `--to-canvas-card` | The reference card wash — light pooling top-left, gone by mid-card. Opt in via the `pastel-card()` mixin. |
| `--to-canvas-hero` | Identity moments only: the dashboard hero, success states. |
| `--to-border-canvas` | Hairline between pastel surfaces. Cooler than `--to-border` so the seam doesn't read grey. |

**Two rules keep it from becoming soup:**

1. **Pastel goes on chrome, never on data.** Tables, forms, charts and every card that
   holds a figure stay on flat `--to-bg-1`. Tinting the surface under a status pill or a
   currency column changes what its colour *means*.
2. **One hero per page.** `pastel-card()` is opt-in. A page where every card is washed is
   just a tinted page, and there is no hero left.

**The restraint that makes it work:** white cards float on a coloured field. Colour still
appears on *interaction*, on *severity*, and at *identity moments* (login panel, top rail,
hero). If every card glowed, none would.

**Rails are the app's shared "state" language** — a 3px left/top bar in a semantic hue.
Used on sidebar active items, stat tiles, attention rows, toasts, access templates, the
expiry notice, and the summary panel. Reuse it rather than inventing a new indicator.

### Density
Two density modes, toggled by `[data-density="compact"]` on `<html>`:
- **Comfortable** (default): table rows 48px, form fields 40px, padding generous
- **Compact**: table rows 36px, form fields 32px, padding tight
Persisted to `localStorage` per user. MIS and Finance users will live in compact mode.

### Number & Currency Formatting
- **Format:** `1,000,000` (comma as thousands separator, period as decimal)
- **Currency:** PKR displayed as `PKR 1,000,000` — never Rs., never ₨
- Use Angular's `CurrencyPipe` with locale `en-PK` and custom formatting service in `src/app/core/services/format.service.ts`
- All currency values are integers (no paise). No decimal places on PKR amounts.

### Status Pills
All status indicators use the subtle background pattern — never saturated fills:
```html
<span class="to-status to-status--approved">Approved</span>
<span class="to-status to-status--pending">Pending</span>
<span class="to-status to-status--rejected">Rejected</span>
<span class="to-status to-status--draft">Draft</span>
<span class="to-status to-status--overdue">Overdue</span>
```

---

## 6. Application Shell

### Layout
**Full-height left sidebar + top utility bar.** Not top nav. Sidebar collapses to icon rail
on toggle, persisted to `localStorage`.

Revised 2026-08-24: the sidebar now runs the **full height** of the application, with the
top bar and content stacked to its right (Linear / Vercel / Stripe). The top bar previously
spanned the full width and carried the brand. It was moved because the FrieslandCampina
lockup is 2.18:1 — inside a 48px bar it capped at 61px wide and rendered the wordmark ~8px
tall, effectively illegible. A 200px-wide block at the top of the sidebar takes it to
~156px with the wordmark readable.

```
┌────────────┬────────────────────────────────────────┐
│ ▓▓ spectrum hairline (3px, full width) ▓▓▓▓▓▓▓▓▓▓▓▓ │
├────────────┼────────────────────────────────────────┤
│ ┌────────┐ │  [≡]      [⌘K Search]      [🔔][🌙][👤]│  ← Top bar (48px)
│ │  LOGO  │ │────────────────────────────────────────│
│ └────────┘ │  Breadcrumb                            │
│            │  Page title             [Actions]      │
│  Nav       │────────────────────────────────────────│
│  items     │                                        │
│            │  Content area (pastel canvas)          │
│            │                                        │
│  [«]       │                                        │
└────────────┴────────────────────────────────────────┘
```

### Top Bar (48px fixed)
- Left: sidebar toggle `[≡]`. **No brand and no product wordmark** — the brand lives in the
  sidebar, and "Trade Octane" as a text label was removed 2026-08-24 at the client's request.
- Centre: global command palette trigger `[⌘K Search]` — keyboard shortcut `Ctrl+K` / `Cmd+K`
- Right: environment badge (visible when mocks active) + notifications bell + dark/light toggle + user avatar/initials
- Painted from `--to-canvas-topbar`.

### Spectrum hairline (3px, above everything)
The brandmark's own colour sequence pinned across the full application width. It is the one
piece of FrieslandCampina identity on screen at every moment.

### Sidebar — Full Mode (200px)
- Brand block at top: the lockup on a Milk White keeper plate, hairline beneath
- Module nav items with icons (Tabler icons)
- Active item: filled Sky Blue gradient, white label, tinted glow, Together-green rail
- Pending-count badges on Claims and Approvals items
- Section dividers between module groups
- Collapse button `[«]` at bottom
- Painted from `--to-canvas-rail`.

### Sidebar — Icon Rail (48px)
- Brand block shows the star alone (`logo-mark.png`) at 26px — the wordmark is unreadable
  at this width, and dropping it beats shrinking it
- Icons only, tooltip on hover
- Badges collapse to a magenta dot on the icon's top-right corner
- Expand button `[»]`

### Content Area
- Breadcrumb below top bar
- Page header row: title (left) + primary actions (right)
- Filter/toolbar row when applicable
- Main content (table, form, dashboard widgets)
- Scroll-to-top button appears after 300px scroll

### Global Features
- **Command palette (⌘K):** search across screens and trigger actions. Mouse users reach it via the search bar click.
- **Notifications centre:** slide-over panel from bell icon. Shows pending approvals, scheme expirations, SAP sync alerts.
- **Unsaved changes guard:** `CanDeactivate` on all form screens. Confirmation dialog before leaving with unsaved data.
- **Session management:** idle timeout warning at 25 minutes, auto-logout at 30. Token refresh handled silently.
- **Scroll to top:** FAB bottom-right, appears after 300px scroll, smooth scroll.
- **Keyboard shortcuts:** `Ctrl+K` command palette, `Ctrl+S` save form, `Esc` close modal/drawer. All documented in a shortcuts help overlay (`?` key).
- **Right-click context menus** on table rows — mouse-oriented as client requested.
- **Style guide route:** `/style-guide` showing every component. Visible in mock mode only.

---

## 7. Modules & Screens

### Module Overview
| Module | Approx. Screens | Primary User Roles |
|---|---|---|
| Budget Management | 8–10 | RSM, Head of Sales, Finance, Admin |
| Scheme Management | 10–12 | Sales Ops, RSM, Trade Category |
| Claims & Trade Spend | 8–10 | Sales Ops, Finance, RSM |
| Distribution Management | 6–8 | Admin, RSM |
| Reports | 5–6 | MIS, Finance, Head of Sales |
| Admin / Master Data | 4–6 | Admin |

### POC Priority Screens (20–30)
[PENDING: finalise list with Adil after full KT sessions complete]

Confirmed priority based on kickoff sessions:
1. Login screen (mock role switcher)
2. Dashboard / approvals inbox
3. Budget Initiation form
4. Budget list view
5. Budget approval detail
6. Scheme Management list (BRD)
7. Scheme Management list (Trade Offer)
8. Scheme creation form (BRD)
9. Scheme creation form (Trade Offer)
10. Scheme bulk uploader
11. Claims list view
12. Claims detail / approval
13. Distribution management list
14. Distributor detail form
15. Reports — Budget consumed/unconsumed
16. Reports — Gross profit
17. User access / role management
18. Notifications centre

### Dashboard vs Workspace (added 2026-08-18)

Two distinct landing surfaces. Do not merge them.

| | **Dashboard** (`/dashboard`) | **My Workspace** (`/workspace`) |
|---|---|---|
| Purpose | Read-only overview — what is pending, what is off-track | The approvals desk — where decisions are made |
| Mode | Analysis | Queue |
| Content | Tiles, charts, "needs attention" cards | Split pane: list left, detail right |
| Actions | None. Every tile drills into a workspace | Approve / reject inline |
| Route | App landing page (`''` redirects here) | Deep-linkable per tab: `/workspace?tab=claim` |

Rules that keep the pair honest:

1. **Everything on the Dashboard is permission-filtered.** Tiles carry `requiredAnyOf: string[]`
   ("any of" — an approvals tile must not be gated on a single module's permission, or it
   vanishes for someone who approves a different module). Charts are gated on the permission
   that owns their subject. Chart aggregates are scoped to the user's regions/brands.
2. **Counts come from the live feature stores**, never a parallel summary endpoint. Approving
   in the workspace decrements the Dashboard tile and the sidebar badge with no refetch.
   A dashboard that disagrees with the screen it links to is worse than no dashboard.
3. **Labels must be true for the reader.** The desk tile reads "Awaiting my approval" for an
   approver and "My open items" for someone who cannot approve, and counts accordingly.

### Three Interaction Modes
Every screen in the app fits one of three modes. Design and layout must match the mode, not a one-size-fits-all template:

**Queue mode** — user's job is triage and decision-making on pending items (approvals inbox, claims queue). Layout: split pane — list left, detail right. Approve/reject without leaving the list.

**Builder mode** — user is creating or editing a record (budget initiation, scheme creation, distributor form). Layout: single-column form, progressive disclosure, live validation, live constraint feedback (headroom bar).

**Analysis mode** — user is reading data, spotting patterns, exporting (reports, dashboard widgets). Layout: full-width, dense table, filter panel, export controls prominent.

---

## 8. Key Business Rules (Frontend Impact)

These rules have direct UI implications. Get them right — they were the most-discussed items in kickoff.

### Budget
- Initiation cascade: Year → Region → Business Unit → Category → Brand → Master SKU. Each level filters the next. One-to-one mapping enforced. Display remaining headroom **live as the user types** — not as a post-submit error.
- Budget overrun = hard block with clear inline error and headroom visualisation.
- Approval chain: 3–4 dynamic levels based on role hierarchy. Show the full chain on the approval detail screen with who approved, who is current, who is next.
- Master data (from SAP) can change at runtime and affect live budgets. Show a "needs attention" indicator on affected records — never silent.

### Schemes
- Two separate scheme types: **BRD** and **Trade Offer**. Separate forms, separate sequence IDs (IDs can repeat across types — this is expected, not a bug).
- Single-slab discounts only. No multi-slab.
- Scheme expiry is instant via API call — confirm before triggering.
- Scheme copier / duplicator — pre-fills form with existing scheme data for editing.
- Bulk uploader: Excel file → client-side preview → backend validation → error display per row → verified submit. Validate discount column and liter column. Apply region/brand/Master SKU filter before verification.

### Claims
- Three types: Normal, Delay, Damage.
- Three-stage pipeline: VBase → Trade Spend → Pujar. Show pipeline stage visually on list and detail screens — not just a status column.
- Approval hierarchy is dynamic: depends on business type and claim value.
- After final approval: posts to SAP. Show posting status.

### Approval Chain Component (reusable)
Used across Budget, Scheme, Promotion, and Claims. Single component, configured via inputs:

```typescript
@Input() steps: ApprovalStep[];     // [{role, name, status, timestamp, remarks}]
@Input() currentStepIndex: number;
@Input() canApprove: boolean;       // from PermissionService
```

Displays: who approved with timestamp, current approver highlighted, pending steps greyed, remarks per step, inline approve/reject actions when `canApprove` is true.

---

## 9. Shared Components (Build Once, Use Everywhere)

Build these before touching any feature screen. They are the building blocks every screen assembles from.

| Component | Selector | Notes |
|---|---|---|
| Approval chain | `to-approval-chain` | See §8 |
| Cascading select | `to-cascading-select` | Year→Region→Business→Category→Brand→SKU pattern. Configurable levels. Saveable presets. |
| Bulk uploader | `to-bulk-uploader` | Excel upload, row-level error display, configurable column validators |
| Data table | `to-data-table` | Server-side pagination, virtual scroll, column show/hide, row right-click menu, bulk select, export (Excel/CSV/PDF), sticky header, sticky first column, saved views |
| Status pill | `to-status-pill` | Approved / Pending / Draft / Rejected / Overdue / Needs Attention |
| Page header | `to-page-header` | Title + breadcrumb + action slot (ng-content) |
| Filter bar | `to-filter-bar` | Chip-based active filters with clear-all, saved filter presets |
| Headroom bar | `to-headroom-bar` | Budget remaining visualisation. Inputs: total, consumed, pending. Updates reactively. |
| Pipeline stage | `to-pipeline-stage` | VBase → Trade Spend → Pujar. Configurable stages. |
| Confirm dialog | `to-confirm-dialog` | PrimeNG Dialog wrapper. Always used for destructive actions. |
| Empty state | `to-empty-state` | Icon + heading + description + optional action button. Never leave a blank screen. |
| Skeleton loader | `to-skeleton` | Matches the layout of the content it is loading. |
| Activity timeline | `to-activity-timeline` | Audit trail. Used on approval detail screens for remarks history. |
| Number display | `to-number` | Applies tabular-nums, PKR formatting, sign colouring for +/- values. |
| Bar chart | `to-bar-chart` | Horizontal bars. `unit`: pkr / litres / count. `categorical` colours each bar from the viz series; a bar over its `total` always renders in Passion red. |
| Donut chart | `to-donut-chart` | Inline-SVG arcs + legend with centre total. Designed for 2–5 slices. |
| Trend chart | `to-trend-chart` | Area + smooth line over time, hover readout. Y axis is floored at zero, never at the series minimum. |
| Segmented meter | `to-segmented-meter` | One bar split into brand-coloured composition segments |
| Stat tile | `to-stat-tile` | Compact KPI (~84px): icon chip, figure, delta chip, full-width label |
| Wizard steps | `to-wizard-steps` | Stepper header. Backwards always allowed; forwards gated on `furthestReached`. |
| Success panel | `to-success-panel` | Drawn checkmark + projected body/actions, for completed multi-step flows |

**Charts are hand-built, not library-backed.** No chart.js, no ngx-charts. Three reasons:
no new dependency on a locked stack; the marks read `--to-viz-*` directly so a palette
change propagates with zero chart config; and at 3–6 categorical marks a library is pure
weight. Revisit only if a chart genuinely needs axes, zoom, or time series.

**Dashboard density rule.** Every figure carries a `Delta` — a bare number is close to
useless without a comparison. `Delta.good` is separate from `Delta.direction` on purpose:
rising volume is good, rising SLA breaches is not, and colour must follow the *meaning*,
never the arrow direction.

---

## 10. Folder Structure

```
src/
  app/
    core/
      interceptors/
        auth.interceptor.ts
        error.interceptor.ts
        loading.interceptor.ts
      guards/
        permission.guard.ts
        unsaved-changes.guard.ts
      services/
        auth.service.ts
        permission.service.ts
        format.service.ts       ← PKR formatting, number display
        notification.service.ts
        loading.service.ts
      models/
        user-context.model.ts
        role.model.ts
    shared/
      components/               ← All shared components from §9
      directives/
        has-permission.directive.ts
      pipes/
        pkr-currency.pipe.ts
        relative-date.pipe.ts
      validators/
        required-if.validator.ts
        date-range.validator.ts
    layout/
      shell/
        shell.component.ts      ← Top bar + sidebar + router-outlet
      sidebar/
        sidebar.component.ts
      command-palette/
        command-palette.component.ts
    features/
      auth/
        login/
      dashboard/                ← landing page: tiles + charts, read-only
        models/dashboard.model.ts
        services/{dashboard,mock-dashboard}.service.ts
      workspace/                ← the approvals desk (was features/dashboard pre-2026-08-18)
        models/approval-item.model.ts
        services/{approvals,mock-approvals}.service.ts
      admin/
        user-management/
          user-list/            ← who can sign in, revoke/restore
          user-form/            ← provisioning: identity → access → scope
          access-summary/       ← live grant summary panel
          permission-matrix/    ← module × action grid (reusable)
          models/admin-user.model.ts
          services/{admin-users,mock-admin-users}.service.ts
      budget/
        budget-list/
        budget-initiation/
        budget-detail/
        budget-approval/
        services/
          budget.service.ts
          mock-budget.service.ts
        models/
          budget.model.ts
      schemes/
        scheme-list-brd/
        scheme-list-trade-offer/
        scheme-form-brd/
        scheme-form-trade-offer/
        scheme-bulk-upload/
        services/
        models/
      claims/
        claims-list/
        claims-detail/
        services/
        models/
      distribution/
        distributor-list/
        distributor-detail/
        services/
        models/
      reports/
        budget-report/
        gross-profit-report/
        services/
        models/
      admin/
        user-management/
        master-data/
    style-guide/                ← Visible in mock mode only
  styles/
    _tokens.scss                ← SCSS variables only. Emits no CSS. Components @use this.
    _theme.scss                 ← ALL --to-* custom properties (light/dark/density).
                                   EMITS CSS — imported by main.scss and nothing else.
    _typography.scss            ← Font face, type scale utilities
    _primeng-overrides.scss     ← PrimeNG theme overrides
    _utilities.scss             ← Mixins: respond-to, motion, truncate
    _reset.scss                 ← Minimal reset on top of PrimeNG base
    main.scss                   ← Imports all partials. No rules here.
  environments/
    environment.ts              ← { production: false, useMocks: true, apiBase: '' }
    environment.prod.ts         ← { production: true, useMocks: false, apiBase: '[PENDING]' }
```

---

## 11. Build Order

Execute in this sequence. Do not skip ahead — each phase unblocks the next.

**Phase 0 — Foundation (do before any feature screen)**
1. Angular 21 project scaffold with zoneless, strict TS, standalone
2. `_theme.scss` — full token set (light + dark); `_tokens.scss` — compile-time SCSS vars
3. `_primeng-overrides.scss` — theme aligned to design tokens
4. Shell layout component (sidebar + top bar + router-outlet)
5. Mock auth service + role switcher dev panel
6. `PermissionService` + `*toHasPermission` directive + `PermissionGuard`
7. All shared components from §9
8. `/style-guide` route

**Phase 1 — POC Priority Screens**
Follow the priority list in §7. Budget Initiation first — it establishes the cascading-select + approval-chain + headroom-bar pattern that all subsequent builder-mode screens reuse.

**Phase 2 — Remaining Screens**
Fill out the full 50–60 screen count as KT sessions complete and specs arrive from Saima.

---

## 12. Git & CI

- **Repo:** GitHub (to be created — name: `trade-octane-frontend`)
- **Branching:** `main` is always deployable. Feature branches: `feature/budget-initiation`, `feature/scheme-list-brd` etc. Executor writes to feature branches. Talal reviews and merges.
- **Commits:** conventional commit format — `feat(budget): add initiation form with cascading selects`
- **CI:** GitHub Actions on every push — `ng lint`, `ng build`, `ng test --watch=false`. No push that breaks build or lint.
- **Never commit:** `environment.prod.ts`, API keys, mock data files containing client-sensitive field values.

---

## 13. Subagent Instructions

When Talal gives you a task, decide which subagent to spawn:

| Task type | Spawn |
|---|---|
| Design a component interface, decide folder structure, spec a screen from KT transcript | **planner** (Sonnet) |
| Scaffold a component, write a service, generate mock data, create a form | **executor** (Sonnet) |
| Install a package, check PrimeNG docs, search for an error message, verify Angular version compat | **researcher** (Haiku) |
| Anything requiring full project context + judgment across multiple concerns | Handle yourself (Opus) |

Always read this file (`CLAUDE.md`) at the start of every session. If `tasks.md` exists, read it too.

After completing any task that writes files, update `tasks.md` with what was done and what is next.

### Executor rules (enforce on every generated file)
- Standalone component: `standalone: true`, no `NgModule`
- Control flow: `@if` / `@for` — never `*ngIf` / `*ngFor`
- Signals for state: `signal()` / `computed()` — never `BehaviorSubject` for component state
- Reactive Forms with `nonNullable: true`
- SCSS using token variables — never hardcoded colours or spacing
- Tabular numerals on all numeric displays
- Every component has: an empty state, a skeleton loader state, an error state
- PKR formatting via `PkrCurrencyPipe` — never raw `CurrencyPipe` with default settings
- No `console.log` in committed code

---

## 14. Pending Items

Items marked `[PENDING]` need resolution before the relevant screens can be built. Do not block on these — stub with placeholders and flag to Talal.

| # | Item | Owner | Needed for |
|---|---|---|---|
| ~~1~~ | ~~Friesland brand accent hex~~ | ~~Adil Saeed~~ | **RESOLVED 2026-08-18** — Sky Blue `#0094d9` (pms 3005), from the Corporate Identity Guidelines PDF. See §5 Color Tokens. |
| 2 | Responsive scope (desktop-only or tablet too?) | Adil Saeed | Every component |
| 3 | Browser support matrix | Adil Saeed / Friesland IT | CSS/JS feature decisions |
| 4 | Final POC screen list (20–30) | Adil Saeed | Phase 1 build order |
| 5 | API base URL + auth header format for test env | Zeeshan Aameer | Mock-to-real service swap |
| 6 | PrimeNG licensing status for client deliverable | Adil Saeed | Library decision confirmation |
| 7 | Typeface: guidelines name **Verdana** as the digital typeface; we ship **Inter**. Confirm the substitution or budget for the swap. | Adil Saeed / Noor Wasti | §5 Typography |
| ~~8~~ | ~~Multi-series charts use several support colours at once~~ | — | **RESOLVED 2026-08-20** — the supplied logo is polychrome (the star combines five support colours), so the palette is designed to co-occur. See §5 Color Tokens. |
| 9 | "Aggressive" visual register is currently delivered via colour, rails and density — type weight is still capped at 500 per §5. Confirm whether weight 600 may be unlocked for KPI figures. | Adil Saeed | Dashboard / KPI tiles |
| 10 | Access-template catalogue (`ACCESS_TEMPLATES`) is seeded from the KT role list. Needs business sign-off on the exact permission bundle per role. | Saima Aslam / Sufyan | Admin user provisioning |
| 11 | Approval-hierarchy designer (drag-and-drop, business-type × group × request-type) is not built — provisioning covers *user → role → permission* only. | Adil Saeed | Admin 2.0 scope |

---

## 15. MCP Tools Available

*(Update this section as tools are added)*

Currently connected:
- **Fireflies MCP** — pull meeting transcripts from KT sessions. Use when a screen spec needs business rule clarification from recorded sessions.
- **Google Drive MCP** — access shared project documents.

Planned additions:
- **21st.dev Magic MCP** — generate polished UI components on demand. Use for: complex UI compositions, data visualisation widgets, anything requiring precise visual polish. Do NOT use for: business-logic-heavy components, anything tightly coupled to `PermissionService` or mock data layer.

---

*Last updated: 7 September 2026 — Administration 1.0 wired to the real API contract.*
*This file is the single source of truth for all frontend decisions on Trade Octane.*
