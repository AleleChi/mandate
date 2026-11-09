import { ChildItem } from '../types';

/**
 * Canonical relationship options shared across:
 * - Child Registration Step 1 (Parent relationship to child)
 * - Child Registration Step 4 (Pickup person relationship)
 * - Post-Selection Pickup Person Editor
 */
export const PARENT_RELATIONSHIP_OPTIONS = [
  'Mother',
  'Father',
  'Guardian',
  'Grandparent',
  'Aunt',
  'Uncle',
  'Other'
] as const;

export type ParentRelationshipOption = (typeof PARENT_RELATIONSHIP_OPTIONS)[number];

/**
 * Statuses that permit parent pickup person management.
 * Strictly: selected, pass_ready, checked_in, inside.
 */
export const PICKUP_MANAGEABLE_STATUSES = [
  'selected',
  'pass_ready',
  'checked_in',
  'inside'
] as const;

export type PickupManageableStatus = (typeof PICKUP_MANAGEABLE_STATUSES)[number];

/**
 * Normalizes a raw child status string to a snake_case token.
 */
export function normalizeChildStatus(rawStatus?: string | null): string {
  if (!rawStatus) return '';
  return rawStatus.toLowerCase().trim().replace(/[\s-]+/g, '_');
}

/**
 * Determines whether a child is in an editable pickup status.
 */
export function isChildPickupManageable(childOrStatus?: ChildItem | string | null): boolean {
  if (!childOrStatus) return false;
  const rawStatus = typeof childOrStatus === 'string' ? childOrStatus : childOrStatus.status;
  const normalized = normalizeChildStatus(rawStatus);
  return (PICKUP_MANAGEABLE_STATUSES as readonly string[]).includes(normalized);
}

/**
 * Determines whether a child has already been released (picked up / checked out).
 */
export function isChildPickedUp(childOrStatus?: ChildItem | string | null): boolean {
  if (!childOrStatus) return false;
  const rawStatus = typeof childOrStatus === 'string' ? childOrStatus : childOrStatus.status;
  const normalized = normalizeChildStatus(rawStatus);
  return normalized === 'picked_up' || normalized === 'checked_out';
}

/**
 * Parses a stored relationship string against the canonical options.
 * If the value matches a canonical option (e.g. 'Uncle'), it is returned as selectedOption.
 * If the value is a custom string (e.g. 'Family friend'), selectedOption is 'Other' and
 * customValue is prepopulated with that string for full backward compatibility.
 */
export function parseRelationshipValue(storedValue: string | undefined | null): {
  selectedOption: string;
  customValue: string;
} {
  const trimmed = (storedValue || '').trim();
  if (!trimmed) {
    return { selectedOption: '', customValue: '' };
  }

  const match = PARENT_RELATIONSHIP_OPTIONS.find(
    (opt) => opt.toLowerCase() === trimmed.toLowerCase() && opt !== 'Other'
  );

  if (match) {
    return { selectedOption: match, customValue: '' };
  }

  // Not in standard list -> select Other and prepopulate specify field
  return {
    selectedOption: 'Other',
    customValue: trimmed.toLowerCase() === 'other' ? '' : trimmed
  };
}

/**
 * Computes the final relationship string to store.
 * If 'Other' was selected, the specified custom value is returned.
 */
export function getEffectiveRelationship(selectedOption: string, customValue: string): string {
  if (selectedOption === 'Other') {
    return customValue.trim();
  }
  return selectedOption.trim();
}
