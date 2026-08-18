import * as THREE from 'three';
import { Entity } from './Entity';
import {
  CLASS_LABEL,
  PlayerClass,
  SKILL4_UNLOCK_LEVEL,
  SkillId,
  SkillState,
  createSkillsForClass,
  isSkillUnlocked,
  nextClassInCycle,
} from '../combat/Skills';
import { createToonMaterial } from '../render/stylized';
import { PLAYER_SPAWN } from '../world/spawnSafe';
import { MAGE_VISUAL, PlayerVisual, ROGUE_VISUAL, WARRIOR_VISUAL } from './PlayerVisual';

export type PlayerAnim = 'idle' | 'move' | 'slash' | 'quake' | 'bash' | 'burst' | 'dodge';

export type LevelUpResult = {
  leveled: boolean;
  levelsGained: number;
  xpGained: number;
  hpGained: number;
  damageGained: number;
};

/** Dodge roll timing — short burst + brief i-frames, shared by all classes. */
export const DODGE_DURATION = 0.38;
export const DODGE_COOLDOWN = 1.55;
export const DODGE_SPEED = 18.5;
export const DODGE_IFRAMES = 0.4;

/** XP required to advance from `level` → level+1 (Level 1 needs 20). */
export function xpToReachNext(level: number): number {
  return Math.floor(20 + (Math.max(1, level) - 1) * 12);
}

/**
 * Playable hero — gameplay capsule + facing/skills on the Entity root.
 * Visuals swap between KayKit Knight / Mage / Rogue via PlayerVisual.
 */
export class Player extends Entity {
  static readonly BASE_MAX_HP = 120;

  readonly maxSpeed = 7.8;
  readonly accel = 52;
  readonly friction = 64;
  skills: Record<SkillId, SkillState>;
  facing = new THREE.Vector3(0, 0, -1);
  invuln = 0;
  /** Seconds since last combat event; regen starts after a short delay. */
  outOfCombat = 0;
  /** Temporary shrine / charm blessing — multiplies outgoing skill damage. */
  damageBuffMult = 1;
  /** Temporary shrine blessing — multiplies move speed cap. */
  moveBuffMult = 1;
  /** Session level — persists through respawn and class swaps. */
  level = 1;
  /** Progress toward the next level. */
  xp = 0;
  /** Permanent flat damage from leveling (all class kits). */
  bonusDamage = 0;
  /** True after the Level-3 skill-unlock toast has fired once this session. */
  private skill4UnlockAnnounced = false;
  private buffRemain = 0;
  /** HUD chip label while a combat buff is active. */
  private buffLabel = 'Shrine Blessing';
  private classId: PlayerClass = 'warrior';
  /** While > 0, Leap / Shadow Leap owns horizontal position (blocks WASD drift). */
  private leapLockRemain = 0;
  /** While > 0, dodge roll owns horizontal position (blocks WASD drift). */
  private dodgeRemain = 0;
  /** Shared dodge cooldown across class swaps. */
  private dodgeCooldownRemain = 0;
  private readonly dodgeDir = new THREE.Vector3(0, 0, -1);

  private readonly velocity = new THREE.Vector3();
  private anim: PlayerAnim = 'idle';
  private animT = 0;
  private animDur = 0;
  private readonly warriorVisual: PlayerVisual;
  private readonly mageVisual: PlayerVisual;
  private readonly rogueVisual: PlayerVisual;
  private visual: PlayerVisual;

  /** Smoothed visual yaw (radians). Snapping this was the main side-strafe choppiness. */
  private yaw = Math.PI;
  private targetYaw = Math.PI;
  /** Turn rate while locomoting — fast enough to track WASD, soft enough to avoid rubber-band. */
  private readonly turnSpeed = 11;
  /** Faster catch-up when the move vector is nearly opposite the body. */
  private readonly turnSpeedSnap = 16;

