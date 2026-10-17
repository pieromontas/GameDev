import * as THREE from 'three';
import { smoothstep } from '../anim/ease';
import { isMobilePlay } from '../render/deviceQuality';

/**
 * Reusable camera→hero occluder fade.
 *
 * Tag a wall, arch, pillar, or prop with `markOccluderFade`. While that mesh
 * sits on a thickened segment from the camera to the hero, its opacity tweens
 * down and back. Shared materials are cloned so a city-wide slate mat cannot
 * ghost the whole town. Later corridors should mark the same way — selection
 * stays in `viewBlockedByAabb`, which is what the tests lock.
 */

export const OCCLUDER_FADE = 'occluderFade';
export const OCCLUDER_SKIP = 'occluderSkip';

/** How see-through a blocking wall becomes. Low enough that the hero reads. */
export const FADE_TARGET_OPACITY = 0.16;
/** Seconds to tween into the faded state. */
export const FADE_IN_SEC = 0.2;
/** Seconds to tween back to solid. Slightly slower so it doesn't pop. */
export const FADE_OUT_SEC = 0.32;
/**
 * Thickens each camera→hero segment. Catches a battlement that cuts the body
 * even when the single helmet ray skims the top.
 */
export const OCCLUDER_RADIUS = 0.42;
/** Ignore occluders whose bounds sit far from the hero. */
const NEAR_XZ = 26;
/** Mobile: reuse the last selection for this many frames; opacity still tweens. */
const MOBILE_STRIDE = 3;

export type Vec3 = { x: number; y: number; z: number };

export type Aabb = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

/** Points on the hero capsule, feet at `origin`. */
export const HERO_SAMPLE_OFFSETS: readonly Vec3[] = [
  { x: 0, y: 1.72, z: 0 },
  { x: 0, y: 1.15, z: 0 },
  { x: 0, y: 0.55, z: 0 },
  { x: 0.36, y: 1.05, z: 0 },
  { x: -0.36, y: 1.05, z: 0 },
  { x: 0, y: 0.18, z: 0 },
];

export function heroViewSamples(origin: Vec3): Vec3[] {
  return HERO_SAMPLE_OFFSETS.map((offset) => ({
    x: origin.x + offset.x,
    y: origin.y + offset.y,
    z: origin.z + offset.z,
  }));
}

export function expandAabb(box: Aabb, radius: number): Aabb {
  return {
    minX: box.minX - radius,
    minY: box.minY - radius,
    minZ: box.minZ - radius,
    maxX: box.maxX + radius,
    maxY: box.maxY + radius,
    maxZ: box.maxZ + radius,
  };
}

/** True if segment AB intersects the box (inclusive). A flat box still counts. */
export function segmentIntersectsAabb(a: Vec3, b: Vec3, box: Aabb): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  let tMin = 0;
  let tMax = 1;
  const axes: Array<[number, number, number, number]> = [
    [dx, a.x, box.minX, box.maxX],
    [dy, a.y, box.minY, box.maxY],
    [dz, a.z, box.minZ, box.maxZ],
  ];
  for (const [delta, origin, min, max] of axes) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < min || origin > max) return false;
      continue;
    }
    let t1 = (min - origin) / delta;
    let t2 = (max - origin) / delta;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return false;
  }
  return true;
}

/**
 * True when any camera→hero sample, thickened by `radius`, clips the box.
 * `radius` 0 tests the raw segments.
 */
export function viewBlockedByAabb(
  camera: Vec3,
  samples: readonly Vec3[],
  box: Aabb,
  radius = OCCLUDER_RADIUS,
): boolean {
  const expanded = radius > 0 ? expandAabb(box, radius) : box;
  for (const sample of samples) {
    if (segmentIntersectsAabb(camera, sample, expanded)) return true;
  }
  return false;
}

/** Mark a root whose descendant meshes may fade. Skip cards with `occluderSkip`. */
export function markOccluderFade(root: THREE.Object3D): void {
  root.userData[OCCLUDER_FADE] = true;
}

type BaseState = {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
};

type FadeSlot = {
  mesh: THREE.Mesh;
  amount: number;
  base: THREE.Material | THREE.Material[];
  clones: THREE.Material[];
};

/**
 * Tweens tagged occluders. Call `forget` before disposing a root (the crypt
 * hall) so cloned materials are released with the visit.
 */
export class OccluderFade {
  private readonly slots = new Map<THREE.Mesh, FadeSlot>();
  private readonly boundsCache = new Map<THREE.Mesh, Aabb>();
  private readonly meshList: THREE.Mesh[] = [];
  private readonly wanted = new Set<THREE.Mesh>();
  private readonly cheap = isMobilePlay();
  private frame = 0;
  private readonly box = new THREE.Box3();
  private readonly cam = { x: 0, y: 0, z: 0 };
  private samples: Vec3[] = [];

