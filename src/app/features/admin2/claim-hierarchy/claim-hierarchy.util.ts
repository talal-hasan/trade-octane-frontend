import { ClaimHierarchyLevelResponse } from '../../../core/api/admin2.models';
import { int } from '../../../core/api/api.types';

/** Legacy "Approval Hierarchy" — `CPS_Claim_Hierarchy.aspx`, under Administration 2.0 (92). */
export const MENU_CLAIM_HIERARCHY = 90;

export const CLAIM_HIERARCHY_ROUTE = '/admin2/claim-hierarchy';

/** `Proc_CPS_Claim_Stepback_RMC` steps a claim back to this role. */
export const STEP_BACK_ROLE_ID = 3;

/** `Proc_CPS_Claim_Approve` marks a claim approved when this role approves. */
export const FINAL_APPROVAL_ROLE_ID = 7;

/** Steps that share a stored sequence — the approval procedures take them in no fixed order. */
export interface SequenceTie {
  sequence: number;
  roleNames: string[];
}

export interface StoredOrderIssues {
  ties: SequenceTie[];
  /** The stored steps do not run 1, 2, 3… without a break. */
  gaps: boolean;
}

export function storedOrderIssues(levels: readonly ClaimHierarchyLevelResponse[]): StoredOrderIssues {
  const bySequence = new Map<number, string[]>();
  for (const level of levels) {
    const sequence = int(level.sequence);
    bySequence.set(sequence, [...(bySequence.get(sequence) ?? []), level.roleName || `Role ${level.roleId}`]);
  }
  const ties = [...bySequence.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([sequence, roleNames]) => ({ sequence, roleNames }))
    .sort((a, b) => a.sequence - b.sequence);
  const sequences = [...bySequence.keys()].sort((a, b) => a - b);
  const gaps = sequences.some((sequence, index) => sequence !== index + 1);
  return { ties, gaps };
}

export interface HierarchyDiff {
  added: number[];
  removed: number[];
  /** The roles kept in both are in a different relative order. */
  reordered: boolean;
  changed: boolean;
}

export function diffHierarchy(saved: readonly number[], draft: readonly number[]): HierarchyDiff {
  const savedSet = new Set(saved);
  const draftSet = new Set(draft);
  const added = draft.filter((id) => !savedSet.has(id));
  const removed = saved.filter((id) => !draftSet.has(id));
  const keptSaved = saved.filter((id) => draftSet.has(id));
  const keptDraft = draft.filter((id) => savedSet.has(id));
  const reordered = keptSaved.some((id, index) => keptDraft[index] !== id);
  const changed = saved.length !== draft.length || saved.some((id, index) => draft[index] !== id);
  return { added, removed, reordered, changed };
}

/** A copy of `ids` with the item at `from` moved to `to`. */
export function moveStep(ids: readonly number[], from: number, to: number): number[] {
  const next = [...ids];
  if (from < 0 || from >= next.length) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/** A copy of `ids` with `roleId` inserted at `index`, unless it is already there. */
export function insertStep(ids: readonly number[], roleId: number, index = ids.length): number[] {
  if (ids.includes(roleId)) {
    return [...ids];
  }
  const next = [...ids];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, roleId);
  return next;
}
