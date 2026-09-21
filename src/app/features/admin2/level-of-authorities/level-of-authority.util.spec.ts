import { joinsApprovalCycle } from './level-of-authority.util';

describe('joinsApprovalCycle', () => {
  it('lets a 0 to 0 band into every claim', () => {
    expect(joinsApprovalCycle(0, 0, 0)).toBe(true);
    expect(joinsApprovalCycle(50_000_000, 0, 0)).toBe(true);
  });

  it('includes both ends of the band', () => {
    expect(joinsApprovalCycle(1_000_001, 1_000_001, 2_500_000)).toBe(true);
    expect(joinsApprovalCycle(2_500_000, 1_000_001, 2_500_000)).toBe(true);
  });

  it('keeps a role out below its From amount', () => {
    expect(joinsApprovalCycle(1_000_000, 1_000_001, 2_500_000)).toBe(false);
  });

  it('still brings the role in above its To amount, as Proc_Claim_Create does', () => {
    expect(joinsApprovalCycle(9_000_000, 1_000_001, 2_500_000)).toBe(true);
  });
});
