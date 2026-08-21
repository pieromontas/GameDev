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
 * Wooden benches on the plaza cobble around the fountain.
 * Pushed onto the outer cobble ring (~3.2 from the basin) so a walkable
 * inner loop stays open (fountain r≈1.25 + bench r≈0.38 + ~1.5 gap).
 * No SW seat — gate→market diagonal stays a clear quadrant. Clear of vendor /
 * produce / traveling cart / notice board / forge pad / inn porch / alley mouth,
 * MARKET_PLAZA_LANTERNS poles, and KayKit shop pack radii (~4.4).
 */
export const MARKET_FOUNTAIN_BENCHES = [
  { x: MARKET_FOUNTAIN_SPOT.x + 0.0, z: MARKET_FOUNTAIN_SPOT.z + 3.22 }, // N
  { x: MARKET_FOUNTAIN_SPOT.x - 3.2, z: MARKET_FOUNTAIN_SPOT.z + 0.16 }, // W
  { x: MARKET_FOUNTAIN_SPOT.x + 3.02, z: MARKET_FOUNTAIN_SPOT.z + 1.12 }, // ENE
] as const;

/** Face the plaza fountain so the seat reads from the cobble ring. */
export const MARKET_FOUNTAIN_BENCH_YAWS = [
  Math.atan2(
    MARKET_FOUNTAIN_SPOT.x - MARKET_FOUNTAIN_BENCHES[0].x,
    MARKET_FOUNTAIN_SPOT.z - MARKET_FOUNTAIN_BENCHES[0].z,
  ),
  Math.atan2(
    MARKET_FOUNTAIN_SPOT.x - MARKET_FOUNTAIN_BENCHES[1].x,
    MARKET_FOUNTAIN_SPOT.z - MARKET_FOUNTAIN_BENCHES[1].z,
  ),
  Math.atan2(
    MARKET_FOUNTAIN_SPOT.x - MARKET_FOUNTAIN_BENCHES[2].x,
    MARKET_FOUNTAIN_SPOT.z - MARKET_FOUNTAIN_BENCHES[2].z,
  ),
] as const;

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
 * Two MeshToon chickens pecking in the inn yard (south plaza rim).
 * Sit among outdoor tables / barrels on the porch/yard side — south of the
 * inn-door E pad, not on the fountain cobble loop, hitch/cart, or tailor stoop.
 * Visual-only (no E, no extra lights, no collision).
 */
export const MARKET_INN_CHICKENS = [
  { x: 48.32, z: 44.5, yaw: 0.55, dark: false },
  { x: 50.28, z: 44.55, yaw: -0.35, dark: true },
] as const;

/**
 * Short west-rim side alley off the plaza (between curtain wall + crate stacks).
 * Keep clear of KayKit shop pack radii (~4.4) and the gate→market diagonal.
 */
export const MARKET_ALLEY_SPOT = { x: 43.6, z: 52.4 } as const;

/**
 * MeshToon clothesline across the west-rim alley walk lane.
 * Midpoint sits east of the flavor board (MARKET_ALLEY_SPOT) so the cobble
 * stays open. Yaw matches the alley ribbon (−0.15); posts nestle the crate /
 * barrel flanks. Line hangs ~2.12 (walk under). Soft collision on posts only
 * (r≈0.22) — hanging cloth does not collide. Clear of produce stall, plaza
 * lanterns, vendor, baker pack, curtain wall, and fountain lanes.
 */
export const MARKET_CLOTHESLINE_SPOT = { x: 44.31, z: 52.15 } as const;
export const MARKET_CLOTHESLINE_YAW = -0.15;
export const MARKET_CLOTHESLINE_HALF = 1.08;

function clotheslinePost(along: number) {
  return {
    x: MARKET_CLOTHESLINE_SPOT.x + Math.sin(MARKET_CLOTHESLINE_YAW) * along,
    z: MARKET_CLOTHESLINE_SPOT.z + Math.cos(MARKET_CLOTHESLINE_YAW) * along,
  };
}

/** North (+along) then south (−along) posts — MeadowBiome colliders. */
export const MARKET_CLOTHESLINE_POSTS = [
  clotheslinePost(MARKET_CLOTHESLINE_HALF),
  clotheslinePost(-MARKET_CLOTHESLINE_HALF),
] as const;

