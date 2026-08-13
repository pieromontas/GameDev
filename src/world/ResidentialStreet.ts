import * as THREE from 'three';
import { Player } from '../entities/Player';
import { NortheastResidentialStreet } from '../render/stylized';

export type ResidentialHudPrompt = {
  visible: boolean;
  text: string;
};

/** World XZ of the residential street pocket (minimap / discovery). */
export const RESIDENTIAL_CENTER = {
  x: NortheastResidentialStreet.x,
  z: NortheastResidentialStreet.z,
} as const;

/**
 * KayKit cottage homes along the stub (street-facing; soft collision in MeadowBiome).
 * Centers stay ≥~9 apart and ≥~5.5 off the NE diagonal so pack r≈4.4 clears the lane.
 */
export const RESIDENTIAL_HOME_SPOTS = [
  {
    x: 61.2,
    z: 72.8,
    scale: 1.05,
    yaw: Math.atan2(67 - 61.2, 67 - 72.8),
  },
  {
    x: 72.8,
    z: 61.2,
    scale: 1.08,
    yaw: Math.atan2(67 - 72.8, 67 - 61.2),
  },
  {
    x: 69.0,
    z: 77.2,
    scale: 1.0,
    yaw: Math.atan2(72 - 69.0, 72 - 77.2),
  },
] as const;

/** Door pad in front of the first home (E flavor) — outside cottage footprint. */
export const RESIDENTIAL_DOOR_SPOT = { x: 64.5, z: 69.5 } as const;

/**
 * KayKit church / town chapel on the east residential rim (street-facing).
 * Soft collision in MeadowBiome; keep ≥~5.5 off the NE diagonal so the lane stays open.
 */
export const RESIDENTIAL_CHAPEL_SPOT = {
  x: 77.0,
  z: 69.0,
  scale: 1.02,
  yaw: Math.atan2(67 - 77.0, 67 - 69.0),
} as const;

/** Door / porch pad in front of the chapel (E interact) — outside church pack radius (~4.1). */
export const RESIDENTIAL_CHAPEL_DOOR = { x: 72.3, z: 68.1 } as const;

/** Shared well accent south of the chapel apron (pack-swapped; clear of door pad). */
export const RESIDENTIAL_WELL_SPOT = { x: 72.5, z: 64.8 } as const;

/** Small garden patch north of the chapel apron — clear of house / church footprints. */
export const RESIDENTIAL_GARDEN_SPOT = { x: 74.2, z: 72.5 } as const;

/** Free chapel blessing — smaller heal than the market inn rest, no gold. */
export const CHAPEL_BLESS_HEAL = 22;
export const CHAPEL_BLESS_COOLDOWN = 40;
/** Mild short buff — weaker than the east shrine wave reward. */
export const CHAPEL_BLESS_BUFF_DURATION = 18;
export const CHAPEL_BLESS_DAMAGE_MULT = 1.15;

const DOOR_INTERACT_RADIUS = 3.2;
const DOOR_INTERACT_RADIUS_SQ = DOOR_INTERACT_RADIUS * DOOR_INTERACT_RADIUS;
const DOOR_PROMPT = 'Press E — Cottage Door';
const DOOR_TOAST = 'Locked — townsfolk later';

/**
 * Flavor interact at a residential cottage door — toast only (no NPC / interior).
 * Keep E-priority after market alley so plaza interacts still win on overlap.
 */
export class ResidentialDoor {
  private readonly spot = new THREE.Vector3(
    RESIDENTIAL_DOOR_SPOT.x,
    0,
    RESIDENTIAL_DOOR_SPOT.z,
  );
  private readonly onToast: (message: string, duration?: number) => void;

  constructor(hooks: { onToast: (message: string, duration?: number) => void }) {
    this.onToast = hooks.onToast;
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.spot.x;
    const dz = pos.z - this.spot.z;
    return dx * dx + dz * dz <= DOOR_INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): ResidentialHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    return { visible: true, text: DOOR_PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;
    this.onToast(DOOR_TOAST, 2.0);
    return true;
  }
}

const CHAPEL_INTERACT_RADIUS = 3.5;
const CHAPEL_INTERACT_RADIUS_SQ = CHAPEL_INTERACT_RADIUS * CHAPEL_INTERACT_RADIUS;
const CHAPEL_PROMPT = 'Press E — Town Chapel';
const CHAPEL_TOAST_FLAVOR = 'Town Chapel  ·  quiet prayer · townsfolk shrine';

/**
 * Free short blessing at the residential chapel door — tiny heal + cooldown.
 * Distinct from the east meadow shrine (no waves / crystal defend).
 * Keep E-priority after residential door so the cottage stoop still wins on overlap.
 */
export class ResidentialChapel {
  private readonly door = new THREE.Vector3(
    RESIDENTIAL_CHAPEL_DOOR.x,
    0,
    RESIDENTIAL_CHAPEL_DOOR.z,
  );
  private cooldownRemain = 0;
  private readonly onToast: (message: string, duration?: number) => void;

  constructor(hooks: { onToast: (message: string, duration?: number) => void }) {
    this.onToast = hooks.onToast;
  }

  get ready(): boolean {
    return this.cooldownRemain <= 0;
  }

  get cooldownRemaining(): number {
    return Math.max(0, this.cooldownRemain);
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.door.x;
    const dz = pos.z - this.door.z;
    return dx * dx + dz * dz <= CHAPEL_INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): ResidentialHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    if (!this.ready) {
      const secs = Math.ceil(this.cooldownRemaining);
      return { visible: true, text: `Chapel resting… ${secs}s` };
    }
    return { visible: true, text: CHAPEL_PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;

    if (!this.ready) {
      const secs = Math.ceil(this.cooldownRemaining);
      this.onToast(`Chapel candles cooling… ${secs}s`, 1.4);
      return true;
    }

    const needsHeal = player.hp < player.maxHp;
    // Mild town buff — never clobber a stronger shrine / charm already running.
    const canBless =
      !player.hasShrineBuff || player.activeBuffLabel === 'Town Blessing';

    if (!needsHeal && !canBless) {
      this.onToast(`${CHAPEL_TOAST_FLAVOR}  ·  already favored`, 2.0);
      return true;
    }

    let gained = 0;
    if (needsHeal) {
      const before = player.hp;
      player.heal(CHAPEL_BLESS_HEAL);
      gained = Math.max(0, Math.round(player.hp - before));
    }
    if (canBless) {
      player.applyTownBlessing(CHAPEL_BLESS_BUFF_DURATION, CHAPEL_BLESS_DAMAGE_MULT);
    }

    this.cooldownRemain = CHAPEL_BLESS_COOLDOWN;
    if (gained > 0 && canBless) {
      this.onToast(`Town blessing  ·  +${gained} HP  ·  brief favor`, 2.1);
    } else if (gained > 0) {
      this.onToast(`Town blessing  ·  +${gained} HP`, 2.1);
    } else {
      this.onToast(`${CHAPEL_TOAST_FLAVOR}  ·  brief favor`, 2.0);
    }
    return true;
  }

  /** Tick blessing cooldown — call once per frame from the game loop. */
  update(dt: number): void {
    if (this.cooldownRemain > 0) {
      this.cooldownRemain = Math.max(0, this.cooldownRemain - dt);
    }
  }
}
