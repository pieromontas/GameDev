import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { addDynamicPointLight } from '../../render/deviceQuality';
import {
  CRYPT_CHEST_OPEN_SECONDS,
  CRYPT_SHOWCASE,
  CryptChestState,
  chestInRange,
  lidMixerTime,
  lidSwingRange,
  type CryptModelId,
  type ShowcasePlacement,
} from './cryptShowcase';

const WARM = new THREE.Color(1.04, 0.9, 0.78);

type Template = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  graded: boolean;
};

export type CryptKitHooks = {
  /** Hall occluder list — pillars and walls already use the same fade. */
  tagOccluder: (root: THREE.Object3D) => void;
};

/**
 * One visit's Scenario props. Templates are cached for that visit (barrels,
 * lanterns, and the gargoyle pair clone one load) and released with the hall.
 */
export class CryptModelKit {
  readonly root = new THREE.Group();
  private readonly cacheRoot = new THREE.Group();
  private readonly templates = new Map<CryptModelId, Template>();
  private readonly lives: THREE.Object3D[] = [];
  private readonly golemMeshes: THREE.Mesh[] = [];
  private readonly flames: THREE.Object3D[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly chest = new CryptChestState();
  private mixer: THREE.AnimationMixer | null = null;
  private lidStart = 0;
  private lidHold = 0;
  private lidNode: THREE.Object3D | null = null;
  private glow: THREE.Mesh | null = null;
  private flameGeo: THREE.BufferGeometry | null = null;
  private flameMat: THREE.Material | null = null;
  private token = 0;
  private time = 0;
  private lootReady = false;

  constructor(private readonly hooks: CryptKitHooks) {
    this.root.name = 'CryptModels';
  }

  start(): void {
    if (typeof document === 'undefined') return;
    const token = ++this.token;
    void this.loadAll(token);
  }

  chestPrompt(x: number, z: number): boolean {
    return this.lootReady && this.chest.isClosed && chestInRange(x, z);
  }

  /** One-shot. False when the mesh is not in yet, or the lid already moved. */
  tryOpen(x: number, z: number): boolean {
    if (!this.chestPrompt(x, z)) return false;
    return this.chest.beginOpen();
  }

  update(dt: number): void {
    this.time += dt;
    if (this.chest.phase !== 'closed') {
      this.chest.update(dt);
      this.poseChest();
    }
    this.poseLife();
    this.flicker();
  }

  /** Geometry count so the hall's leave accounting includes the GLBs. */
  dispose(): number {
    this.token += 1;
    this.mixer?.stopAllAction();
    this.mixer = null;
    const freed = disposeTrees([this.root, this.cacheRoot]);
    this.root.clear();
    this.cacheRoot.clear();
    this.templates.clear();
    this.lives.length = 0;
    this.golemMeshes.length = 0;
    this.flames.length = 0;
    this.lights.length = 0;
    this.glow = null;
    this.lidNode = null;
    this.flameGeo = null;
    this.flameMat = null;
    this.lootReady = false;
    return freed;
  }

  private async loadAll(token: number): Promise<void> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    try {
      await MeshoptDecoder.ready;
    } catch (err) {
      if (token === this.token) console.warn('[CryptModels] meshopt decoder failed', err);
      return;
    }
    if (token !== this.token) return;

    const ids = [...new Set(CRYPT_SHOWCASE.map((spot) => spot.model))];
    const failed: string[] = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          const gltf = await loader.loadAsync(`/models/crypt/${id}.glb`);
          if (token !== this.token) {
            disposeTrees([gltf.scene]);
            return;
          }
          this.cacheRoot.add(gltf.scene);
          this.templates.set(id, { scene: gltf.scene, animations: gltf.animations, graded: false });
        } catch {
          failed.push(id);
        }
      }),
    );
    if (token !== this.token) return;
    if (failed.length > 0) {
      console.warn('[CryptModels] Could not load', failed.join(', '));
    }
    this.placeAll();
    if (this.root.children.length > 0) {
      console.info(`[CryptModels] Placed ${this.root.children.length} props`);
    }
  }

  private placeAll(): void {
    CRYPT_SHOWCASE.forEach((spot, index) => {
      const template = this.templates.get(spot.model);
      if (!template) return;
      if (!template.graded) {
        gradeCryptMaterials(template.scene, roleFor(spot));
        template.graded = true;
      }
      this.place(spot, template, index);
    });
  }

  private place(spot: ShowcasePlacement, template: Template, index: number): void {
    const measured = measureHeight(template.scene);
    const slot = new THREE.Group();
    slot.name = `CryptProp_${spot.id}`;
    slot.position.set(spot.x, 0, spot.z);
    slot.rotation.y = spot.yaw;

    const life = new THREE.Group();
    life.userData.life = spot.life;
    life.userData.phase = index * 1.37;
    slot.add(life);

    const fit = new THREE.Group();
    const scale = spot.targetHeight / measured.height;
    fit.scale.setScalar(scale);
    fit.position.y = -measured.minY * scale;
    const clone = template.scene.clone(true);
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = spot.kind !== 'lootChest';
      mesh.receiveShadow = true;
    });
    fit.add(clone);
    life.add(fit);
    this.root.add(slot);
    this.hooks.tagOccluder(slot);
    if (spot.life !== 'none') this.lives.push(life);

    if (spot.kind === 'lootChest') this.armChest(clone, template.animations, spot, slot);
    if (spot.kind === 'lantern') this.armLantern(slot, spot, index);
    if (spot.life === 'golem') {
      clone.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) this.golemMeshes.push(obj as THREE.Mesh);
      });
    }
  }

  private armChest(
    model: THREE.Object3D,
    animations: THREE.AnimationClip[],
    spot: ShowcasePlacement,
    slot: THREE.Group,
  ): void {
    const lidClip =
      animations.find((clip) => clip.name === 'Chest_Lid') ??
      animations.find((clip) => clip.tracks.some((track) => track.name.includes('Chest_Lid')));
    const swing = lidClip ? lidSwingRange(lidClip) : null;
    if (lidClip && swing && swing.hold - swing.start > 0.05) {
      const mixer = new THREE.AnimationMixer(model);
      for (const clip of animations) {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
      }
      mixer.setTime(0);
      this.mixer = mixer;
      this.lidStart = swing.start;
      this.lidHold = swing.hold;
      this.chest.setDuration(CRYPT_CHEST_OPEN_SECONDS);
    } else {
      this.lidNode = model.getObjectByName('Chest_Lid') ?? null;
      this.chest.setDuration(0.45);
    }

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffd24a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    glow.name = 'cryptChestGlow';
    glow.position.y = spot.targetHeight * 0.42;
    slot.add(glow);
    this.glow = glow;
    this.lootReady = true;
  }

  private armLantern(slot: THREE.Group, spot: ShowcasePlacement, index: number): void {
    if (!this.flameGeo || !this.flameMat) {
      this.flameGeo = new THREE.ConeGeometry(0.07, 0.24, 6);
      this.flameMat = new THREE.MeshBasicMaterial({ color: 0xffa24a });
    }
    const flame = new THREE.Mesh(this.flameGeo, this.flameMat);
    flame.position.y = spot.targetHeight * 0.62;
    flame.userData.phase = index;
    slot.add(flame);
    this.flames.push(flame);

    const light = addDynamicPointLight(slot, 0xff8a3a, 0.72, 6.2, 2);
    if (light) {
      light.position.y = spot.targetHeight * 0.58;
      light.userData.phase = index;
      light.userData.base = 0.72;
      this.lights.push(light);
    }
  }

  private poseChest(): void {
    const open = this.chest.phase === 'open';
    const t = open ? 1 : Math.min(1, this.chest.elapsed / this.chest.duration);
    if (this.mixer && this.lidHold > this.lidStart) {
      this.mixer.setTime(lidMixerTime(t, this.lidStart, this.lidHold));
    } else if (this.lidNode) {
      const ease = 1 - (1 - t) * (1 - t) * (1 - t);
      this.lidNode.rotation.x = -1.15 * ease;
    }
    if (this.glow) {
      const mat = this.glow.material as THREE.MeshBasicMaterial;
      const pulse = open ? 0.85 + Math.sin(this.time * 2.2) * 0.15 : t;
      mat.opacity = pulse * 0.72;
      this.glow.scale.setScalar(0.7 + pulse * 0.3);
    }
  }

  private poseLife(): void {
    const bob = Math.sin(this.time * 1.7) * 0.5 + 0.5;
    const pulse = 0.1 + bob * 0.42;
    for (const mesh of this.golemMeshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        mat.emissive.setHex(0x3ad4ea);
        mat.emissiveIntensity = pulse;
      }
    }
    for (const life of this.lives) {
      const phase = (life.userData.phase as number) ?? 0;
      if (life.userData.life === 'sway') {
        life.rotation.z = Math.sin(this.time * 0.85 + phase) * 0.03;
        life.rotation.x = Math.sin(this.time * 0.55 + phase) * 0.012;
        life.position.y = Math.sin(this.time * 1.35 + phase) * 0.02;
      } else if (life.userData.life === 'golem') {
        life.position.y = Math.sin(this.time * 0.8 + phase) * 0.045;
      }
    }
  }

  private flicker(): void {
    for (const flame of this.flames) {
      const phase = (flame.userData.phase as number) ?? 0;
      const flicker =
        1 + Math.sin(this.time * 9 + phase) * 0.12 + Math.cos(this.time * 14 + phase) * 0.07;
      flame.scale.set(flicker, 1.15 * flicker, flicker);
    }
    for (const light of this.lights) {
      const phase = (light.userData.phase as number) ?? 0;
      const base = (light.userData.base as number) ?? 0.72;
      light.intensity = base * (0.86 + Math.sin(this.time * 11 + phase) * 0.08);
    }
  }
}