/**
 * MeshToon cat loafing on a west-rim alley crate lid (clothesline area).
 * Sits on the existing north-flank crate stack at (42.9, 53.35) — lid center
 * after the stack yaw — not in the cobble walk lane. Clear of clothesline
 * posts, alley E board, produce stall, and the fountain cobble loop.
 * Visual-only (no E, no extra lights, no collision — crate collider holds).
 */
export const MARKET_ALLEY_CAT = {
  x: 42.94,
  z: 53.27,
  y: 1.005,
  yaw: 0.95,
} as const;

/**
 * Extra west-rim plaza stall (toast-only produce / cloth / trinket flavor).
 * Clear of gate→market diagonal, fountain lanes, vendor stand, alley, inn porch,
 * notice board, and KayKit shop pack radii (~4.4). Soft collision in MeadowBiome.
 */
export const MARKET_EXTRA_STALL = { x: 45.0, z: 48.5 } as const;

/** Face the plaza fountain so the awning reads from the cobble. */
export const MARKET_EXTRA_STALL_YAW = Math.atan2(
  MARKET_FOUNTAIN_SPOT.x - MARKET_EXTRA_STALL.x,
  MARKET_FOUNTAIN_SPOT.z - MARKET_EXTRA_STALL.z,
);

/**
 * Town notice / bounty board on the east plaza rim (between the SE + E stalls).
 * Clear of fountain walk lanes, vendor stand, forge pad, and shop pack radii (~4.4).
 */
export const MARKET_NOTICE_BOARD_SPOT = { x: 54.6, z: 50.8 } as const;

/** Face the plaza fountain so posted papers read from the cobble. */
export const MARKET_NOTICE_BOARD_YAW = Math.atan2(
  MARKET_FOUNTAIN_SPOT.x - MARKET_NOTICE_BOARD_SPOT.x,
  MARKET_FOUNTAIN_SPOT.z - MARKET_NOTICE_BOARD_SPOT.z,
);

/**
 * Warm street lanterns on the outer plaza rim / building flanks.
 * Poles sit off the fountain cobble loop and the gate→vendor / produce / cart /
 * inn spokes. Soft pole collision only (thin post, modest radius).
 */
export const MARKET_PLAZA_LANTERNS = [
  { x: 49.25, z: 57.05 }, // N — baker / well flank, west of forge
  { x: 43.65, z: 55.15 }, // WNW — alley / baker flank
  { x: 42.85, z: 49.35 }, // WSW — curtain / produce flank
  { x: 54.55, z: 44.75 }, // SSE — tailor / inn street flank
  { x: 57.15, z: 48.35 }, // ESE — tailor / apothecary flank
] as const;

/**
 * Parked traveling cart on the SE plaza cobble (west of the yellow SE stall,
 * east of the inn porch). Clear of gate→market diagonal, fountain walk lanes,
 * vendor / produce pads, alley, inn door, notice board, forge, plaza lanterns,
 * and KayKit shop pack radii (~4.4). Soft collision in MeadowBiome.
 */
export const MARKET_WAGON_SPOT = { x: 51.9, z: 47.5 } as const;

/** Long axis follows the cobble rim so the bed does not poke the fountain lane. */
export const MARKET_WAGON_YAW =
  Math.atan2(
    MARKET_FOUNTAIN_SPOT.x - MARKET_WAGON_SPOT.x,
    MARKET_FOUNTAIN_SPOT.z - MARKET_WAGON_SPOT.z,
  ) +
  Math.PI * 0.5;

/**
 * Hitching rail + water trough on the SE plaza cobble, street-side / west of
 * the traveling cart. Wagon local +X is cobble/south (away from the fountain);
 * local +Z is the tongue (ENE into the yellow stall). Cluster sits south of
 * the bed so fountain→inn and fountain→cart gaps stay walkable — not on the
 * inner cobble ring, not overlapping tailor door or shop pack r≈4.4.
 * Visual-only (cart E r=3.0 would swallow a hitch prompt). Soft colliders
 * in MeadowBiome (post r≈0.22, trough r≈0.32).
 */
