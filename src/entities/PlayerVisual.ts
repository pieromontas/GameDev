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
  /** Shield Bash — KayKit Block_Attack sells the Round_Shield shove. */
  bash: 'Block_Attack',
} as const;

type ClipKey = keyof typeof CLIP;

type MatFlash = {
  mat: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
};

const FADE = {
  /** Idle ↔ Walk / Walk ↔ Run — longer softens side-strafe foot pops. */
  loco: 0.28,
  /** Enter Slash / Quake / Bash — keep snappy for combat timing. */
  attackIn: 0.1,
  /** Leave attack pose back to loco. */
  attackOut: 0.22,
} as const;

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

  /** Walk/run hysteresis so speed chatter doesn't restart clips every frame. */
  private locoGate: 'walk' | 'run' = 'walk';
  /** Set once when entering an attack so we don't re-timeScale / scrub every tick. */
  private attackSynced: ClipKey | null = null;

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
    this.current = null;
    this.locoGate = 'walk';
    this.attackSynced = null;

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
   * Direction changes do NOT restart walk — only clip identity changes do.
   */
  syncAnim(state: PlayerAnim, speed: number, maxSpeed: number, animT: number, animDur: number): void {
    if (!this.ready || !this.mixer) return;

    let desired: ClipKey = 'idle';
    if (state === 'slash') desired = 'slash';
    else if (state === 'quake') desired = 'quake';
    else if (state === 'bash') desired = 'bash';
    else if (state === 'move') {
      // Hysteresis avoids Idle/Walk/Run thrash when speed chatters near thresholds.
      if (this.locoGate === 'walk' && speed > maxSpeed * 0.78) this.locoGate = 'run';
      else if (this.locoGate === 'run' && speed < maxSpeed * 0.58) this.locoGate = 'walk';
      desired = this.locoGate;
    } else {
      desired = 'idle';
    }

    if (desired !== this.current) {
      const fade = this.fadeFor(this.current, desired);
      this.crossfade(desired, fade);
      if (desired === 'slash' || desired === 'quake' || desired === 'bash') {
        this.attackSynced = null;
      }
    }

    // Fit attack clips into the gameplay anim window (once per attack).
    if ((desired === 'slash' || desired === 'quake' || desired === 'bash') && animDur > 1e-4) {
      const action = this.actions.get(desired);
      const clip = action?.getClip();
      if (action && clip && clip.duration > 1e-4) {
        if (this.attackSynced !== desired) {
          action.timeScale = clip.duration / animDur;
          action.time = THREE.MathUtils.clamp((animT / animDur) * clip.duration, 0, clip.duration);
          this.attackSynced = desired;
        }
      }
    } else {
      this.attackSynced = null;
      // Mild speed coupling so walk/run cadence matches travel without restarting.
      if (desired === 'walk' || desired === 'run') {
        const action = this.actions.get(desired);
        if (action) {
          const base = desired === 'run' ? maxSpeed * 0.9 : maxSpeed * 0.55;
          action.timeScale = THREE.MathUtils.clamp(speed / Math.max(base, 0.01), 0.7, 1.35);
        }
      }
    }

    // Procedural motion on the model root for Quake / Bash (extra juice on pack clips).
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
        this.root.position.x = 0;
        this.root.position.z = 0;
      } else if (state === 'bash' && animDur > 1e-4) {
        // Short forward shove so the shield bash reads even without a leap clip.
        const t = THREE.MathUtils.clamp(animT / animDur, 0, 1);
        const surge = Math.sin(Math.min(1, t / 0.35) * Math.PI);
        const settle = smooth01((t - 0.45) / 0.55);
        const push = surge * (1 - settle * 0.65) * 0.14;
        this.root.position.y = -surge * 0.04;
        this.root.position.x = 0;
        this.root.position.z = push;
      } else {
        this.root.position.y = 0;
        this.root.position.x = 0;
        this.root.position.z = 0;
      }
    }
  }

  private fadeFor(from: ClipKey | null, to: ClipKey): number {
    const toAttack = to === 'slash' || to === 'quake' || to === 'bash';
    const fromAttack = from === 'slash' || from === 'quake' || from === 'bash';
    if (toAttack) return FADE.attackIn;
    if (fromAttack) return FADE.attackOut;
    return FADE.loco;
  }

  private crossfade(next: ClipKey, fade: number): void {
    const action = this.actions.get(next);
    if (!action) return;

    const prevKey = this.current;
    const prev = prevKey ? this.actions.get(prevKey) : undefined;

    if (prev) prev.fadeOut(fade);

    const nextIsLoco = next === 'idle' || next === 'walk' || next === 'run';
    const prevIsLoco = prevKey === 'idle' || prevKey === 'walk' || prevKey === 'run';
    // Preserve foot phase when swapping Walk ↔ Run so redirects don't restart the cycle.
    const preservePhase =
      !!prev &&
      nextIsLoco &&
      prevIsLoco &&
      next !== 'idle' &&
      prevKey !== 'idle' &&
      next !== prevKey;

    if (preservePhase) {
      const prevClip = prev.getClip();
      const nextClip = action.getClip();
      const phase = prevClip.duration > 1e-4 ? prev.time / prevClip.duration : 0;
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.time = phase * nextClip.duration;
      action.setEffectiveTimeScale(1);
      action.play();
      action.fadeIn(fade);
    } else {
      action.reset();
      action.setEffectiveWeight(1);
      if (nextIsLoco) action.timeScale = 1;
      action.fadeIn(fade).play();
    }

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
    // Game loop feeds fixed 1/60 dt — keep mixer on that clock (no frame-time restart).
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
