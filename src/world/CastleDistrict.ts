import * as THREE from 'three';
import { Player } from '../entities/Player';
import { NortheastCastleKeep, NortheastCastleGatehouse } from '../render/stylized';

export type CastleHudPrompt = {
  visible: boolean;
  text: string;
};

/** World XZ of the Castle Gatehouse (minimap / discovery). */
export const CASTLE_GATEHOUSE_CENTER = {
  x: NortheastCastleGatehouse.x,
  z: NortheastCastleGatehouse.z,
} as const;

/** World XZ of the Castle Keep & Courtyard (minimap / discovery). */
export const CASTLE_KEEP_CENTER = {
  x: NortheastCastleKeep.x,
  z: NortheastCastleKeep.z,
} as const;

/** Grand Citadel Gate portal pad (E inspect). */
export const CASTLE_CITADEL_GATE = { x: 93.8, z: 93.8 } as const;

/**
 * Royal Knight Captain standing at attention in the courtyard.
 * Flanked by high banners and heraldic standards.
 */
export const CASTLE_KNIGHT_CAPTAIN = {
  x: 87.2,
  z: 88.5,
} as const;

/** Face southwest down the main causeway approach. */
export const CASTLE_KNIGHT_CAPTAIN_YAW = Math.PI * 0.25;

/** Royal Armory & Weapon Racks pad (E inspect). */
export const CASTLE_ARMORY_SPOT = { x: 84.5, z: 92.2 } as const;

/** Archery practice targets in the western yard. */
export const CASTLE_TARGET_SPOT = { x: 82.2, z: 94.0 } as const;

/** Combat training dummy in the yard. */
export const CASTLE_DUMMY_SPOT = { x: 85.5, z: 94.5 } as const;

/** Royal Treasury gilded chest tucked behind the eastern battlements. */
export const CASTLE_CHEST_SPOT = { x: 92.5, z: 85.2 } as const;

/**
 * Fortified stone braziers lighting the causeway and courtyard.
 */
export const CASTLE_BRAZIER_SPOTS = [
  { x: 74.5, z: 75.8 }, // Gatehouse approach W
  { x: 76.8, z: 73.5 }, // Gatehouse approach E
  { x: 79.5, z: 81.2 }, // Gatehouse inner arch W
  { x: 82.2, z: 78.5 }, // Gatehouse inner arch E
  { x: 85.2, z: 85.8 }, // Courtyard central entrance W
  { x: 86.8, z: 84.2 }, // Courtyard central entrance E
  { x: 91.5, z: 91.0 }, // Citadel grand portal flank W
  { x: 91.0, z: 91.5 }, // Citadel grand portal flank E
] as const;

/**
 * Royal standards and heraldic banner posts.
 */
export const CASTLE_BANNER_POSTS = [
  { x: 76.5, z: 79.5, yaw: -Math.PI * 0.25 },
  { x: 79.5, z: 76.5, yaw: Math.PI * 0.75 },
  { x: 85.0, z: 91.0, yaw: -Math.PI * 0.25 },
  { x: 91.0, z: 85.0, yaw: Math.PI * 0.75 },
] as const;

/** Knight's Valor blessing constants */
export const CASTLE_VALOR_HEAL = 40;
export const CASTLE_VALOR_COOLDOWN = 45;
export const CASTLE_VALOR_BUFF_DURATION = 30;
export const CASTLE_VALOR_DAMAGE_MULT = 1.25;

const CAPTAIN_INTERACT_RADIUS = 3.6;
const CAPTAIN_INTERACT_RADIUS_SQ = CAPTAIN_INTERACT_RADIUS * CAPTAIN_INTERACT_RADIUS;
const CAPTAIN_PROMPT = 'Press E — Knight Captain';

const GATE_INTERACT_RADIUS = 3.8;
const GATE_INTERACT_RADIUS_SQ = GATE_INTERACT_RADIUS * GATE_INTERACT_RADIUS;
const GATE_PROMPT = 'Press E — Citadel Gate';
const GATE_TOAST = 'Grand Citadel · The High Throne stands vigilant above the realm.';

const ARMORY_INTERACT_RADIUS = 3.4;
const ARMORY_INTERACT_RADIUS_SQ = ARMORY_INTERACT_RADIUS * ARMORY_INTERACT_RADIUS;
const ARMORY_PROMPT = 'Press E — Royal Armory';
const ARMORY_TOAST = 'Royal Armory · Mastercrafted steel and knightly crests.';

/**
 * Manages castle interactables, Knight Captain dialogue/valor buff, armory inspections,
 * and citadel gate toasts.
 */
export class CastleDistrict {
  private valorCooldownTimer = 0;
  private readonly playerPos = new THREE.Vector3();