export const MARKET_HITCHING_SPOT = { x: 51.32, z: 45.12 } as const;
export const MARKET_HITCHING_YAW = MARKET_WAGON_YAW;

/** Trough offset in hitching-group space (+X further cobble). */
export const MARKET_TROUGH_LOCAL = { x: 0.42, z: 0.12 } as const;

export const MARKET_WATER_TROUGH = {
  x:
    MARKET_HITCHING_SPOT.x +
    MARKET_TROUGH_LOCAL.x * Math.cos(MARKET_HITCHING_YAW) +
    MARKET_TROUGH_LOCAL.z * Math.sin(MARKET_HITCHING_YAW),
  z:
    MARKET_HITCHING_SPOT.z -
    MARKET_TROUGH_LOCAL.x * Math.sin(MARKET_HITCHING_YAW) +
    MARKET_TROUGH_LOCAL.z * Math.cos(MARKET_HITCHING_YAW),
} as const;

/**
 * KayKit plaza shop cottages — origins + street-facing yaws match MeadowBiome.
 * Local +Z is the plaza facade (hanging signs / flower boxes).
 */
export const MARKET_BAKERY_SPOT = { x: 44.8, z: 58.2, yaw: Math.PI * 0.78 } as const;
export const MARKET_TAILOR_SPOT = { x: 57.2, z: 43.2, yaw: -Math.PI * 0.22 } as const;
export const MARKET_APOTHECARY_SPOT = { x: 61.0, z: 53.0, yaw: -Math.PI * 0.45 } as const;

/**
 * Plaza-facing door pads. Direct local +Z from the baker hits the market well,
 * and tailor +Z hits the traveling cart, so those two pads sit on the walkable
 * stoop still toward the cobble (inside pack r≈4.4). Apothecary +Z is clear.
 */
const PLAZA_SHOP_DOOR_OFFSET = 3.05;

function plazaShopDoor(spot: { readonly x: number; readonly z: number; readonly yaw: number }) {
  return {
    x: spot.x + Math.sin(spot.yaw) * PLAZA_SHOP_DOOR_OFFSET,
    z: spot.z + Math.cos(spot.yaw) * PLAZA_SHOP_DOOR_OFFSET,
  };
}

/** East stoop beside the well — local +Z is blocked by the plaza well. */
export const MARKET_BAKERY_DOOR = { x: 47.9, z: 57.85 } as const;

/**
 * KayKit well accent between baker and plaza (MeadowBiome pack-swap).
 * Local +Z from the baker hits this well, so MARKET_BAKERY_DOOR sits on the
 * east stoop. Visual + existing well collider only — no extra props, lights,
 * or grown radius. Matches MeadowBiome.marketWellPlacement.
 */
export const MARKET_WELL_SPOT = { x: 47.8, z: 55.4 } as const;
/** North cobble stoop — local +Z overlaps the traveling cart / inn radii. */
export const MARKET_TAILOR_DOOR = { x: 55.9, z: 46.35 } as const;
export const MARKET_APOTHECARY_DOOR = plazaShopDoor(MARKET_APOTHECARY_SPOT);

/** Cheap short rest — reachable after one chest. */
export const INN_REST_COST = 3;
export const INN_REST_HEAL = 40;
export const INN_REST_COOLDOWN = 45;

/** Free plaza sip — smaller than grove herb / snack bread / inn rest. */
export const FOUNTAIN_SIP_HEAL = 10;
export const FOUNTAIN_SIP_COOLDOWN = 25;

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
 * Street vendor shop lives in MarketStreetVendor (plaza stall).
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
 * Keep E-priority after the gate guard; before street vendor / produce stall / sign
 * so the forge yard still wins on plaza-edge overlap.
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

/**
 * Small enough to cover walkable cobble around the basin (collider r≈1.25,
 * plinth r≈1.7, closest stand ≈1.75) between the benches at ~2.45 — not the
 * vendor / produce / cart / notice / inn / forge / shop / alley pads.
 */
const FOUNTAIN_INTERACT_RADIUS = 2.15;
const FOUNTAIN_INTERACT_RADIUS_SQ =
  FOUNTAIN_INTERACT_RADIUS * FOUNTAIN_INTERACT_RADIUS;
