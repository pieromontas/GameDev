import * as THREE from 'three';
import { isMobilePlay } from '../render/deviceQuality';

/** Soft see-through when a crown sits between the camera and the knight. */
const FADE_OPACITY = 0.16;
/** Even softer when the camera is inside a crown volume. */
const FADE_OPACITY_INSIDE = 0.12;
/** Only test foliage near the hero — meadow-wide casts are unnecessary. */
const NEAR_XZ = 18;
/** Expand bounds a little so sphere crowns still register when the cam clips them. */
const BOUNDS_PAD = 1.2;
/** Fade neighboring crowns so overlapping KayKit spheres don't stay solid. */
const NEIGHBOR_XZ = 5.5;
/** Mobile: skip occlusion work unless camera/hero moved this far. */
const MOBILE_MOVE = 0.4;
/** Mobile: at most one occlusion pass every N frames. */
const MOBILE_FRAME_STRIDE = 3;

type FoliageBase = {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  side: THREE.Side;
};

/**
 * Cheap camera↔hero occlusion for KayKit tree / bush crowns.
 *
 * Fades tagged `foliageOccluder` roots when they sit on the look ray or contain
 * the camera (the common “inside green sphere” case). Cottages / gate / ground
 * are never in the occluder list.
 */
export class FoliageOcclusion {
  private readonly raycaster = new THREE.Raycaster();
  private readonly origin = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly camUp = new THREE.Vector3();
  private readonly sampleOrigin = new THREE.Vector3();
  private readonly toCam = new THREE.Vector3();
  private readonly bounds = new THREE.Box3();
  private readonly sphere = new THREE.Sphere();
  private readonly segDir = new THREE.Vector3();
  private readonly closest = new THREE.Vector3();
  private readonly nearList: THREE.Object3D[] = [];
  /** Groups currently faded this frame (restored when the ray is clear). */
  private readonly faded = new Map<THREE.Object3D, number>();
  private readonly nextFaded = new Map<THREE.Object3D, number>();
  private readonly cheapMode = isMobilePlay();
  private readonly lastCam = new THREE.Vector3();
  private readonly lastLook = new THREE.Vector3();
  private mobileTick = 0;
  private didRun = false;

  /**
   * @param lookAt World point near the hero helmet (FollowCamera look target).
   * @param occluders Tree / bush roots tagged `foliageOccluder`.
   */
  update(
    camera: THREE.Camera,
    lookAt: THREE.Vector3,
    occluders: readonly THREE.Object3D[],
  ): void {
    if (this.cheapMode && this.skipCheapUpdate(camera, lookAt)) return;

    this.nextFaded.clear();
    if (occluders.length === 0) {
      this.restoreCleared();
      return;
    }

    this.toCam.copy(camera.position).sub(lookAt);
    const span = this.toCam.length();
    if (span < 0.05) {
      this.restoreCleared();
      return;
    }

    // 1) Nearby crowns that contain the camera or the look point (inside-sphere case).
    for (const root of occluders) {
      const dx = root.position.x - lookAt.x;
      const dz = root.position.z - lookAt.z;
      if (dx * dx + dz * dz > NEAR_XZ * NEAR_XZ) continue;
      const inside = this.occluderContains(root, camera.position, lookAt);
      if (inside || this.occluderBlocks(root, camera.position, lookAt)) {
        this.markFade(root, inside ? FADE_OPACITY_INSIDE : FADE_OPACITY);
      }
    }

    // 2) A few camera→hero rays catch crowns that sit on the view line.
    // Mobile skips the 4× intersectObjects casts (CPU + GPU transparent DoubleSide bomb).
    let nearList: THREE.Object3D[] | null = null;
    if (!this.cheapMode) {
      this.origin.copy(camera.position);
      this.direction.copy(lookAt).sub(this.origin).normalize();
      this.camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      this.camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      const lateral = Math.min(0.7, span * 0.045);

      nearList = this.collectNear(occluders, lookAt);
      this.castSample(this.origin, this.direction, span, nearList);
      this.sampleOrigin.copy(this.origin).addScaledVector(this.camRight, lateral);
      this.castSample(this.sampleOrigin, this.direction, span, nearList);
      this.sampleOrigin.copy(this.origin).addScaledVector(this.camRight, -lateral);
      this.castSample(this.sampleOrigin, this.direction, span, nearList);
      this.sampleOrigin.copy(this.origin).addScaledVector(this.camUp, lateral * 0.7);
      this.castSample(this.sampleOrigin, this.direction, span, nearList);
    }

    // 3) Soft-fade neighbors of any blocked crown (overlapping KayKit spheres).
    // Mobile only fades the 1–2 blocking crowns — no meadow-wide DoubleSide clones.
    if (!this.cheapMode && nearList && this.nextFaded.size > 0) {
      for (const root of nearList) {
        if (this.nextFaded.has(root)) continue;
        for (const blocked of this.nextFaded.keys()) {
          const dx = root.position.x - blocked.position.x;
          const dz = root.position.z - blocked.position.z;
          if (dx * dx + dz * dz <= NEIGHBOR_XZ * NEIGHBOR_XZ) {
            this.markFade(root, FADE_OPACITY);
            break;
          }
        }
      }
    }

    for (const [group, opacity] of this.nextFaded) {
      const prev = this.faded.get(group);
      if (prev === undefined || prev !== opacity) this.fadeGroup(group, opacity);
    }
    for (const group of this.faded.keys()) {
      if (!this.nextFaded.has(group)) this.fadeGroup(group, null);
    }
    this.faded.clear();
    for (const [group, opacity] of this.nextFaded) this.faded.set(group, opacity);
  }

