import { describe, expect, it } from 'vitest';
import { parseDebugAt } from './debugSpawn';

describe('parseDebugAt', () => {
  it('reads ?at=dungeon', () => {
    expect(parseDebugAt('?at=dungeon')).toBe('dungeon');
  });

  it('accepts a missing question mark and any case', () => {
    expect(parseDebugAt('at=Dungeon')).toBe('dungeon');
    expect(parseDebugAt('?AT=dungeon')).toBe(null);
    expect(parseDebugAt('?at=  DUNGEON  ')).toBe('dungeon');
  });

  it('keeps other query params and ignores unknown at values', () => {
    expect(parseDebugAt('?touch=1&at=dungeon')).toBe('dungeon');
    expect(parseDebugAt('?at=town')).toBe(null);
    expect(parseDebugAt('?at=')).toBe(null);
    expect(parseDebugAt('')).toBe(null);
    expect(parseDebugAt('?touch=1')).toBe(null);
  });
});
