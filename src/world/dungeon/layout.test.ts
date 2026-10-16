import { describe, expect, it } from 'vitest';
import { CASTLE_ARMORY_SPOT, CASTLE_CITADEL_GATE, CASTLE_KNIGHT_CAPTAIN } from '../CastleDistrict';
import {
  CITY_NORTH_WALL_A,
  CITY_NORTH_WALL_B,
  DUNGEON_ENTER_PAD,
  DUNGEON_ENTER_RADIUS,
  DUNGEON_EXIT_LANDING,
  DUNGEON_MOUTH,
  DUNGEON_POCKET_RADIUS,
  HALL_EXIT_PAD,
  HALL_EXIT_RADIUS,
  HALL_SEALED_PAD,
  HALL_SEALED_RADIUS,
  HALL_SPAWN,
  NORTH_POSTERN,
  hallPromptKind,
  isInsideDungeonPocket,
  isNearDungeonEntrance,
} from './layout';

/** Matches CastleDistrict interact radii — the pads must not steal those prompts. */
const ARMORY_R = 3.4;
const CAPTAIN_R = 3.6;
const CITADEL_R = 3.8;

function dist(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe('dungeon entrance clearances', () => {
  it('keeps the enter pad outside castle interact radii', () => {
    expect(dist(DUNGEON_ENTER_PAD, CASTLE_ARMORY_SPOT)).toBeGreaterThan(ARMORY_R + DUNGEON_ENTER_RADIUS);
    expect(dist(DUNGEON_ENTER_PAD, CASTLE_KNIGHT_CAPTAIN)).toBeGreaterThan(CAPTAIN_R + DUNGEON_ENTER_RADIUS);
    expect(dist(DUNGEON_ENTER_PAD, CASTLE_CITADEL_GATE)).toBeGreaterThan(CITADEL_R + DUNGEON_ENTER_RADIUS);
  });

  it('drops the player outside the enter pad and the armory after leaving', () => {
    expect(dist(DUNGEON_EXIT_LANDING, DUNGEON_ENTER_PAD)).toBeGreaterThan(DUNGEON_ENTER_RADIUS + 0.4);
    expect(dist(DUNGEON_EXIT_LANDING, CASTLE_ARMORY_SPOT)).toBeGreaterThan(ARMORY_R + 0.4);
    expect(isNearDungeonEntrance(DUNGEON_EXIT_LANDING.x, DUNGEON_EXIT_LANDING.z)).toBe(false);
    expect(isInsideDungeonPocket(DUNGEON_EXIT_LANDING.x, DUNGEON_EXIT_LANDING.z)).toBe(true);
    expect(isInsideDungeonPocket(DUNGEON_ENTER_PAD.x, DUNGEON_ENTER_PAD.z)).toBe(true);
  });

  it('opens a postern wider than a hero between the north curtain endpoints', () => {
    const gap = dist(NORTH_POSTERN.from, NORTH_POSTERN.to);
    expect(gap).toBeGreaterThan(6);
    expect(dist(DUNGEON_MOUTH, NORTH_POSTERN.from)).toBeCloseTo(gap / 2, 5);
    expect(dist(DUNGEON_MOUTH, NORTH_POSTERN.to)).toBeCloseTo(gap / 2, 5);
    // Gap sits on the A→B segment, not off in the yard.
    const ab = dist(CITY_NORTH_WALL_A, CITY_NORTH_WALL_B);
    const via =
      dist(CITY_NORTH_WALL_A, NORTH_POSTERN.from) +
      gap +
      dist(NORTH_POSTERN.to, CITY_NORTH_WALL_B);
    expect(via).toBeCloseTo(ab, 4);
    expect(DUNGEON_POCKET_RADIUS).toBeGreaterThan(dist(DUNGEON_MOUTH, DUNGEON_EXIT_LANDING));
  });
});

describe('entry hall prompts', () => {
  it('does not overlap spawn, exit, and the sealed gate', () => {
    expect(hallPromptKind(HALL_SPAWN.x, HALL_SPAWN.z)).toBe(null);
    expect(hallPromptKind(HALL_EXIT_PAD.x, HALL_EXIT_PAD.z)).toBe('exit');
    expect(hallPromptKind(HALL_SEALED_PAD.x, HALL_SEALED_PAD.z)).toBe('sealed');
    expect(dist(HALL_SPAWN, HALL_EXIT_PAD)).toBeGreaterThan(HALL_EXIT_RADIUS);
    expect(dist(HALL_SPAWN, HALL_SEALED_PAD)).toBeGreaterThan(HALL_SEALED_RADIUS);
    expect(dist(HALL_EXIT_PAD, HALL_SEALED_PAD)).toBeGreaterThan(HALL_EXIT_RADIUS + HALL_SEALED_RADIUS);
  });
});