  constructor() {
    const group = new THREE.Group();
    group.name = 'Player';

    // Soft contact shadow disc (kept from the procedural hero for ground readability).
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 16),
      createToonMaterial(0x1a2818, { transparent: true, opacity: 0.28 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.name = 'ContactShadow';
    group.add(shadow);

    const warriorVisual = new PlayerVisual(WARRIOR_VISUAL);
    const mageVisual = new PlayerVisual(MAGE_VISUAL);
    const rogueVisual = new PlayerVisual(ROGUE_VISUAL);
    group.add(warriorVisual.root);
    group.add(mageVisual.root);
    group.add(rogueVisual.root);

    super(group, 'player', Player.BASE_MAX_HP, 0.5);
    this.warriorVisual = warriorVisual;
    this.mageVisual = mageVisual;
    this.rogueVisual = rogueVisual;
    this.visual = warriorVisual;
    this.warriorVisual.setActive(true);
    this.mageVisual.setActive(false);
    this.rogueVisual.setActive(false);
    this.skills = createSkillsForClass('warrior');
    this.position.copy(PLAYER_SPAWN);
    this.mesh.rotation.y = this.yaw;
    this.syncMesh();
  }

  get playerClass(): PlayerClass {
    return this.classId;
  }

  get classLabel(): string {
    return CLASS_LABEL[this.classId];
  }

  /** Begin GLTF loads for all kits; safe to call once from Game boot. */
  async loadVisuals(): Promise<{ warrior: boolean; mage: boolean; rogue: boolean }> {
    const [warrior, mage, rogue] = await Promise.all([
      this.warriorVisual.load(),
      this.mageVisual.load(),
      this.rogueVisual.load(),
    ]);
    return { warrior, mage, rogue };
  }

  /** @deprecated Prefer loadVisuals — kept for call-site clarity during migration. */
  loadVisual(): Promise<boolean> {
    return this.loadVisuals().then((r) => r.warrior);
  }

  private visualForClass(cls: PlayerClass): PlayerVisual {
    if (cls === 'mage') return this.mageVisual;
    if (cls === 'rogue') return this.rogueVisual;
    return this.warriorVisual;
  }

  /**
   * Swap active class kit (model + skills). Returns false if already that class.
   * Cooldowns reset so HUD labels match a fresh kit.
   * Clears brief leap lock so a mid-leap swap never softlocks WASD.
   */
  switchClass(next: PlayerClass): boolean {
    if (next === this.classId) return false;

    this.classId = next;
    this.skills = createSkillsForClass(next);
    this.visual.setActive(false);
    this.visual = this.visualForClass(next);
    this.visual.setActive(true);

    // Drop any leftover gap-closer / mid-roll ownership from the previous kit.
    this.leapLockRemain = 0;
    this.dodgeRemain = 0;
    this.anim = 'idle';
    this.animT = 0;
    this.animDur = 0;
    return true;
  }

  /** Cycle Warrior → Mage → Rogue → Warrior… */
  toggleClass(): PlayerClass {
    this.switchClass(nextClassInCycle(this.classId));
    return this.classId;
  }

  get moveSpeed(): number {
    return this.maxSpeed * this.moveBuffMult;
  }

  get hasShrineBuff(): boolean {
    return this.buffRemain > 0;
  }

  get shrineBuffRemain(): number {
    return this.buffRemain;
  }

  /** Active combat buff chip text (shrine blessing or merchant damage charm). */
  get activeBuffLabel(): string {
    return this.buffLabel;
  }

  /** XP needed for the current level → next. */
  get xpToNext(): number {
    return xpToReachNext(this.level);
  }

  get xpRatio(): number {
    const need = this.xpToNext;
    return need <= 0 ? 0 : Math.min(1, this.xp / need);
  }

  /**
   * Grant XP from a kill. May chain multiple level-ups if the award is large.
   * Level, XP, max HP, and bonus damage persist for the session (including respawn).
   */
  gainXp(amount: number): LevelUpResult {
    const xpGained = Math.max(0, Math.round(amount));
    if (xpGained <= 0) {
      return { leveled: false, levelsGained: 0, xpGained: 0, hpGained: 0, damageGained: 0 };
    }

    this.xp += xpGained;
    let levelsGained = 0;
    let hpGained = 0;
    let damageGained = 0;

    // Soft cap so a huge burst can't softlock the HUD with endless toasts.
    while (this.xp >= this.xpToNext && levelsGained < 8) {
      this.xp -= this.xpToNext;
      const bump = this.applyLevelUp();
      levelsGained += 1;
      hpGained += bump.hp;
      damageGained += bump.damage;
    }

    return {
      leveled: levelsGained > 0,
      levelsGained,
      xpGained,
      hpGained,
      damageGained,
    };
  }

  /** Permanent +max HP and +damage; heals the HP bump so the level-up feels good. */
  private applyLevelUp(): { hp: number; damage: number } {
    this.level += 1;
    const hp = 12;
    // Alternate +1 / +2 so every other level is a bit punchier vs spitters.
    const damage = this.level % 2 === 0 ? 2 : 1;
    this.maxHp += hp;
    this.hp = Math.min(this.maxHp, this.hp + hp);
    this.bonusDamage += damage;
    return { hp, damage };
  }

  /**
   * Apply (or refresh) a shrine blessing — damage + move speed for a short window.
   * Works for all classes; stacks by refresh, not multiply-on-multiply.
   */
  applyShrineBuff(duration: number, damageMult = 1.4, moveMult = 1.22): void {
    this.buffRemain = Math.max(this.buffRemain, duration);
    this.damageBuffMult = damageMult;
    this.moveBuffMult = moveMult;
    this.buffLabel = 'Shrine Blessing';
  }

  /**
   * Merchant damage charm — outgoing skill damage for a short window (all classes).
   * Damage-only; does not grant shrine move speed.
   */
  applyDamageCharm(duration: number, damageMult = 1.35): void {
    this.buffRemain = Math.max(this.buffRemain, duration);
    this.damageBuffMult = damageMult;
    this.moveBuffMult = 1;
    this.buffLabel = 'Damage Charm';
  }

  /**
   * Residential town-chapel blessing — mild short damage buff (all classes).
   * Weaker / shorter than the east shrine wave reward; no move-speed spike.
   */
  applyTownBlessing(duration: number, damageMult = 1.15): void {
    this.buffRemain = Math.max(this.buffRemain, duration);
    this.damageBuffMult = damageMult;
    this.moveBuffMult = 1;
    this.buffLabel = 'Town Blessing';
  }

  /**
   * Market street-vendor honey nibble — tiny move-speed snack (all classes).
   * Speed-only; does not grant shrine / charm damage.
   */
  applySpeedNibble(duration: number, moveMult = 1.12): void {
    this.buffRemain = Math.max(this.buffRemain, duration);
    this.damageBuffMult = 1;
    this.moveBuffMult = moveMult;
    this.buffLabel = 'Honey Nibble';
  }

  /**
   * Royal Knight Captain's blessing — damage and move speed boost (all classes).
   */
  applyKnightValor(duration: number, damageMult = 1.25, moveMult = 1.1): void {
    this.buffRemain = Math.max(this.buffRemain, duration);
    this.damageBuffMult = damageMult;
    this.moveBuffMult = moveMult;
    this.buffLabel = "Knight's Valor";
  }

  clearShrineBuff(): void {
    this.buffRemain = 0;
    this.damageBuffMult = 1;
    this.moveBuffMult = 1;
    this.buffLabel = 'Shrine Blessing';
  }

  get animState(): PlayerAnim {
    return this.anim;
  }

  tickSkills(dt: number): void {
    for (const skill of Object.values(this.skills)) {
      if (skill.cooldownRemaining > 0) {
        skill.cooldownRemaining = Math.max(0, skill.cooldownRemaining - dt);
      }
    }
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.dodgeCooldownRemain > 0) {
      this.dodgeCooldownRemain = Math.max(0, this.dodgeCooldownRemain - dt);
    }
    if (this.buffRemain > 0) {
      this.buffRemain = Math.max(0, this.buffRemain - dt);
      if (this.buffRemain <= 0) {
        this.damageBuffMult = 1;
        this.moveBuffMult = 1;
      }
    }
  }

