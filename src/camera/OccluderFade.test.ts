import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FADE_TARGET_OPACITY,
  OccluderFade,
  expandAabb,
  heroViewSamples,
  segmentIntersectsAabb,
  viewBlockedByAabb,
  type Aabb,
  type Vec3,
} from './OccluderFade';

const camera: Vec3 = { x: 0, y: 18, z: 10 };
const hero: Vec3 = { x: 0, y: 0, z: 0 };

/** Wing-like battlement between a high yard camera and the hero. */
const battlement: Aabb = {
  minX: -1.4,
  maxX: 1.4,
  minY: 0,
  maxY: 4.3,
  minZ: 1.5,
  maxZ: 2.7,
};

describe('occluder fade selection', () => {
  it('selects a battlement that cuts the hero from the default high camera', () => {
    const samples = heroViewSamples(hero);
    expect(viewBlockedByAabb(camera, samples, battlement)).toBe(true);
  });

  it('ignores a wall beside the view and a wall behind the camera', () => {
    const samples = heroViewSamples(hero);
    const beside: Aabb = { minX: 6, maxX: 8, minY: 0, maxY: 5, minZ: 1, maxZ: 3 };
    const behindCam: Aabb = { minX: -2, maxX: 2, minY: 0, maxY: 6, minZ: 12, maxZ: 14 };
    expect(viewBlockedByAabb(camera, samples, beside)).toBe(false);
    expect(viewBlockedByAabb(camera, samples, behindCam)).toBe(false);
  });

  it('ignores a beam that only sits behind the hero', () => {
    const samples = heroViewSamples(hero);
    const behindHero: Aabb = { minX: -2, maxX: 2, minY: 2, maxY: 3.4, minZ: -4, maxZ: -2.5 };
    expect(viewBlockedByAabb(camera, samples, behindHero)).toBe(false);
  });

  it('catches an arch beam the helmet ray clears but the body still hits', () => {
    // High camera, beam just north of the hero. Helmet segment passes over it;
    // the thickened body samples still clip the stone.
    const high: Vec3 = { x: 0, y: 21.5, z: 9.2 };
    const beam: Aabb = { minX: -1.9, maxX: 1.9, minY: 2.7, maxY: 3.2, minZ: 1.05, maxZ: 1.7 };
    const samples = heroViewSamples(hero);
    const head = samples[0]!;
    expect(segmentIntersectsAabb(high, head, beam)).toBe(false);
    expect(viewBlockedByAabb(high, samples, beam)).toBe(true);
  });

  it('does not treat an expanded box as a reason to fade a distant curb', () => {
    const curb: Aabb = { minX: -1, maxX: 1, minY: 0, maxY: 0.25, minZ: 6.5, maxZ: 7.2 };
    expect(viewBlockedByAabb(camera, heroViewSamples(hero), curb)).toBe(false);
    expect(expandAabb(curb, 0).minY).toBe(0);
  });
});

describe('occluder fade tween', () => {
  function blockingMesh(): { fade: OccluderFade; mesh: THREE.Mesh; camera: THREE.Camera } {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 4.3, 1.2),
      new THREE.MeshToonMaterial({ color: 0x556677 }),
    );
    mesh.position.set(0, 2.15, 2.1);
    mesh.updateMatrixWorld(true);
    const fade = new OccluderFade();
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(camera.x, camera.y, camera.z);
    return { fade, mesh, camera: cam };
  }

  it('tweens opacity instead of popping, then restores', () => {
    const { fade, mesh, camera: cam } = blockingMesh();
    const player = new THREE.Vector3(hero.x, hero.y, hero.z);
    fade.update(cam, player, [mesh], 0.04);
    const mat = mesh.material as THREE.MeshToonMaterial;
    expect(mat.opacity).toBeLessThan(0.95);
    expect(mat.opacity).toBeGreaterThan(0.7);
    expect(mat.transparent).toBe(true);

    for (let i = 0; i < 12; i++) fade.update(cam, player, [mesh], 0.05);
    expect(mat.opacity).toBeCloseTo(FADE_TARGET_OPACITY, 2);

    cam.position.set(0, 18, -12);
    const fadedOpacity = mat.opacity;
    fade.update(cam, player, [mesh], 0.04);
    expect(fade.fadeAmount(mesh)).toBeLessThan(1);
    expect(mat.opacity).toBeGreaterThan(fadedOpacity);
    expect(mat.opacity).toBeLessThan(0.5);

    for (let i = 0; i < 16; i++) fade.update(cam, player, [mesh], 0.05);
    expect(mat.opacity).toBeCloseTo(1, 2);
    expect(mat.transparent).toBe(false);
    expect(mat.depthWrite).toBe(true);
  });

  it('clones a shared material so a neighbor wall stays solid', () => {
    const shared = new THREE.MeshToonMaterial({ color: 0x556677 });
    const blocking = new THREE.Mesh(new THREE.BoxGeometry(2.8, 4.3, 1.2), shared);
    blocking.position.set(0, 2.15, 2.1);
    blocking.updateMatrixWorld(true);
    const neighbor = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1), shared);
    neighbor.position.set(12, 1.5, 0);
    neighbor.updateMatrixWorld(true);

    const fade = new OccluderFade();
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(camera.x, camera.y, camera.z);
    for (let i = 0; i < 12; i++) fade.update(cam, new THREE.Vector3(), [blocking, neighbor], 0.05);

    expect(shared.opacity).toBe(1);
    expect(neighbor.material).toBe(shared);
    expect((blocking.material as THREE.Material).opacity).toBeLessThan(0.25);
    fade.forget(blocking);
    expect(blocking.material).toBe(shared);
  });
});
