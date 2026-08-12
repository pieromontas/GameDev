import * as THREE from 'three';
import { Entity } from './Entity';
import { SkillId, SkillState, createWarriorSkills } from '../combat/Skills';
import { createToonMaterial } from '../render/stylized';
import { PlayerVisual } from './PlayerVisual';

export type PlayerAnim = 'idle' | 'move' | 'slash' | 'quake' | 'bash';

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

    const visual = new PlayerVisual();
    group.add(visual.root);

    super(group, 'player', 120, 0.5);
    this.visual = visual;
    this.skills = createWarriorSkills();
    this.position.set(0, 0, 6);
    this.mesh.rotation.y = this.yaw;
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

  /** Trigger Shield Bash — Block_Attack clip window. */
  playBash(): void {
    this.anim = 'bash';
    this.animT = 0;
    this.animDur = 0.42;
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
    // Lock locomotion facing during attack poses, but still allow small drift.
    const attacking = this.anim === 'slash' || this.anim === 'quake' || this.anim === 'bash';
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
      if (!attacking) {
        // Prefer wishDir for responsive redirects; blend toward velocity when
        // already moving sideways so feet stay aligned with travel sooner.
        if (speed > 1.2) {
          const vx = this.velocity.x / speed;
          const vz = this.velocity.z / speed;
          // Weighted blend: mostly stick, a bit of current velocity heading.
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
    const speed = Math.hypot(this.velocity.x, this.velocity.z);

    if (this.anim === 'slash' || this.anim === 'quake' || this.anim === 'bash') {
      this.animT += dt;
      if (this.animT >= this.animDur) {
        this.anim = speed > 0.4 ? 'move' : 'idle';
        this.animT = 0;
      }
    } else {
      this.anim = speed > 0.35 ? 'move' : 'idle';
    }

    this.updateYaw(dt);

    this.visual.syncAnim(this.anim, speed, this.maxSpeed, this.animT, this.animDur);
    this.visual.update(dt);

    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.visual.applyFlash(this.hitFlash, this.invuln);

    if (this.alive && this.outOfCombat > 2.4 && this.hp < this.maxHp) {
      this.heal(8 * dt);
    }
  }

  /** Smoothly rotate mesh yaw toward target; freeze during attack poses. */
  private updateYaw(dt: number): void {
    if (this.anim === 'slash' || this.anim === 'quake' || this.anim === 'bash') {
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

    // Quicker turn on large redirects (strafe / 180°) so body catches velocity.
    const rate = abs > 1.1 ? this.turnSpeedSnap : this.turnSpeed;
    const step = rate * dt;
    if (abs <= step) this.yaw = this.targetYaw;
    else this.yaw += Math.sign(delta) * step;
    this.mesh.rotation.y = this.yaw;
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
    this.facing.set(0, 0, -1);
    this.yaw = Math.PI;
    this.targetYaw = Math.PI;
    this.mesh.rotation.y = this.yaw;
    this.syncMesh();
  }
}
