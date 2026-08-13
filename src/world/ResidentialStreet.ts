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

/** Shared well accent off the lane near the street bend (pack-swapped). */
export const RESIDENTIAL_WELL_SPOT = { x: 73.5, z: 68.0 } as const;

/** Small garden patch clear of house footprints and the walk lane. */
export const RESIDENTIAL_GARDEN_SPOT = { x: 74.0, z: 70.5 } as const;

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
