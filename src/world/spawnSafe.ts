import * as THREE from 'three';
import { dist2 } from '../utils/math';

/** Canonical player spawn / respawn point (meadow camp). */
export const PLAYER_SPAWN = new THREE.Vector3(0, 0, 6);

/**
 * Clear circle around camp: no enemy home / idle / leash rest.
 * Sized past meadow-blob aggro (9.5) with margin for chase linger.
 * Spitter homes sit farther out so their 13.5 aggro never reaches camp.
 */
export const SPAWN_SAFE_RADIUS = 14;

/** Brief post-respawn window where enemies will not aggro the player. */
export const SPAWN_AGGRO_GRACE = 2.4;

export function isInsideSpawnSafe(
  x: number,
  z: number,
  radius = SPAWN_SAFE_RADIUS,
): boolean {
  return dist2(x, z, PLAYER_SPAWN.x, PLAYER_SPAWN.z) < radius * radius;
}

/**
 * Teleport a point onto the rim of the spawn-safe circle (outward from camp).
 * `margin` pushes slightly past the rim so collision radii don't overlap.
 */
export function pushOutOfSpawnSafe(
  pos: THREE.Vector3,
  radius = SPAWN_SAFE_RADIUS,
  margin = 1.25,
): boolean {
  const dx = pos.x - PLAYER_SPAWN.x;
  const dz = pos.z - PLAYER_SPAWN.z;
  const d = Math.hypot(dx, dz);
  const target = radius + margin;
  if (d >= target) return false;
  if (d < 1e-4) {
    // Exactly on spawn — shove south toward the open meadow ring.
    pos.x = PLAYER_SPAWN.x;
    pos.z = PLAYER_SPAWN.z + target;
  } else {
    const s = target / d;
    pos.x = PLAYER_SPAWN.x + dx * s;
    pos.z = PLAYER_SPAWN.z + dz * s;
  }
  pos.y = 0;
  return true;
}