const FOUNTAIN_PROMPT = 'Press E — Drink';
const FOUNTAIN_TOAST_FLAVOR = 'Fountain  ·  cool plaza water';

/**
 * Free small sip at the plaza fountain — tiny heal + cooldown, no gold / panel.
 * Keep E-priority after plaza baker/tailor/apothecary so a stoop never reads
 * as Drink; before plaza well / street vendor / produce / cart / market sign
 * so the basin wins vs those larger radii on the inner cobble.
 */
export class MarketFountain {
  private readonly spot = new THREE.Vector3(
    MARKET_FOUNTAIN_SPOT.x,
    0,
    MARKET_FOUNTAIN_SPOT.z,
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
    const dx = pos.x - this.spot.x;
    const dz = pos.z - this.spot.z;
    return dx * dx + dz * dz <= FOUNTAIN_INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): MarketHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    if (!this.ready) {
      const secs = Math.ceil(this.cooldownRemaining);
      return { visible: true, text: `Fountain… ${secs}s` };
    }
    return { visible: true, text: FOUNTAIN_PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;

    if (!this.ready) {
      const secs = Math.ceil(this.cooldownRemaining);
      this.onToast(`Fountain… ${secs}s`, 1.4);
      return true;
    }

    if (player.hp >= player.maxHp) {
      this.onToast(`${FOUNTAIN_TOAST_FLAVOR}  ·  already quenched`, 2.0);
      return true;
    }

    const before = player.hp;
    player.heal(FOUNTAIN_SIP_HEAL);
    const gained = Math.max(0, Math.round(player.hp - before));
    this.cooldownRemain = FOUNTAIN_SIP_COOLDOWN;
    this.onToast(`${FOUNTAIN_TOAST_FLAVOR}  ·  +${gained} HP`, 2.0);
    return true;
  }

  /** Tick sip cooldown — call once per frame from the game loop. */
  update(dt: number): void {
    if (this.cooldownRemain > 0) {
      this.cooldownRemain = Math.max(0, this.cooldownRemain - dt);
    }
  }
}

/**
 * Small enough to cover the well lip walk-up (collider r≈1.24 + player 0.5
 * ≈ 1.74) without reaching MARKET_BAKERY_DOOR (2.45), fountain basin (5.44),
 * vendor stand (2.39), produce stall, or plaza lantern poles that other pads
 * do not already own.
 */
const WELL_INTERACT_RADIUS = 2.3;
const WELL_INTERACT_RADIUS_SQ = WELL_INTERACT_RADIUS * WELL_INTERACT_RADIUS;
const WELL_PROMPT = 'Press E — Well';
const WELL_TOAST = 'Town well  ·  cold stone · plaza water';

/**
 * Flavor interact at the plaza well lip — toast only (no heal / gold / panel).
 * Fountain already sips (+10 HP). Keep E-priority after plaza shops and
 * fountain so the bakery stoop still reads Bakery and the basin still reads
 * Drink; before street vendor so the well lip wins vs the vendor's larger radius.
 */
export class MarketPlazaWell {
  private readonly spot = new THREE.Vector3(MARKET_WELL_SPOT.x, 0, MARKET_WELL_SPOT.z);
  private readonly onToast: (message: string, duration?: number) => void;

  constructor(hooks: { onToast: (message: string, duration?: number) => void }) {
    this.onToast = hooks.onToast;
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.spot.x;
    const dz = pos.z - this.spot.z;
    return dx * dx + dz * dz <= WELL_INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): MarketHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    return { visible: true, text: WELL_PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;
    this.onToast(WELL_TOAST, 2.0);
    return true;
  }
}

const EXTRA_STALL_INTERACT_RADIUS = 3.2;
const EXTRA_STALL_INTERACT_RADIUS_SQ =
  EXTRA_STALL_INTERACT_RADIUS * EXTRA_STALL_INTERACT_RADIUS;
const EXTRA_STALL_PROMPT = 'Press E — Produce Stall';
const EXTRA_STALL_TOAST = 'Produce stall  ·  ripe gourds · cloth & trinkets';

