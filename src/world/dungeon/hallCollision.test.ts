import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DungeonHall } from './DungeonHall';
import {
  DUNGEON_HALL_ORIGIN,
  HALL_BOUNDS,
  HALL_EXIT_PAD,
  HALL_SEALED_PAD,
  HALL_SPAWN,
} from './layout';

const RADIUS = 0.5;

function world(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(DUNGEON_HALL_ORIGIN.x + x, 0, DUNGEON_HALL_ORIGIN.z + z);
}

function settled(hall: DungeonHall, x: number, z: number): THREE.Vector3 {
  const pos = world(x, z);
  hall.resolve(pos, RADIUS);
  const onceX = pos.x;
  const onceZ = pos.z;
  hall.resolve(pos, RADIUS);
  expect(Math.hypot(pos.x - onceX, pos.z - onceZ)).toBeLessThan(0.02);
  return pos;
}

function canReach(hall: DungeonHall, from: { x: number; z: number }, to: { x: number; z: number }): boolean {
  const pos = world(from.x, from.z);
  const goal = world(to.x, to.z);
  for (let step = 0; step < 80; step++) {
    const dx = goal.x - pos.x;
    const dz = goal.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) return true;
    const length = Math.min(0.45, dist);
    const base = Math.atan2(dx, dz);
    let moved = false;
    for (const extra of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.2, -2.2, Math.PI]) {
      const angle = base + extra;
      const trial = new THREE.Vector3(
        pos.x + Math.sin(angle) * length,
        0,
        pos.z + Math.cos(angle) * length,
      );
      hall.resolve(trial, RADIUS);
      if (Math.hypot(goal.x - trial.x, goal.z - trial.z) < dist - 0.015) {
        pos.copy(trial);
        moved = true;
        break;
      }
    }
    if (!moved) return false;
  }
  return false;
}

describe('entry hall collision', () => {
  const hall = new DungeonHall();
  hall.ensureBuilt();

  it('leaves the aisle, the leave stair, and the sealed gate standing still', () => {
    const spawn = settled(hall, HALL_SPAWN.x, HALL_SPAWN.z);
    expect(spawn.x).toBeCloseTo(DUNGEON_HALL_ORIGIN.x + HALL_SPAWN.x, 2);
    expect(spawn.z).toBeCloseTo(DUNGEON_HALL_ORIGIN.z + HALL_SPAWN.z, 2);

    const exit = settled(hall, HALL_EXIT_PAD.x, HALL_EXIT_PAD.z);
    expect(exit.z).toBeCloseTo(DUNGEON_HALL_ORIGIN.z + HALL_EXIT_PAD.z, 2);

    const gate = settled(hall, HALL_SEALED_PAD.x, HALL_SEALED_PAD.z);
    expect(gate.z).toBeCloseTo(DUNGEON_HALL_ORIGIN.z + HALL_SEALED_PAD.z, 2);
  });

  it('pushes the hero out of a pillar and the loose stair chunk', () => {
    const pillar = settled(hall, -2.05, -1.35);
    expect(Math.hypot(pillar.x - (DUNGEON_HALL_ORIGIN.x - 2.05), pillar.z - (DUNGEON_HALL_ORIGIN.z - 1.35))).toBeGreaterThan(0.9);

    const chunk = settled(hall, 1.15, 5.15);
    expect(Math.hypot(chunk.x - (DUNGEON_HALL_ORIGIN.x + 1.15), chunk.z - (DUNGEON_HALL_ORIGIN.z + 5.15))).toBeGreaterThan(0.7);
  });

  it('stays inside the room on a grid and does not jitter', () => {
    for (let x = -2.8; x <= 2.8; x += 0.45) {
      for (let z = -4.9; z <= 6.3; z += 0.45) {
        const pos = settled(hall, x, z);
        expect(pos.x).toBeGreaterThanOrEqual(DUNGEON_HALL_ORIGIN.x + HALL_BOUNDS.minX + RADIUS - 1e-3);
        expect(pos.x).toBeLessThanOrEqual(DUNGEON_HALL_ORIGIN.x + HALL_BOUNDS.maxX - RADIUS + 1e-3);
        expect(pos.z).toBeGreaterThanOrEqual(DUNGEON_HALL_ORIGIN.z + HALL_BOUNDS.minZ + RADIUS - 1e-3);
        expect(pos.z).toBeLessThanOrEqual(DUNGEON_HALL_ORIGIN.z + HALL_BOUNDS.maxZ - RADIUS + 1e-3);
      }
    }
  });

  it('can walk from the spawn to the leave stair and the sealed gate', () => {
    expect(canReach(hall, HALL_SPAWN, HALL_EXIT_PAD)).toBe(true);
    expect(canReach(hall, HALL_SPAWN, HALL_SEALED_PAD)).toBe(true);
    expect(canReach(hall, HALL_EXIT_PAD, HALL_SPAWN)).toBe(true);
    hall.release();
  });
});
