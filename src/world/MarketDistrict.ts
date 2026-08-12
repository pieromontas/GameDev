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

const SIGN_INTERACT_RADIUS = 3.4;
const SIGN_INTERACT_RADIUS_SQ = SIGN_INTERACT_RADIUS * SIGN_INTERACT_RADIUS;
const SIGN_PROMPT = 'Press E — Market District';
const SIGN_TOAST = 'Market District  ·  stalls & shops (more town coming)';

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