/**
 * Flavor interact at the extra west-rim plaza stall — toast only (no shop panel).
 * Distinct from the NW street vendor snacks. Keep E-priority after the street
 * vendor so the snack shop still wins on overlap; before the market sign so the
 * west-rim pad wins where the sign radius overlaps the stall.
 */
export class MarketExtraStall {
  private readonly spot = new THREE.Vector3(MARKET_EXTRA_STALL.x, 0, MARKET_EXTRA_STALL.z);
  private readonly onToast: (message: string, duration?: number) => void;

  constructor(hooks: { onToast: (message: string, duration?: number) => void }) {
    this.onToast = hooks.onToast;
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.spot.x;
    const dz = pos.z - this.spot.z;
    return dx * dx + dz * dz <= EXTRA_STALL_INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): MarketHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    return { visible: true, text: EXTRA_STALL_PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;
    this.onToast(EXTRA_STALL_TOAST, 2.0);
    return true;
  }
}

const WAGON_INTERACT_RADIUS = 3.0;
const WAGON_INTERACT_RADIUS_SQ = WAGON_INTERACT_RADIUS * WAGON_INTERACT_RADIUS;
const WAGON_PROMPT = 'Press E — Traveling Cart';
const WAGON_TOAST = 'Traveling cart  ·  spices from the south road';

/**
 * Flavor interact at the parked plaza wagon — toast only (no shop panel).
 * Keep E-priority after the street vendor / produce stall so shops still win
 * on overlap; before the market sign so the cart pad wins vs the generic sign.
 */
export class MarketTravelingCart {
  private readonly spot = new THREE.Vector3(MARKET_WAGON_SPOT.x, 0, MARKET_WAGON_SPOT.z);
  private readonly onToast: (message: string, duration?: number) => void;

  constructor(hooks: { onToast: (message: string, duration?: number) => void }) {
    this.onToast = hooks.onToast;
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.spot.x;
    const dz = pos.z - this.spot.z;
    return dx * dx + dz * dz <= WAGON_INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): MarketHudPrompt {
    if (!player.alive || !this.isNear(player.position)) {
      return { visible: false, text: '' };
    }
    return { visible: true, text: WAGON_PROMPT };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive || !this.isNear(player.position)) return false;
    this.onToast(WAGON_TOAST, 2.0);
    return true;
  }
}

const PLAZA_SHOP_INTERACT_RADIUS = 3.2;
const PLAZA_SHOP_INTERACT_RADIUS_SQ =
  PLAZA_SHOP_INTERACT_RADIUS * PLAZA_SHOP_INTERACT_RADIUS;

type PlazaShopKind = 'baker' | 'tailor' | 'apothecary';

type PlazaShopDef = {
  kind: PlazaShopKind;
  spot: THREE.Vector3;
  prompt: string;
  toast: string;
};

/**
 * Flavor interact at the three signed plaza shop doors — toast only (no shop
 * panel / gold). Distinct baker / tailor / apothecary prompts.
 *
 * Door pads sit on the plaza facade (local +Z). Vendor r≈3.5 / cart r≈3.0 /
 * notice r≈3.4 overlap the stoops, so keep E-priority *before* those pads or
 * the porches read as Street Vendor / Traveling Cart / Notice Board. Shop r=3.2
 * does not reach the vendor stand, cart center, inn door, or fountain benches,
 * so those pads still win at their own stand points.
 */
export class MarketPlazaShops {
  private readonly shops: readonly PlazaShopDef[];
  private readonly onToast: (message: string, duration?: number) => void;

  constructor(hooks: { onToast: (message: string, duration?: number) => void }) {
    this.onToast = hooks.onToast;
    this.shops = [
      {
        kind: 'baker',
        spot: new THREE.Vector3(MARKET_BAKERY_DOOR.x, 0, MARKET_BAKERY_DOOR.z),
        prompt: 'Press E — Bakery',
        toast: 'Bakery  ·  warm loaves · sold out till dawn',
      },
      {
        kind: 'tailor',
        spot: new THREE.Vector3(MARKET_TAILOR_DOOR.x, 0, MARKET_TAILOR_DOOR.z),
        prompt: 'Press E — Tailor',
        toast: 'Tailor  ·  thread & patches · a cloak later',
      },
      {
        kind: 'apothecary',
        spot: new THREE.Vector3(MARKET_APOTHECARY_DOOR.x, 0, MARKET_APOTHECARY_DOOR.z),
        prompt: 'Press E — Apothecary',
        toast: 'Apothecary  ·  tonics on the shelf · no potions for sale yet',
      },
    ];
  }

