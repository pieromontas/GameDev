import { describe, expect, it } from 'vitest';
import {
  DUNGEON_DOCUMENT_TITLE,
  OVERWORLD_DOCUMENT_TITLE,
  documentTitleForZone,
} from './zoneTitle';

describe('zone document title', () => {
  it('names the crypt while inside and restores the meadow title on the way out', () => {
    expect(documentTitleForZone('dungeon')).toBe(DUNGEON_DOCUMENT_TITLE);
    expect(documentTitleForZone('dungeon')).toContain('Old Crypt');
    expect(documentTitleForZone('overworld')).toBe(OVERWORLD_DOCUMENT_TITLE);
    expect(documentTitleForZone('overworld')).toContain('Meadow Training Grounds');
    expect(documentTitleForZone('dungeon')).not.toBe(documentTitleForZone('overworld'));
  });

  it('round-trips: leaving the crypt restores the exact meadow title', () => {
    const inside = documentTitleForZone('dungeon');
    const outside = documentTitleForZone('overworld');
    expect(documentTitleForZone('overworld')).toBe(outside);
    expect(inside.endsWith('Old Crypt')).toBe(true);
    expect(outside.endsWith('Meadow Training Grounds')).toBe(true);
  });
});
