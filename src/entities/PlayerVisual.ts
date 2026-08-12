import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PlayerAnim } from './Player';

const MODEL_URL = '/models/kaykit-knight/Knight.glb';

/** Equipment pieces to keep visible on the warrior. */
const SHOW_PROPS = new Set([
  '1H_Sword',
  'Round_Shield',
  'Knight_Helmet',
  'Knight_Cape',
]);

/** Extra weapons/shields bundled in the GLB that we hide for a clean silhouette. */
const HIDE_PROPS = new Set([
  '1H_Sword_Offhand',
  '2H_Sword',
  'Badge_Shield',
  'Rectangle_Shield',
  'Spike_Shield',
]);

const CLIP = {
  idle: 'Idle',
  walk: 'Walking_A',
  run: 'Running_A',
  slash: '1H_Melee_Attack_Slice_Horizontal',
  quake: 'Jump_Full_Short',
} as const;

type ClipKey = keyof typeof CLIP;

type MatFlash = {
  mat: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
};

/**
 * GLTF-backed KayKit Knight visual: loads the model, maps AnimationMixer clips
 * to PlayerAnim states, and attaches under the Player entity root.
 */
export class PlayerVisual {
  readonly root = new THREE.Group();
  private readonly loader = new GLTFLoader();
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<ClipKey, THREE.AnimationAction>();
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private current: ClipKey | null = null;
  private model: THREE.Object3D | null = null;
  private readonly flashMats: MatFlash[] = [];
  private ready = false;
  private failed = false;
  private loadPromise: Promise<boolean> | null = null;

  /** Target world height for the knight (feet→head), matching the old procedural hero. */
  private readonly targetHeight = 1.95;
  /** KayKit / glTF forward is +Z; gameplay facing uses yaw on the entity root. */
  private readonly modelYawOffset = 0;

  constructor() {
    this.root.name = 'PlayerVisual';
  }

  get isReady(): boolean {
    return this.ready;
  }

  get hasFailed(): boolean {
    return this.failed;
  }