  isNear(pos: THREE.Vector3): boolean {
    return this.nearestShop(pos) != null;
  }

  getInteractPrompt(player: Player): MarketHudPrompt {
    if (!player.alive) return { visible: false, text: '' };
    const shop = this.nearestShop(player.position);
    if (!shop) return { visible: false, text: '' };
    return { visible: true, text: shop.prompt };
  }

  tryInteract(player: Player): boolean {
    if (!player.alive) return false;
    const shop = this.nearestShop(player.position);
    if (!shop) return false;
    this.onToast(shop.toast, 2.0);
    return true;
  }

  /** Closest in-range door — baker / tailor / apothecary radii do not overlap. */
  private nearestShop(pos: THREE.Vector3): PlazaShopDef | null {
    let best: PlazaShopDef | null = null;
    let bestD2 = Infinity;
    for (const shop of this.shops) {
      const dx = pos.x - shop.spot.x;
      const dz = pos.z - shop.spot.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= PLAZA_SHOP_INTERACT_RADIUS_SQ && d2 < bestD2) {
        best = shop;
        bestD2 = d2;
      }
    }
    return best;
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

const NOTICE_INTERACT_RADIUS = 3.4;
const NOTICE_INTERACT_RADIUS_SQ = NOTICE_INTERACT_RADIUS * NOTICE_INTERACT_RADIUS;
const NOTICE_OPEN_PROMPT = 'Press E — Notice Board';
const NOTICE_CLOSE_PROMPT = 'Press E — Close Notices';
const NOTICE_ACCEPT_PROMPT = 'Press E — Accept Bounty';
const NOTICE_CLAIM_PROMPT = 'Press E — Claim Bounty';

/** Meadow-blob bounty kill goal (tracked after accept). */
export const NOTICE_BLOB_GOAL = 5;
/** Gold paid on bounty turn-in. */
export const NOTICE_BOUNTY_GOLD = 8;
/** XP paid on bounty turn-in. */
export const NOTICE_BOUNTY_XP = 40;

const BOUNTY_STORAGE_KEY = 'spiritvale.meadowBlobBounty';

export type NoticeBountyState = 'available' | 'active' | 'ready' | 'claimed';

export type NoticeBoardLine = {
  title: string;
  body: string;
  /** Optional Accept / Claim button on the bounty line. */
  action?: { id: 'accept' | 'claim'; label: string };
};

export type MarketNoticeBoardHooks = {
  onToast: (message: string, duration?: number) => void;
  onBoardChanged: (open: boolean, lines: NoticeBoardLine[]) => void;
  /** Grant turn-in rewards (gold + XP). */
  onBountyReward: (gold: number, xp: number) => void;
};

type StoredBounty = {
  state: NoticeBountyState;
  kills: number;
};

/**
 * Plaza notice / bounty board — E opens a HUD with notices + a real meadow-blob
 * bounty (accept → kill progress → turn in for gold/XP, once per session).
 * Keep E-priority after the street vendor so the snack stall still wins on overlap;
 * before the inn so the board wins on the east rim vs porch.
 */
export class MarketNoticeBoard {
  private open = false;
  private lastPostedKills = -1;
  private bountyState: NoticeBountyState = 'available';
  private bountyKills = 0;
  private readonly spot = new THREE.Vector3(
    MARKET_NOTICE_BOARD_SPOT.x,
    0,
    MARKET_NOTICE_BOARD_SPOT.z,
  );

  constructor(private readonly hooks: MarketNoticeBoardHooks) {
    this.loadBounty();
  }

  get isOpen(): boolean {
    return this.open;
  }

  get bountyStatus(): NoticeBountyState {
    return this.bountyState;
  }

  get bountyProgress(): number {
    return this.bountyKills;
  }

