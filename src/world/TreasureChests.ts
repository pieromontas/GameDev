import * as THREE from 'three';
import { Player } from '../entities/Player';
import { TreasureChest } from '../entities/TreasureChest';
import { LootPickup } from '../entities/Loot';
import { MeadowBiome } from './MeadowBiome';
import {
  WestMistyGrove,
  SouthRiverFordClearing,
} from '../render/stylized';

export type ChestHudPrompt = {
  visible: boolean;
  text: string;
};

export type TreasureChestHooks = {
  onLootBurst: (pickups: LootPickup[]) => void;
  onToast: (message: string, duration?: number) => void;
  onXpGranted: (amount: number, worldPos: THREE.Vector3) => void;
};

const INTERACT_PROMPT = 'Press E — Open Chest';
const CHEST_XP = 18;
const CHEST_HEAL = 28;
const LOOT_COINS = 3;

type ChestSpot = {
  x: number;
  z: number;
  yaw: number;
};

/** Readable discovery spots — clear of shrine, cart, fairy ring, and gate posts. */
export const CHEST_SPOTS: ChestSpot[] = [
  // Main meadow, SE of the quiet pond — edge landmark near the path bend
  { x: -14.2, z: -8.2, yaw: 0.55 },
  // South river ford camp, east of the broken cart on the near bank
  {
    x: SouthRiverFordClearing.x + 2.6,
    z: SouthRiverFordClearing.z + 5.2,
    yaw: -0.35,
  },
  // West misty grove, south of the fairy ring / fallen trunk
  {
    x: WestMistyGrove.x + 3.8,
    z: WestMistyGrove.z - 5.4,
    yaw: 0.9,
  },
];

/**
 * Places 3 one-shot treasure chests and handles E-to-open interact + rewards.
 * Mirrors the shrine proximity/prompt pattern without a shared Interactable base.
 */
export class TreasureChests {
  readonly chests: TreasureChest[] = [];
  private readonly root = new THREE.Group();

  constructor(
    private readonly meadow: MeadowBiome,
    private readonly hooks: TreasureChestHooks,
  ) {
    this.root.name = 'TreasureChests';
    for (const spot of CHEST_SPOTS) {
      const chest = new TreasureChest(new THREE.Vector3(spot.x, 0, spot.z), spot.yaw);
      this.chests.push(chest);
      this.root.add(chest.mesh);
      this.meadow.obstacles.push({
        x: spot.x,
        z: spot.z,
        radius: chest.obstacleRadius,
      });
    }
    this.meadow.root.add(this.root);
  }

  getInteractPrompt(player: Player): ChestHudPrompt {
    if (!player.alive) return { visible: false, text: '' };
    const near = this.findNearestClosed(player.position);
    if (!near) return { visible: false, text: '' };
    return { visible: true, text: INTERACT_PROMPT };
  }

  /** Edge-triggered interact when the player presses E near a closed chest. */
  tryInteract(player: Player): boolean {
    if (!player.alive) return false;
    const chest = this.findNearestClosed(player.position);
    if (!chest) return false;
    if (!chest.beginOpen()) return false;
    this.grantReward(player, chest);
    return true;
  }

  update(dt: number): void {
    for (const chest of this.chests) chest.update(dt);
  }

  private findNearestClosed(pos: THREE.Vector3): TreasureChest | null {
    let best: TreasureChest | null = null;
    let bestD2 = Infinity;
    for (const chest of this.chests) {
      if (chest.opened) continue;
      if (!chest.isNear(pos)) continue;
      const dx = pos.x - chest.position.x;
      const dz = pos.z - chest.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = chest;
      }
    }
    return best;
  }

  private grantReward(player: Player, chest: TreasureChest): void {
    player.heal(CHEST_HEAL);

    const pickups: LootPickup[] = [];
    for (let i = 0; i < LOOT_COINS; i++) {
      const a = (i / LOOT_COINS) * Math.PI * 2 + 0.4;
      const r = 1.15 + (i % 2) * 0.25;
      pickups.push(
        new LootPickup(
          new THREE.Vector3(
            chest.position.x + Math.cos(a) * r,
            0,
            chest.position.z + Math.sin(a) * r,
          ),
        ),
      );
    }
    this.hooks.onLootBurst(pickups);

    // Loot toast first; XP grant may replace it with a Level Up toast.
    this.hooks.onToast(
      `Chest looted!  ·  +${CHEST_XP} XP  ·  +${LOOT_COINS} gold  ·  healed`,
      2.4,
    );
    this.hooks.onXpGranted(CHEST_XP, chest.position);
  }
}
