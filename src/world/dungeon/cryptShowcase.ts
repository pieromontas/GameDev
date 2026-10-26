import type { AnimationClip, KeyframeTrack } from 'three';
import {
  HALL_BOUNDS,
  HALL_EXIT_PAD,
  HALL_EXIT_RADIUS,
  HALL_PROP_CIRCLES,
  HALL_SEALED_PAD,
  HALL_SEALED_RADIUS,
  HALL_SPAWN,
  LEAVE_PROMPT,
  SEALED_PROMPT,
  type HallPromptKind,
} from './layout';

/** Same payout as the meadow treasure chests. */
export const CRYPT_CHEST_REWARD = { xp: 18, heal: 28, coins: 3 } as const;

export const CRYPT_CHEST_PROMPT = 'Press E — Open Chest';
export const CRYPT_CHEST_INTERACT_RADIUS = 1.8;

/**
 * How long the visible lid swing takes, in game seconds. The authored clip
 * sits shut for about a second, then opens and closes again — playback skips
 * that dead prefix and holds the open key instead of the closed end.
 */
export const CRYPT_CHEST_OPEN_SECONDS = 0.8;

export type CryptModelId =
  | '0244_stone_chest'
  | '1295_animated_chest'
  | '0729_barrel'
  | '0832_lantern'
  | '0292_gargoyle'
  | '0724_stone_golem'
  | '0504_plague_cultist'
  | '0928_hooded_cultist';

export type ShowcaseKind =
  | 'barrel'
  | 'stoneChest'
  | 'lootChest'
  | 'lantern'
  | 'gargoyle'
  | 'cultist'
  | 'golem';

export type ShowcaseLife = 'none' | 'sway' | 'golem';

export type ShowcasePlacement = {
  id: string;
  model: CryptModelId;
  kind: ShowcaseKind;
  /** Local hall XZ. +Z is the leave stair, −Z is the sealed gate. */
  x: number;
  z: number;
  yaw: number;
  /** World height after the raw GLB is measured. */
  targetHeight: number;
  /** 0 keeps the prop visual-only (golem sits past the walk clamp). */
  collisionRadius: number;
  life: ShowcaseLife;
};

/**
 * Wall dressing stays off the center aisle. The golem is behind the bars
 * (bar line is z ≈ −6.48). Gargoyles flank the gate on the hall side.
 */
export const CRYPT_SHOWCASE: readonly ShowcasePlacement[] = [
  { id: 'barrel-west-stair', model: '0729_barrel', kind: 'barrel', x: -2.78, z: 4.25, yaw: 0.35, targetHeight: 1.02, collisionRadius: 0.34, life: 'none' },
  { id: 'barrel-west-mid', model: '0729_barrel', kind: 'barrel', x: -2.82, z: -2.35, yaw: -0.5, targetHeight: 0.96, collisionRadius: 0.34, life: 'none' },
  { id: 'barrel-east-stair', model: '0729_barrel', kind: 'barrel', x: 2.78, z: 3.85, yaw: 1.1, targetHeight: 1.08, collisionRadius: 0.34, life: 'none' },
  { id: 'stone-chest-east', model: '0244_stone_chest', kind: 'stoneChest', x: 2.7, z: -2.45, yaw: -Math.PI / 2, targetHeight: 0.82, collisionRadius: 0.58, life: 'none' },
  { id: 'loot-chest-west', model: '1295_animated_chest', kind: 'lootChest', x: -2.68, z: 1.42, yaw: Math.PI / 2, targetHeight: 0.92, collisionRadius: 0.6, life: 'none' },
  { id: 'lantern-west-gate', model: '0832_lantern', kind: 'lantern', x: -2.72, z: -4.15, yaw: 0.2, targetHeight: 1.15, collisionRadius: 0.28, life: 'none' },
  { id: 'lantern-east-mid', model: '0832_lantern', kind: 'lantern', x: 2.72, z: 1.55, yaw: -0.3, targetHeight: 1.15, collisionRadius: 0.28, life: 'none' },
  { id: 'gargoyle-west', model: '0292_gargoyle', kind: 'gargoyle', x: -2.15, z: -5.22, yaw: 0.55, targetHeight: 1.62, collisionRadius: 0.42, life: 'none' },
  { id: 'gargoyle-east', model: '0292_gargoyle', kind: 'gargoyle', x: 2.15, z: -5.22, yaw: -0.55, targetHeight: 1.62, collisionRadius: 0.42, life: 'none' },
  { id: 'plague-cultist', model: '0504_plague_cultist', kind: 'cultist', x: -1.72, z: -3.35, yaw: 0.35, targetHeight: 1.88, collisionRadius: 0.4, life: 'sway' },
  { id: 'hooded-cultist', model: '0928_hooded_cultist', kind: 'cultist', x: 1.78, z: -3.05, yaw: -0.4, targetHeight: 1.88, collisionRadius: 0.4, life: 'sway' },
  { id: 'golem-teaser', model: '0724_stone_golem', kind: 'golem', x: 0, z: -6.55, yaw: 0, targetHeight: 2.05, collisionRadius: 0, life: 'golem' },
];