  /** Compact objective line while the bounty is active / ready (shrine takes priority). */
  getObjectiveBanner(): string | null {
    if (this.bountyState === 'active') {
      return `Bounty  ·  meadow blobs ${this.bountyKills}/${NOTICE_BLOB_GOAL}`;
    }
    if (this.bountyState === 'ready') {
      return 'Bounty ready  ·  turn in at the notice board';
    }
    return null;
  }

  isNear(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.spot.x;
    const dz = pos.z - this.spot.z;
    return dx * dx + dz * dz <= NOTICE_INTERACT_RADIUS_SQ;
  }

  getInteractPrompt(player: Player): MarketHudPrompt {
    if (!player.alive) return { visible: false, text: '' };
    if (this.open) {
      if (this.bountyState === 'available') {
        return { visible: true, text: NOTICE_ACCEPT_PROMPT };
      }
      if (this.bountyState === 'ready') {
        return { visible: true, text: NOTICE_CLAIM_PROMPT };
      }
      return { visible: true, text: NOTICE_CLOSE_PROMPT };
    }
    if (!this.isNear(player.position)) return { visible: false, text: '' };
    if (this.bountyState === 'ready') {
      return { visible: true, text: NOTICE_CLAIM_PROMPT };
    }
    return { visible: true, text: NOTICE_OPEN_PROMPT };
  }

  /**
   * Edge-triggered interact — open board, accept/claim bounty, or close.
   * Ready bounty can be claimed in one E at the board (panel optional).
   */
  tryInteract(player: Player): boolean {
    if (!player.alive) return false;
    if (this.open) {
      if (this.bountyState === 'available') {
        this.acceptBounty();
        return true;
      }
      if (this.bountyState === 'ready') {
        this.claimBounty();
        return true;
      }
      this.close();
      return true;
    }
    if (!this.isNear(player.position)) return false;
    if (this.bountyState === 'ready') {
      this.claimBounty();
      return true;
    }
    this.setOpen(true);
    this.hooks.onToast('Town board  ·  bounties & notices', 1.5);
    return true;
  }

  /** HUD Accept / Claim button — same actions as E while the panel is open. */
  tryBoardAction(actionId: 'accept' | 'claim'): boolean {
    if (actionId === 'accept' && this.bountyState === 'available') {
      this.acceptBounty();
      return true;
    }
    if (actionId === 'claim' && this.bountyState === 'ready') {
      this.claimBounty();
      return true;
    }
    return false;
  }

  close(): void {
    if (!this.open) return;
    this.setOpen(false);
  }

  /**
   * Count a meadow-blob kill toward the active bounty.
   * Call from Game.onKill when enemy.kind === 'blob'.
   */
  onBlobKilled(): void {
    if (this.bountyState !== 'active') return;
    this.bountyKills = Math.min(NOTICE_BLOB_GOAL, this.bountyKills + 1);
    if (this.bountyKills >= NOTICE_BLOB_GOAL) {
      this.bountyState = 'ready';
      this.persistBounty();
      this.hooks.onToast(
        `Bounty complete  ·  return to the notice board (${NOTICE_BLOB_GOAL}/${NOTICE_BLOB_GOAL})`,
        2.4,
      );
    } else {
      this.persistBounty();
      if (this.bountyKills === 1 || this.bountyKills === Math.ceil(NOTICE_BLOB_GOAL / 2)) {
        this.hooks.onToast(
          `Bounty  ·  meadow blobs ${this.bountyKills}/${NOTICE_BLOB_GOAL}`,
          1.2,
        );
      }
    }
    this.refreshOpenBoard();
  }

  /**
   * Auto-close if the player walks away or dies; refresh live bounty line while open.
   * Call once per frame from the game loop.
   */
  update(player: Player): void {
    if (!this.open) return;
    if (!player.alive || !this.isNear(player.position)) {
      this.close();
      return;
    }
    if (this.bountyKills !== this.lastPostedKills) {
      this.lastPostedKills = this.bountyKills;
      this.hooks.onBoardChanged(true, this.buildLines());
    }
  }