  /** Load once; resolves true on success, false on failure (never throws). */
  load(): Promise<boolean> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadInternal();
    return this.loadPromise;
  }

  private async loadInternal(): Promise<boolean> {
    try {
      const gltf = await this.loader.loadAsync(MODEL_URL);
      this.install(gltf.scene, gltf.animations);
      this.ready = true;
      this.failed = false;
      return true;
    } catch (err) {
      this.failed = true;
      this.ready = false;
      console.error(
        '[PlayerVisual] Failed to load warrior GLTF — gameplay continues without the hero mesh.',
        MODEL_URL,
        err,
      );
      return false;
    }
  }

  private install(scene: THREE.Object3D, animations: THREE.AnimationClip[]): void {
    // Clear any prior model
    while (this.root.children.length) this.root.remove(this.root.children[0]!);

    this.model = scene;
    this.model.name = 'KayKitKnight';
    this.model.rotation.y = this.modelYawOffset;

    // Scale to a consistent hero height for the isometric camera.
    const box = new THREE.Box3().setFromObject(this.model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const height = Math.max(size.y, 0.01);
    const scale = this.targetHeight / height;
    this.model.scale.setScalar(scale);

    // Feet on the ground (entity root is at ground level).
    box.setFromObject(this.model);
    this.model.position.y -= box.min.y;

    this.model.traverse((obj) => {
      const name = obj.name;
      if (HIDE_PROPS.has(name)) {
        obj.visible = false;
        return;
      }
      if (SHOW_PROPS.has(name)) obj.visible = true;

      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m) continue;
          // Keep pack textures; slight roughness nudge reads better under meadow lighting.
          if (m instanceof THREE.MeshStandardMaterial) {
            m.roughness = Math.min(1, Math.max(0.55, m.roughness ?? 0.7));
            m.envMapIntensity = 0.35;
            this.flashMats.push({
              mat: m,
              color: m.color.clone(),
              emissive: m.emissive.clone(),
              emissiveIntensity: m.emissiveIntensity,
            });
          }
        }
      }
    });

    this.root.add(this.model);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips.clear();
    this.actions.clear();
    for (const clip of animations) {
      this.clips.set(clip.name, clip);
    }

    for (const key of Object.keys(CLIP) as ClipKey[]) {
      const clip = this.clips.get(CLIP[key]);
      if (!clip) {
        console.warn(`[PlayerVisual] Missing clip "${CLIP[key]}" for ${key}`);
        continue;
      }
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      if (key === 'idle' || key === 'walk' || key === 'run') {
        action.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(key, action);
    }

    // Start in idle if available.
    this.crossfade('idle', 0);
  }

  /**
   * Drive locomotion / skill clips from the Player anim state machine.
   * Attack durations are time-scaled to match gameplay windows.
   */
  syncAnim(state: PlayerAnim, speed: number, maxSpeed: number, animT: number, animDur: number): void {
    if (!this.ready || !this.mixer) return;

    let desired: ClipKey = 'idle';
    if (state === 'slash') desired = 'slash';
    else if (state === 'quake') desired = 'quake';
    else if (state === 'move') desired = speed > maxSpeed * 0.72 ? 'run' : 'walk';
    else desired = 'idle';

    if (desired !== this.current) {
      const fade = state === 'slash' || state === 'quake' || this.current === 'slash' || this.current === 'quake'
        ? 0.08
        : 0.18;
      this.crossfade(desired, fade);
    }

    // Fit slash / quake clips into the gameplay anim window.
    if ((desired === 'slash' || desired === 'quake') && animDur > 1e-4) {
      const action = this.actions.get(desired);
      const clip = action?.getClip();
      if (action && clip && clip.duration > 1e-4) {
        action.timeScale = clip.duration / animDur;
        // Keep mixer time roughly aligned if we mid-joined.
        const targetTime = (animT / animDur) * clip.duration;
        if (Math.abs(action.time - targetTime) > 0.12) {
          action.time = THREE.MathUtils.clamp(targetTime, 0, clip.duration);
        }
      }
    }

    // Procedural Quake stomp on the model root (extra juice on top of Jump clip).
    if (this.model) {
      if (state === 'quake' && animDur > 1e-4) {
        const t = THREE.MathUtils.clamp(animT / animDur, 0, 1);
        const crouch = smooth01(t / 0.22);
        const launch = smooth01((t - 0.18) / 0.18);
        const impact = easeOut((t - 0.32) / 0.25);
        const settle = smooth01((t - 0.55) / 0.45);
        const down = crouch * (1 - launch) * 0.12;
        const hop = launch * (1 - impact) * 0.16;
        const squash = impact * 0.05 * (1 - settle);
        // Preserve ground snap from install — offset via root, not model base.
        this.root.position.y = -down + hop - squash;
      } else {
        this.root.position.y = 0;
      }
    }
  }

  private crossfade(next: ClipKey, fade: number): void {
    const action = this.actions.get(next);
    if (!action) return;

    if (this.current) {
      const prev = this.actions.get(this.current);
      prev?.fadeOut(fade);
    }

    action.reset();
    action.setEffectiveWeight(1);
    if (next === 'idle' || next === 'walk' || next === 'run') {
      action.timeScale = 1;
    }
    action.fadeIn(fade).play();
    this.current = next;
  }

  /** Hit / i-frame material flash using the pack’s standard materials. */
  applyFlash(hitFlash: number, invuln: number): void {
    if (this.flashMats.length === 0) return;

    if (hitFlash > 0) {
      for (const entry of this.flashMats) {
        entry.mat.color.setHex(0xffffff);
        entry.mat.emissive.setHex(0xfff2d0);
        entry.mat.emissiveIntensity = 0.55;
      }
      return;
    }

    if (invuln > 0) {
      const blink = Math.sin(invuln * 28) > 0;
      for (const entry of this.flashMats) {
        if (blink) {
          entry.mat.color.copy(entry.color).lerp(new THREE.Color(0xffffff), 0.45);
          entry.mat.emissive.setHex(0xffe8b0);
          entry.mat.emissiveIntensity = 0.25;
        } else {
          entry.mat.color.copy(entry.color);
          entry.mat.emissive.copy(entry.emissive);
          entry.mat.emissiveIntensity = entry.emissiveIntensity;
        }
      }
      return;
    }

    for (const entry of this.flashMats) {
      entry.mat.color.copy(entry.color);
      entry.mat.emissive.copy(entry.emissive);
      entry.mat.emissiveIntensity = entry.emissiveIntensity;
    }
  }

  update(dt: number): void {
    this.mixer?.update(dt);
  }
}

function smooth01(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function easeOut(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return 1 - (1 - x) * (1 - x) * (1 - x);
}