  update(dt: number): void {
    if (this.valorCooldownTimer > 0) {
      this.valorCooldownTimer = Math.max(0, this.valorCooldownTimer - dt);
    }
  }

  getHudPrompt(player: Player): CastleHudPrompt {
    this.playerPos.copy(player.position);

    // 1. Knight Captain (highest priority in courtyard)
    const cdx = this.playerPos.x - CASTLE_KNIGHT_CAPTAIN.x;
    const cdz = this.playerPos.z - CASTLE_KNIGHT_CAPTAIN.z;
    if (cdx * cdx + cdz * cdz <= CAPTAIN_INTERACT_RADIUS_SQ) {
      const ready = this.valorCooldownTimer <= 0;
      return {
        visible: true,
        text: ready ? CAPTAIN_PROMPT : 'Knight Captain · On Cooldown',
      };
    }

    // 2. Citadel Grand Gate
    const gdx = this.playerPos.x - CASTLE_CITADEL_GATE.x;
    const gdz = this.playerPos.z - CASTLE_CITADEL_GATE.z;
    if (gdx * gdx + gdz * gdz <= GATE_INTERACT_RADIUS_SQ) {
      return {
        visible: true,
        text: GATE_PROMPT,
      };
    }

    // 3. Royal Armory Rack
    const adx = this.playerPos.x - CASTLE_ARMORY_SPOT.x;
    const adz = this.playerPos.z - CASTLE_ARMORY_SPOT.z;
    if (adx * adx + adz * adz <= ARMORY_INTERACT_RADIUS_SQ) {
      return {
        visible: true,
        text: ARMORY_PROMPT,
      };
    }

    return { visible: false, text: '' };
  }

  isNearInteractable(player: Player): boolean {
    this.playerPos.copy(player.position);
    const cdx = this.playerPos.x - CASTLE_KNIGHT_CAPTAIN.x;
    const cdz = this.playerPos.z - CASTLE_KNIGHT_CAPTAIN.z;
    if (cdx * cdx + cdz * cdz <= CAPTAIN_INTERACT_RADIUS_SQ) return true;

    const gdx = this.playerPos.x - CASTLE_CITADEL_GATE.x;
    const gdz = this.playerPos.z - CASTLE_CITADEL_GATE.z;
    if (gdx * gdx + gdz * gdz <= GATE_INTERACT_RADIUS_SQ) return true;

    const adx = this.playerPos.x - CASTLE_ARMORY_SPOT.x;
    const adz = this.playerPos.z - CASTLE_ARMORY_SPOT.z;
    if (adx * adx + adz * adz <= ARMORY_INTERACT_RADIUS_SQ) return true;

    return false;
  }

  interact(
    player: Player,
    showToast: (text: string) => void,
    onBuffApplied?: (duration: number) => void,
  ): boolean {
    this.playerPos.copy(player.position);

    // 1. Knight Captain
    const cdx = this.playerPos.x - CASTLE_KNIGHT_CAPTAIN.x;
    const cdz = this.playerPos.z - CASTLE_KNIGHT_CAPTAIN.z;
    if (cdx * cdx + cdz * cdz <= CAPTAIN_INTERACT_RADIUS_SQ) {
      if (this.valorCooldownTimer > 0) {
        const left = Math.ceil(this.valorCooldownTimer);
        showToast(`Knight Captain · "Stand tall, warrior! Regroup in ${left}s."`);
        return true;
      }
      this.valorCooldownTimer = CASTLE_VALOR_COOLDOWN;
      player.heal(CASTLE_VALOR_HEAL);
      player.applyKnightValor(CASTLE_VALOR_BUFF_DURATION, CASTLE_VALOR_DAMAGE_MULT);
      onBuffApplied?.(CASTLE_VALOR_BUFF_DURATION);
      showToast(
        `Knight Captain · "For the Crown! Take heart and strike true!" (+${CASTLE_VALOR_HEAL} HP, +25% DMG)`,
      );
      return true;
    }

    // 2. Citadel Gate
    const gdx = this.playerPos.x - CASTLE_CITADEL_GATE.x;
    const gdz = this.playerPos.z - CASTLE_CITADEL_GATE.z;
    if (gdx * gdx + gdz * gdz <= GATE_INTERACT_RADIUS_SQ) {
      showToast(GATE_TOAST);
      return true;
    }

    // 3. Armory Rack
    const adx = this.playerPos.x - CASTLE_ARMORY_SPOT.x;
    const adz = this.playerPos.z - CASTLE_ARMORY_SPOT.z;
    if (adx * adx + adz * adz <= ARMORY_INTERACT_RADIUS_SQ) {
      showToast(ARMORY_TOAST);
      return true;
    }

    return false;
  }
}