  private acceptBounty(): void {
    if (this.bountyState !== 'available') return;
    this.bountyState = 'active';
    this.bountyKills = 0;
    this.persistBounty();
    this.hooks.onToast(
      `Bounty accepted  ·  clear ${NOTICE_BLOB_GOAL} meadow blobs`,
      2.2,
    );
    this.refreshOpenBoard();
  }

  private claimBounty(): void {
    if (this.bountyState !== 'ready') return;
    this.bountyState = 'claimed';
    this.persistBounty();
    // Toast before XP grant so a level-up toast can take over if needed.
    this.hooks.onToast(
      `Bounty claimed  ·  +${NOTICE_BOUNTY_GOLD}g  ·  +${NOTICE_BOUNTY_XP} XP`,
      2.6,
    );
    this.hooks.onBountyReward(NOTICE_BOUNTY_GOLD, NOTICE_BOUNTY_XP);
    if (this.open) this.refreshOpenBoard();
  }

  private refreshOpenBoard(): void {
    if (!this.open) return;
    this.lastPostedKills = this.bountyKills;
    this.hooks.onBoardChanged(true, this.buildLines());
  }

  private setOpen(open: boolean): void {
    this.open = open;
    if (!open) {
      this.lastPostedKills = -1;
      this.hooks.onBoardChanged(false, []);
      return;
    }
    this.lastPostedKills = this.bountyKills;
    this.hooks.onBoardChanged(true, this.buildLines());
  }

  private buildLines(): NoticeBoardLine[] {
    const bountyLine = this.buildBountyLine();
    return [
      bountyLine,
      {
        title: 'Call — East Shrine',
        body: 'Defend the shrine if the meadow stirs',
      },
      {
        title: 'Town Notice',
        body: 'Townsfolk coming soon — watch this board',
      },
    ];
  }

  private buildBountyLine(): NoticeBoardLine {
    if (this.bountyState === 'available') {
      return {
        title: 'Bounty — Meadow Blobs',
        body: `Wanted: clear ${NOTICE_BLOB_GOAL} meadow blobs · reward ${NOTICE_BOUNTY_GOLD}g + ${NOTICE_BOUNTY_XP} XP`,
        action: { id: 'accept', label: 'Accept bounty' },
      };
    }
    if (this.bountyState === 'active') {
      return {
        title: 'Bounty — Meadow Blobs',
        body: `In progress  ·  ${this.bountyKills}/${NOTICE_BLOB_GOAL} blobs cleared`,
      };
    }
    if (this.bountyState === 'ready') {
      return {
        title: 'Bounty — Meadow Blobs',
        body: `Complete  ·  ${NOTICE_BLOB_GOAL}/${NOTICE_BLOB_GOAL} — press E or Claim for ${NOTICE_BOUNTY_GOLD}g + ${NOTICE_BOUNTY_XP} XP`,
        action: { id: 'claim', label: 'Claim reward' },
      };
    }
    return {
      title: 'Bounty — Meadow Blobs',
      body: 'Claimed this session  ·  road\'s quieter — thanks, traveler',
    };
  }

  private persistBounty(): void {
    try {
      const payload: StoredBounty = {
        state: this.bountyState,
        kills: this.bountyKills,
      };
      sessionStorage.setItem(BOUNTY_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* private mode / blocked storage — in-memory still works */
    }
  }

  private loadBounty(): void {
    try {
      const raw = sessionStorage.getItem(BOUNTY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<StoredBounty>;
      const state = parsed.state;
      if (
        state !== 'available' &&
        state !== 'active' &&
        state !== 'ready' &&
        state !== 'claimed'
      ) {
        return;
      }
      this.bountyState = state;
      const kills = typeof parsed.kills === 'number' ? parsed.kills : 0;
      this.bountyKills = Math.max(0, Math.min(NOTICE_BLOB_GOAL, Math.floor(kills)));
      if (this.bountyState === 'active' && this.bountyKills >= NOTICE_BLOB_GOAL) {
        this.bountyState = 'ready';
      }
      if (this.bountyState === 'ready' || this.bountyState === 'claimed') {
        this.bountyKills = NOTICE_BLOB_GOAL;
      }
    } catch {
      /* ignore corrupt storage */
    }
  }
}
