import * as THREE from 'three';
import { Player } from '../entities/Player';
import { HealingSpring } from '../entities/HealingSpring';
import { MeadowBiome } from './MeadowBiome';
import { NorthRuinsClearing } from '../render/stylized';

export type SpringHudPrompt = {
  visible: boolean;
  text: string;
};

export type HealingSpringHooks = {
  onToast: (message: string, duration?: number) => void;
};

/** North ruins courtyard pocket — clear of gate posts / columns / rubble / chests / shrine. */
export const SPRING_SPOT = {
  x: NorthRuinsClearing.x + 0.15,
  z: NorthRuinsClearing.z - 1.85,
} as const;

const COOLDOWN = 60;
const INTERACT_PROMPT = 'Press E — Drink from Spring';

/**
 * Places one reusable healing spring and handles E-to-drink interact + cooldown.
 * Mirrors the chest / shrine proximity-prompt pattern without a shared base.
 */
export class HealingSprings {
  readonly spring: HealingSpring;
  private readonly root = new THREE.Group();

  constructor(
    private readonly meadow: MeadowBiome,
    private readonly hooks: HealingSpringHooks,
  ) {
    this.root.name = 'HealingSprings';
    this.spring = new HealingSpring(
      new THREE.Vector3(SPRING_SPOT.x, 0, SPRING_SPOT.z),
      COOLDOWN,
    );
    this.root.add(this.spring.mesh);
    this.meadow.obstacles.push({
      x: SPRING_SPOT.x,
      z: SPRING_SPOT.z,
      radius: this.spring.obstacleRadius,
    });
    this.meadow.root.add(this.root);
  }

  getInteractPrompt(player: Player): SpringHudPrompt {
    if (!player.alive) return { visible: false, text: '' };
    if (!this.spring.isNear(player.position)) return { visible: false, text: '' };
    if (this.spring.ready) {
      return { visible: true, text: INTERACT_PROMPT };
    }
    const secs = Math.ceil(this.spring.cooldownRemaining);
    return { visible: true, text: `Healing Spring cooling… ${secs}s` };
  }

  /** Edge-triggered interact when the player presses E near a ready spring. */
  tryInteract(player: Player): boolean {
    if (!player.alive) return false;
    if (!this.spring.isNear(player.position)) return false;

    if (!this.spring.ready) {
      const secs = Math.ceil(this.spring.cooldownRemaining);
      this.hooks.onToast(`Healing Spring cooling… ${secs}s`, 1.4);
      return true; // consume E so shrine doesn't also fire if somehow overlapping
    }

    if (!this.spring.beginHeal()) return false;

    const missing = player.maxHp - player.hp;
    player.heal(player.maxHp); // full restore — clamped in Entity.heal
    const gained = Math.max(0, Math.round(missing));
    this.hooks.onToast(
      gained > 0
        ? `Healing Spring!  ·  +${gained} HP  ·  restored`
        : `Healing Spring!  ·  already full  ·  ${COOLDOWN}s rest`,
      2.2,
    );
    return true;
  }

  update(dt: number): void {
    this.spring.update(dt);
  }
}
