import { ApprovalQueueResponse, ApprovalStage, ApprovalTable, HolderStatus } from '../../../core/api/operations.models';
import {
  censusCsv,
  countChange,
  displayName,
  groupByHolder,
  holderKey,
  inScope,
  initials,
  isTargetable,
  mergeNotes,
  parseStage,
  parseTable,
  parseView,
  searchHolders,
  sortHolders,
  stageMatrix,
  stageToken,
  tableToken,
  viewFacets,
  waited,
} from './re-route.util';

function queue(
  holder: string,
  pendingCount: number,
  options: {
    table?: ApprovalTable;
    stage?: ApprovalStage;
    status?: HolderStatus;
    fullName?: string;
    oldest?: string | null;
  } = {},
): ApprovalQueueResponse {
  const status = options.status ?? 'Active';
  return {
    table: options.table ?? 'SchemeApprovals',
    stage: options.stage ?? 'Role1',
    holder,
    holderFullName: options.fullName ?? '',
    holderStatus: status,
    // The wire sends integers as strings on some deployments; the util must not care.
    pendingCount: String(pendingCount),
    oldestInitiatedOn: options.oldest ?? '2024-01-01T00:00:00',
    newestInitiatedOn: '2026-08-01T00:00:00',
    isActionable: status === 'Active',
  };
}

// Shaped on the local census: two placeholder strings holding most of the backlog, a real
// approver with work at two levels, a deactivated account, and the blank approver.
const CENSUS: ApprovalQueueResponse[] = [
  queue('<-- FORWARD TO -->', 6630, { stage: 'Role2', status: 'NotAUser' }),
  queue('<-- FORWARD TO -->', 600, { stage: 'Rmc', status: 'NotAUser' }),
  queue('skahmed', 400, { stage: 'Role2', fullName: 'Sheikh Kashif Ahmed ', oldest: '2019-12-20T12:32:09' }),
  queue('skahmed', 20, { table: 'BudgetApprovals', stage: 'Role1', fullName: 'Sheikh Kashif Ahmed ' }),
  queue('HOSM.Temp', 304, { stage: 'Role3', status: 'Deactivated', fullName: 'HOSM Temp' }),
  queue('', 27, { table: 'JbpExceptionApprovals', stage: 'Role1', status: 'NotAUser' }),
];

describe('holderKey', () => {
  it('compares approver values the way the database does — case and trailing spaces ignored', () => {
    expect(holderKey('Burhan.Abid ')).toBe(holderKey('burhan.abid'));
    expect(holderKey(' burhan.abid')).not.toBe(holderKey('burhan.abid'));
  });
});

