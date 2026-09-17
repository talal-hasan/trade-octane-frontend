/** Legacy "Level Of Authorities" — `CPS_Level_Of_Authorities.aspx`, under Administration 2.0 (92). */
export const MENU_LEVEL_OF_AUTHORITIES = 89;

export const LEVEL_OF_AUTHORITIES_ROUTE = '/admin2/level-of-authorities';

/** The API's ceiling: the largest whole number a JSON number carries exactly. */
export const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;

/**
 * Whether a claim of `amount` brings a role with this band into its approval cycle — the
 * condition in `Proc_Claim_Create`, verbatim:
 *
 *     amount between From and To   or   From = 0 and To = 0   or   amount > To
 *
 * Read together, that is "from `fromAmount` upwards": Amount To never keeps a role out.
 * Kept as the literal three-way test rather than simplified, so it stays checkable against
 * the procedure, and so a band stored with From above To behaves here as it does there.
 */
export function joinsApprovalCycle(amount: number, fromAmount: number, toAmount: number): boolean {
  return (
    (amount >= fromAmount && amount <= toAmount) ||
    (fromAmount === 0 && toAmount === 0) ||
    amount > toAmount
  );
}

/** Request member names, as `changedFields` reports them, in words. */
export const LEVEL_OF_AUTHORITY_FIELD_LABELS: Readonly<Record<string, string>> = {
  businessTypeId: 'Business type',
  claimNatureId: 'Claim nature',
  roleId: 'Role',
  fromAmount: 'Amount from',
  toAmount: 'Amount to',
};
