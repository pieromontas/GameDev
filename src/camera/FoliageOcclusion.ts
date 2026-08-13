import * as THREE from 'three';

/** Soft see-through when a crown sits between the camera and the knight. */
const FADE_OPACITY = 0.25;

type FoliageBase = {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
};

/**
 * Cheap camera→hero occlusion for KayKit tree / bush crowns.
 *
 * One (or a few) rays from the look target toward the camera; only meshes tagged
 * `userData.foliageOccluder` fade. Cottages, gate, stalls, and ground stay opaque.
 */
export class FoliageOcclusion {
  private readonly raycaster = new THREE.Raycaster();
  private readonly origin = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly camUp = new THREE.Vector3();
  private readonly sampleOrigin = new THREE.Vector3();
  /** Groups currently faded this frame (restored when the ray is clear). */
  private readonly faded = new Set<THREE.Object3D>();
  private readonly nextFaded = new Set<THREE.Object3D>();

  /**
   * @param lookAt World point near the hero helmet (same as FollowCamera look target).
   * @param occluders Tree / bush roots tagged `foliageOccluder` (not the whole scene).
   */
  update(
    camera: THREE.Camera,
    lookAt: THREE.Vector3,
    occluders: readonly THREE.Object3D[],
  ): void {
    this.nextFaded.clear();
    if (occluders.length === 0) {
      this.restoreCleared();
      return;
    }

    this.origin.copy(lookAt);
    this.direction.copy(camera.position).sub(this.origin);
    const span = this.direction.length();
    if (span < 0.05) {
      this.restoreCleared();
      return;
    }
    this.direction.multiplyScalar(1 / span);

    // Lateral samples catch thick crowns that miss a single center ray.
    this.camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const lateral = Math.min(0.55, span * 0.04);

    this.castSample(this.origin, this.direction, span, occluders);
    this.sampleOrigin.copy(this.origin).addScaledVector(this.camRight, lateral);
    this.castSample(this.sampleOrigin, this.direction, span, occluders);
    this.sampleOrigin.copy(this.origin).addScaledVector(this.camRight, -lateral);
    this.castSample(this.sampleOrigin, this.direction, span, occluders);
    this.sampleOrigin.copy(this.origin).addScaledVector(this.camUp, lateral * 0.65);
    this.castSample(this.sampleOrigin, this.direction, span, occluders);

    for (const group of this.nextFaded) {
      if (!this.faded.has(group)) this.fadeGroup(group, true);
    }
    for (const group of this.faded) {
      if (!this.nextFaded.has(group)) this.fadeGroup(group, false);
    }
    this.faded.clear();
    for (const group of this.nextFaded) this.faded.add(group);
  }

  private castSample(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDist: number,
    occluders: readonly THREE.Object3D[],
  ): void {
    this.raycaster.set(origin, direction);
    this.raycaster.far = maxDist;
    const hits = this.raycaster.intersectObjects(occluders as THREE.Object3D[], true);
    for (const hit of hits) {
      if (hit.distance > maxDist) continue;
      const root = findFoliageRoot(hit.object);
      if (root) this.nextFaded.add(root);
    }
  }

  private restoreCleared(): void {
    for (const group of this.faded) this.fadeGroup(group, false);
    this.faded.clear();
  }

  private fadeGroup(root: THREE.Object3D, fade: boolean): void {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      // Only crown/trunk pack foliage — skip any stray child without the tag.
      if (!obj.userData.foliageOccluder && !root.userData.foliageOccluder) return;
      ensureUniqueMaterials(obj);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        const base = (mat.userData.foliageBase as FoliageBase | undefined) ?? {
          transparent: mat.transparent,
          opacity: mat.opacity,
          depthWrite: mat.depthWrite,
        };
        if (fade) {
          mat.transparent = true;
          mat.opacity = FADE_OPACITY;
          mat.depthWrite = false;
          mat.needsUpdate = true;
        } else {
          mat.transparent = base.transparent;
          mat.opacity = base.opacity;
          mat.depthWrite = base.depthWrite;
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
    };
    return cloned;
  });
  mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
  mesh.userData.foliageOccluder = true;
}
