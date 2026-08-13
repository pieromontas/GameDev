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
 * Warm street lanterns on the cobble plaza rim (around the fountain).
 * Clear of gate→market diagonal, fountain walk lanes, vendor stand, produce stall,
 * forge pad, inn porch, notice board, and west-rim alley. Soft pole collision only.
 */
export const MARKET_PLAZA_LANTERNS = [
  { x: 50.2, z: 55.95 }, // N rim — west of forge
  { x: 45.9, z: 53.4 }, // WNW — between alley mouth and vendor stall
  { x: 45.7, z: 50.5 }, // WSW — between produce stall and west crates
  { x: 52.85, z: 46.25 }, // SSE — east of inn porch approach
  { x: 55.65, z: 49.35 }, // ESE — between notice board and SE stall
] as const;

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
