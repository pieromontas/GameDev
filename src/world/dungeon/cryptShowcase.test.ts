import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DungeonHall } from './DungeonHall';
import { resolveCryptModels } from './cryptModelsFlag';
import {
  CRYPT_CHEST_REWARD,
  CRYPT_SHOWCASE,
  CryptChestState,
  centerAisleClear,
  chestInRange,
  cryptChestToast,
  cryptLootPlacement,
  lidHoldTime,
  lidMixerTime,
  lidSwingRange,
  lootChestApproach,
  resolveHallPrompt,
} from './cryptShowcase';
import { DUNGEON_HALL_ORIGIN, HALL_EXIT_PAD, HALL_SEALED_PAD, HALL_SPAWN } from './layout';

describe('crypt model flag', () => {
  it('stays on unless the URL asks for the procedural hall', () => {
    expect(resolveCryptModels(true, '')).toBe(true);
    expect(resolveCryptModels(true, '?at=dungeon')).toBe(true);
    expect(resolveCryptModels(true, '?models=1')).toBe(true);
    expect(resolveCryptModels(true, '?at=dungeon&models=0')).toBe(false);
    expect(resolveCryptModels(true, 'models=off')).toBe(false);
    expect(resolveCryptModels(false, '?models=1')).toBe(false);
  });
});

describe('crypt loot chest', () => {
  it('opens once, holds the open pose, and pays the meadow chest reward', () => {
    const chest = new CryptChestState(1);
    expect(chest.beginOpen()).toBe(true);
    expect(chest.beginOpen()).toBe(false);
    chest.update(0.4);
    expect(chest.phase).toBe('opening');
    chest.update(1);
    expect(chest.phase).toBe('open');
    expect(chest.elapsed).toBe(1);
    chest.update(2);
    expect(chest.phase).toBe('open');
    expect(chest.beginOpen()).toBe(false);

    expect(CRYPT_CHEST_REWARD).toEqual({ xp: 18, heal: 28, coins: 3 });
    expect(cryptChestToast()).toContain('+18 XP');
    expect(cryptChestToast()).toContain('+3 gold');
  });

  it('holds the lid clip at the open key, not the closed end', () => {
    const times = new Float32Array([0, 1, 2]);
    const values = new Float32Array([
      0, 0, 0, 1,
      -0.70710678, 0, 0, 0.70710678,
      0, 0, 0, 1,
    ]);
    const track = new THREE.QuaternionKeyframeTrack('Chest_Lid.quaternion', times, values);
    const clip = new THREE.AnimationClip('Chest_Lid', 2, [track]);
    expect(lidHoldTime(clip)).toBeCloseTo(1, 5);
    expect(lidSwingRange(clip)).toEqual({ start: 0, hold: 1 });
  });

  it('skips the closed prefix and maps the swing onto the open key', () => {
    const times = new Float32Array([0, 1, 2, 3]);
    const values = new Float32Array([
      0, 0, 0, 1,
      0, 0, 0, 1,
      -0.70710678, 0, 0, 0.70710678,
      0, 0, 0, 1,
    ]);
    const track = new THREE.QuaternionKeyframeTrack('Chest_Lid.quaternion', times, values);
    const clip = new THREE.AnimationClip('Chest_Lid', 3, [track]);
    expect(lidSwingRange(clip)).toEqual({ start: 1, hold: 2 });
    expect(lidMixerTime(0, 1, 2)).toBe(1);
    expect(lidMixerTime(0.5, 1, 2)).toBeCloseTo(1.5, 5);
    expect(lidMixerTime(1, 1, 2)).toBe(2);
    expect(lidMixerTime(4, 1, 2)).toBe(2);
  });

  it('lets the sealed gate and the leave stair win over the chest prompt', () => {
    expect(resolveHallPrompt('sealed', true).kind).toBe('sealed');
    expect(resolveHallPrompt('exit', true).kind).toBe('exit');
    expect(resolveHallPrompt(null, true)).toMatchObject({ visible: true, kind: 'chest' });
    expect(resolveHallPrompt(null, false).visible).toBe(false);
  });
});

