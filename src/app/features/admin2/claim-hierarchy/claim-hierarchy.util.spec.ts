import { ClaimHierarchyLevelResponse } from '../../../core/api/admin2.models';
import { diffHierarchy, insertStep, moveStep, storedOrderIssues } from './claim-hierarchy.util';

function level(sequence: number, roleId: number, roleName: string): ClaimHierarchyLevelResponse {
  return { sequence, roleId, roleName, roleDescription: '' };
}

describe('storedOrderIssues', () => {
  it('finds roles sharing a step, as in FSD where Global Finance and IBEX are both 7', () => {
    const issues = storedOrderIssues([
      level(1, 2, 'ASM'),
      level(2, 3, 'RMC'),
      level(3, 7, 'Global Finance'),
      level(3, 39, 'IBEX'),
    ]);
    expect(issues.ties).toEqual([{ sequence: 3, roleNames: ['Global Finance', 'IBEX'] }]);
    expect(issues.gaps).toBe(false);
  });

  it('notices a gap, as in Vehicle Maintainance running 1–4 then 10', () => {
    expect(storedOrderIssues([level(1, 2, 'ASM'), level(2, 3, 'RMC'), level(10, 16, 'KAM')]).gaps).toBe(true);
  });

  it('is clean for an order numbered 1, 2, 3', () => {
    expect(storedOrderIssues([level(1, 2, 'ASM'), level(2, 3, 'RMC')])).toEqual({ ties: [], gaps: false });
  });
});

describe('diffHierarchy', () => {
  it('reports added and removed roles without calling that a reorder', () => {
    expect(diffHierarchy([2, 3, 4], [2, 4, 5])).toEqual({ added: [5], removed: [3], reordered: false, changed: true });
  });

  it('reports a reorder of the roles kept', () => {
    expect(diffHierarchy([2, 3, 4], [3, 2, 4])).toEqual({ added: [], removed: [], reordered: true, changed: true });
  });

  it('is unchanged for the same order', () => {
    expect(diffHierarchy([2, 3], [2, 3]).changed).toBe(false);
  });
});

describe('moveStep and insertStep', () => {
  it('moves a step without mutating the input', () => {
    const ids = [2, 3, 4];
    expect(moveStep(ids, 0, 2)).toEqual([3, 4, 2]);
    expect(ids).toEqual([2, 3, 4]);
  });

  it('inserts a role once, at the position it was dropped', () => {
    expect(insertStep([2, 4], 3, 1)).toEqual([2, 3, 4]);
    expect(insertStep([2, 3], 3, 0)).toEqual([2, 3]);
  });
});
