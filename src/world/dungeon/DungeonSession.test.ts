import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DungeonHall } from './DungeonHall';
import { DungeonSession } from './DungeonSession';
import { DUNGEON_HALL_ORIGIN, HALL_BOUNDS } from './layout';

function stepUntil(
  session: DungeonSession,
  predicate: (event: ReturnType<DungeonSession['update']>) => boolean,
): ReturnType<DungeonSession['update']>[] {
  const events = [];
  for (let i = 0; i < 80; i++) {
    const event = session.update(0.05);
    events.push(event);
    if (predicate(event)) break;
  }
  return events;
}

function hallRoots(scene: THREE.Scene): THREE.Object3D[] {
  return scene.children.filter((child) => child.name === 'DungeonHall');
}

describe('DungeonHall collision', () => {
  it('keeps a body inside the room and out of the pillars', () => {
    const hall = new DungeonHall();
    hall.ensureBuilt();
    const outside = new THREE.Vector3(DUNGEON_HALL_ORIGIN.x + 12, 0, DUNGEON_HALL_ORIGIN.z);
    hall.resolve(outside, 0.5);
    expect(outside.x).toBeLessThanOrEqual(DUNGEON_HALL_ORIGIN.x + HALL_BOUNDS.maxX - 0.5 + 1e-6);
    expect(outside.z).toBeGreaterThanOrEqual(DUNGEON_HALL_ORIGIN.z + HALL_BOUNDS.minZ);

    const center = new THREE.Vector3(DUNGEON_HALL_ORIGIN.x, 0, DUNGEON_HALL_ORIGIN.z + 4.45);
    hall.resolve(center, 0.5);
    expect(center.x).toBeCloseTo(DUNGEON_HALL_ORIGIN.x, 5);
    expect(center.z).toBeCloseTo(DUNGEON_HALL_ORIGIN.z + 4.45, 5);

    hall.release();
    expect(hall.meshCount()).toBe(0);
    expect(hall.disposedGeometries).toBeGreaterThan(0);
  });
});

describe('DungeonSession zone switch', () => {
  it('builds one hall, disposes it on exit, and does not duplicate on re-entry', () => {
    const scene = new THREE.Scene();
    const session = new DungeonSession(scene);

    expect(session.requestEnter()).toBe(true);
    expect(session.requestEnter()).toBe(false);
    expect(session.inputLocked).toBe(true);

    const entered = stepUntil(session, (event) => event.switchedTo != null);
    expect(entered.filter((event) => event.switchedTo === 'dungeon')).toHaveLength(1);
    expect(hallRoots(scene)).toHaveLength(1);
    const meshes = session.meshCount;
    const lights = session.lightCount;
    expect(meshes).toBeGreaterThan(8);
    expect(lights).toBeLessThanOrEqual(2);

    stepUntil(session, (event) => event.arrived);
    expect(session.inputLocked).toBe(false);
    expect(session.currentZone).toBe('dungeon');

    expect(session.requestExit()).toBe(true);
    const left = stepUntil(session, (event) => event.switchedTo != null);
    expect(left.filter((event) => event.switchedTo === 'overworld')).toHaveLength(1);
    expect(hallRoots(scene)).toHaveLength(0);
    expect(session.meshCount).toBe(0);
    expect(session.lightCount).toBe(0);
    const disposed = session.disposedGeometryCount;
    expect(disposed).toBeGreaterThan(0);

    stepUntil(session, (event) => event.arrived);
    expect(session.inputLocked).toBe(false);
    expect(session.requestEnter()).toBe(true);
    stepUntil(session, (event) => event.switchedTo != null);
    expect(hallRoots(scene)).toHaveLength(1);
    expect(session.meshCount).toBe(meshes);
    expect(session.lightCount).toBe(lights);
    expect(session.disposedGeometryCount).toBe(disposed);

    session.dispose();
    expect(hallRoots(scene)).toHaveLength(0);
    expect(session.disposedGeometryCount).toBeGreaterThan(disposed);
  });

  it('boots into the hall without a switch event and can force back out', () => {
    const scene = new THREE.Scene();
    const session = new DungeonSession(scene);
    session.bootInDungeon();
    expect(session.currentZone).toBe('dungeon');
    expect(hallRoots(scene)).toHaveLength(1);
    expect(session.overlay).toBe(1);

    const events = stepUntil(session, (event) => event.arrived);
    expect(events.some((event) => event.switchedTo != null)).toBe(false);
    expect(session.currentZone).toBe('dungeon');

    session.forceOverworld();
    expect(session.currentZone).toBe('overworld');
    expect(session.inputLocked).toBe(false);
    expect(hallRoots(scene)).toHaveLength(0);
    session.dispose();
  });
});