export type Circle = { x: number; z: number; radius: number };

export function cryptShowcaseCircles(): Circle[] {
  const circles: Circle[] = [];
  for (const spot of CRYPT_SHOWCASE) {
    if (spot.collisionRadius > 0) {
      circles.push({ x: spot.x, z: spot.z, radius: spot.collisionRadius });
    }
  }
  return circles;
}

export function cryptLootPlacement(): ShowcasePlacement {
  const spot = CRYPT_SHOWCASE.find((entry) => entry.kind === 'lootChest');
  if (!spot) throw new Error('Crypt showcase is missing the loot chest');
  return spot;
}

export function cryptChestToast(): string {
  const reward = CRYPT_CHEST_REWARD;
  return `Chest looted!  ·  +${reward.xp} XP  ·  +${reward.coins} gold  ·  healed`;
}

export type CryptChestGrant = {
  xp: number;
  heal: number;
  coins: number;
  toast: string;
  x: number;
  z: number;
};

export type HallPrompt = { visible: boolean; text: string; kind: HallPromptKind | null };

/** Exit and the sealed gate win over the loot chest when the pads overlap. */
export function resolveHallPrompt(zoneKind: HallPromptKind | null, chestReady: boolean): HallPrompt {
  if (zoneKind === 'exit') return { visible: true, text: LEAVE_PROMPT, kind: 'exit' };
  if (zoneKind === 'sealed') return { visible: true, text: SEALED_PROMPT, kind: 'sealed' };
  if (chestReady) return { visible: true, text: CRYPT_CHEST_PROMPT, kind: 'chest' };
  return { visible: false, text: '', kind: null };
}

export function chestInRange(x: number, z: number, spot: { x: number; z: number } = cryptLootPlacement()): boolean {
  const dx = x - spot.x;
  const dz = z - spot.z;
  return dx * dx + dz * dz <= CRYPT_CHEST_INTERACT_RADIUS * CRYPT_CHEST_INTERACT_RADIUS;
}

export type ChestPhase = 'closed' | 'opening' | 'open';

/** One-shot lid. `duration` is how long the swing takes in game seconds. */
export class CryptChestState {
  phase: ChestPhase = 'closed';
  elapsed = 0;
  duration: number;

  constructor(duration = 3) {
    this.duration = duration;
  }

  get isClosed(): boolean {
    return this.phase === 'closed';
  }

  /** Ignored once the lid has finished so a late clip measurement cannot shut it. */
  setDuration(seconds: number): void {
    if (this.phase === 'open') return;
    if (seconds > 0.05) this.duration = seconds;
  }

  beginOpen(): boolean {
    if (this.phase !== 'closed') return false;
    this.phase = 'opening';
    this.elapsed = 0;
    return true;
  }

  update(dt: number): void {
    if (this.phase !== 'opening') return;
    this.elapsed += Math.max(0, dt);
    if (this.elapsed >= this.duration) {
      this.elapsed = this.duration;
      this.phase = 'open';
    }
  }
}

const LID_SHUT_RADIANS = 0.04;

function lidHingeTrack(clip: AnimationClip, nodeName: string): KeyframeTrack | undefined {
  const needle = nodeName.toLowerCase();
  return clip.tracks.find((entry) => {
    const name = entry.name.toLowerCase();
    return name.includes(needle) && (name.endsWith('quaternion') || name.endsWith('rotation'));
  });
}

function hingeAngle(track: KeyframeTrack, index: number): number {
  const quat = track.values.length === track.times.length * 4;
  if (!quat) return Math.abs(track.values[index * 3] ?? 0);
  const x = track.values[index * 4] ?? 0;
  const w = track.values[index * 4 + 3] ?? 1;
  return Math.abs(2 * Math.atan2(x, w));
}

