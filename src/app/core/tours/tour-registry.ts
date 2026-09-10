import { TourDefinition } from '../services/tour.service';

// ─────────────────────────────────────────────────────────────────────────────
// Every screen's walkthrough, in one place, keyed by route.
//
// Registering centrally rather than per component is what keeps this from becoming
// boilerplate: a screen needs `data-tour` attributes on the things worth pointing at and
// nothing else. The shell reads this registry, auto-starts an unseen tour and renders the
// help button, so no component imports the tour service at all.
//
// Targets are matched on `data-tour` attributes rather than classes. A class is a styling
// decision and will eventually be renamed by someone with no idea a tour depends on it;
// `data-tour` announces that something points here.
//
// **Steps describe the decision, not the widget.** "Click the dropdown" teaches nothing a
// user cannot already see. What they cannot see is which choice narrows the next one, which
// number means something is wrong, and which action has consequences they cannot undo.
// ─────────────────────────────────────────────────────────────────────────────

export const USERS_LIST_TOUR: TourDefinition = {
  id: 'users-list',
  label: 'How the user directory works',
  steps: [
    {
      target: '[data-tour="users-tabs"]',
      title: 'Filter by what you are actually looking for',
      body: 'Locked accounts need a lock cleared. Pending ones were provisioned but never signed in — useful for chasing onboarding. Inactive cannot sign in at all.',
    },
    {
      target: '[data-tour="users-search"]',
      title: 'Search covers name, login and email',
      body: 'Searching runs on the server across the whole directory, not just the page you are looking at.',
    },
    {
      target: '[data-tour="users-status"]',
      title: 'Status and resignation are separate',
      body: 'Someone can have resigned and still hold a working account — that is exactly the case worth spotting, so resignation has its own column rather than being folded into the status.',
    },
    {
      target: '[data-tour="users-actions"]',
      title: 'Only safe actions live on a row',
      body: 'Activate, deactivate and unlock are here. Anything that needs context — roles, regions, brands, access — is on the user, because granting access from a list row is how people grant the wrong thing.',
    },
    {
      target: '[data-tour="users-export"]',
      title: 'Export gives you the filtered set',
      body: 'The CSV matches whatever filters and search are applied, not the whole directory.',
    },
  ],
};

export const USER_DETAIL_TOUR: TourDefinition = {
  id: 'user-detail',
  label: 'How to grant a user access',
  steps: [
    {
      target: '[data-tour="user-identity"]',
      title: 'The login name is the real identifier',
      body: 'Every API path and every audit row keys on it. When you cross-reference anything about this person, this is the value to use.',
    },
    {
      target: '[data-tour="user-tabs"]',
      title: 'One person, every facet',
      body: 'The legacy system had a separate menu item for each of these. You only see the tabs you have been granted, so this consolidation did not widen anyone access.',
    },
    {
      target: '[data-tour="user-tabs"]',
      title: 'Roles first, then the exceptions',
      body: 'Roles carry menu access, so granting a role is usually the whole job. Regions and brands scope the data they see. Use Access only for someone who needs something their role does not give them.',
    },
    {
      target: '[data-tour="user-header-actions"]',
      title: 'Deactivating drops cached grants',
      body: 'Their roles and mappings are kept, so reactivating restores everything. Unlocking clears a failed-sign-in lock and leaves the password alone.',
    },
  ],
};

export const USER_CREATE_TOUR: TourDefinition = {
  id: 'user-create',
  label: 'How to create a user',
  steps: [
    {
      target: '[data-tour="create-check"]',
      title: 'Always check the email first',
      body: 'It tells you whether this person already has an account — creating a second one is the wrong fix — and fills in the rest of the form if the directory knows them.',
    },
    {
      target: '[data-tour="create-login"]',
      title: 'The login name is permanent in practice',
      body: 'It is the key every audit row and API path uses. Changing it later breaks the trail, so get it right now.',
    },
    {
      target: '[data-tour="create-summary"]',
      title: 'Creating an account grants nothing',
      body: 'No roles, no scope, no screens. They can sign in and see an empty app. You will land on their Roles tab next, which is where access actually starts.',
    },
  ],
};

export const ROLES_TOUR: TourDefinition = {
  id: 'roles-list',
  label: 'How roles work',
  steps: [
    {
      target: '[data-tour="roles-grid"]',
      title: 'The user count is the blast radius',
      body: 'Editing a role changes access for everyone holding it. That number is here, in front of the decision, rather than after you have made it.',
    },
    {
      target: '[data-tour="roles-tabs"]',
      title: 'Inactive roles still matter',
      body: 'A retired role can still have people attached. Those grants authorise nothing, which is exactly the sort of thing worth finding.',
    },
  ],
};

