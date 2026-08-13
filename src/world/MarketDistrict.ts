import * as THREE from 'three';
import { Player } from '../entities/Player';
import { NortheastMarketDistrict } from '../render/stylized';

export type MarketHudPrompt = {
  visible: boolean;
  text: string;
};

/**
 * Flavor sign just past the city gate into the market stub.
 * Keep clear of building footprints / stall obstacles.
 */
export const MARKET_SIGN_SPOT = { x: 45.8, z: 45.2 } as const;

/** World XZ of the market plaza center (minimap / discovery). */
export const MARKET_CENTER = {
  x: NortheastMarketDistrict.x,
  z: NortheastMarketDistrict.z,
} as const;

/** Stylized plaza fountain — soft collision around this point in MeadowBiome. */
export const MARKET_FOUNTAIN_SPOT = {
  x: NortheastMarketDistrict.x,
  z: NortheastMarketDistrict.z,
} as const;

/**
 * KayKit cottage blacksmith workshop on the NNE market rim.
 * Forge / anvil yard sits toward the plaza (see MeadowBiome).
 */
export const MARKET_BLACKSMITH_SPOT = { x: 55.2, z: 60.8 } as const;

/** Anvil / open forge pad in front of the blacksmith (E interact). */
export const MARKET_FORGE_SPOT = { x: 52.5, z: 55.5 } as const;

/**
 * KayKit cottage inn / tavern on the south market rim (opposite the blacksmith).
 * Outdoor tables + door pad sit toward the plaza (see MeadowBiome).
 */
export const MARKET_INN_SPOT = { x: 48.5, z: 40.8 } as const;

/** Door / porch stand point in front of the inn (E interact) — outside cottage footprint. */
export const MARKET_INN_DOOR = { x: 49.6, z: 45.3 } as const;

/**
 * Short west-rim side alley off the plaza (between curtain wall + crate stacks).
 * Keep clear of KayKit shop pack radii (~4.4) and the gate→market diagonal.
 */
export const MARKET_ALLEY_SPOT = { x: 43.6, z: 52.4 } as const;

/** Cheap short rest — reachable after one chest. */
export const INN_REST_COST = 3;
export const INN_REST_HEAL = 40;
export const INN_REST_COOLDOWN = 45;

const SIGN_INTERACT_RADIUS = 3.4;
const SIGN_INTERACT_RADIUS_SQ = SIGN_INTERACT_RADIUS * SIGN_INTERACT_RADIUS;
const SIGN_PROMPT = 'Press E — Market District';
const SIGN_TOAST = 'Market District  ·  stalls & shops · homes beyond';

const SMITH_INTERACT_RADIUS = 3.6;
const SMITH_INTERACT_RADIUS_SQ = SMITH_INTERACT_RADIUS * SMITH_INTERACT_RADIUS;
const SMITH_PROMPT = 'Press E — Blacksmith';
const SMITH_TOAST = 'Blacksmith  ·  forge warm · blades & plates later';

/**
 * Lightweight town-slice interact — E at the market sign shows a flavor toast.
 * Mirrors chest / spring proximity prompts without opening a shop panel.
 * Hook point for a second merchant later.
 */
export class MarketDistrictSign {
  private readonly spot = new THREE.Vector3(MARKET_SIGN_SPOT.x, 0, MARKET_SIGN_SPOT.z);
  private readonly onToast: (message: string, duration?: number) => void;

  constructor(hooks: { onToast: (message: string, duration?: number) => void }) {
    this.onToast = hooks.onToast;
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.spot.x;
    const dz = pos.z - this.spot.z;
    return dx * dx + dz * dz <= SIGN_INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): MarketHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    return { visible: true, text: SIGN_PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;
    this.onToast(SIGN_TOAST, 2.0);
    return true;
  }
}

/**
 * Flavor interact at the market blacksmith forge — toast only (no shop panel).
 * Keep E-priority after the market sign so the welcome board still wins on overlap.
 */
export class MarketBlacksmith {
  private readonly spot = new THREE.Vector3(MARKET_FORGE_SPOT.x, 0, MARKET_FORGE_SPOT.z);
  private readonly onToast: (message: string, duration?: number) => void;

