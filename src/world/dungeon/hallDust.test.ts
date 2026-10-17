import { describe, expect, it } from 'vitest';
import {
  HALL_DUST_BOUNDS,
  HALL_DUST_COUNT,
  createDustMotes,
  stepDustMote,
} from './hallDust';

describe('hall dust pool', () => {
  it('keeps a fixed pool inside the hall as motes wrap', () => {
    const motes = createDustMotes(HALL_DUST_COUNT, () => 0.37);
    expect(motes).toHaveLength(HALL_DUST_COUNT);
    const far = motes[0]!;
    far.x = HALL_DUST_BOUNDS.maxX + 2;
    far.y = HALL_DUST_BOUNDS.maxY + 1;
    far.z = HALL_DUST_BOUNDS.minZ - 3;
    stepDustMote(far, 0.016, 1);
    expect(far.x).toBeGreaterThanOrEqual(HALL_DUST_BOUNDS.minX);
    expect(far.x).toBeLessThanOrEqual(HALL_DUST_BOUNDS.maxX);
    expect(far.z).toBeGreaterThanOrEqual(HALL_DUST_BOUNDS.minZ);
    expect(far.z).toBeLessThanOrEqual(HALL_DUST_BOUNDS.maxZ);
    expect(far.y).toBeGreaterThanOrEqual(HALL_DUST_BOUNDS.minY);
    expect(far.y).toBeLessThanOrEqual(HALL_DUST_BOUNDS.maxY);

    for (let i = 0; i < 400; i++) {
      for (const mote of motes) stepDustMote(mote, 0.05, i * 0.05);
    }
    expect(motes).toHaveLength(HALL_DUST_COUNT);
    for (const mote of motes) {
      expect(mote.x).toBeGreaterThanOrEqual(HALL_DUST_BOUNDS.minX);
      expect(mote.x).toBeLessThanOrEqual(HALL_DUST_BOUNDS.maxX);
      expect(mote.y).toBeGreaterThanOrEqual(HALL_DUST_BOUNDS.minY);
      expect(mote.y).toBeLessThanOrEqual(HALL_DUST_BOUNDS.maxY);
      expect(mote.z).toBeGreaterThanOrEqual(HALL_DUST_BOUNDS.minZ);
      expect(mote.z).toBeLessThanOrEqual(HALL_DUST_BOUNDS.maxZ);
    }
  });
});