  update(
    camera: THREE.Camera,
    playerPosition: THREE.Vector3,
    roots: readonly THREE.Object3D[],
    dt: number,
  ): void {
    const step = Math.min(Math.max(dt, 0), 0.05);
    this.cam.x = camera.position.x;
    this.cam.y = camera.position.y;
    this.cam.z = camera.position.z;
    this.samples = heroViewSamples({
      x: playerPosition.x,
      y: playerPosition.y,
      z: playerPosition.z,
    });

    this.frame += 1;
    const refresh = !this.cheap || this.frame === 1 || this.frame % MOBILE_STRIDE === 0;
    if (refresh) this.select(roots);

    for (const mesh of this.wanted) {
      const slot = this.ensureSlot(mesh);
      slot.amount = Math.min(1, slot.amount + step / FADE_IN_SEC);
      this.apply(slot);
    }
    for (const [mesh, slot] of this.slots) {
      if (this.wanted.has(mesh)) continue;
      slot.amount = Math.max(0, slot.amount - step / FADE_OUT_SEC);
      this.apply(slot);
    }
  }

  /** Restore and dispose clones under `root` (call before the hall releases). */
  forget(root: THREE.Object3D): void {
    const drop: THREE.Mesh[] = [];
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) drop.push(obj);
    });
    for (const mesh of drop) this.dropMesh(mesh);
  }

  /** Test hook — current tween 0 (solid) … 1 (fully faded). */
  fadeAmount(mesh: THREE.Mesh): number {
    return this.slots.get(mesh)?.amount ?? 0;
  }

  private select(roots: readonly THREE.Object3D[]): void {
    this.wanted.clear();
    this.meshList.length = 0;
    for (const root of roots) {
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.userData[OCCLUDER_SKIP] === true) return;
        this.meshList.push(obj);
      });
    }
    const px = this.samples[1]?.x ?? this.cam.x;
    const pz = this.samples[1]?.z ?? this.cam.z;
    for (const mesh of this.meshList) {
      const box = this.boundsOf(mesh);
      if (!box) continue;
      const cx = (box.minX + box.maxX) * 0.5;
      const cz = (box.minZ + box.maxZ) * 0.5;
      const dx = cx - px;
      const dz = cz - pz;
      if (dx * dx + dz * dz > NEAR_XZ * NEAR_XZ) continue;
      if (viewBlockedByAabb(this.cam, this.samples, box, OCCLUDER_RADIUS)) {
        this.wanted.add(mesh);
      }
    }
  }

  private boundsOf(mesh: THREE.Mesh): Aabb | null {
    const cached = this.boundsCache.get(mesh);
    if (cached) return cached;
    mesh.updateWorldMatrix(true, false);
    this.box.setFromObject(mesh);
    if (this.box.isEmpty()) return null;
    const box: Aabb = {
      minX: this.box.min.x,
      minY: this.box.min.y,
      minZ: this.box.min.z,
      maxX: this.box.max.x,
      maxY: this.box.max.y,
      maxZ: this.box.max.z,
    };
    this.boundsCache.set(mesh, box);
    return box;
  }

  private ensureSlot(mesh: THREE.Mesh): FadeSlot {
    const existing = this.slots.get(mesh);
    if (existing) return existing;
    const base = mesh.material;
    const sources = Array.isArray(base) ? base : [base];
    const clones = sources.map((mat) => {
      const clone = mat.clone();
      const snapshot: BaseState = {
        transparent: mat.transparent,
        opacity: mat.opacity,
        depthWrite: mat.depthWrite,
      };
      clone.userData.occluderBase = snapshot;
      return clone;
    });
    mesh.material = Array.isArray(base) ? clones : clones[0]!;
    const slot: FadeSlot = { mesh, amount: 0, base, clones };
    this.slots.set(mesh, slot);
    return slot;
  }

  private apply(slot: FadeSlot): void {
    const t = smoothstep(slot.amount);
    for (const mat of slot.clones) {
      const base = mat.userData.occluderBase as BaseState;
      const faded = Math.min(base.opacity, FADE_TARGET_OPACITY);
      const opacity = base.opacity + (faded - base.opacity) * t;
      const transparent = t > 0.001 ? true : base.transparent;
      const depthWrite = t > 0.04 ? false : base.depthWrite;
      if (mat.opacity !== opacity) mat.opacity = opacity;
      if (mat.transparent !== transparent) {
        mat.transparent = transparent;
        mat.needsUpdate = true;
      }
      if (mat.depthWrite !== depthWrite) mat.depthWrite = depthWrite;
    }
  }

  private dropMesh(mesh: THREE.Mesh): void {
    const slot = this.slots.get(mesh);
    this.slots.delete(mesh);
    this.boundsCache.delete(mesh);
    this.wanted.delete(mesh);
    if (!slot) return;
    mesh.material = slot.base;
    for (const clone of slot.clones) clone.dispose();
  }
}
