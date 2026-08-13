import * as THREE from 'three';
import { clamp } from '../utils/math';

/**
 * Hard caps so a bad instance / PROP_SCALE bleed / runaway squash cannot make
 * meadow mobs screen-filling giants. Normal poses stay well under these.
 */
export const MAX_ENEMY_ROOT_SCALE = 1.35;
export const MAX_ENEMY_VISUAL_SCALE = 1.75;
export const MAX_ENEMY_COLLISION_RADIUS = 1.2;

/** Clamp Entity collision radius used for combat / blocking. */
export function clampEnemyCollisionRadius(radius: number): number {
  return clamp(radius, 0.2, MAX_ENEMY_COLLISION_RADIUS);
}

/** Keep the enemy root mesh from inheriting a huge world scale. */
export function clampEnemyRootScale(mesh: THREE.Object3D): void {
  const sx = clamp(mesh.scale.x, 0.05, MAX_ENEMY_ROOT_SCALE);
  const sy = clamp(mesh.scale.y, 0.05, MAX_ENEMY_ROOT_SCALE);
  const sz = clamp(mesh.scale.z, 0.05, MAX_ENEMY_ROOT_SCALE);
  if (sx !== mesh.scale.x || sy !== mesh.scale.y || sz !== mesh.scale.z) {
    mesh.scale.set(sx, sy, sz);
  }
}

/** Clamp procedural visual squash / stretch (pose anims). */
export function clampEnemyVisualScale(visual: THREE.Object3D): void {
  const sx = clamp(visual.scale.x, 0.05, MAX_ENEMY_VISUAL_SCALE);
  const sy = clamp(visual.scale.y, 0.05, MAX_ENEMY_VISUAL_SCALE);
  const sz = clamp(visual.scale.z, 0.05, MAX_ENEMY_VISUAL_SCALE);
  if (sx !== visual.scale.x || sy !== visual.scale.y || sz !== visual.scale.z) {
    visual.scale.set(sx, sy, sz);
  }
}
