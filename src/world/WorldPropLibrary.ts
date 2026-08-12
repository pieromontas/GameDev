import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getToonGradientMap } from '../render/stylized';

/** Curated KayKit Forest Nature FREE-tier props (shared atlas). */
const FOREST_TREES = [
  'Tree_1_A_Color1',
  'Tree_1_B_Color1',
  'Tree_1_C_Color1',
  'Tree_2_A_Color1',
  'Tree_2_B_Color1',
  'Tree_2_C_Color1',
  'Tree_2_D_Color1',
  'Tree_3_A_Color1',
  'Tree_3_B_Color1',
  'Tree_4_A_Color1',
  'Tree_4_B_Color1',
] as const;

const FOREST_ROCKS = [
  'Rock_1_A_Color1',
  'Rock_1_C_Color1',
  'Rock_1_E_Color1',
  'Rock_1_G_Color1',
  'Rock_1_I_Color1',
  'Rock_2_A_Color1',
  'Rock_2_C_Color1',
  'Rock_2_E_Color1',
  'Rock_3_A_Color1',
  'Rock_3_C_Color1',
  'Rock_3_F_Color1',
  'Rock_3_H_Color1',
] as const;

const FOREST_BUSHES = [
  'Bush_1_A_Color1',
  'Bush_1_C_Color1',
  'Bush_1_E_Color1',
  'Bush_2_A_Color1',
  'Bush_2_C_Color1',
  'Bush_3_A_Color1',
  'Bush_4_A_Color1',
  'Bush_4_C_Color1',
] as const;

/**
 * Adventurers hero is normalized to ~1.95 world units (`PlayerVisual.targetHeight`).
 *
 * BEFORE reference (playtest screenshot): knight helmet ≈ cottage eaves, well
 * (roof included) ≈ waist, trees barely taller than the hero — props read ~⅓–½
 * of a correct Adventurers-relative size.
 *
 * `BASE_HEIGHT` = old toy procedural-matched heights. Tweak `PROP_SCALE` (not the
 * hero) to rebalance. Effective target height =
 * `BASE_HEIGHT[k] * PROP_SCALE[k]` (plus any per-instance scale in `instantiate`).
 */
const BASE_HEIGHT = {
  tree: 3.55,
  rock: 0.72,
  bush: 0.85,
  cottage: 2.55,
  windmill: 4.4,
  well: 1.35,
} as const;

/**
 * Per-category multipliers vs `BASE_HEIGHT` — calibrated from the before screenshot
 * so KayKit props match Adventurers scale (~1.95 hero). ~3× on buildings (not ~2×):
 * the KayKit cottage roof starts high on the mesh, so eaves need extra headroom.
 *
 * Effective heights (cottage includes createCottage’s ×1.15 instance scale):
 * - cottage peak ~8.1 → eaves clearly above head; door ~character-accessible
 * - well full ~3.0 → stone rim ~chest/upper-torso (not waist)
 * - windmill ~13 → landmark bulk
 * - trees ~9.6 → clearly taller than the knight
 * - rocks / bushes scale with the larger forest dressing
 */
export const PROP_SCALE = {
  tree: 2.7,
  rock: 1.75,
  bush: 1.55,
  cottage: 2.75,
  windmill: 3.0,
  well: 2.25,
} as const;

/** World-space target heights after `PROP_SCALE` (fed into template `baseScale`). */
const TARGET = {
  tree: BASE_HEIGHT.tree * PROP_SCALE.tree,
  rock: BASE_HEIGHT.rock * PROP_SCALE.rock,
  bush: BASE_HEIGHT.bush * PROP_SCALE.bush,
  cottage: BASE_HEIGHT.cottage * PROP_SCALE.cottage,
  windmill: BASE_HEIGHT.windmill * PROP_SCALE.windmill,
  well: BASE_HEIGHT.well * PROP_SCALE.well,
} as const;

/** Soft-collision radius multipliers — same knobs as visuals (uniform scale). */
export const PROP_COLLISION_SCALE = PROP_SCALE;