describe('crypt showcase placement', () => {
  it('keeps the aisle, the pads, and a chest approach walkable', () => {
    expect(centerAisleClear()).toBe(true);
    const approach = lootChestApproach();
    expect(approach).not.toBeNull();
    expect(chestInRange(approach!.x, approach!.z)).toBe(true);

    const golem = CRYPT_SHOWCASE.find((spot) => spot.kind === 'golem');
    expect(golem?.collisionRadius).toBe(0);
    expect(golem!.z).toBeLessThan(-6.5);

    const gargoyles = CRYPT_SHOWCASE.filter((spot) => spot.kind === 'gargoyle');
    expect(gargoyles).toHaveLength(2);
    expect(gargoyles[0]!.x * gargoyles[1]!.x).toBeLessThan(0);

    const cultists = CRYPT_SHOWCASE.filter((spot) => spot.kind === 'cultist');
    expect(new Set(cultists.map((spot) => spot.model)).size).toBe(2);

    const hall = new DungeonHall({ models: true });
    hall.ensureBuilt();
    for (const pad of [HALL_SPAWN, HALL_EXIT_PAD, HALL_SEALED_PAD]) {
      const pos = new THREE.Vector3(
        DUNGEON_HALL_ORIGIN.x + pad.x,
        0,
        DUNGEON_HALL_ORIGIN.z + pad.z,
      );
      hall.resolve(pos, 0.5);
      expect(pos.x).toBeCloseTo(DUNGEON_HALL_ORIGIN.x + pad.x, 2);
      expect(pos.z).toBeCloseTo(DUNGEON_HALL_ORIGIN.z + pad.z, 2);
    }
    const stand = new THREE.Vector3(
      DUNGEON_HALL_ORIGIN.x + approach!.x,
      0,
      DUNGEON_HALL_ORIGIN.z + approach!.z,
    );
    hall.resolve(stand, 0.5);
    expect(stand.x).toBeCloseTo(DUNGEON_HALL_ORIGIN.x + approach!.x, 2);
    expect(chestInRange(stand.x - DUNGEON_HALL_ORIGIN.x, stand.z - DUNGEON_HALL_ORIGIN.z)).toBe(true);

    const barrel = CRYPT_SHOWCASE.find((spot) => spot.id === 'barrel-west-stair')!;
    const blocked = new THREE.Vector3(
      DUNGEON_HALL_ORIGIN.x + barrel.x,
      0,
      DUNGEON_HALL_ORIGIN.z + barrel.z,
    );
    hall.resolve(blocked, 0.5);
    expect(Math.hypot(blocked.x - (DUNGEON_HALL_ORIGIN.x + barrel.x), blocked.z - (DUNGEON_HALL_ORIGIN.z + barrel.z))).toBeGreaterThan(0.2);

    const plain = new DungeonHall({ models: false });
    plain.ensureBuilt();
    const open = new THREE.Vector3(
      DUNGEON_HALL_ORIGIN.x + barrel.x,
      0,
      DUNGEON_HALL_ORIGIN.z + barrel.z,
    );
    plain.resolve(open, 0.5);
    expect(open.x).toBeCloseTo(DUNGEON_HALL_ORIGIN.x + barrel.x, 2);
    expect(open.z).toBeCloseTo(DUNGEON_HALL_ORIGIN.z + barrel.z, 2);
    expect(plain.tryLootChest(open.x, open.z)).toBeNull();

    hall.release();
    plain.release();
  });

  it('does not grant loot until the chest mesh is actually loaded', () => {
    const hall = new DungeonHall({ models: true });
    hall.ensureBuilt();
    const spot = cryptLootPlacement();
    expect(
      hall.tryLootChest(DUNGEON_HALL_ORIGIN.x + spot.x, DUNGEON_HALL_ORIGIN.z + spot.z),
    ).toBeNull();
    hall.release();
  });
});
