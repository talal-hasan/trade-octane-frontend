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

/**
 * The Resignation tab has its own tour rather than a step inside the user-detail one,
 * because what it has to explain is not "where things are" — it is that the screen it
 * replaces was storing wrong dates, and how to tell whether this record is one of them.
 */
export const USER_RESIGNATION_TOUR: TourDefinition = {
  id: 'user-resignation',
  label: 'How resignation dates work',
  steps: [
    {
      target: '[data-tour="resignation-current"]',
      title: 'A stamped date is not a leaving date',
      body: 'Deactivating an account puts the current moment in this column when nothing is recorded. That is when the account was switched off, not the day the person left — the card tells you which of the two you are looking at.',
    },
    {
      target: '[data-tour="resignation-panel"]',
      title: 'The date is never typed as text',
      body: 'The legacy screen took dd-MM-yyyy as free text and let the database decide which half was the day, so 5 March could be stored as 3 May. The field here hands over an unambiguous date, whatever format your browser shows you.',
    },
    {
      target: '[data-tour="resignation-panel"]',
      title: 'Recording a resignation grants and revokes nothing',
      body: 'The account still works. Deactivate them in the header when their access should actually end — and note that reactivating an account erases the date recorded here.',
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

export const RE_ROUTE_TOUR: TourDefinition = {
  id: 're-route',
  label: 'How to re-route pending approvals',
  steps: [
    {
      target: '[data-tour="rr-views"]',
      title: 'Start from the work that cannot move',
      body: 'Needs re-routing counts approvals held by a deactivated account or by leftover text such as “Please Select”. Nobody can sign in as those, so the work never moves on its own.',
    },
    {
      target: '[data-tour="rr-filters"]',
      title: 'The old dropdowns, as filters',
      body: 'Table, Level and Role are the old screen’s dropdowns — but they narrow a list you can already see, instead of standing between you and it.',
    },
    {
      target: '[data-tour="rr-list"]',
      title: 'One row per approver',
      body: 'Everything a person holds, across every table and level, with how long the oldest item has waited. Arrow keys walk the list.',
    },
    {
      target: '[data-tour="rr-detail"]',
      title: 'Check, choose, re-route',
      body: 'Only people who share the approver’s role are offered, as before. Each queue moves only if it still holds exactly the rows counted — otherwise it is left untouched and you are asked to look again.',
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
      target: '[data-tour="freq-groups"]',
      title: 'Pick the scheme groups to work on',
      body: 'Tick as many groups as you need — every group starts ticked. Select all and None set them in one click. Unticking a group also unticks its schemes, so a prior-month change never reaches a scheme you cannot see.',
    },
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

export const DISTRIBUTORS_TOUR: TourDefinition = {
  id: 'admin2-distributors',
  label: 'How distributor accounts work',
  steps: [
    {
      target: '[data-tour="dst-tabs"]',
      title: 'Active is what can sign in',
      body: 'Locked accounts are still active — the lock only stops the SSO sign-in. Inactive accounts were deactivated and cannot sign in at all.',
    },
    {
      target: '[data-tour="dst-search"]',
      title: 'Search is instant',
      body: 'The whole directory is already loaded, so search, the business type filter and sorting never wait on the server.',
    },
    {
      target: '[data-tour="dst-actions"]',
      title: 'Lock is not a hard stop',
      body: 'The password sign-in does not check the lock. To stop a distributor signing in at all, deactivate them — there is no screen to reactivate an account afterwards.',
    },
    {
      target: '[data-tour="dst-new"]',
      title: 'One account per distributor',
      body: 'Only distributors from the master without an account are offered, so a duplicate cannot be started.',
    },
  ],
};

export const DISTRIBUTOR_FORM_TOUR: TourDefinition = {
  id: 'admin2-distributor-form',
  label: 'How to create a distributor account',
  steps: [
    {
      target: '[data-tour="df-distributor"]',
      title: 'Pick from the master',
      body: 'The ID becomes the sign-in name and the name comes from the master. Distributors the master records as resigned are listed last and flagged.',
    },
    {
      target: '[data-tour="df-location"]',
      title: 'Region, then area, then territory',
      body: 'Changing one clears what is below it, and a level with only one choice fills itself in.',
    },
    {
      target: '[data-tour="df-password"]',
      title: 'The rules turn green as you type',
      body: 'They are the rules the server applies, including that the password must not contain the distributor ID. On edit, leave it blank to keep the current password.',
    },
    {
      target: '[data-tour="df-summary"]',
      title: 'Check the summary before saving',
      body: 'It shows the account as it will be saved. When editing, it lists every change against what is stored.',
    },
  ],
};

export const DISTRIBUTOR_ACCESS_TOUR: TourDefinition = {
  id: 'admin2-distributor-access',
  label: 'How distributor access works',
  steps: [
    {
      target: '[data-tour="da-grid"]',
      title: 'The grid is the picker',
      body: 'Click a name to read exactly what that distributor holds. Tick several to give them all the same menu — that is the one write this screen performs.',
    },
    {
      target: '[data-tour="da-tree"]',
      title: 'The ticks are what they will hold',
      body: 'Not what they hold now: saving replaces each selected distributor’s set with exactly these items. Where the selection differs today, the row shows the spread, such as 3 of 7.',
    },
    {
      target: '[data-tour="da-save"]',
      title: 'The effect is stated before the save',
      body: 'The panel lists which distributors change and what each gains and loses. The legacy screen never ticked the tree, so every save there revoked whatever was not re-ticked.',
    },
    {
      target: '[data-tour="da-actions"]',
      title: 'Delete is the legacy Delete',
      body: 'It deactivates the account — the record, its claims and its menu grants are kept, and there is no screen to reactivate one.',
    },
  ],
};

export const ROLES_2_TOUR: TourDefinition = {
  id: 'admin2-roles',
  label: 'How Administration 2.0 roles work',
  steps: [
    {
      target: '[data-tour="r2-flags"]',
      title: 'One column per claim permission',
      body: 'Compare a permission down the page. Hover a heading for what it does — two of the four are stored but read by nothing today.',
    },
    {
      target: '[data-tour="r2-menus"]',
      title: 'The screens a role opens',
      body: 'How many menu items the role grants. Click it to see the menu tree and change which screens everyone holding the role can open.',
    },
    {
      target: '[data-tour="r2-usage"]',
      title: 'What an edit reaches',
      body: 'Accounts holding the role, the claim approval steps it sits in and its authority levels.',
    },
    {
      target: '[data-tour="r2-tabs"]',
      title: 'Deactivating revokes nothing',
      body: 'An inactive role is refused for new user mappings, approval steps and authority levels. Everyone who already holds it keeps it.',
    },
    {
      target: '[data-tour="r2-new"]',
      title: 'Roles are never deleted',
      body: 'Too many tables point at a role id to remove one safely. Deactivate a role you no longer want handed out.',
    },
  ],
};

export const ROLE_2_FORM_TOUR: TourDefinition = {
  id: 'admin2-role-form',
  label: 'How to create an Administration 2.0 role',
  steps: [
    {
      target: '[data-tour="rf-details"]',
      title: 'The abbreviation is what people pick',
      body: 'It must be unique, ignoring case — a taken name is flagged as you type.',
    },
    {
      target: '[data-tour="rf-flags"]',
      title: 'Claim permissions',
      body: 'Each one says what it does. Edits keep all four as they are, where the legacy screen switched two of them off on every save.',
    },
    {
      target: '[data-tour="rf-summary"]',
      title: 'A new role starts empty',
      body: 'No screens and no people. Grant screens in Access Control | By Role, and give it to accounts in User Mapping.',
    },
  ],
};

export const LEVEL_OF_AUTHORITIES_TOUR: TourDefinition = {
  id: 'admin2-level-of-authorities',
  label: 'How levels of authority work',
  steps: [
    {
      target: '[data-tour="loa-pair"]',
      title: 'Pick a business type and claim nature',
      body: 'Every level belongs to one pair. The counts show how many roles each pair brings in by amount.',
    },
    {
      target: '[data-tour="loa-bands"]',
      title: 'Lowest threshold first',
      body: 'The order a growing claim picks roles up in. "Every claim" means the role is in the approval whatever the amount.',
    },
    {
      target: '[data-tour="loa-try"]',
      title: 'Amount to does not stop a role',
      body: 'A claim above the Amount to of a role still includes that role — that is how claim creation reads these rows. Type an amount to see exactly who it brings in.',
    },
    {
      target: '[data-tour="loa-new"]',
      title: 'Edit beside the neighbours',
      body: 'New and Edit open in the panel, so the amounts of the other roles stay in view. Changes apply to claims raised from now on.',
    },
  ],
};

export const USER_MAPPING_TOUR: TourDefinition = {
  id: 'admin2-user-mapping',
  label: 'How to map a user',
  steps: [
    {
      target: '[data-tour="um-users"]',
      title: 'Start from the account',
      body: 'Every Administration 2.0 account, with what it holds. "Needs mapping" lists the ones missing a role, a business type, a region or an area.',
    },
    {
      target: '[data-tour="um-role"]',
      title: 'One role per account',
      body: 'The role decides their Administration 2.0 menus and where they sit in claim approval routing.',
    },
    {
      target: '[data-tour="um-views"]',
      title: 'Mapping, or menu access',
      body: 'Menu access shows the Administration 2.0 screens this account opens. Rows from its role are locked; tick a row to grant it directly.',
    },
    {
      target: '[data-tour="um-geo"]',
      title: 'Areas sit under regions',
      body: 'Tick a region to see its areas. An area without its region grants nothing, so unticking a region takes its areas with it.',
    },
    {
      target: '[data-tour="um-summary"]',
      title: 'Nothing is written until you save',
      body: 'The summary lists every addition and removal against what the account holds now.',
    },
  ],
};

export const REGION_ROLES_TOUR: TourDefinition = {
  id: 'admin2-region-roles',
  label: 'How roles by region works',
  steps: [
    {
      target: '[data-tour="rr-census"]',
      title: 'Accounts and the gaps',
      body: 'An account mapped to three regions counts once in the total and once in each region. The gaps open the accounts with no role or no region.',
    },
    {
      target: '[data-tour="rr-regions"]',
      title: 'Click a region or a role',
      body: 'Any count opens the accounts behind it, and from there the mapping of any one of them.',
    },
  ],
};

export const APPROVAL_HIERARCHY_TOUR: TourDefinition = {
  id: 'approval-hierarchy',
  label: 'How to set an approval hierarchy',
  steps: [
    {
      target: '[data-tour="ah-scope"]',
      title: 'One hierarchy per business type, group and scheme',
      body: 'Pick all three — there is no Search to press. The number on a scheme is how many steps its hierarchy has; schemes without a number have none yet.',
    },
    {
      target: '[data-tour="ah-steps"]',
      title: 'Sequence 0 initiates, the rest approve',
      body: 'Budget initiation offers the scheme to the roles at sequence 0, and approval runs 1, 2, 3 from there. Drag a step by its handle, or use the arrows. The link button lets a step share the one above it: any of its roles can then act.',
    },
    {
      target: '[data-tour="ah-roles"]',
      title: 'Add a role',
      body: 'Drag it into the steps where it belongs, or press Add to make it the last step. Deactivated roles cannot be added.',
    },
    {
      target: '[data-tour="ah-summary"]',
      title: 'Saving applies at once',
      body: 'The summary lists every change before you save, and warns when the initiating roles change. Untick "The first step initiates" only for a hierarchy where no role initiates.',
    },
  ],
};

export const CLAIM_HIERARCHY_TOUR: TourDefinition = {
  id: 'admin2-claim-hierarchy',
  label: 'How to set a claim hierarchy',
  steps: [
    {
      target: '[data-tour="ch-types"]',
      title: 'One order per business type',
      body: 'Pick a business type. The number beside it is how many roles approve its documents.',
    },
    {
      target: '[data-tour="ch-order"]',
      title: 'First approver first',
      body: 'Drag a step by its handle, or use the arrows. Only the roles listed here approve — there is nothing to delete afterwards.',
    },
    {
      target: '[data-tour="ch-roles"]',
      title: 'Add a role',
      body: 'Drag it into the order where it belongs, or press Add to make it the last step. Deactivated roles cannot be added.',
    },
    {
      target: '[data-tour="ch-summary"]',
      title: 'Saving applies at once',
      body: 'It reaches documents already in approval as well as new ones. The summary lists every change, and warns before RMC or the final approval role is taken out.',
    },
  ],
};

// ─── Route → tour ─────────────────────────────────────────────────────────────

interface RouteTour {
  /**
   * Matched against the path, most specific first. `query` is for a screen whose tabs live
   * in the query string: the shell re-resolves the tour on every navigation, including a
   * tab switch, so a tab's tour must be resolvable from the URL rather than set by the screen.
   */
  match: (path: string, query: URLSearchParams) => boolean;
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
  {
    match: (p, q) => /^\/admin\/users\/[^/]+$/.test(p) && q.get('tab') === 'resignation',
    tour: USER_RESIGNATION_TOUR,
  },
  { match: (p) => /^\/admin\/users\/[^/]+$/.test(p), tour: USER_DETAIL_TOUR },
  { match: exact('/admin/users'), tour: USERS_LIST_TOUR },

  { match: (p) => /^\/admin\/roles\/[^/]+$/.test(p), tour: ROLE_ACCESS_TOUR },
  { match: exact('/admin/roles'), tour: ROLES_TOUR },

  { match: startsWith('/admin/access-explorer'), tour: ACCESS_EXPLORER_TOUR },
  { match: exact('/admin/menus'), tour: MENUS_TOUR },
  { match: startsWith('/admin/re-route'), tour: RE_ROUTE_TOUR },
  { match: exact('/admin/approval-hierarchy'), tour: APPROVAL_HIERARCHY_TOUR },
  { match: startsWith('/admin/activity-logs'), tour: ACTIVITY_LOGS_TOUR },
  { match: startsWith('/admin/frequency'), tour: FREQUENCY_TOUR },
  { match: startsWith('/admin/integration'), tour: INTEGRATION_TOUR },

  // Only the create form has a tour: editing is the same form, already walked through.
  { match: exact('/admin2/distributors/new'), tour: DISTRIBUTOR_FORM_TOUR },
  { match: exact('/admin2/distributors'), tour: DISTRIBUTORS_TOUR },
  { match: exact('/admin2/distributor-access'), tour: DISTRIBUTOR_ACCESS_TOUR },
  { match: (p) => /^\/admin2\/roles\/[^/]+\/access$/.test(p), tour: ROLE_ACCESS_TOUR },
  { match: exact('/admin2/roles/new'), tour: ROLE_2_FORM_TOUR },
  { match: exact('/admin2/roles'), tour: ROLES_2_TOUR },
  { match: exact('/admin2/level-of-authorities'), tour: LEVEL_OF_AUTHORITIES_TOUR },
  { match: exact('/admin2/claim-hierarchy'), tour: CLAIM_HIERARCHY_TOUR },
  { match: startsWith('/admin2/activity-logs'), tour: ACTIVITY_LOGS_TOUR },
  { match: (p, q) => p === '/admin2/user-mapping' && q.get('tab') === 'regions', tour: REGION_ROLES_TOUR },
  { match: exact('/admin2/user-mapping'), tour: USER_MAPPING_TOUR },

  { match: startsWith('/account'), tour: ACCOUNT_TOUR },
];

/**
 * The tour for a URL, or null.
 *
 * Ownership is deliberately absent: it has one tour per tab, so that screen resolves its
 * own and the shell defers to it (see `TourService.setRouteTour`).
 */
export function tourForRoute(url: string): TourDefinition | null {
  const [beforeHash] = url.split('#');
  const [path, queryString = ''] = beforeHash.split('?');
  const query = new URLSearchParams(queryString);
  return ROUTE_TOURS.find((entry) => entry.match(path, query))?.tour ?? null;
}