/** Well offset from cottage center — clears the ~3× cottage footprint. */
export const WELL_OFFSET = { x: 5.4, z: -2.3 } as const;

type Template = {
  root: THREE.Object3D;
  /** Uniform scale that brings the raw mesh to TARGET height. */
  baseScale: number;
  /** Raw (unscaled) bounding-box min Y — used to plant feet at y=0 after scale. */
  rawMinY: number;
};

/**
 * Shared KayKit world-prop templates (Forest Nature + Medieval Hexagon).
 * Loads once, reuses geometries/materials, clones instances for the meadow.
 */
export class WorldPropLibrary {
  private readonly loader = new GLTFLoader();
  private readonly trees: Template[] = [];
  private readonly rocks: Template[] = [];
  private readonly bushes: Template[] = [];
  private cottage: Template | null = null;
  private windmill: Template | null = null;
  private well: Template | null = null;
  private ready = false;

  get isReady(): boolean {
    return this.ready;
  }

  /** Load curated GLTFs. Never throws — returns false if everything failed. */
  static async load(): Promise<WorldPropLibrary> {
    const lib = new WorldPropLibrary();
    await lib.loadInternal();
    return lib;
  }

  private async loadInternal(): Promise<void> {
    const forestBase = '/models/kaykit-forest';
    const medievalBase = '/models/kaykit-medieval';

    const treeResults = await Promise.all(
      FOREST_TREES.map((name) => this.loadTemplate(`${forestBase}/${name}.gltf`, TARGET.tree, name)),
    );
    const rockResults = await Promise.all(
      FOREST_ROCKS.map((name) => this.loadTemplate(`${forestBase}/${name}.gltf`, TARGET.rock, name)),
    );
    const bushResults = await Promise.all(
      FOREST_BUSHES.map((name) => this.loadTemplate(`${forestBase}/${name}.gltf`, TARGET.bush, name)),
    );

    for (const t of treeResults) if (t) this.trees.push(t);
    for (const t of rockResults) if (t) this.rocks.push(t);
    for (const t of bushResults) if (t) this.bushes.push(t);

    this.cottage = await this.loadTemplate(
      `${medievalBase}/building_home_A_green.gltf`,
      TARGET.cottage,
      'cottage',
    );
    this.windmill = await this.loadTemplate(
      `${medievalBase}/building_windmill_green.gltf`,
      TARGET.windmill,
      'windmill',
    );
    this.well = await this.loadTemplate(
      `${medievalBase}/building_well_green.gltf`,
      TARGET.well,
      'well',
    );

    this.ready =
      this.trees.length > 0 ||
      this.rocks.length > 0 ||
      this.cottage != null ||
      this.windmill != null;

    if (!this.ready) {
      console.error('[WorldPropLibrary] No world props loaded — meadow keeps procedural meshes.');
    } else {
      console.info(
        `[WorldPropLibrary] Ready — trees ${this.trees.length}, rocks ${this.rocks.length}, bushes ${this.bushes.length}, cottage ${this.cottage ? 1 : 0}, windmill ${this.windmill ? 1 : 0}, well ${this.well ? 1 : 0}`,
      );
    }
  }

  private async loadTemplate(
    url: string,
    targetHeight: number,
    label: string,
  ): Promise<Template | null> {
    try {
      const gltf = await this.loader.loadAsync(url);
      const root = gltf.scene;
      root.name = `KayKitProp_${label}`;
      stylizePropMaterials(root);

      // Measure raw mesh, then leave scale/position for instantiate (correct at any gameplay scale).
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      const height = Math.max(size.y, 0.01);
      const baseScale = targetHeight / height;

      return { root, baseScale, rawMinY: box.min.y };
    } catch (err) {
      console.error(`[WorldPropLibrary] Failed to load ${label}`, url, err);
      return null;
    }
  }

