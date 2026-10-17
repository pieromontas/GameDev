/**
 * Dungeon entrance + entry-hall layout.
 *
 * The crypt mouth occupies a deliberate postern in the north city curtain
 * (between the castle yard and the outer wall). Numbers are derived once so
 * the wall gap, the interact pad, and the exit landing cannot drift apart.
 */

export const CITY_NORTH_WALL_A = { x: 93.5, z: 102.5 } as const;
export const CITY_NORTH_WALL_B = { x: 72, z: 97.5 } as const;

const wallDx = CITY_NORTH_WALL_B.x - CITY_NORTH_WALL_A.x;
const wallDz = CITY_NORTH_WALL_B.z - CITY_NORTH_WALL_A.z;
const wallLen = Math.hypot(wallDx, wallDz);
const wallUx = wallDx / wallLen;
const wallUz = wallDz / wallLen;

/** Midpoint of the north curtain — the crypt arch sits in a gap here. */
export const DUNGEON_MOUTH = {
  x: CITY_NORTH_WALL_A.x + wallUx * wallLen * 0.5,
  z: CITY_NORTH_WALL_A.z + wallUz * wallLen * 0.5,
} as const;

/** Half-width of the missing curtain segment, along the wall. */
export const NORTH_POSTERN_HALF = 3.6;

/** Wall runs stop at these points so the arch can fill the opening. */
export const NORTH_POSTERN = {
  from: {
    x: DUNGEON_MOUTH.x - wallUx * NORTH_POSTERN_HALF,
    z: DUNGEON_MOUTH.z - wallUz * NORTH_POSTERN_HALF,
  },
  to: {
    x: DUNGEON_MOUTH.x + wallUx * NORTH_POSTERN_HALF,
    z: DUNGEON_MOUTH.z + wallUz * NORTH_POSTERN_HALF,
  },
} as const;

const toCastleX = 89 - DUNGEON_MOUTH.x;
const toCastleZ = 89 - DUNGEON_MOUTH.z;
const toCastleLen = Math.hypot(toCastleX, toCastleZ);
/** Unit XZ from the arch toward the castle courtyard (the walk-up). */
export const DUNGEON_APPROACH = {
  x: toCastleX / toCastleLen,
  z: toCastleZ / toCastleLen,
} as const;

/** Perpendicular on the courtyard side, biased east of the armory pad. */
export const DUNGEON_APPROACH_SIDE = {
  x: -DUNGEON_APPROACH.z,
  z: DUNGEON_APPROACH.x,
} as const;

/**
 * Arch group yaw. Three.js `rotation.y` sends local +Z along this facing,
 * which is the courtyard side of the mouth.
 */
export const DUNGEON_MOUTH_YAW = Math.atan2(DUNGEON_APPROACH.x, DUNGEON_APPROACH.z);

// Slightly toward the arch center (smaller side) so the default yard camera
// looks through the opening more than the flanking battlement. Forward stays
// short of the armory interact radius.
const PAD_FORWARD = 2.72;
const PAD_SIDE = 0.48;

/** E pad in front of the arch, still clear of the armory / captain radii. */
export const DUNGEON_ENTER_PAD = {
  x: DUNGEON_MOUTH.x + DUNGEON_APPROACH.x * PAD_FORWARD + DUNGEON_APPROACH_SIDE.x * PAD_SIDE,
  z: DUNGEON_MOUTH.z + DUNGEON_APPROACH.z * PAD_FORWARD + DUNGEON_APPROACH_SIDE.z * PAD_SIDE,
} as const;

export const DUNGEON_ENTER_RADIUS = 2.15;

const LAND_FORWARD = 2.2;
const LAND_SIDE = 2.4;

/**
 * Where the player stands after leaving the hall: outside the enter radius,
 * facing away from the arch into the yard.
 */
