import * as THREE from 'three';
import { Player } from '../entities/Player';
import { GroveHerb } from '../entities/GroveHerb';
import { MeadowBiome } from './MeadowBiome';
import { WestMistyGrove } from '../render/stylized';

export type HerbHudPrompt = {
  visible: boolean;
  text: string;
};

export type GroveHerbHooks = {
  onToast: (message: string, duration?: number) => void;
};

/**
 * North rim of the west misty grove — clear of fairy ring, fallen trunk,
 * south chest, and the eastern dirt-path arrival.
 */
export const GROVE_HERB_SPOT = {
  x: WestMistyGrove.x - 3.2,
  z: WestMistyGrove.z + 6.8,
} as const;

/** Modest free heal — below inn rest / spring full restore; near snack bread. */
export const GROVE_HERB_HEAL = 26;
/** Short respawn so the grove stay useful without trivial spam. */
export const GROVE_HERB_COOLDOWN = 35;

const INTERACT_PROMPT = 'Press E — Pick Grove Herb';

/**
 * Places one reusable glowing herb in the west misty grove and handles
 * E-to-pick interact + respawn cooldown. Mirrors HealingSprings without sharing a base.
 */
export class GroveHerbs {
  readonly herb: GroveHerb;
  private readonly root = new THREE.Group();

  constructor(
    private readonly meadow: MeadowBiome,
    private readonly hooks: GroveHerbHooks,
  ) {
    this.root.name = 'GroveHerbs';
    this.herb = new GroveHerb(
      new THREE.Vector3(GROVE_HERB_SPOT.x, 0, GROVE_HERB_SPOT.z),
      GROVE_HERB_COOLDOWN,
    );
    this.root.add(this.herb.mesh);
    // No soft collision — tiny plant must not block the grove path.
    this.meadow.root.add(this.root);
  }

  getInteractPrompt(player: Player): HerbHudPrompt {
    if (!player.alive) return { visible: false, text: '' };
    if (!this.herb.isNear(player.position)) return { visible: false, text: '' };
    if (this.herb.ready) {
      return { visible: true, text: INTERACT_PROMPT };
    }
    const secs = Math.ceil(this.herb.cooldownRemaining);
    return { visible: true, text: `Grove herb regrowing… ${secs}s` };
  }

  /** Edge-triggered interact when the player presses E near a ready herb. */
  tryInteract(player: Player): boolean {
    if (!player.alive) return false;
    if (!this.herb.isNear(player.position)) return false;

    if (!this.herb.ready) {
      const secs = Math.ceil(this.herb.cooldownRemaining);
      this.hooks.onToast(`Grove herb regrowing… ${secs}s`, 1.4);
      return true;
    }

    if (!this.herb.beginPickup()) return false;

    const before = player.hp;
    player.heal(GROVE_HERB_HEAL);
    const gained = Math.max(0, Math.round(player.hp - before));
    this.hooks.onToast(
      gained > 0
        ? `Grove herb!  ·  +${gained} HP  ·  misty sip`
        : `Grove herb!  ·  already full  ·  regrows in ${GROVE_HERB_COOLDOWN}s`,
      2.1,
    );
    return true;
  }

  update(dt: number): void {
    this.herb.update(dt);
  }
}