  constructor(hooks: { onToast: (message: string, duration?: number) => void }) {
    this.onToast = hooks.onToast;
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.spot.x;
    const dz = pos.z - this.spot.z;
    return dx * dx + dz * dz <= SMITH_INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): MarketHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    return { visible: true, text: SMITH_PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;
    this.onToast(SMITH_TOAST, 2.1);
    return true;
  }
}

const INN_INTERACT_RADIUS = 3.6;
const INN_INTERACT_RADIUS_SQ = INN_INTERACT_RADIUS * INN_INTERACT_RADIUS;
const INN_PROMPT = 'Press E — Rest at Inn';
const INN_TOAST_FLAVOR = 'Market Inn  ·  warm hearth · beds upstairs';

export type MarketInnHooks = {
  onToast: (message: string, duration?: number) => void;
  getGold: () => number;
  trySpend: (amount: number) => boolean;
};

/**
 * Paid short rest at the market inn door — small heal for a few gold + cooldown.
 * Keep E-priority after blacksmith so the forge yard still wins on plaza-edge overlap.
 */
export class MarketInn {
  private readonly door = new THREE.Vector3(MARKET_INN_DOOR.x, 0, MARKET_INN_DOOR.z);
  private cooldownRemain = 0;

  constructor(private readonly hooks: MarketInnHooks) {}

  get ready(): boolean {
    return this.cooldownRemain <= 0;
  }

  get cooldownRemaining(): number {
    return Math.max(0, this.cooldownRemain);
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.door.x;
    const dz = pos.z - this.door.z;
    return dx * dx + dz * dz <= INN_INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): MarketHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    if (!this.ready) {
      const secs = Math.ceil(this.cooldownRemaining);
      return { visible: true, text: `Inn resting… ${secs}s` };
    }
    return { visible: true, text: `${INN_PROMPT} (${INN_REST_COST}g)` };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;

    if (!this.ready) {
      const secs = Math.ceil(this.cooldownRemaining);
      this.hooks.onToast(`Inn beds airing… ${secs}s`, 1.4);
      return true;
    }

    if (player.hp >= player.maxHp) {
      this.hooks.onToast(`${INN_TOAST_FLAVOR}  ·  already rested`, 2.0);
      return true;
    }

    if (this.hooks.getGold() < INN_REST_COST) {
      this.hooks.onToast(`Need ${INN_REST_COST} gold for a short rest`, 1.5);
      return true;
    }

    if (!this.hooks.trySpend(INN_REST_COST)) {
      this.hooks.onToast(`Need ${INN_REST_COST} gold for a short rest`, 1.5);
      return true;
    }

    const before = player.hp;
    player.heal(INN_REST_HEAL);
    const gained = Math.max(0, Math.round(player.hp - before));
    this.cooldownRemain = INN_REST_COOLDOWN;
    this.hooks.onToast(
      `Inn rest  ·  −${INN_REST_COST}g  ·  +${gained} HP`,
      2.1,
    );
    return true;
  }

  /** Tick rest cooldown — call once per frame from the game loop. */
  update(dt: number): void {
    if (this.cooldownRemain > 0) {
      this.cooldownRemain = Math.max(0, this.cooldownRemain - dt);
    }
  }
}

const ALLEY_INTERACT_RADIUS = 3.2;
const ALLEY_INTERACT_RADIUS_SQ = ALLEY_INTERACT_RADIUS * ALLEY_INTERACT_RADIUS;
const ALLEY_PROMPT = 'Press E — Back Alley';
const ALLEY_TOAST = 'Back alley  ·  quiet crates · town gossip';

/**
 * Flavor interact at the market side alley — toast only.
 * Keep E-priority after the inn so porch / forge / sign still win on overlap.
 */
export class MarketAlley {
  private readonly spot = new THREE.Vector3(MARKET_ALLEY_SPOT.x, 0, MARKET_ALLEY_SPOT.z);
  private readonly onToast: (message: string, duration?: number) => void;

  constructor(hooks: { onToast: (message: string, duration?: number) => void }) {
    this.onToast = hooks.onToast;
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.spot.x;
    const dz = pos.z - this.spot.z;
    return dx * dx + dz * dz <= ALLEY_INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): MarketHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    return { visible: true, text: ALLEY_PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;
    this.onToast(ALLEY_TOAST, 2.0);
    return true;
  }
}
