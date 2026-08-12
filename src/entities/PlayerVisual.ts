import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PlayerAnim } from './Player';
import type { PlayerClass } from '../combat/Skills';

export type ClipMap = {
  idle: string;
  walk: string;
  run: string;
  slash: string;
  quake: string;
  bash: string;
};

export type VisualConfig = {
  classId: PlayerClass;
  label: string;
  modelUrl: string;
  modelName: string;
  showProps: ReadonlySet<string>;
  hideProps: ReadonlySet<string>;
  clips: ClipMap;
  /** Procedural juice flavor during attack poses. */
  attackMotion: 'warrior' | 'mage';
};

export const WARRIOR_VISUAL: VisualConfig = {
  classId: 'warrior',
  label: 'warrior',
  modelUrl: '/models/kaykit-knight/Knight.glb',
  modelName: 'KayKitKnight',
  showProps: new Set(['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape']),
  hideProps: new Set([
    '1H_Sword_Offhand',
    '2H_Sword',
    'Badge_Shield',
    'Rectangle_Shield',
    'Spike_Shield',
  ]),
  clips: {
    idle: 'Idle',
    walk: 'Walking_A',
    run: 'Running_A',
    slash: '1H_Melee_Attack_Slice_Horizontal',
    quake: 'Jump_Full_Short',
    bash: 'Block_Attack',
  },
  attackMotion: 'warrior',
};

export const MAGE_VISUAL: VisualConfig = {
  classId: 'mage',
  label: 'mage',
  modelUrl: '/models/kaykit-mage/Mage.glb',
  modelName: 'KayKitMage',
  showProps: new Set(['1H_Wand', 'Spellbook', 'Mage_Hat', 'Mage_Cape']),
  hideProps: new Set(['2H_Staff', 'Spellbook_open']),
  clips: {
    idle: 'Idle',
    walk: 'Walking_A',
    run: 'Running_A',
    slash: 'Spellcast_Shoot',
    quake: 'Spellcast_Long',
    bash: 'Spellcast_Raise',
  },
  attackMotion: 'mage',
};

