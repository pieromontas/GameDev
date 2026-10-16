/** Named `?at=` debug spawns. Only `dungeon` is wired in this step. */
export type DebugAt = 'dungeon';

/**
 * Parse a location search string (`?at=dungeon`, or the same without `?`).
 * Unknown values and a missing param return null — the meadow spawn is unchanged.
 * Matching is case-insensitive so `?at=Dungeon` still drops into the hall.
 */
export function parseDebugAt(search: string): DebugAt | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  let at: string | null = null;
  try {
    at = new URLSearchParams(raw).get('at');
  } catch {
    return null;
  }
  if (!at) return null;
  if (at.trim().toLowerCase() === 'dungeon') return 'dungeon';
  return null;
}
