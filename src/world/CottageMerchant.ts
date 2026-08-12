import * as THREE from 'three';
import { Player } from '../entities/Player';

export type MerchantHudPrompt = {
  visible: boolean;
  text: string;
};

export type CottageMerchantHooks = {
  onToast: (message: string, duration?: number) => void;
  getGold: () => number;
  trySpend: (amount: number) => boolean;
  onShopChanged: (open: boolean) => void;
};

/** NW cottage center — matches MeadowBiome.addCottage(-29, 21). */
export const COTTAGE_SPOT = { x: -29, z: 21 } as const;

/**
 * Door / front stand point — SE of the cottage toward the well / meadow
 * (outside the scaled KayKit cottage collision footprint).
 */
export const MERCHANT_DOOR = { x: -25.5, z: 18.4 } as const;

const INTERACT_RADIUS = 3.8;
const INTERACT_RADIUS_SQ = INTERACT_RADIUS * INTERACT_RADIUS;
const OPEN_PROMPT = 'Press E — Cottage Merchant';
const CLOSE_PROMPT = 'Press E — Close Shop';

/** Reachable after opening a couple of chests (~3 gold each). */
export const HEALTH_POTION_COST = 6;
export const HEALTH_POTION_HEAL = 50;
export const DAMAGE_CHARM_COST = 11;
export const DAMAGE_CHARM_DURATION = 45;
export const DAMAGE_CHARM_MULT = 1.35;

/**
 * NW cottage spend-gold shop — E at the door opens a lightweight HUD panel.
 * Mirrors chest / spring proximity prompts without a shared Interactable base.
 */
export class CottageMerchant {
  private open = false;
  private readonly door = new THREE.Vector3(MERCHANT_DOOR.x, 0, MERCHANT_DOOR.z);

  constructor(private readonly hooks: CottageMerchantHooks) {}

  get isOpen(): boolean {
    return this.open;
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.door.x;
    const dz = pos.z - this.door.z;
    return dx * dx + dz * dz <= INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): MerchantHudPrompt {
    if (!player.alive) return { visible: false, text: '' };
    if (this.open) {
      return { visible: true, text: CLOSE_PROMPT };
    }
    if (!this.isNear(player.position)) return { visible: false, text: '' };
    return { visible: true, text: OPEN_PROMPT };
  }

  /** Edge-triggered interact — open shop at the door, or close if already open. */
  tryInteract(player: Player): boolean {
    if (!player.alive) return false;
    if (this.open) {
      this.close();
      return true;
    }
    if (!this.isNear(player.position)) return false;
    this.setOpen(true);
    this.hooks.onToast('Cottage Merchant  ·  spend your gold', 1.6);
    return true;
  }

  close(): void {
    if (!this.open) return;
    this.setOpen(false);
  }

  /**
   * Auto-close if the player walks away or dies while browsing.
   * Call once per frame from the game loop.
   */
  update(player: Player): void {
    if (!this.open) return;
    if (!player.alive || !this.isNear(player.position)) {
      this.close();
    }
  }

  buyHealthPotion(player: Player): boolean {
    if (!this.open || !player.alive) return false;
    if (this.hooks.getGold() < HEALTH_POTION_COST) {
      this.hooks.onToast(`Need ${HEALTH_POTION_COST} gold for a Health Potion`, 1.5);
      return false;
    }
    if (!this.hooks.trySpend(HEALTH_POTION_COST)) {
      this.hooks.onToast(`Need ${HEALTH_POTION_COST} gold for a Health Potion`, 1.5);
      return false;
    }

    const before = player.hp;
    player.heal(HEALTH_POTION_HEAL);
    const gained = Math.max(0, Math.round(player.hp - before));
    this.hooks.onToast(
      gained > 0
        ? `Bought Health Potion!  ·  −${HEALTH_POTION_COST} gold  ·  +${gained} HP`
        : `Bought Health Potion!  ·  −${HEALTH_POTION_COST} gold  ·  already full`,
      2.2,
    );
    return true;
  }

  buyDamageCharm(player: Player): boolean {
    if (!this.open || !player.alive) return false;
    if (this.hooks.getGold() < DAMAGE_CHARM_COST) {
      this.hooks.onToast(`Need ${DAMAGE_CHARM_COST} gold for a Damage Charm`, 1.5);
      return false;
    }
    if (!this.hooks.trySpend(DAMAGE_CHARM_COST)) {
      this.hooks.onToast(`Need ${DAMAGE_CHARM_COST} gold for a Damage Charm`, 1.5);
      return false;
    }

    player.applyDamageCharm(DAMAGE_CHARM_DURATION, DAMAGE_CHARM_MULT);
    this.hooks.onToast(
      `Bought Damage Charm!  ·  −${DAMAGE_CHARM_COST} gold  ·  +35% dmg ${DAMAGE_CHARM_DURATION}s`,
      2.4,
    );
    return true;
  }

  private setOpen(next: boolean): void {
    if (this.open === next) return;
    this.open = next;
    this.hooks.onShopChanged(next);
  }
}