describe('groupByHolder', () => {
  const groups = groupByHolder(CENSUS);

  it('gives one row per approver, with every table and level they hold', () => {
    expect(groups.map((g) => g.holder)).toEqual(['<-- FORWARD TO -->', 'skahmed', 'HOSM.Temp', '']);
    const kashif = groups.find((g) => g.holder === 'skahmed')!;
    expect(kashif.total).toBe(420);
    expect(kashif.queues.map((q) => `${q.table}/${q.stage}`)).toEqual([
      'SchemeApprovals/Role2',
      'BudgetApprovals/Role1',
    ]);
  });

  it('trims the trailing spaces USERS.FULL_NAME carries', () => {
    expect(groups.find((g) => g.holder === 'skahmed')!.fullName).toBe('Sheikh Kashif Ahmed');
  });

  it('keeps the oldest wait across all of an approver’s queues', () => {
    expect(groups.find((g) => g.holder === 'skahmed')!.oldestInitiatedOn).toBe('2019-12-20T12:32:09');
  });

  it('merges values the database treats as one approver', () => {
    const merged = groupByHolder([queue('AwanU01', 3), queue('awanu01 ', 4, { stage: 'Role2' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].total).toBe(7);
  });

  it('marks the blank approver as not targetable — the API refuses an empty holder', () => {
    expect(groups.find((g) => g.holder === '')!.targetable).toBe(false);
    expect(isTargetable('   ')).toBe(false);
    expect(isTargetable('Please Select')).toBe(true);
  });
});

describe('viewFacets', () => {
  it('counts pending approvals and distinct approvers per status, with stuck as the union', () => {
    const facets = viewFacets(CENSUS);
    expect(facets.all).toEqual({ pending: 7981, approvers: 4 });
    expect(facets.active).toEqual({ pending: 420, approvers: 1 });
    expect(facets.deactivated).toEqual({ pending: 304, approvers: 1 });
    expect(facets['not-a-user']).toEqual({ pending: 7257, approvers: 2 });
    expect(facets.stuck).toEqual({ pending: 7561, approvers: 3 });
  });
});

describe('stageMatrix', () => {
  const matrix = stageMatrix(CENSUS);

  it('lays the census out as table × level', () => {
    const scheme = matrix[0];
    expect(scheme.map((cell) => cell.pending)).toEqual([0, 7030, 304, 600]);
    expect(scheme[1].stuck).toBe(6630);
    expect(scheme[1].approvers).toBe(2);
  });

  it('knows budget approvals have no RMC stage', () => {
    expect(matrix[1][3].exists).toBe(false);
    expect(matrix[0][3].exists).toBe(true);
  });

  it('buckets heat by order of magnitude', () => {
    expect(matrix[0][0].heat).toBe(0);
    expect(matrix[1][0].heat).toBe(2);
    expect(matrix[0][1].heat).toBe(4);
  });
});

describe('inScope', () => {
  it('applies table, level and role together', () => {
    const members = new Set(['skahmed']);
    const scope = { table: 'SchemeApprovals' as const, stage: null, roleMembers: members };
    expect(CENSUS.filter((q) => inScope(q, scope)).map((q) => q.pendingCount)).toEqual(['400']);
  });

  it('never matches a non-user when a role is chosen — a placeholder holds no role', () => {
    const scope = { table: null, stage: null, roleMembers: new Set(['please select']) };
    expect(inScope(queue('Please Select', 1, { status: 'NotAUser' }), scope)).toBe(true);
    expect(inScope(queue('<-- FORWARD TO -->', 1, { status: 'NotAUser' }), scope)).toBe(false);
  });
});

describe('sortHolders and searchHolders', () => {
  const groups = groupByHolder(CENSUS);

  it('puts the biggest pile first by default', () => {
    expect(sortHolders(groups, 'pending').map((g) => g.holder)[0]).toBe('<-- FORWARD TO -->');
  });

  it('can order by who has waited longest', () => {
    expect(sortHolders(groups, 'waiting')[0].holder).toBe('skahmed');
  });

  it('searches login names and full names', () => {
    expect(searchHolders(groups, 'kashif').map((g) => g.holder)).toEqual(['skahmed']);
    expect(searchHolders(groups, 'FORWARD').map((g) => g.holder)).toEqual(['<-- FORWARD TO -->']);
    expect(searchHolders(groups, '  ')).toHaveLength(groups.length);
  });
});

describe('displayName and initials', () => {
  it('quotes stored text so it is never mistaken for a person', () => {
    expect(displayName({ holder: 'Please Select', fullName: '', status: 'NotAUser' })).toBe('“Please Select”');
    expect(displayName({ holder: '', fullName: '', status: 'NotAUser' })).toBe('Blank approver');
    expect(displayName({ holder: 'skahmed', fullName: 'Sheikh Kashif Ahmed', status: 'Active' })).toBe(
      'Sheikh Kashif Ahmed',
    );
  });

  it('takes initials from the name, falling back to the login', () => {
    expect(initials({ holder: 'skahmed', fullName: 'Sheikh Kashif Ahmed' })).toBe('SA');
    expect(initials({ holder: 'HOSM.Temp', fullName: '' })).toBe('HT');
    expect(initials({ holder: '<-- FORWARD TO -->', fullName: '' })).toBe('FT');
    expect(initials({ holder: '', fullName: '' })).toBe('?');
  });
});

describe('URL tokens', () => {
  it('round-trips table and level tokens', () => {
    expect(parseTable(tableToken('JbpExceptionApprovals'))).toBe('JbpExceptionApprovals');
    expect(parseStage(stageToken('Rmc'))).toBe('Rmc');
    expect(parseStage('2')).toBe('Role2');
  });

  it('ignores anything it does not recognise', () => {
    expect(parseTable('users')).toBeNull();
    expect(parseStage('4')).toBeNull();
    expect(parseView('everything')).toBe('all');
    expect(parseView('stuck')).toBe('stuck');
  });
});

describe('mergeNotes', () => {
  it('reports where the new approver already has a pile at the same table and level', () => {
    const notes = mergeNotes(
      [
        { table: 'SchemeApprovals', stage: 'Role2' },
        { table: 'SchemeApprovals', stage: 'Rmc' },
      ],
      'SKAHMED',
      CENSUS,
    );
    expect(notes).toEqual([{ table: 'SchemeApprovals', stage: 'Role2', existing: 400 }]);
  });
});

describe('countChange', () => {
  it('reads the real count out of a count_changed refusal', () => {
    expect(
      countChange({
        errorCode: 'administration.re_route.count_changed',
        detail:
          'Expected 6630 pending approvals but found 6631. Nothing was moved — the whole update was rolled back.',
      }),
    ).toEqual({ expected: 6630, actual: 6631 });
  });

  it('is null for every other failure', () => {
    expect(countChange({ errorCode: 'administration.re_route.write_contended', detail: 'locked' })).toBeNull();
    expect(countChange(null)).toBeNull();
  });
});

describe('waited', () => {
  const now = new Date('2026-09-21T12:00:00');

  it('uses the shortest unit that still reads', () => {
    expect(waited('2026-09-21T08:00:00', now)).toBe('today');
    expect(waited('2026-08-26T12:00:00', now)).toBe('26d');
    expect(waited('2025-10-21T12:00:00', now)).toBe('11 mo');
    expect(waited('2019-12-20T12:32:09', now)).toBe('6 yr');
    expect(waited(null, now)).toBe('—');
  });
});

describe('censusCsv', () => {
  it('quotes holder values that would otherwise break a column', () => {
    const csv = censusCsv([queue('Smith, J', 3, { status: 'NotAUser' }), queue('say "hi"', 1)]);
    const [, first, second] = csv.split('\r\n');
    expect(first.startsWith('Scheme approvals,Level 1,"Smith, J",,Not a user,3,')).toBe(true);
    expect(second).toContain('"say ""hi"""');
  });
});