  /** Keep last fade set unless the camera/hero moved or a stride elapsed. */
  private skipCheapUpdate(camera: THREE.Camera, lookAt: THREE.Vector3): boolean {
    if (!this.didRun) {
      this.lastCam.copy(camera.position);
      this.lastLook.copy(lookAt);
      this.didRun = true;
      this.mobileTick = 0;
      return false;
    }
    this.mobileTick += 1;
    if (this.mobileTick < MOBILE_FRAME_STRIDE) return true;
    this.mobileTick = 0;
    const moveSq = MOBILE_MOVE * MOBILE_MOVE;
    const moved =
      this.lastCam.distanceToSquared(camera.position) > moveSq ||
      this.lastLook.distanceToSquared(lookAt) > moveSq;
    if (!moved) return true;
    this.lastCam.copy(camera.position);
    this.lastLook.copy(lookAt);
    return false;
  }

  private markFade(root: THREE.Object3D, opacity: number): void {
    const prev = this.nextFaded.get(root);
    if (prev === undefined || opacity < prev) this.nextFaded.set(root, opacity);
  }

  private collectNear(
    occluders: readonly THREE.Object3D[],
    lookAt: THREE.Vector3,
  ): THREE.Object3D[] {
    this.nearList.length = 0;
    for (const root of occluders) {
      const dx = root.position.x - lookAt.x;
      const dz = root.position.z - lookAt.z;
      if (dx * dx + dz * dz <= NEAR_XZ * NEAR_XZ) this.nearList.push(root);
    }
    return this.nearList;
  }

  private refreshBounds(root: THREE.Object3D): boolean {
    root.updateWorldMatrix(true, false);
    this.bounds.setFromObject(root);
    if (this.bounds.isEmpty()) return false;
    this.bounds.expandByScalar(0.35);
    this.bounds.getBoundingSphere(this.sphere);
    this.sphere.radius *= BOUNDS_PAD;
    return true;
  }

  private occluderContains(
    root: THREE.Object3D,
    cameraPos: THREE.Vector3,
    lookAt: THREE.Vector3,
  ): boolean {
    if (!this.refreshBounds(root)) return false;
    return this.sphere.containsPoint(cameraPos) || this.sphere.containsPoint(lookAt);
  }

  /** True if the camera→hero segment clips this crown's bounds. */
  private occluderBlocks(
    root: THREE.Object3D,
    cameraPos: THREE.Vector3,
    lookAt: THREE.Vector3,
  ): boolean {
    if (!this.refreshBounds(root)) return false;
    return this.segmentHitsSphere(cameraPos, lookAt, this.sphere);
  }

  private segmentHitsSphere(
    a: THREE.Vector3,
    b: THREE.Vector3,
    sphere: THREE.Sphere,
  ): boolean {
    this.segDir.copy(b).sub(a);
    const len = this.segDir.length();
    if (len < 1e-6) return sphere.containsPoint(a);
    this.segDir.multiplyScalar(1 / len);
    // Closest point on segment to sphere center.
    const t = THREE.MathUtils.clamp(this.segDir.dot(this.closest.copy(sphere.center).sub(a)), 0, len);
    this.closest.copy(a).addScaledVector(this.segDir, t);
    return this.closest.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius;
  }

  private castSample(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDist: number,
    occluders: readonly THREE.Object3D[],
  ): void {
    if (occluders.length === 0) return;
    this.raycaster.set(origin, direction);
    this.raycaster.far = maxDist;
    // Double-sided tests so rays that start inside a crown still register.
    const hits = this.raycaster.intersectObjects(occluders as THREE.Object3D[], true);
    for (const hit of hits) {
      if (hit.distance > maxDist) continue;
      const root = findFoliageRoot(hit.object);
      if (root) this.markFade(root, FADE_OPACITY);
    }
  }

  private restoreCleared(): void {
    for (const group of this.faded.keys()) this.fadeGroup(group, null);
    this.faded.clear();
  }

  /** `opacity` null restores the mesh to its original solid look. */
  private fadeGroup(root: THREE.Object3D, opacity: number | null): void {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.userData.foliageOccluder && !root.userData.foliageOccluder) return;
      ensureUniqueMaterials(obj);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        const base = (mat.userData.foliageBase as FoliageBase | undefined) ?? {
          transparent: mat.transparent,
          opacity: mat.opacity,
          depthWrite: mat.depthWrite,
          side: mat.side,
        };
        if (!mat.userData.foliageBase) mat.userData.foliageBase = base;
        if (opacity != null) {
          mat.transparent = true;
          mat.opacity = opacity;
          mat.depthWrite = false;
          // DoubleSide keeps the soft crown readable when the camera is inside.
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        } else {
          mat.transparent = base.transparent;
          mat.opacity = base.opacity;
          mat.depthWrite = base.depthWrite;
          mat.side = base.side;
          mat.needsUpdate = true;
        }
      }
    });
  }
}

function findFoliageRoot(obj: THREE.Object3D): THREE.Object3D | null {
  let cur: THREE.Object3D | null = obj;
  let found: THREE.Object3D | null = null;
  while (cur) {
    if (cur.userData.foliageOccluder) found = cur;
    cur = cur.parent;
  }
  return found;
}

/** Procedural leftover trees may still share leaf mats — clone on first fade. */
function ensureUniqueMaterials(mesh: THREE.Mesh): void {
  const srcMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (srcMats.every((m) => m.userData.foliageBase)) return;

  const next = srcMats.map((mat) => {
    if (mat.userData.foliageBase) return mat;
    const cloned = mat.clone();
    cloned.userData.foliageBase = {
      transparent: mat.transparent,
      opacity: mat.opacity,
      depthWrite: mat.depthWrite,
      side: mat.side,
    };
    return cloned;
  });
  mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
  mesh.userData.foliageOccluder = true;
}
