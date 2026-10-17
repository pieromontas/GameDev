import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MeadowBiome } from '../MeadowBiome';
import { PLAYER_SPAWN } from '../spawnSafe';
import { DUNGEON_ENTER_PAD, DUNGEON_ENTER_RADIUS, isNearDungeonEntrance } from './layout';

const RADIUS = 0.5;

/**
 * Greedy steer with a fan of headings. This is not the player's brain — it only
 * checks that some walkable polyline exists from camp to the crypt pad.
 */
function canWalk(
  meadow: MeadowBiome,
  from: { x: number; z: number },
  to: { x: number; z: number },
): { ok: boolean; x: number; z: number; steps: number } {
  const pos = new THREE.Vector3(from.x, 0, from.z);
  const headings = [0, 0.35, -0.35, 0.7, -0.7, 1.15, -1.15, 1.7, -1.7, 2.3, -2.3, Math.PI];
  for (let step = 0; step < 700; step++) {
    const dx = to.x - pos.x;
    const dz = to.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= DUNGEON_ENTER_RADIUS * 0.75) {
      return { ok: true, x: pos.x, z: pos.z, steps: step };
    }
    const length = Math.min(1.15, dist);
    const base = Math.atan2(dx, dz);
    let moved = false;
    for (const extra of headings) {
      const angle = base + extra;
      const trial = new THREE.Vector3(
        pos.x + Math.sin(angle) * length,
        0,
        pos.z + Math.cos(angle) * length,
      );
      meadow.resolveObstacles(trial, RADIUS);
      meadow.clampToPlayArea(trial);
      if (Math.hypot(to.x - trial.x, to.z - trial.z) < dist - 0.04) {
        pos.copy(trial);
        moved = true;
        break;
      }
    }
    if (!moved) return { ok: false, x: pos.x, z: pos.z, steps: step };
  }
  return { ok: false, x: pos.x, z: pos.z, steps: 700 };
}

describe('crypt approach from camp', () => {
  it('keeps the enter pad walkable and reachable from spawn', () => {
    const meadow = new MeadowBiome();
    expect(meadow.isInPlayArea(DUNGEON_ENTER_PAD.x, DUNGEON_ENTER_PAD.z)).toBe(true);
    expect(meadow.getStructureOccluders().length).toBeGreaterThan(2);

    const pad = new THREE.Vector3(DUNGEON_ENTER_PAD.x, 0, DUNGEON_ENTER_PAD.z);
    meadow.resolveObstacles(pad, RADIUS);
    meadow.clampToPlayArea(pad);
    expect(isNearDungeonEntrance(pad.x, pad.z)).toBe(true);

    const walked = canWalk(meadow, PLAYER_SPAWN, DUNGEON_ENTER_PAD);
    expect(walked.ok, `stuck near ${walked.x.toFixed(1)}, ${walked.z.toFixed(1)} after ${walked.steps}`).toBe(true);
  });
});
