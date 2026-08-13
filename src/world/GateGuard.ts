import * as THREE from 'three';
import { Player } from '../entities/Player';
import { NortheastCityGate } from '../render/stylized';

export type GateGuardHudPrompt = {
  visible: boolean;
  text: string;
};

export type GateGuardHooks = {
  onToast: (message: string, duration?: number) => void;
  /** Optional kill counter for a tiny “clear meadow blobs” flavor stub. */
  getKills?: () => number;
};

/**
 * Sentry stand just outside the left gate pillar (arch-local −X), clear of the
 * walk-through lane under the NE city gate. Soft collision lives in MeadowBiome.
 */
export const GATE_GUARD_NPC = { x: 42.2, z: 37.4 } as const;

/** Walk-up stand point toward the SW road approach (outside the NPC footprint). */
export const GATE_GUARD_STAND = { x: 41.25, z: 36.45 } as const;

/** Face travelers coming up the NE road from the meadow. */
export const GATE_GUARD_YAW = Math.atan2(
  30 - GATE_GUARD_NPC.x,
  30 - GATE_GUARD_NPC.z,
);

const INTERACT_RADIUS = 3.6;
const INTERACT_RADIUS_SQ = INTERACT_RADIUS * INTERACT_RADIUS;
const PROMPT = 'Press E — Gate Guard';
const BLOB_QUEST_GOAL = 3;

/**
 * City gate townsfolk sentry — E flavor dialogue (no shop / combat AI).
 * Optional kill-counter stub toasts meadow-blob progress when available.
 */
export class GateGuard {
  private talkedOnce = false;
  private readonly stand = new THREE.Vector3(
    GATE_GUARD_STAND.x,
    0,
    GATE_GUARD_STAND.z,
  );

  constructor(private readonly hooks: GateGuardHooks) {}

  /** World XZ of the gate arch (for callers / docs parity with other landmarks). */
  static get gateAnchor(): { x: number; z: number } {
    return { x: NortheastCityGate.x, z: NortheastCityGate.z };
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.stand.x;
    const dz = pos.z - this.stand.z;
    return dx * dx + dz * dz <= INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): GateGuardHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    return { visible: true, text: PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;

    if (!this.talkedOnce) {
      this.talkedOnce = true;
      this.hooks.onToast(
        'Gate Guard  ·  welcome to town · keep the peace beyond the arch',
        2.4,
      );
      return true;
    }

    const kills = this.hooks.getKills?.() ?? 0;
    if (kills >= BLOB_QUEST_GOAL) {
      this.hooks.onToast(
        `Gate Guard  ·  road's quieter — meadow blobs cleared (${kills})`,
        2.2,
      );
    } else {
      this.hooks.onToast(
        `Gate Guard  ·  watch the road · clear meadow blobs when you can (${kills}/${BLOB_QUEST_GOAL})`,
        2.3,
      );
    }
    return true;
  }
}