export const ROLE_ACCESS_TOUR: TourDefinition = {
  id: 'role-access',
  label: 'How to edit role access',
  steps: [
    {
      target: '[data-tour="role-reach"]',
      title: 'Read this before you change anything',
      body: 'Every tick here applies to all of these people immediately. This is the highest blast-radius action in Administration and the only one where the person making the change is not the person affected.',
    },
    {
      target: '[data-tour="role-filter"]',
      title: 'Filter rather than scroll',
      body: 'The tree covers the whole menu. Filtering by name or page is faster than hunting, and a parent stays visible when one of its children matches.',
    },
    {
      target: '[data-tour="role-tree"]',
      title: 'Flags mark grants that do nothing',
      body: 'Orphaned means the menu item no longer exists. Hidden means it is inactive, so the grant has no effect. Both look like working access until you check.',
    },
  ],
};

export const ACCESS_EXPLORER_TOUR: TourDefinition = {
  id: 'access-explorer',
  label: 'How to audit access',
  steps: [
    {
      target: '[data-tour="ax-sources"]',
      title: 'Five legacy grids, one screen',
      body: 'Each of these was its own page in the legacy system. Hover a tab to see what it used to be called.',
    },
    {
      target: '[data-tour="ax-dead"]',
      title: 'This is the filter worth knowing about',
      body: 'It shows mappings that exist and authorise nothing — a role that is inactive, a menu that was deleted, a user who was disabled. These are the grants people believe are working.',
    },
    {
      target: '[data-tour="ax-export"]',
      title: 'Export what you filtered',
      body: 'The CSV matches the current source and filters, which makes this the fastest way to hand someone an access review.',
    },
  ],
};

export const MENUS_TOUR: TourDefinition = {
  id: 'menus-list',
  label: 'How the menu catalogue works',
  steps: [
    {
      target: '[data-tour="menus-octane"]',
      title: 'Two applications, one catalogue',
      body: 'Administration 1.0 is the legacy tree; 2.0 is the ported one. The same row can be live in one and hidden in the other, which is what the mismatch flag counts.',
    },
    {
      target: '[data-tour="menus-id"]',
      title: 'The ID is the join key',
      body: 'This portal maps menu IDs to its own screens. It is the value to quote when a menu row is not appearing where you expect.',
    },
    {
      target: '[data-tour="menus-portal"]',
      title: 'Ported or legacy-only',
      body: '"Ported" means this portal has a real screen for the row. "Legacy only" means it appears under More and opens the old portal.',
    },
    {
      target: '[data-tour="menus-new"]',
      title: 'A new row grants nothing',
      body: 'Creating a menu item makes it exist, not visible. Somebody has to grant it to a role or a user before anyone can reach it.',
    },
  ],
};

export const APPROVAL_ROUTING_TOUR: TourDefinition = {
  id: 'approval-routing',
  label: 'How to re-route stuck approvals',
  steps: [
    {
      target: '[data-tour="ar-census"]',
      title: 'This is why the screen exists',
      body: 'Approvals sitting with someone who cannot action them never drain on their own. In the legacy data thousands of rows hold a dropdown placeholder rather than a person.',
    },
    {
      target: '[data-tour="ar-filters"]',
      title: 'Narrow to a table and a stage',
      body: 'An approval queue is a table plus a stage plus a holder. Filtering to the one you care about is faster than reading the census.',
    },
    {
      target: '[data-tour="ar-queues"]',
      title: 'Amber means it cannot drain',
      body: 'The holder is deactivated or was never a user account. Selecting a queue previews exactly what would move.',
    },
    {
      target: '[data-tour="ar-panel"]',
      title: 'Preview, then hand it over',
      body: 'The count you see is the count the server checks as it runs. If the queue changes in between, the whole transfer rolls back rather than half-applying.',
    },
  ],
};

export const ACTIVITY_LOGS_TOUR: TourDefinition = {
  id: 'activity-logs',
  label: 'How to search the audit trail',
  steps: [
    {
      target: '[data-tour="logs-groups"]',
      title: 'Narrow by who acted',
      body: 'Systems and Distributors are usually noise when you are investigating a person, and filtering them out first makes everything else readable.',
    },
    {
      target: '[data-tour="logs-dates"]',
      title: 'Bound the window',
      body: 'The trail is large. A date range is the difference between an answer and a scroll.',
    },
    {
      target: '[data-tour="logs-record"]',
      title: 'The record column is the link back',
      body: 'Table plus unique code identifies exactly what was touched, which is what you quote when raising anything with the backend team.',
    },
  ],
};