  canUse(id: SkillId): boolean {
    if (!this.alive || this.skills[id].cooldownRemaining > 0) return false;
    return isSkillUnlocked(id, this.level);
  }

  /** Whether the HUD should show the slot as locked (gray + Lv hint). */
  isSkillLocked(id: SkillId): boolean {
    return !isSkillUnlocked(id, this.level);
  }

  startCooldown(id: SkillId): void {
    const skill = this.skills[id];
    skill.cooldownRemaining = skill.def.cooldown;
  }

  /**
   * If Level 3 was just reached and the slot-4 toast hasn't fired, return a
   * class-specific unlock message and mark it announced.
   */
  consumeSkill4UnlockToast(): string | null {
    if (this.skill4UnlockAnnounced || this.level < SKILL4_UNLOCK_LEVEL) return null;
    this.skill4UnlockAnnounced = true;
    const name = this.skills.burst.def.name;
    return `Unlocked: ${name} (4)!`;
  }

  /** Brief locomotion lock while Leap Strike travels. */
  beginLeapLock(seconds: number): void {
    this.leapLockRemain = Math.max(this.leapLockRemain, seconds);
  }

  get isLeapLocked(): boolean {
    return this.leapLockRemain > 0;
  }

  get isDodging(): boolean {
    return this.dodgeRemain > 0;
  }

