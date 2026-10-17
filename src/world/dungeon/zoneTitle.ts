/** Browser tab title. `index.html` must use the overworld string as its default. */
export const OVERWORLD_DOCUMENT_TITLE = 'SpiritVale Slice — Meadow Training Grounds';

/** Shown while the entry hall (and later crypt rooms) are the current zone. */
export const DUNGEON_DOCUMENT_TITLE = 'SpiritVale Slice — Old Crypt';

export function documentTitleForZone(zone: 'overworld' | 'dungeon'): string {
  return zone === 'dungeon' ? DUNGEON_DOCUMENT_TITLE : OVERWORLD_DOCUMENT_TITLE;
}
