import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FollowCamera } from './FollowCamera';
import { DUNGEON_HALL_ORIGIN, HALL_EXIT_ARCH_Z, HALL_EXIT_PAD, HALL_SPAWN } from '../world/dungeon/layout';

describe('crypt camera framing', () => {
  it('keeps the default crypt orbit over the hall floor, on the near side of the exit arch', () => {
    const cam = new FollowCamera(16 / 9);
    cam.setFraming('crypt');

    const spawn = new THREE.Vector3(
      DUNGEON_HALL_ORIGIN.x + HALL_SPAWN.x,
      0,
      DUNGEON_HALL_ORIGIN.z + HALL_SPAWN.z,
    );
    cam.snapBehind(spawn, HALL_SPAWN.yaw);
    const spawnZ = cam.camera.position.z - DUNGEON_HALL_ORIGIN.z;
    expect(spawnZ).toBeLessThan(HALL_EXIT_ARCH_Z);
    expect(spawnZ).toBeGreaterThan(HALL_SPAWN.z);
    expect(cam.camera.position.y).toBeGreaterThan(6);

    const exit = new THREE.Vector3(
      DUNGEON_HALL_ORIGIN.x + HALL_EXIT_PAD.x,
      0,
      DUNGEON_HALL_ORIGIN.z + HALL_EXIT_PAD.z,
    );
    cam.snapBehind(exit, Math.PI);
    const exitZ = cam.camera.position.z - DUNGEON_HALL_ORIGIN.z;
    // Close enough that the exit arch, when it does cross the view, is the
    // occluder fade's job rather than a hat welded to the hero.
    expect(exitZ).toBeLessThan(HALL_EXIT_ARCH_Z + 1.6);
    expect(exitZ).toBeGreaterThan(HALL_EXIT_PAD.z);
  });

  it('restores the wide yard orbit when leaving', () => {
    const cam = new FollowCamera(16 / 9);
    cam.setFraming('crypt');
    cam.setFraming('yard');
    cam.snapTo(new THREE.Vector3(0, 0, 6));
    expect(cam.camera.position.y).toBeGreaterThan(18);
    expect(cam.camera.position.z).toBeGreaterThan(14);
  });
});
