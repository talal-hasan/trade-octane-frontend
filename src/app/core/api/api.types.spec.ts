import { asList, int, intList, intSet, unwrapData } from './api.types';

describe('unwrapData', () => {
  it('unwraps a single-key data envelope', () => {
    // The real shape of POST /identity/login_old, despite the contract declaring the
    // fields at the top level.
    const body = { data: { userId: 't_SufyaM01', accessToken: 'eyJhbGci' } };
    expect(unwrapData(body)).toEqual({ userId: 't_SufyaM01', accessToken: 'eyJhbGci' });
  });

  it('leaves an already-unwrapped body alone', () => {
    const body = { userId: 't_SufyaM01', accessToken: 'eyJhbGci' };
    expect(unwrapData(body)).toBe(body);
  });

  it('does NOT unwrap a paged response that merely has a data property', () => {
    // This is the case that makes the single-key rule load-bearing. UserPageResponse is
    // `{ data: [...], nextCursor, totalCount, ... }` — unwrapping it would return the rows
    // and silently discard the cursor, breaking pagination in a way that looks like the
    // server stopped sending more pages.
    const page = {
      data: [{ userId: 'a' }, { userId: 'b' }],
      nextCursor: 'abc',
      totalCount: 250,
      pageSize: 25,
      snapshotVersion: 1,
    };
    // Identity, not equality: the very same object comes back, cursor and all.
    expect(unwrapData(page)).toBe(page);
  });

  it('passes through arrays, null and primitives', () => {
    const list = [{ data: 1 }];
    expect(unwrapData(list)).toBe(list);
    expect(unwrapData(null)).toBeNull();
    expect(unwrapData('text')).toBe('text');
  });

  it('unwraps a null payload inside an envelope', () => {
    expect(unwrapData({ data: null })).toBeNull();
  });
});

describe('int', () => {
  it('accepts the string integers the contract permits', () => {
    // Wire integers are declared as ["integer","string"]; /dashboard/tiles returns every
    // count as a string.
    expect(int('42')).toBe(42);
    expect(int(42)).toBe(42);
  });

  it('falls back for null, undefined, blank and non-numeric input', () => {
    expect(int(null)).toBe(0);
    expect(int(undefined)).toBe(0);
    expect(int('')).toBe(0);
    expect(int('abc')).toBe(0);
    expect(int(null, -1)).toBe(-1);
  });
});

describe('intList / intSet', () => {
  it('coerces mixed number/string ids', () => {
    expect(intList([1, '2', 3])).toEqual([1, 2, 3]);
  });

  it('drops non-numeric entries rather than zeroing them', () => {
    // A silently-zeroed menu id would grant or deny the wrong row.
    expect(intList([1, 'nope', 3])).toEqual([1, 3]);
  });

  it('builds a Set that matches on numbers regardless of wire type', () => {
    const granted = intSet(['17', 19, '142']);
    expect(granted.has(17)).toBe(true);
    expect(granted.has(142)).toBe(true);
    expect(granted.has(999)).toBe(false);
  });

  it('handles null and undefined', () => {
    expect(intList(null)).toEqual([]);
    expect(intSet(undefined).size).toBe(0);
  });
});

describe('asList', () => {
  const rsm = { roleId: 2, roleName: 'RSM' };

  // The live shape that blanked the Roles tab: a user holding one role gets a bare object
  // where the contract declares an array, so `.map` threw inside the subscriber and the
  // screen rendered nothing at all.
  it('wraps a single object into a one-element list', () => {
    expect(asList(rsm)).toEqual([rsm]);
  });

  it('passes an array through unchanged', () => {
    expect(asList([rsm])).toEqual([rsm]);
  });

  it('returns an empty list for null and undefined', () => {
    expect(asList(null)).toEqual([]);
    expect(asList(undefined)).toEqual([]);
  });

  it('copies rather than aliasing, so callers cannot mutate the response', () => {
    const source = [rsm];
    const result = asList(source);
    result.push({ roleId: 3, roleName: 'ASM' });
    expect(source.length).toBe(1);
  });

  // An empty array must stay empty — treating it as "one falsy item" would invent a role.
  it('does not wrap an empty array', () => {
    expect(asList([])).toEqual([]);
  });
});
