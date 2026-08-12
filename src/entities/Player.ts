import * as THREE from 'three';
import { Entity } from './Entity';
import { SkillId, SkillState, createWarriorSkills } from '../combat/Skills';
import { createToonMaterial } from '../render/stylized';
import { PlayerVisual } from './PlayerVisual';

export type PlayerAnim = 'idle' | 'move' | 'slash' | 'quake';

/**
 * Warrior player — gameplay capsule + facing/skills on the Entity root.
 * Visuals come from KayKit Knight GLTF via PlayerVisual (AnimationMixer).
 */
export class Player extends Entity {
  readonly maxSpeed = 7.8;
  readonly accel = 52;
  readonly friction = 64;
  readonly skills: Record<SkillId, SkillState>;
  facing = new THREE.Vector3(0, 0, -1);
  invuln = 0;
  /** Seconds since last combat event; regen starts after a short delay. */
  outOfCombat = 0;

  private readonly velocity = new THREE.Vector3();
  private anim: PlayerAnim = 'idle';
  private animT = 0;
  private animDur = 0;
  private readonly visual: PlayerVisual;

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

    const visual = new PlayerVisual();
    group.add(visual.root);

    super(group, 'player', 120, 0.5);
    this.visual = visual;
    this.skills = createWarriorSkills();
    this.position.set(0, 0, 6);
    this.syncMesh();
  }

  /** Begin GLTF load; safe to call once from Game boot. */
  loadVisual(): Promise<boolean> {
    return this.visual.load();
  }

  get moveSpeed(): number {
    return this.maxSpeed;
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
  }

  canUse(id: SkillId): boolean {
    return this.alive && this.skills[id].cooldownRemaining <= 0;
  }

  startCooldown(id: SkillId): void {
    const skill = this.skills[id];
    skill.cooldownRemaining = skill.def.cooldown;
  }

  markCombat(): void {
    this.outOfCombat = 0;
  }

  /** Trigger Slash swing — duration synced to ~0.4s basic CD window. */
  playSlash(): void {
    this.anim = 'slash';
    this.animT = 0;
    this.animDur = 0.38;
  }

  /** Trigger Quake stomp / impact pose. */
  playQuake(): void {
    this.anim = 'quake';
    this.animT = 0;
    this.animDur = 0.55;
  }

  faceDirection(dir: THREE.Vector3): void {
    if (dir.lengthSq() < 1e-6) return;
    this.facing.copy(dir).normalize();
    const yaw = Math.atan2(this.facing.x, this.facing.z);
    this.mesh.rotation.y = yaw;
  }

  /**
   * Accelerate toward a camera-relative wish direction; apply friction when idle.
   * Returns true if the player has meaningful horizontal velocity.
   */
  applyMovement(wishDir: THREE.Vector3, dt: number): boolean {
    // Lock locomotion facing during attack poses, but still allow small drift.
    const attacking = this.anim === 'slash' || this.anim === 'quake';
    if (wishDir.lengthSq() > 1e-6) {
      const accelScale = attacking ? 0.35 : 1;
      this.velocity.x += wishDir.x * this.accel * accelScale * dt;
      this.velocity.z += wishDir.z * this.accel * accelScale * dt;
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      const cap = attacking ? this.maxSpeed * 0.45 : this.maxSpeed;
      if (speed > cap) {
        const s = cap / speed;
        this.velocity.x *= s;
        this.velocity.z *= s;
      }
      if (!attacking) this.faceDirection(wishDir);
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

  update(dt: number): void {
    this.outOfCombat += dt;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);

    if (this.anim === 'slash' || this.anim === 'quake') {
      this.animT += dt;
      if (this.animT >= this.animDur) {
        this.anim = speed > 0.4 ? 'move' : 'idle';
        this.animT = 0;
      }
    } else {
      this.anim = speed > 0.35 ? 'move' : 'idle';
    }

    this.visual.syncAnim(this.anim, speed, this.maxSpeed, this.animT, this.animDur);
    this.visual.update(dt);

    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.visual.applyFlash(this.hitFlash, this.invuln);

    if (this.alive && this.outOfCombat > 2.4 && this.hp < this.maxHp) {
      this.heal(8 * dt);
    }
  }

  respawn(): void {
    this.alive = true;
    this.hp = this.maxHp;
    this.position.set(0, 0, 6);
    this.velocity.set(0, 0, 0);
    this.mesh.visible = true;
    this.invuln = 1.6;
    this.outOfCombat = 0;
    this.anim = 'idle';
    this.animT = 0;
    this.animDur = 0;
    this.syncMesh();
  }
}