function roleFor(spot: ShowcasePlacement): 'default' | 'lantern' | 'golem' {
  if (spot.kind === 'lantern') return 'lantern';
  if (spot.kind === 'golem') return 'golem';
  return 'default';
}

function measureHeight(root: THREE.Object3D): { height: number; minY: number } {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return { height: Math.max(box.max.y - box.min.y, 1e-4), minY: box.min.y };
}

function gradeCryptMaterials(root: THREE.Object3D, role: 'default' | 'lantern' | 'golem'): void {
  const graded = new Set<THREE.Material>();
  const drop = new Set<THREE.Texture>();
  const keep = new Set<THREE.Texture>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      if (!graded.has(mat)) {
        graded.add(mat);
        applyGrade(mat, role, drop);
      }
      rememberTextures(mat, keep);
    }
  });
  for (const tex of drop) {
    if (!keep.has(tex)) tex.dispose();
  }
}

function applyGrade(
  mat: THREE.MeshStandardMaterial,
  role: 'default' | 'lantern' | 'golem',
  drop: Set<THREE.Texture>,
): void {
  if (!mat.map && mat.emissiveMap) {
    mat.map = mat.emissiveMap;
    mat.color.set(0xffffff);
  }
  const gem = mat.name.startsWith('M_Gem');
  if (!gem) {
    mat.color.multiply(WARM);
    const hsl = { h: 0, s: 0, l: 0 };
    mat.color.getHSL(hsl);
    mat.color.setHSL(hsl.h, hsl.s * 0.84, Math.min(0.92, hsl.l * 1.05));
  }
  if (role === 'lantern') {
    mat.emissive.set(0xff9a42);
    mat.emissiveIntensity = 0.28;
    if (mat.map) mat.emissiveMap = mat.map;
    mat.roughness = Math.max(mat.roughness, 0.58);
    mat.metalness = Math.min(mat.metalness, 0.2);
  } else if (role === 'golem') {
    mat.emissive.set(0x3ad4ea);
    mat.emissiveIntensity = 0.2;
    mat.roughness = Math.max(mat.roughness, 0.8);
    mat.metalness = Math.min(mat.metalness, 0.08);
  } else if (mat.name === 'M_Iron') {
    mat.metalness = 0.42;
    mat.roughness = 0.46;
    mat.emissive.set(0x000000);
    mat.emissiveIntensity = 0;
    mat.emissiveMap = null;
  } else if (gem) {
    mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 0.7);
    mat.roughness = Math.min(mat.roughness, 0.32);
  } else {
    mat.emissive.set(0x000000);
    mat.emissiveIntensity = 0;
    mat.emissiveMap = null;
    mat.roughness = Math.max(mat.roughness, 0.78);
    mat.metalness = Math.min(mat.metalness, 0.12);
  }
  mat.envMapIntensity = 0.2;
  for (const key of ['roughnessMap', 'metalnessMap', 'aoMap'] as const) {
    const tex = mat[key];
    if (tex) drop.add(tex);
    mat[key] = null;
  }
  mat.needsUpdate = true;
}

function rememberTextures(mat: THREE.MeshStandardMaterial, keep: Set<THREE.Texture>): void {
  if (mat.map) keep.add(mat.map);
  if (mat.normalMap) keep.add(mat.normalMap);
  if (mat.emissiveMap) keep.add(mat.emissiveMap);
}

function disposeTrees(roots: readonly THREE.Object3D[]): number {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const texs = new Set<THREE.Texture>();
  for (const root of roots) root.traverse((obj) => {
    const light = obj as THREE.Light;
    if (light.isLight) light.dispose();
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) geos.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      mats.add(mat);
      for (const value of Object.values(mat)) {
        if (value instanceof THREE.Texture) texs.add(value);
      }
    }
  });
  for (const tex of texs) tex.dispose();
  for (const mat of mats) mat.dispose();
  for (const geo of geos) geo.dispose();
  return geos.size;
}
