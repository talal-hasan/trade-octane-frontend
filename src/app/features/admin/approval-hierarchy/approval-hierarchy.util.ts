import { ApprovalHierarchyLevelResponse } from '../../../core/api/admin.models';
import { int } from '../../../core/api/api.types';

/** Legacy "Hierarchy" — `Hierarchy.aspx`, under Administration 1.0 (4). */
export const MENU_APPROVAL_HIERARCHY = 135;

export const APPROVAL_HIERARCHY_ROUTE = '/admin/approval-hierarchy';

/** The group most hierarchies are kept under, opened when the URL names none. */
export const DEFAULT_GROUP_ID = 'B';

/** Roles per step, first step first. Roles in one step act for it interchangeably. */
export type Steps = readonly (readonly number[])[];

export interface StoredShape {
  steps: number[][];
  /** The sequence the first step is stored at: 0 (it initiates) or 1 (no role initiates). */
  firstSequence: 0 | 1;
  /** The stored sequences skip a number, or start above 1. Saving numbers them without gaps. */
  irregular: boolean;
}

/** The stored rows as steps: one step per distinct sequence, lowest first. */
export function stepsFromLevels(levels: readonly ApprovalHierarchyLevelResponse[]): StoredShape {
  const bySequence = new Map<number, number[]>();
  for (const level of levels) {
    const sequence = int(level.sequence);
    bySequence.set(sequence, [...(bySequence.get(sequence) ?? []), int(level.roleId)]);
  }
  const sequences = [...bySequence.keys()].sort((a, b) => a - b);
  const first = sequences[0] ?? 0;
  return {
    steps: sequences.map((sequence) => bySequence.get(sequence) ?? []),
    firstSequence: first >= 1 ? 1 : 0,
    irregular: first > 1 || sequences.some((sequence, index) => sequence !== first + index),
  };
}

/** Where each role sits, by step index. */
function stepIndexByRole(steps: Steps): Map<number, number> {
  const index = new Map<number, number>();
  steps.forEach((roles, stepIndex) => roles.forEach((roleId) => index.set(roleId, stepIndex)));
  return index;
}

/** Same roles on the same steps. The order of roles inside a step carries no meaning. */
export function stepsEqual(a: Steps, b: Steps): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((roles, index) => {
    const other = b[index];
    return roles.length === other.length && roles.every((roleId) => other.includes(roleId));
  });
}

export interface StepsDiff {
  added: number[];
  removed: number[];
  /** Roles kept, now acting at a different step. */
  moved: number[];
  changed: boolean;
}

export function diffSteps(saved: Steps, draft: Steps): StepsDiff {
  const before = stepIndexByRole(saved);
  const after = stepIndexByRole(draft);
  return {
    added: [...after.keys()].filter((roleId) => !before.has(roleId)),
    removed: [...before.keys()].filter((roleId) => !after.has(roleId)),
    moved: [...after.entries()]
      .filter(([roleId, step]) => before.has(roleId) && before.get(roleId) !== step)
      .map(([roleId]) => roleId),
    changed: !stepsEqual(saved, draft),
  };
}

function copy(steps: Steps): number[][] {
  return steps.map((roles) => [...roles]);
}

/** A copy with the step at `from` moved to `to`. */
export function moveStep(steps: Steps, from: number, to: number): number[][] {
  const next = copy(steps);
  if (from < 0 || from >= next.length) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/** A copy with `roleId` as a step of its own at `index`, unless it is already in the hierarchy. */
export function addStep(steps: Steps, roleId: number, index = steps.length): number[][] {
  const next = copy(steps);
  if (next.some((roles) => roles.includes(roleId))) {
    return next;
  }
  next.splice(Math.max(0, Math.min(index, next.length)), 0, [roleId]);
  return next;
}

/** A copy without `roleId`. A step it leaves empty is dropped, so the steps stay contiguous. */
export function removeRole(steps: Steps, roleId: number): number[][] {
  return copy(steps)
    .map((roles) => roles.filter((id) => id !== roleId))
    .filter((roles) => roles.length > 0);
}

/** A copy with step `index` merged into the step before it: its roles now share that step. */
export function joinWithPrevious(steps: Steps, index: number): number[][] {
  const next = copy(steps);
  if (index < 1 || index >= next.length) {
    return next;
  }
  const [joined] = next.splice(index, 1);
  next[index - 1] = [...next[index - 1], ...joined];
  return next;
}

/** A copy with `roleId` taken out of a shared step into a step of its own, right after it. */
export function splitIntoOwnStep(steps: Steps, roleId: number): number[][] {
  const next = copy(steps);
  const index = next.findIndex((roles) => roles.includes(roleId));
  if (index === -1 || next[index].length < 2) {
    return next;
  }
  next[index] = next[index].filter((id) => id !== roleId);
  next.splice(index + 1, 0, [roleId]);
  return next;
}

/** `1|B|BRD` — business type, group and scheme key — the cache key of one hierarchy. */
export function scopeKey(businessTypeId: number, groupId: string, schemeId: string): string {
  return `${businessTypeId}|${groupId}|${schemeId}`;
}