export const FREQUENCY_TOUR: TourDefinition = {
  id: 'frequency',
  label: 'How to configure scheme frequency',
  steps: [
    {
      target: '[data-tour="freq-table"]',
      title: 'Edit in place, compare down the column',
      body: 'Cadences are set by comparing a scheme against its neighbours, so the numbers stay editable in the row. Save appears only on rows you have changed.',
    },
    {
      target: '[data-tour="freq-accruals"]',
      title: 'Accruals is a toggle, saved immediately',
      body: 'Unlike the cadence fields, this writes as soon as you click it — there is nothing to compare it against, so there is nothing to review.',
    },
    {
      target: '[data-tour="freq-bulk"]',
      title: 'Prior months apply to many schemes at once',
      body: 'Tick the schemes in the table, set the window, apply. This is one policy across many schemes rather than fifty individual edits — and it changes what users can submit immediately.',
    },
  ],
};

export const INTEGRATION_TOUR: TourDefinition = {
  id: 'integration',
  label: 'How to run an integration',
  steps: [
    {
      target: '[data-tour="int-sap"]',
      title: 'Check SAP is actually reachable',
      body: 'When it is not, the rows below are whatever was cached. They look authoritative either way, so this flag is worth reading first.',
    },
    {
      target: '[data-tour="int-batches"]',
      title: 'Pick the batches to push',
      body: 'Select individually or take the whole page from the header checkbox.',
    },
    {
      target: '[data-tour="int-dry"]',
      title: 'Dry run first — it is on by default',
      body: 'This posts to SAP and cannot be undone from here. A dry run evaluates everything and reports what would happen without sending anything.',
    },
    {
      target: '[data-tour="int-runs"]',
      title: 'Runs are asynchronous',
      body: 'Starting one queues it; the list updates itself while anything is still moving. Open a run to see per-record outcomes, including partial successes.',
    },
  ],
};

export const ACCOUNT_TOUR: TourDefinition = {
  id: 'account',
  label: 'About your account',
  steps: [
    {
      target: '[data-tour="account-facts"]',
      title: 'Your login and roles',
      body: 'Roles are what grant you screens. If something you expect is missing from the sidebar, this is the first thing to check against.',
    },
    {
      target: '[data-tour="account-form"]',
      title: 'Name and email save with the password',
      body: 'The API takes them on the same request, so correcting a typo does not need a separate trip.',
    },
  ],
};

// ─── Route → tour ─────────────────────────────────────────────────────────────

interface RouteTour {
  /** Matched against the path, most specific first. */
  match: (path: string) => boolean;
  tour: TourDefinition;
}

const exact = (route: string) => (path: string) => path === route;
const startsWith = (route: string) => (path: string) => path.startsWith(route);

/**
 * Order matters: `/admin/users/new` must be tested before `/admin/users/:id`, and both
 * before `/admin/users`. The list is arranged specific-to-general for that reason.
 */
const ROUTE_TOURS: RouteTour[] = [
  { match: exact('/admin/users/new'), tour: USER_CREATE_TOUR },
  { match: (p) => /^\/admin\/users\/[^/]+$/.test(p), tour: USER_DETAIL_TOUR },
  { match: exact('/admin/users'), tour: USERS_LIST_TOUR },

  { match: (p) => /^\/admin\/roles\/[^/]+$/.test(p), tour: ROLE_ACCESS_TOUR },
  { match: exact('/admin/roles'), tour: ROLES_TOUR },

  { match: startsWith('/admin/access-explorer'), tour: ACCESS_EXPLORER_TOUR },
  { match: exact('/admin/menus'), tour: MENUS_TOUR },
  { match: startsWith('/admin/approval-routing'), tour: APPROVAL_ROUTING_TOUR },
  { match: startsWith('/admin/activity-logs'), tour: ACTIVITY_LOGS_TOUR },
  { match: startsWith('/admin/frequency'), tour: FREQUENCY_TOUR },
  { match: startsWith('/admin/integration'), tour: INTEGRATION_TOUR },
  { match: startsWith('/account'), tour: ACCOUNT_TOUR },
];

/**
 * The tour for a URL, or null.
 *
 * Ownership is deliberately absent: it has one tour per tab, so that screen resolves its
 * own and the shell defers to it (see `TourService.setRouteTour`).
 */
export function tourForRoute(url: string): TourDefinition | null {
  const path = url.split('?')[0].split('#')[0];
  return ROUTE_TOURS.find((entry) => entry.match(path))?.tour ?? null;
}