/**
 * Time of the lid's most-open key. The Scenario clip swings open and then
 * shut, so clamping at `clip.duration` would leave the chest closed.
 */
export function lidHoldTime(clip: AnimationClip, nodeName = 'Chest_Lid'): number {
  const track = lidHingeTrack(clip, nodeName);
  if (!track || track.times.length === 0) return clip.duration * 0.5;
  let bestT = track.times[0] ?? 0;
  let best = -1;
  for (let i = 0; i < track.times.length; i++) {
    const angle = hingeAngle(track, i);
    if (angle > best + 1e-4) {
      best = angle;
      bestT = track.times[i] ?? bestT;
    }
  }
  return bestT;
}

/**
 * Clip window for the visible swing. `start` is the last nearly-shut key
 * before the lid peaks, so the closed hold at the head of the clip is skipped.
 */
export function lidSwingRange(clip: AnimationClip, nodeName = 'Chest_Lid'): { start: number; hold: number } {
  const hold = lidHoldTime(clip, nodeName);
  const track = lidHingeTrack(clip, nodeName);
  if (!track) return { start: 0, hold };
  let start = track.times[0] ?? 0;
  for (let i = 0; i < track.times.length; i++) {
    const t = track.times[i] ?? 0;
    if (t >= hold) break;
    if (hingeAngle(track, i) < LID_SHUT_RADIANS) start = t;
  }
  if (hold - start < 0.05) return { start: 0, hold };
  return { start, hold };
}

/** Map open progress (0 closed, 1 held open) onto the clip window. */
export function lidMixerTime(progress: number, start: number, hold: number): number {
  const u = Math.min(1, Math.max(0, progress));
  return start + (hold - start) * u;
}

export function circlesOverlap(a: Circle, b: Circle, gap = 0): boolean {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const reach = a.radius + b.radius + gap;
  return dx * dx + dz * dz < reach * reach;
}

/** True when a hero of `radius` can stand on the local point. */
export function pointBlocked(x: number, z: number, radius: number, circles: readonly Circle[]): boolean {
  if (x < HALL_BOUNDS.minX + radius || x > HALL_BOUNDS.maxX - radius) return true;
  if (z < HALL_BOUNDS.minZ + radius || z > HALL_BOUNDS.maxZ - radius) return true;
  for (const circle of circles) {
    if (circlesOverlap({ x, z, radius }, circle)) return true;
  }
  return false;
}

const PLAYER_RADIUS = 0.5;

/** All colliders the hero meets when the showcase flag is on. */
export function cryptHallCircles(): Circle[] {
  return [...HALL_PROP_CIRCLES, ...cryptShowcaseCircles()];
}

/**
 * A stand point on the aisle side of the loot chest: inside the interact
 * disk, clear of props, and not on the leave / sealed pads.
 */
export function lootChestApproach(): { x: number; z: number } | null {
  const chest = cryptLootPlacement();
  const circles = cryptHallCircles();
  for (let x = chest.x + 0.85; x <= 0.4; x += 0.15) {
    for (let z = chest.z - 0.7; z <= chest.z + 0.7; z += 0.15) {
      if (!chestInRange(x, z, chest)) continue;
      if (pointBlocked(x, z, PLAYER_RADIUS, circles)) continue;
      if (padContains(HALL_EXIT_PAD, HALL_EXIT_RADIUS, x, z)) continue;
      if (padContains(HALL_SEALED_PAD, HALL_SEALED_RADIUS, x, z)) continue;
      return { x, z };
    }
  }
  return null;
}

function padContains(pad: { x: number; z: number }, radius: number, x: number, z: number): boolean {
  const dx = x - pad.x;
  const dz = z - pad.z;
  return dx * dx + dz * dz <= radius * radius;
}

/** Center aisle from the spawn through the sealed pad, hero radius included. */
export function centerAisleClear(circles: readonly Circle[] = cryptHallCircles()): boolean {
  for (let z = HALL_SEALED_PAD.z; z <= HALL_SPAWN.z; z += 0.25) {
    if (pointBlocked(0, z, PLAYER_RADIUS, circles)) return false;
  }
  for (const pad of [HALL_SPAWN, HALL_EXIT_PAD, HALL_SEALED_PAD]) {
    if (pointBlocked(pad.x, pad.z, PLAYER_RADIUS, circles)) return false;
  }
  return true;
}
