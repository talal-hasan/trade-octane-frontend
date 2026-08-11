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
- All design tokens defined as CSS custom properties in `src/styles/_tokens.scss` and as SCSS variables. Components reference tokens only — never hardcoded values.
- Component stylesheets use `@use '../../../styles/tokens' as t`.
- Dark mode via `[data-theme="dark"]` on `<html>`. Token overrides in `_tokens.scss` under that selector. Zero component-level dark mode logic.
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
- Login screen: branded split-panel with "Sign in with Friesland Campina" button. No username/password form.
- **Role switcher in mock auth** — critical for POC client vetting. Talal must be able to switch roles (RSM, Admin, Head of Sales, Distributor, MIS, Trade Category) without logging out. Implement as a floating dev panel visible only when `environment.useMocks = true`.

### Routing
- Feature modules are lazy-loaded via `loadComponent()` / `loadChildren()`.
- Every route has a `canActivate` guard using `PermissionGuard`.
- Route data carries `{ requiredPermission: 'BUDGET_VIEW' }` — guard checks against `PermissionService`.

---

## 4. RBAC — Role-Based Access Control

This is the most complex part of the system. Get it right from the start.

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
```scss
// Base — light mode defaults
--to-bg-0: #f8f8f7;          // page background
--to-bg-1: #ffffff;          // card / panel surface
--to-bg-2: #f3f3f2;          // subtle fill (table rows, inputs)
--to-border: #e5e5e3;        // hairline borders
--to-border-strong: #d1d1ce; // hover borders, dividers
--to-text-primary: #1a1a18;  // headings, labels
--to-text-secondary: #595957;// body, descriptions
--to-text-muted: #8f8f8c;    // placeholders, timestamps

// Accent (Friesland blue — [PENDING: confirm hex with client])
--to-accent: #1a5fa8;
--to-accent-subtle: #e8f1fb;
--to-accent-text: #0c3d6e;

// Semantic
--to-success: #1a7a4a;
--to-success-subtle: #e6f5ec;
--to-warning: #956800;
--to-warning-subtle: #fef7e0;
--to-danger: #c0392b;
--to-danger-subtle: #fde8e6;

// Dark mode overrides under [data-theme="dark"] in _tokens.scss
```

### Spacing
4px base unit. Use only: 4 / 8 / 12 / 16 / 24 / 32 / 48px. No arbitrary values.

### Border Radius
- 6px — controls (inputs, buttons, badges)
- 8px — cards, panels, dropdowns
- 12px — modals, large surface containers
- 9999px — pills / tags only

### Motion
- 150ms ease-out for all transitions. No decorative animation.
- Transitions on: opacity, transform, background-color, border-color only.
- Respect `prefers-reduced-motion` — wrap all transitions in the mixin in `_utilities.scss`.

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
**Left sidebar + top utility bar.** Not top nav. Sidebar collapses to icon rail on toggle, persisted to `localStorage`.

```
┌─────────────────────────────────────────────────────┐
│  [≡] Trade Octane    [⌘K Search]         [🔔][👤]  │  ← Top bar (48px)
├──────────┬──────────────────────────────────────────┤
│          │  Breadcrumb                               │
│  Icon    │  Page title              [Actions]        │
│  Rail    │──────────────────────────────────────────│
│  or      │                                           │
│  Full    │  Content area                             │
│  Sidebar │                                           │
│          │                                           │
│  [«]     │                                           │
└──────────┴──────────────────────────────────────────┘
```

### Top Bar (48px fixed)
- Left: sidebar toggle `[≡]` + logo/product name
- Centre: global command palette trigger `[⌘K Search]` — keyboard shortcut `Ctrl+K` / `Cmd+K`
- Right: environment badge (visible when mocks active) + notifications bell + dark/light toggle + user avatar/initials

### Sidebar — Full Mode (200px)
- Module nav items with icons (Tabler icons)
- Pending-count badges on Claims and Approvals items
- Section dividers between module groups
- Collapse button `[«]` at bottom

### Sidebar — Icon Rail (48px)
- Icons only, tooltip on hover
- Badges visible on icon
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
      dashboard/
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
    _tokens.scss                ← ALL CSS custom properties and SCSS variables
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
2. `_tokens.scss` — full token set (light + dark)
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
| 1 | Friesland brand accent hex | Adil Saeed | Full design token finalisation |
| 2 | Responsive scope (desktop-only or tablet too?) | Adil Saeed | Every component |
| 3 | Browser support matrix | Adil Saeed / Friesland IT | CSS/JS feature decisions |
| 4 | Final POC screen list (20–30) | Adil Saeed | Phase 1 build order |
| 5 | API base URL + auth header format for test env | Zeeshan Aameer | Mock-to-real service swap |
| 6 | PrimeNG licensing status for client deliverable | Adil Saeed | Library decision confirmation |

---

## 15. MCP Tools Available

*(Update this section as tools are added)*

Currently connected:
- **Fireflies MCP** — pull meeting transcripts from KT sessions. Use when a screen spec needs business rule clarification from recorded sessions.
- **Google Drive MCP** — access shared project documents.

Planned additions:
- **21st.dev Magic MCP** — generate polished UI components on demand. Use for: complex UI compositions, data visualisation widgets, anything requiring precise visual polish. Do NOT use for: business-logic-heavy components, anything tightly coupled to `PermissionService` or mock data layer.

---

*Last updated: August 2026 — Talal, Frontend Lead*
*This file is the single source of truth for all frontend decisions on Trade Octane.*
