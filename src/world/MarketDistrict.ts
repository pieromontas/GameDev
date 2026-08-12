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

const INTERACT_RADIUS = 3.4;
const INTERACT_RADIUS_SQ = INTERACT_RADIUS * INTERACT_RADIUS;
const PROMPT = 'Press E — Market District';
const TOAST = 'Market District  ·  stalls & shops (more town coming)';

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
    return dx * dx + dz * dz <= INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): MarketHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    return { visible: true, text: PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;
    this.onToast(TOAST, 2.0);
    return true;
  }
}
