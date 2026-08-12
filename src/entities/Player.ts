import * as THREE from 'three';
import { Entity } from './Entity';
import { SkillId, SkillState, createWarriorSkills } from '../combat/Skills';

export class Player extends Entity {
  readonly maxSpeed = 7.8;
  readonly accel = 52;
  readonly friction = 64;
  readonly skills: Record<SkillId, SkillState>;
  facing = new THREE.Vector3(0, 0, -1);
  invuln = 0;
  /** Seconds since last combat event; regen starts after a short delay. */
  outOfCombat = 0;
  private bob = 0;
  private readonly body: THREE.Mesh;
  private readonly bodyMat: THREE.MeshLambertMaterial;
  private readonly baseColor = 0x3b7ddd;
  private readonly velocity = new THREE.Vector3();

  constructor() {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3b7ddd });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 4, 8), bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 10),
      new THREE.MeshLambertMaterial({ color: 0xffe0bd }),
    );
    head.position.y = 1.7;
    head.castShadow = true;
    group.add(head);

    const helm = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, 0.55),
      new THREE.MeshLambertMaterial({ color: 0xd4a017 }),
    );
    helm.position.y = 1.88;
    group.add(helm);

    const sword = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.9, 0.12),
      new THREE.MeshLambertMaterial({ color: 0xc0c8d0 }),
    );
    sword.position.set(0.55, 1.0, 0.1);
    sword.rotation.z = -0.35;
    group.add(sword);

    super(group, 'player', 120, 0.5);
    this.body = body;
    this.bodyMat = bodyMat;
    this.skills = createWarriorSkills();
    this.position.set(0, 0, 6);
    this.syncMesh();
  }

  get moveSpeed(): number {
    return this.maxSpeed;
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
    if (wishDir.lengthSq() > 1e-6) {
      this.velocity.x += wishDir.x * this.accel * dt;
      this.velocity.z += wishDir.z * this.accel * dt;
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (speed > this.maxSpeed) {
        const s = this.maxSpeed / speed;
        this.velocity.x *= s;
        this.velocity.z *= s;
      }
      this.faceDirection(wishDir);
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
    this.bob += dt * 8;
    this.outOfCombat += dt;

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      this.bodyMat.color.setHex(0xffffff);
    } else if (this.invuln > 0) {
      // Soft blink while i-framed after a hit / respawn
      const blink = Math.sin(this.invuln * 28) > 0;
      this.bodyMat.color.setHex(blink ? 0xa8d4ff : this.baseColor);
    } else {
      this.bodyMat.color.setHex(this.baseColor);
    }

    // subtle idle / run bob on body
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const bobAmp = 0.02 + Math.min(0.05, speed * 0.008);
    this.body.position.y = 0.9 + Math.sin(this.bob) * bobAmp;

    // Light out-of-combat regen so mistakes are recoverable without a full wipe
    if (this.alive && this.outOfCombat > 2.4 && this.hp < this.maxHp) {
      this.heal(10 * dt);
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
    this.syncMesh();
  }
}
