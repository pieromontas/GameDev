import * as THREE from 'three';
import { Entity } from './Entity';
import { SkillId, SkillState, createWarriorSkills } from '../combat/Skills';
import { Palette, createToonMaterial } from '../render/stylized';

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
  private readonly bodyMat: THREE.MeshToonMaterial;
  private readonly baseColor = Palette.warriorCloth;
  private readonly velocity = new THREE.Vector3();

  constructor() {
    const group = new THREE.Group();

    const cloth = createToonMaterial(Palette.warriorCloth);
    const clothDark = createToonMaterial(Palette.warriorClothDark);
    const trim = createToonMaterial(Palette.warriorTrim, {
      emissive: Palette.warriorTrim,
      emissiveIntensity: 0.08,
    });
    const skin = createToonMaterial(Palette.warriorSkin);
    const steel = createToonMaterial(Palette.warriorSteel);
    const boot = createToonMaterial(Palette.warriorBoot);

    // Torso — slightly wider capsule for a readable armored silhouette
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.72, 4, 10), cloth);
    body.position.y = 0.95;
    body.castShadow = true;
    group.add(body);

    // Shoulder pads (gold trim blocks)
    const shoulderGeo = new THREE.BoxGeometry(0.28, 0.16, 0.34);
    const leftPad = new THREE.Mesh(shoulderGeo, trim);
    leftPad.position.set(-0.42, 1.35, 0);
    leftPad.rotation.z = 0.25;
    leftPad.castShadow = true;
    const rightPad = new THREE.Mesh(shoulderGeo, trim);
    rightPad.position.set(0.42, 1.35, 0);
    rightPad.rotation.z = -0.25;
    rightPad.castShadow = true;
    group.add(leftPad, rightPad);

    // Belt / mid stripe for color blocking
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 0.5), trim);
    belt.position.y = 0.72;
    group.add(belt);

    // Boots
    const bootGeo = new THREE.BoxGeometry(0.22, 0.22, 0.28);
    const leftBoot = new THREE.Mesh(bootGeo, boot);
    leftBoot.position.set(-0.16, 0.12, 0.02);
    leftBoot.castShadow = true;
    const rightBoot = new THREE.Mesh(bootGeo, boot);
    rightBoot.position.set(0.16, 0.12, 0.02);
    rightBoot.castShadow = true;
    group.add(leftBoot, rightBoot);

    // Head + helm
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), skin);
    head.position.y = 1.72;
    head.castShadow = true;
    group.add(head);

    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.24, 0.58), trim);
    helm.position.y = 1.9;
    helm.castShadow = true;
    group.add(helm);

    // Small crest so the warrior pops from behind at distance
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.18), clothDark);
    crest.position.set(0, 2.1, -0.05);
    group.add(crest);

    // Sword: blade + gold guard + grip
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), steel);
    blade.position.set(0.58, 1.05, 0.12);
    blade.rotation.z = -0.35;
    blade.castShadow = true;
    group.add(blade);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.14), trim);
    guard.position.set(0.48, 0.62, 0.08);
    guard.rotation.z = -0.35;
    group.add(guard);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.28, 0.09), boot);
    grip.position.set(0.42, 0.42, 0.05);
    grip.rotation.z = -0.35;
    group.add(grip);

    // Small round shield on the off-hand for silhouette / color pop
    const shield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10),
      clothDark,
    );
    shield.rotation.z = Math.PI / 2;
    shield.rotation.y = 0.35;
    shield.position.set(-0.55, 1.05, 0.05);
    shield.castShadow = true;
    group.add(shield);

    const boss = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), trim);
    boss.position.set(-0.6, 1.05, 0.05);
    boss.rotation.y = Math.PI / 2 + 0.35;
    group.add(boss);

    super(group, 'player', 120, 0.5);
    this.body = body;
    this.bodyMat = cloth;
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
    this.body.position.y = 0.95 + Math.sin(this.bob) * bobAmp;

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