  get dodgeCooldownRemaining(): number {
    return this.dodgeCooldownRemain;
  }

  /** 1 = ready, 0 = just used (for HUD cooldown pip fill). */
  get dodgeReadyRatio(): number {
    if (this.dodgeCooldownRemain <= 0) return 1;
    return 1 - Math.min(1, this.dodgeCooldownRemain / DODGE_COOLDOWN);
  }

  /**
   * Start a short invulnerable burst in wishDir, or facing if standing still.
   * Returns false when on cooldown, mid-leap, already rolling, or dead.
   */
  tryDodge(wishDir: THREE.Vector3): boolean {
    if (!this.alive) return false;
    if (this.dodgeRemain > 0 || this.dodgeCooldownRemain > 0) return false;
    if (this.leapLockRemain > 0) return false;

    if (wishDir.lengthSq() > 1e-6) {
      this.dodgeDir.copy(wishDir).normalize();
    } else {
      this.dodgeDir.copy(this.facing);
      if (this.dodgeDir.lengthSq() < 1e-6) this.dodgeDir.set(0, 0, -1);
      else this.dodgeDir.normalize();
    }

    this.faceDirection(this.dodgeDir);
    // Snap yaw so the roll reads immediately in the burst direction.
    this.yaw = this.targetYaw;
    this.mesh.rotation.y = this.yaw;

    this.dodgeRemain = DODGE_DURATION;
    this.dodgeCooldownRemain = DODGE_COOLDOWN;
    this.invuln = Math.max(this.invuln, DODGE_IFRAMES);
    this.velocity.set(0, 0, 0);
    this.anim = 'dodge';
    this.animT = 0;
    this.animDur = DODGE_DURATION;
    return true;
  }

  markCombat(): void {
    this.outOfCombat = 0;
  }

  /** Trigger basic skill pose (Slash / Arcane Bolt / Stab). */
  playSlash(): void {
    this.anim = 'slash';
    this.animT = 0;
    this.animDur =
      this.classId === 'mage' ? 0.42 : this.classId === 'rogue' ? 0.32 : 0.38;
  }

  /** Trigger AoE pose (Quake / Frost Nova / Fan of Knives). */
  playQuake(): void {
    this.anim = 'quake';
    this.animT = 0;
    this.animDur =
      this.classId === 'mage' ? 0.62 : this.classId === 'rogue' ? 0.58 : 0.55;
  }

  /** Trigger utility pose (Shield Bash / Arcane Ward / Smoke Bomb). */
  playBash(): void {
    this.anim = 'bash';
    this.animT = 0;
    this.animDur =
      this.classId === 'mage' ? 0.5 : this.classId === 'rogue' ? 0.4 : 0.42;
  }

  /** Trigger slot-4 pose (Leap Strike / Meteor / Shadow Leap). */
  playBurst(): void {
    this.anim = 'burst';
    this.animT = 0;
    this.animDur =
      this.classId === 'mage' ? 0.72 : this.classId === 'rogue' ? 0.56 : 0.58;
  }

  /**
   * Set desired facing from a movement vector. Visual yaw lerps in `updateYaw`
   * so A/D strafes and quick redirects don't snap the skeleton.
   */
  faceDirection(dir: THREE.Vector3): void {
    if (dir.lengthSq() < 1e-6) return;
    this.facing.copy(dir).normalize();
    this.targetYaw = Math.atan2(this.facing.x, this.facing.z);
  }

