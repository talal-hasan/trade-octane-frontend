import { TourDefinition } from '../../../core/services/tour.service';

// ─────────────────────────────────────────────────────────────────────────────
// Walkthroughs for the ownership screens.
//
// Targets are matched on `data-tour` attributes rather than classes. A class is a styling
// decision and will eventually be renamed by someone with no idea a tour depends on it;
// `data-tour` says out loud that something points here.
//
// The steps follow the order the screen actually forces, because each panel only appears
// once the one above it has been answered. That progressive reveal is exactly what a
// first-time user cannot see, and the reason a tour is worth more here than a help page.
// ─────────────────────────────────────────────────────────────────────────────

export const BUDGET_OWNERSHIP_TOUR: TourDefinition = {
  id: 'budget-ownership',
  label: 'How to transfer budget ownership',
  steps: [
    {
      target: '[data-tour="budget-period"]',
      title: 'Start with the period',
      body: 'Pick the year and month the budgets belong to. Nothing below this row loads until you do — the whole screen is scoped to a period.',
    },
    {
      target: '[data-tour="budget-scope"]',
      title: 'Narrow it if you need to',
      body: 'Scheme type and region are optional filters. Leave them alone to work across everything in the period; use them when you already know what you are looking for.',
    },
    {
      target: '[data-tour="budget-census"]',
      title: 'This is the number that matters',
      body: '"Held by a non-actionable owner" counts budgets sitting with someone deactivated or no longer a user. Those cannot move on their own — they are why this screen exists.',
    },
    {
      target: '[data-tour="budget-table"]',
      title: 'Choose the budget table',
      body: 'Budgets are split across dimension tables and a shell lives in exactly one. If only one table has data, it is picked for you.',
    },
    {
      target: '[data-tour="budget-owner"]',
      title: 'Pick who is losing the budgets',
      body: 'Owners are listed with how many shells each holds. An amber bar means they cannot action them. Choosing one loads their shells below.',
    },
    {
      target: '[data-tour="budget-shells"]',
      title: 'Select the shells to move',
      body: 'Tick the shells, or use the header checkbox to take the whole page. Rows tinted amber have an approval chain that disagrees with the owner.',
    },
    {
      target: '[data-tour="budget-destination"]',
      title: 'Then hand them over',
      body: 'Pick the new owner and transfer. Approval rows move with the shells, and the count is checked against the server as it runs — if the set changed in the meantime, nothing is applied rather than half of it.',
    },
  ],
};

export const ACTIVITY_OWNERSHIP_TOUR: TourDefinition = {
  id: 'activity-ownership',
  label: 'How to transfer activity ownership',
  steps: [
    {
      target: '[data-tour="activity-period"]',
      title: 'Start with the period',
      body: 'Year, month and claim type scope the whole screen. Nothing below loads until a period is chosen.',
    },
    {
      target: '[data-tour="activity-census"]',
      title: 'This is the number that matters',
      body: '"Held by a non-actionable owner" counts activities sitting with someone who has left or been deactivated. Those stop moving on their own.',
    },
    {
      target: '[data-tour="activity-owner"]',
      title: 'Pick who is losing the activities',
      body: 'Each owner shows how many activities they hold. An amber bar means they cannot action them. Choosing one loads their activities below.',
    },
    {
      target: '[data-tour="activity-rows"]',
      title: 'Select the activities to move',
      body: 'Tick individual rows or take the whole page from the header checkbox. Amber rows have an approval chain that disagrees with the owner.',
    },
    {
      target: '[data-tour="activity-destination"]',
      title: 'Then hand them over',
      body: 'Pick the new owner and transfer. Approval rows move with the activities, and the transfer is guarded on the count you selected — if the set changes first, nothing is applied.',
    },
  ],
};