  createTree(x: number, z: number, scale: number, seed: number): THREE.Group | null {
    if (this.trees.length === 0) return null;
    const tmpl = this.trees[Math.abs(Math.floor(seed)) % this.trees.length]!;
    return this.instantiate(tmpl, x, z, scale, seed * 1.7);
  }

  createRock(x: number, z: number, scale: number, seed: number): THREE.Group | null {
    if (this.rocks.length === 0) return null;
    const tmpl = this.rocks[Math.abs(Math.floor(seed * 3.1)) % this.rocks.length]!;
    return this.instantiate(tmpl, x, z, scale, seed * 2.3);
  }

  createBush(x: number, z: number, scale: number, seed: number): THREE.Group | null {
    if (this.bushes.length === 0) return null;
    const tmpl = this.bushes[Math.abs(Math.floor(seed * 5.3)) % this.bushes.length]!;
    return this.instantiate(tmpl, x, z, scale, seed * 0.9);
  }

  createCottage(
    x: number,
    z: number,
    opts?: { scale?: number; yaw?: number },
  ): THREE.Group | null {
    if (!this.cottage) return null;
    // Extra 1.15 matches the prior procedural cottage group scale.
    // Optional yaw lets market shops face the street (seed yaw used otherwise).
    const scale = opts?.scale ?? 1.15;
    const group = this.instantiate(this.cottage, x, z, scale, 0.35);
    if (opts?.yaw !== undefined) group.rotation.y = opts.yaw;
    return group;
  }

  createWindmill(x: number, z: number): THREE.Group | null {
    if (!this.windmill) return null;
    return this.instantiate(this.windmill, x, z, 1, 0.15);
  }

  createWell(x: number, z: number): THREE.Group | null {
    if (!this.well) return null;
    return this.instantiate(this.well, x, z, 1, 1.1);
  }

  private instantiate(
    tmpl: Template,
    x: number,
    z: number,
    scale: number,
    yawSeed: number,
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = fract(yawSeed) * Math.PI * 2;
    const clone = tmpl.root.clone(true);
    const worldScale = tmpl.baseScale * scale;
    clone.scale.setScalar(worldScale);
    // Feet to ground: scaled minY lifts with uniform scale (pivot at local origin).
    clone.position.y = -tmpl.rawMinY * worldScale;
    group.add(clone);
    group.userData.packProp = true;
    return group;
  }
}

/** Remap KayKit PBR atlas mats → MeshToon so meadow lighting stays cel-readable. */
function stylizePropMaterials(root: THREE.Object3D): void {
  const gradientMap = getToonGradientMap();
  const converted = new Map<THREE.Material, THREE.Material>();

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;

    const srcMats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = srcMats.map((mat) => {
      const cached = converted.get(mat);
      if (cached) return cached;

      if (mat instanceof THREE.MeshToonMaterial) {
        converted.set(mat, mat);
        return mat;
      }

      if (
        mat instanceof THREE.MeshStandardMaterial ||
        mat instanceof THREE.MeshPhysicalMaterial
      ) {
        const toon = new THREE.MeshToonMaterial({
          color: mat.color.clone(),
          map: mat.map,
          gradientMap,
          transparent: mat.transparent,
          opacity: mat.opacity,
          side: mat.side,
          depthWrite: mat.depthWrite,
        });
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          toon.map = mat.map;
        }
        converted.set(mat, toon);
        return toon;
      }

      // Soft remap for any other lit material — keep albedo, drop metal response.
      if ('color' in mat && (mat as THREE.MeshPhongMaterial).color) {
        const phong = mat as THREE.MeshPhongMaterial;
        const toon = new THREE.MeshToonMaterial({
          color: phong.color.clone(),
          map: phong.map ?? null,
          gradientMap,
        });
        converted.set(mat, toon);
        return toon;
      }

      converted.set(mat, mat);
      return mat;
    });

    obj.material = Array.isArray(obj.material) ? next : next[0]!;
  });
}

function fract(n: number): number {
  return n - Math.floor(n);
}