  /**
   * Accelerate toward a camera-relative wish direction; apply friction when idle.
   * Returns true if the player has meaningful horizontal velocity.
   */
  applyMovement(wishDir: THREE.Vector3, dt: number): boolean {
    if (this.leapLockRemain > 0) {
      // Leap Strike owns translation this frame — don't fight the arc with WASD.
      this.velocity.set(0, 0, 0);
      return false;
    }

    if (this.dodgeRemain > 0) {
      // Dodge roll owns translation — constant burst along the roll direction.
      this.velocity.set(this.dodgeDir.x * DODGE_SPEED, 0, this.dodgeDir.z * DODGE_SPEED);
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      return true;
    }

    // Lock locomotion facing during attack poses, but still allow small drift.
    const attacking =
      this.anim === 'slash' ||
      this.anim === 'quake' ||
      this.anim === 'bash' ||
      this.anim === 'burst';
    if (wishDir.lengthSq() > 1e-6) {
      const wishMag = Math.min(1, Math.hypot(wishDir.x, wishDir.z));
      const accelScale = attacking ? 0.35 : 1;
      this.velocity.x += wishDir.x * this.accel * accelScale * dt;
      this.velocity.z += wishDir.z * this.accel * accelScale * dt;
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      const cap = (attacking ? this.moveSpeed * 0.45 : this.moveSpeed) * wishMag;
      if (speed > cap) {
        const s = cap / speed;
        this.velocity.x *= s;
        this.velocity.z *= s;
      }
      if (!attacking) {
        if (speed > 1.2) {
          const vx = this.velocity.x / speed;
          const vz = this.velocity.z / speed;
          const bx = wishDir.x * 0.72 + vx * 0.28;
          const bz = wishDir.z * 0.72 + vz * 0.28;
          this.faceTmp.set(bx, 0, bz);
          this.faceDirection(this.faceTmp);
        } else {
          this.faceDirection(wishDir);
        }
      }
    } else {
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (speed > 0) {
        const newSpeed = Math.max(0, speed - this.friction * dt);
        if (newSpeed <= 1e-4) {
          this.velocity.set(0, 0, 0);
        } else {
          const s = newSpeed / speed;
          this.velocity.x *= s;
          this.velocity.z *= s;
        }
      }
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    return this.velocity.lengthSq() > 1e-4;
  }

  private readonly faceTmp = new THREE.Vector3();

  update(dt: number): void {
    this.outOfCombat += dt;
    if (this.leapLockRemain > 0) {
      this.leapLockRemain = Math.max(0, this.leapLockRemain - dt);
    }
    if (this.dodgeRemain > 0) {
      this.dodgeRemain = Math.max(0, this.dodgeRemain - dt);
      if (this.dodgeRemain <= 0) {
        this.velocity.set(0, 0, 0);
      }
    }
    const speed = Math.hypot(this.velocity.x, this.velocity.z);

    if (
      this.anim === 'slash' ||
      this.anim === 'quake' ||
      this.anim === 'bash' ||
      this.anim === 'burst' ||
      this.anim === 'dodge'
    ) {
      this.animT += dt;
      if (this.animT >= this.animDur) {
        this.anim = speed > 0.4 ? 'move' : 'idle';
        this.animT = 0;
      }
    } else {
      this.anim = speed > 0.35 ? 'move' : 'idle';
    }

    this.updateYaw(dt);

    this.visual.syncAnim(this.anim, speed, this.moveSpeed, this.animT, this.animDur);
    this.visual.update(dt);

    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.visual.applyFlash(this.hitFlash, this.invuln);

    if (this.alive && this.outOfCombat > 2.4 && this.hp < this.maxHp) {
      this.heal(8 * dt);
    }
  }

  /** Smoothly rotate mesh yaw toward target; freeze during attack poses / dodge. */
  private updateYaw(dt: number): void {
    if (
      this.anim === 'slash' ||
      this.anim === 'quake' ||
      this.anim === 'bash' ||
      this.anim === 'burst' ||
      this.anim === 'dodge'
    ) {
      this.mesh.rotation.y = this.yaw;
      return;
    }

    let delta = this.targetYaw - this.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const abs = Math.abs(delta);
    if (abs < 1e-4) {
      this.yaw = this.targetYaw;
      this.mesh.rotation.y = this.yaw;
      return;
    }

    const rate = abs > 1.1 ? this.turnSpeedSnap : this.turnSpeed;
    const step = rate * dt;
    if (abs <= step) this.yaw = this.targetYaw;
    else this.yaw += Math.sign(delta) * step;
    this.mesh.rotation.y = this.yaw;
  }

  respawn(): void {
    this.alive = true;
    this.hp = this.maxHp;
    this.position.copy(PLAYER_SPAWN);
    this.velocity.set(0, 0, 0);
    this.mesh.visible = true;
    this.invuln = 1.6;
    this.outOfCombat = 0;
    this.dodgeRemain = 0;
    this.dodgeCooldownRemain = 0;
    // Buff persists through death — shrine blessing shouldn't soft-punish a wipe mid-meadow.
    this.anim = 'idle';
    this.animT = 0;
    this.animDur = 0;
    this.facing.set(0, 0, -1);
    this.yaw = Math.PI;
    this.targetYaw = Math.PI;
    this.mesh.rotation.y = this.yaw;
    this.syncMesh();
  }
}