export const DUNGEON_EXIT_LANDING = {
  x:
    DUNGEON_ENTER_PAD.x +
    DUNGEON_APPROACH.x * LAND_FORWARD +
    DUNGEON_APPROACH_SIDE.x * LAND_SIDE,
  z:
    DUNGEON_ENTER_PAD.z +
    DUNGEON_APPROACH.z * LAND_FORWARD +
    DUNGEON_APPROACH_SIDE.z * LAND_SIDE,
  yaw: Math.atan2(
    DUNGEON_ENTER_PAD.x +
      DUNGEON_APPROACH.x * LAND_FORWARD +
      DUNGEON_APPROACH_SIDE.x * LAND_SIDE -
      DUNGEON_MOUTH.x,
    DUNGEON_ENTER_PAD.z +
      DUNGEON_APPROACH.z * LAND_FORWARD +
      DUNGEON_APPROACH_SIDE.z * LAND_SIDE -
      DUNGEON_MOUTH.z,
  ),
} as const;

/** Play-area disk so the arch, pad, and landing stay walkable. */
export const DUNGEON_POCKET_RADIUS = 8.5;

export const ENTER_PROMPT = 'Press E — Enter Dungeon';
export const LEAVE_PROMPT = 'Press E — Leave Dungeon';
export const SEALED_PROMPT = 'Press E — Sealed Gate';

export const ENTER_ARRIVAL_TOAST = 'Old crypt — entry hall. The far gate is sealed.';
export const EXIT_ARRIVAL_TOAST = 'Back in the castle yard.';
export const SEALED_TOAST = 'Iron bars hold fast — the crypt depths are sealed for now.';

/** Hall is parked far from the meadow so mobs and props never share its space. */
export const DUNGEON_HALL_ORIGIN = { x: 520, z: 520 } as const;

/** Local spawn: facing the sealed gate (−Z), short of the exit stair. */
export const HALL_SPAWN = { x: 0, z: 4.45, yaw: Math.PI } as const;

/**
 * Leave prompt sits in the open hall, short of the stair arch, so the beam
 * is not the thing the hero stands under. The arch itself is further +Z.
 */
export const HALL_EXIT_PAD = { x: 0, z: 5.9 } as const;
export const HALL_EXIT_RADIUS = 1.3;

/** Local Z of the exit-stair lintel (camera side of the hall). */
export const HALL_EXIT_ARCH_Z = 8.55;

export const HALL_SEALED_PAD = { x: 0, z: -4.65 } as const;
export const HALL_SEALED_RADIUS = 1.85;

/** Walkable XZ limits for the hall capsule (player center). */
export const HALL_BOUNDS = {
  minX: -3.42,
  maxX: 3.42,
  minZ: -5.55,
  maxZ: 7.05,
} as const;

export function isNearDungeonEntrance(x: number, z: number): boolean {
  const dx = x - DUNGEON_ENTER_PAD.x;
  const dz = z - DUNGEON_ENTER_PAD.z;
  return dx * dx + dz * dz <= DUNGEON_ENTER_RADIUS * DUNGEON_ENTER_RADIUS;
}

export type HallPromptKind = 'exit' | 'sealed';

export function hallPromptKind(localX: number, localZ: number): HallPromptKind | null {
  const ex = localX - HALL_EXIT_PAD.x;
  const ez = localZ - HALL_EXIT_PAD.z;
  if (ex * ex + ez * ez <= HALL_EXIT_RADIUS * HALL_EXIT_RADIUS) return 'exit';
  const sx = localX - HALL_SEALED_PAD.x;
  const sz = localZ - HALL_SEALED_PAD.z;
  if (sx * sx + sz * sz <= HALL_SEALED_RADIUS * HALL_SEALED_RADIUS) return 'sealed';
  return null;
}

export function isInsideDungeonPocket(x: number, z: number): boolean {
  const dx = x - DUNGEON_MOUTH.x;
  const dz = z - DUNGEON_MOUTH.z;
  return dx * dx + dz * dz <= DUNGEON_POCKET_RADIUS * DUNGEON_POCKET_RADIUS;
}
