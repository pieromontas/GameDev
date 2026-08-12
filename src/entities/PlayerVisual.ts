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
  burst: string;
  dodge: string;
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
  attackMotion: 'warrior' | 'mage' | 'rogue';
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
    // Longer jump for Leap Strike — distinct from Quake's short hop.
    burst: 'Jump_Full_Long',
    dodge: 'Dodge_Forward',
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
    // Channel cast for Meteor — distinct from Bolt / Nova / Ward clips.
    burst: 'Spellcasting',
    dodge: 'Dodge_Forward',
  },
  attackMotion: 'mage',
};

export const ROGUE_VISUAL: VisualConfig = {
  classId: 'rogue',
  label: 'rogue',
  modelUrl: '/models/kaykit-rogue/Rogue.glb',
  modelName: 'KayKitRogue',
  showProps: new Set(['Knife', 'Knife_Offhand', 'Rogue_Cape']),
  hideProps: new Set(['1H_Crossbow', '2H_Crossbow', 'Throwable']),
  clips: {
    idle: 'Idle',
    walk: 'Walking_A',
    run: 'Running_A',
    slash: '1H_Melee_Attack_Stab',
    // Spin reads as a knife fan / whirl around the rogue.
    quake: '2H_Melee_Attack_Spin',
    bash: 'Dodge_Forward',
    // Same long jump clip as Leap Strike — Shadow Leap reuses the travel feel.
    burst: 'Jump_Full_Long',
    dodge: 'Dodge_Forward',
  },
  attackMotion: 'rogue',
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
    else if (state === 'burst') desired = 'burst';
    else if (state === 'dodge') desired = 'dodge';
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
      if (
        desired === 'slash' ||
        desired === 'quake' ||
        desired === 'bash' ||
        desired === 'burst' ||
        desired === 'dodge'
      ) {
        this.attackSynced = null;
      }
    }

    if (
      (desired === 'slash' ||
        desired === 'quake' ||
        desired === 'bash' ||
        desired === 'burst' ||
        desired === 'dodge') &&
      animDur > 1e-4
    ) {
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
      } else if (this.config.attackMotion === 'rogue') {
        this.applyRogueMotion(state, animT, animDur);
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
    } else if (state === 'burst' && animDur > 1e-4) {
      // Higher, longer arc than Quake so Leap Strike reads as a real gap-closer.
      const t = THREE.MathUtils.clamp(animT / animDur, 0, 1);
      const launch = smooth01(t / 0.2);
      const hang = Math.sin(Math.min(1, (t - 0.12) / 0.55) * Math.PI);
      const land = easeOut((t - 0.62) / 0.38);
      const hop = launch * hang * (1 - land * 0.85) * 0.42;
      const squash = land * 0.08 * (1 - smooth01((t - 0.85) / 0.15));
      this.root.position.y = hop - squash;
      this.root.position.x = 0;
      this.root.position.z = 0;
    } else if (state === 'dodge' && animDur > 1e-4) {
      this.applyDodgeLean(animT, animDur);
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
    if (state === 'burst' && animDur > 1e-4) {
      // Slow channel rise — Meteor telegraph window, not a quick Bolt flick.
      const t = THREE.MathUtils.clamp(animT / animDur, 0, 1);
      const rise = smooth01(t / 0.35) * 0.16;
      const hold = Math.sin(Math.min(1, t / 0.7) * Math.PI) * 0.05;
      const settle = smooth01((t - 0.7) / 0.3);
      this.root.position.y = (rise + hold) * (1 - settle);
      this.root.position.x = 0;
      this.root.position.z = 0;
    } else if (state === 'dodge' && animDur > 1e-4) {
      this.applyDodgeLean(animT, animDur);
    } else if ((state === 'slash' || state === 'quake' || state === 'bash') && animDur > 1e-4) {
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

  private applyRogueMotion(state: PlayerAnim, animT: number, animDur: number): void {
    if (state === 'burst' && animDur > 1e-4) {
      // Compact shadow arc — lower than Warrior Leap so it reads stealthier.
      const t = THREE.MathUtils.clamp(animT / animDur, 0, 1);
      const launch = smooth01(t / 0.18);
      const hang = Math.sin(Math.min(1, (t - 0.1) / 0.55) * Math.PI);
      const land = easeOut((t - 0.6) / 0.4);
      const hop = launch * hang * (1 - land * 0.85) * 0.34;
      const squash = land * 0.07 * (1 - smooth01((t - 0.85) / 0.15));
      this.root.position.y = hop - squash;
      this.root.position.x = 0;
      this.root.position.z = 0;
    } else if (state === 'dodge' && animDur > 1e-4) {
      this.applyDodgeLean(animT, animDur);
    } else if (state === 'bash' && animDur > 1e-4) {
      // Dodge lunge — short forward dip, then settle (Smoke Bomb i-frames).
      const t = THREE.MathUtils.clamp(animT / animDur, 0, 1);
      const surge = Math.sin(Math.min(1, t / 0.4) * Math.PI);
      const settle = smooth01((t - 0.4) / 0.6);
      this.root.position.y = -surge * 0.06 * (1 - settle);
      this.root.position.x = 0;
      this.root.position.z = surge * (1 - settle) * 0.22;
    } else if (state === 'quake' && animDur > 1e-4) {
      // Fan spin — slight lift + yaw wobble on the root for readability.
      const t = THREE.MathUtils.clamp(animT / animDur, 0, 1);
      const lift = Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.1;
      const settle = smooth01((t - 0.55) / 0.45);
      this.root.position.y = lift * (1 - settle);
      this.root.position.x = Math.sin(t * Math.PI * 2) * 0.04 * (1 - settle);
      this.root.position.z = 0;
    } else if (state === 'slash' && animDur > 1e-4) {
      const t = THREE.MathUtils.clamp(animT / animDur, 0, 1);
      const poke = Math.sin(Math.min(1, t / 0.35) * Math.PI);
      const settle = smooth01((t - 0.4) / 0.6);
      this.root.position.y = 0;
      this.root.position.x = 0;
      this.root.position.z = poke * (1 - settle) * 0.12;
    } else {
      this.root.position.y = 0;
      this.root.position.x = 0;
      this.root.position.z = 0;
    }
  }

  /** Shared procedural lean for Shift dodge — pairs with Dodge_Forward clip. */
  private applyDodgeLean(animT: number, animDur: number): void {
    const t = THREE.MathUtils.clamp(animT / animDur, 0, 1);
    const surge = Math.sin(Math.min(1, t / 0.45) * Math.PI);
    const settle = smooth01((t - 0.5) / 0.5);
    const lean = surge * (1 - settle);
    this.root.position.y = -lean * 0.08;
    this.root.position.x = 0;
    this.root.position.z = lean * 0.18;
  }

  private fadeFor(from: ClipKey | null, to: ClipKey): number {
    const toAttack =
      to === 'slash' || to === 'quake' || to === 'bash' || to === 'burst' || to === 'dodge';
    const fromAttack =
      from === 'slash' || from === 'quake' || from === 'bash' || from === 'burst' || from === 'dodge';
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
      const wardTint =
        this.config.classId === 'mage'
          ? 0xc8b0ff
          : this.config.classId === 'rogue'
            ? 0xa8ffd8
            : 0xffe8b0;
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
