/**
 * Pooled dust motes for the entry hall. Positions wrap inside the room so the
 * instance count never grows. A shader sheet in `DungeonHall` supplies the
 * softer floor fog; these are the drifting specks.
 */

export type DustBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type DustMote = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  phase: number;
  spin: number;
};

export const HALL_DUST_BOUNDS: DustBounds = {
  minX: -3.05,
  maxX: 3.05,
  minY: 0.28,
  maxY: 1.9,
  minZ: -5.15,
  maxZ: 6.35,
};

export const HALL_DUST_COUNT = 28;
export const HALL_DUST_COUNT_MOBILE = 12;

export function createDustMotes(
  count: number,
  rand: () => number = Math.random,
  bounds: DustBounds = HALL_DUST_BOUNDS,
): DustMote[] {
  const motes: DustMote[] = [];
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const spanZ = bounds.maxZ - bounds.minZ;
  for (let i = 0; i < count; i++) {
    motes.push({
      x: bounds.minX + rand() * spanX,
      y: bounds.minY + rand() * spanY,
      z: bounds.minZ + rand() * spanZ,
      vx: (rand() - 0.5) * 0.16,
      vy: 0.035 + rand() * 0.06,
      vz: (rand() - 0.5) * 0.1,
      phase: rand() * Math.PI * 2,
      spin: rand() * Math.PI * 2,
    });
  }
  return motes;
}

function wrap(value: number, min: number, max: number): number {
  if (value > max) return min;
  if (value < min) return max;
  return value;
}

/** Advance one mote and keep it inside the hall volume. */
export function stepDustMote(
  mote: DustMote,
  dt: number,
  time: number,
  bounds: DustBounds = HALL_DUST_BOUNDS,
): void {
  const sway = Math.sin(time * 0.65 + mote.phase) * 0.07;
  const drift = Math.cos(time * 0.45 + mote.phase) * 0.04;
  mote.x += (mote.vx + sway) * dt;
  mote.y += mote.vy * dt;
  mote.z += (mote.vz + drift) * dt;
  mote.spin += dt * 0.4;
  mote.x = wrap(mote.x, bounds.minX, bounds.maxX);
  mote.z = wrap(mote.z, bounds.minZ, bounds.maxZ);
  if (mote.y > bounds.maxY || mote.y < bounds.minY) mote.y = bounds.minY;
}