type ClipKey = keyof ClipMap;

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
 * GLTF-backed KayKit character visual: loads a class model, maps AnimationMixer
 * clips to PlayerAnim states, and attaches under the Player entity root.
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

  /** Target world height for the hero (feet→head), matching the old procedural hero. */
  private readonly targetHeight = 1.95;
  /** KayKit / glTF forward is +Z; gameplay facing uses yaw on the entity root. */
  private readonly modelYawOffset = 0;

  constructor(readonly config: VisualConfig) {
    this.root.name = `PlayerVisual_${config.label}`;
    this.root.visible = false;
  }

  get isReady(): boolean {
    return this.ready;
  }

  get hasFailed(): boolean {
    return this.failed;
  }

  setActive(active: boolean): void {
    this.root.visible = active;
    if (!active) {
      // Stop mixer weight so hidden class doesn't keep evaluating.
      for (const action of this.actions.values()) {
        action.stop();
        action.setEffectiveWeight(0);
      }
      this.current = null;
      this.attackSynced = null;
      this.root.position.set(0, 0, 0);
    } else if (this.ready) {
      this.crossfade('idle', 0);
    }
  }

  /** Load once; resolves true on success, false on failure (never throws). */
  load(): Promise<boolean> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadInternal();
    return this.loadPromise;
  }

  private async loadInternal(): Promise<boolean> {
    try {
      const gltf = await this.loader.loadAsync(this.config.modelUrl);
      this.install(gltf.scene, gltf.animations);
      this.ready = true;
      this.failed = false;
      return true;
    } catch (err) {
      this.failed = true;
      this.ready = false;
      console.error(
        `[PlayerVisual] Failed to load ${this.config.label} GLTF — gameplay continues without that mesh.`,
        this.config.modelUrl,
        err,
      );
      return false;
    }
  }

  private install(scene: THREE.Object3D, animations: THREE.AnimationClip[]): void {
    while (this.root.children.length) this.root.remove(this.root.children[0]!);

    this.model = scene;
    this.model.name = this.config.modelName;
    this.model.rotation.y = this.modelYawOffset;

    const box = new THREE.Box3().setFromObject(this.model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const height = Math.max(size.y, 0.01);
    const scale = this.targetHeight / height;
    this.model.scale.setScalar(scale);

    box.setFromObject(this.model);
    this.model.position.y -= box.min.y;

    this.model.traverse((obj) => {
      const name = obj.name;
      if (this.config.hideProps.has(name)) {
        obj.visible = false;
        return;
      }
      if (this.config.showProps.has(name)) obj.visible = true;

      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m) continue;
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

    const clipMap = this.config.clips;
    for (const key of Object.keys(clipMap) as ClipKey[]) {
      const clip = this.clips.get(clipMap[key]);
      if (!clip) {
        console.warn(`[PlayerVisual] Missing clip "${clipMap[key]}" for ${key} (${this.config.label})`);
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

    this.crossfade('idle', 0);
  }

  /**
   * Drive locomotion / skill clips from the Player anim state machine.
   * Attack durations are time-scaled to match gameplay windows.
   * Direction changes do NOT restart walk — only clip identity changes do.
   */
  syncAnim(state: PlayerAnim, speed: number, maxSpeed: number, animT: number, animDur: number): void {
    if (!this.ready || !this.mixer || !this.root.visible) return;

    let desired: ClipKey = 'idle';
    if (state === 'slash') desired = 'slash';
    else if (state === 'quake') desired = 'quake';
    else if (state === 'bash') desired = 'bash';
    else if (state === 'move') {
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
      if (desired === 'walk' || desired === 'run') {
        const action = this.actions.get(desired);
        if (action) {
          const base = desired === 'run' ? maxSpeed * 0.9 : maxSpeed * 0.55;
          action.timeScale = THREE.MathUtils.clamp(speed / Math.max(base, 0.01), 0.7, 1.35);
        }
      }
    }

    if (this.model) {
      if (this.config.attackMotion === 'mage') {
        this.applyMageMotion(state, animT, animDur);
      } else {
        this.applyWarriorMotion(state, animT, animDur);
      }
    }
  }

  private applyWarriorMotion(state: PlayerAnim, animT: number, animDur: number): void {
    if (state === 'quake' && animDur > 1e-4) {
      const t = THREE.MathUtils.clamp(animT / animDur, 0, 1);
      const crouch = smooth01(t / 0.22);
      const launch = smooth01((t - 0.18) / 0.18);
      const impact = easeOut((t - 0.32) / 0.25);
      const settle = smooth01((t - 0.55) / 0.45);
      const down = crouch * (1 - launch) * 0.12;
      const hop = launch * (1 - impact) * 0.16;
      const squash = impact * 0.05 * (1 - settle);
      this.root.position.y = -down + hop - squash;
      this.root.position.x = 0;
      this.root.position.z = 0;
    } else if (state === 'bash' && animDur > 1e-4) {
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

  private applyMageMotion(state: PlayerAnim, animT: number, animDur: number): void {
    if ((state === 'slash' || state === 'quake' || state === 'bash') && animDur > 1e-4) {
      const t = THREE.MathUtils.clamp(animT / animDur, 0, 1);
      const lift = Math.sin(Math.min(1, t / 0.45) * Math.PI) * (state === 'quake' ? 0.12 : 0.07);
      const settle = smooth01((t - 0.55) / 0.45);
      this.root.position.y = lift * (1 - settle * 0.85);
      this.root.position.x = 0;
      this.root.position.z = state === 'slash' ? -0.04 * (1 - settle) : 0;
    } else {
      this.root.position.y = 0;
      this.root.position.x = 0;
      this.root.position.z = 0;
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
    if (this.flashMats.length === 0 || !this.root.visible) return;

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
      const wardTint = this.config.classId === 'mage' ? 0xc8b0ff : 0xffe8b0;
      for (const entry of this.flashMats) {
        if (blink) {
          entry.mat.color.copy(entry.color).lerp(new THREE.Color(0xffffff), 0.45);
          entry.mat.emissive.setHex(wardTint);
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
    if (!this.root.visible) return;
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
