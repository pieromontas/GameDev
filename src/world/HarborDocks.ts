import * as THREE from 'three';
import { Player } from '../entities/Player';
import { NortheastHarborDocks } from '../render/stylized';

export type HarborHudPrompt = {
  visible: boolean;
  text: string;
};

/** World XZ of the harbor / docks pocket (minimap / discovery). */
export const HARBOR_CENTER = {
  x: NortheastHarborDocks.x,
  z: NortheastHarborDocks.z,
} as const;

/**
 * Catch-crate / pier sign pad — E flavor only (no shop).
 * Sits beside the walkable pier lane, clear of boat soft blockers.
 */
export const HARBOR_CATCH_SIGN = { x: 63.8, z: 43.6 } as const;

/** Soft door-style interact radius at the catch crate. */
const CATCH_INTERACT_RADIUS = 3.2;
const CATCH_INTERACT_RADIUS_SQ = CATCH_INTERACT_RADIUS * CATCH_INTERACT_RADIUS;
const CATCH_PROMPT = 'Press E — Catch Crate';
const CATCH_TOAST = 'Catch of the day later  ·  nets drying · pier quiet';

/**
 * Flavor interact at a dockside catch crate — toast only (no combat / shop).
 * Keep E-priority after market alley so plaza interacts still win on overlap.
 */
export class HarborCatchSign {
  private readonly spot = new THREE.Vector3(
    HARBOR_CATCH_SIGN.x,
    0,
    HARBOR_CATCH_SIGN.z,
  );
  private readonly onToast: (message: string, duration?: number) => void;

  constructor(hooks: { onToast: (message: string, duration?: number) => void }) {
    this.onToast = hooks.onToast;
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.spot.x;
    const dz = pos.z - this.spot.z;
    return dx * dx + dz * dz <= CATCH_INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): HarborHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    return { visible: true, text: CATCH_PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;
    this.onToast(CATCH_TOAST, 2.0);
    return true;
  }
}
