import * as THREE from 'three';
import { Player } from '../entities/Player';

export type VendorHudPrompt = {
  visible: boolean;
  text: string;
};

export type MarketStreetVendorHooks = {
  onToast: (message: string, duration?: number) => void;
  getGold: () => number;
  trySpend: (amount: number) => boolean;
  onShopChanged: (open: boolean) => void;
};

/**
 * NW plaza stall (awning already in MeadowBiome) — clear of fountain / street diagonal.
 * NPC stands behind the counter; interact pad is plaza-side.
 */
export const MARKET_VENDOR_STALL = { x: 48.0, z: 54.0 } as const;

/** Low-poly vendor body — slightly behind the stall counter. */
export const MARKET_VENDOR_NPC = { x: 47.45, z: 54.55 } as const;

/** Walk-up stand point in front of the stall (outside stall + NPC soft footprints). */
export const MARKET_VENDOR_STAND = { x: 48.85, z: 53.25 } as const;

const INTERACT_RADIUS = 3.5;
const INTERACT_RADIUS_SQ = INTERACT_RADIUS * INTERACT_RADIUS;
const OPEN_PROMPT = 'Press E — Street Vendor';
const CLOSE_PROMPT = 'Press E — Close Stall';

/** Cheap snack — reachable after one chest (~3 gold). */
export const STREET_BREAD_COST = 3;
export const STREET_BREAD_HEAL = 25;

/** Tiny speed nibble — second cheap stall item (all classes). */
export const STREET_NIBBLE_COST = 4;
export const STREET_NIBBLE_DURATION = 15;
export const STREET_NIBBLE_MOVE_MULT = 1.12;

/**
 * Market plaza street vendor — E opens a lightweight stall shop (distinct from NW cottage).
 * Snack heal + optional speed nibble; mirrors CottageMerchant without a shared Interactable base.
 */
export class MarketStreetVendor {
  private open = false;
  private readonly stand = new THREE.Vector3(
    MARKET_VENDOR_STAND.x,
    0,
    MARKET_VENDOR_STAND.z,
  );

  constructor(private readonly hooks: MarketStreetVendorHooks) {}

  get isOpen(): boolean {
    return this.open;
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.stand.x;
    const dz = pos.z - this.stand.z;
    return dx * dx + dz * dz <= INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): VendorHudPrompt {
    if (!player.alive) return { visible: false, text: '' };
    if (this.open) {
      return { visible: true, text: CLOSE_PROMPT };
    }
    if (!this.isNear(player.position)) return { visible: false, text: '' };
    return { visible: true, text: OPEN_PROMPT };
  }

  /** Edge-triggered interact — open stall shop, or close if already open. */
  tryInteract(player: Player): boolean {
    if (!player.alive) return false;
    if (this.open) {
      this.close();
      return true;
    }
    if (!this.isNear(player.position)) return false;
    this.setOpen(true);
    this.hooks.onToast('Street Vendor  ·  fresh snacks from the stall', 1.6);
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

  buyBread(player: Player): boolean {
    if (!this.open || !player.alive) return false;
    if (this.hooks.getGold() < STREET_BREAD_COST) {
      this.hooks.onToast(`Need ${STREET_BREAD_COST} gold for Snack Bread`, 1.5);
      return false;
    }
    if (!this.hooks.trySpend(STREET_BREAD_COST)) {
      this.hooks.onToast(`Need ${STREET_BREAD_COST} gold for Snack Bread`, 1.5);
      return false;
    }

    const before = player.hp;
    player.heal(STREET_BREAD_HEAL);
    const gained = Math.max(0, Math.round(player.hp - before));
    this.hooks.onToast(
      gained > 0
        ? `Bought Snack Bread!  ·  −${STREET_BREAD_COST} gold  ·  +${gained} HP`
        : `Bought Snack Bread!  ·  −${STREET_BREAD_COST} gold  ·  already full`,
      2.2,
    );
    return true;
  }

  buySpeedNibble(player: Player): boolean {
    if (!this.open || !player.alive) return false;
    if (this.hooks.getGold() < STREET_NIBBLE_COST) {
      this.hooks.onToast(`Need ${STREET_NIBBLE_COST} gold for Honey Nibble`, 1.5);
      return false;
    }
    if (!this.hooks.trySpend(STREET_NIBBLE_COST)) {
      this.hooks.onToast(`Need ${STREET_NIBBLE_COST} gold for Honey Nibble`, 1.5);
      return false;
    }

    player.applySpeedNibble(STREET_NIBBLE_DURATION, STREET_NIBBLE_MOVE_MULT);
    this.hooks.onToast(
      `Bought Honey Nibble!  ·  −${STREET_NIBBLE_COST} gold  ·  +12% speed ${STREET_NIBBLE_DURATION}s`,
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
