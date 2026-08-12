import * as THREE from 'three';
import { Entity } from './Entity';
import type { MobAIState } from './Mob';
import { dist2, randomPointInRing } from '../utils/math';
import { createToonMaterial } from '../render/stylized';
import { clamp01, easeOutCubic, smoothstep } from '../anim/ease';

/** Rust / bronze armored tank — clearly not a blob, spitter, or shrine stone. */
export const BRUTE_ARMOR = 0x8a5a38;
export const BRUTE_ARMOR_DARK = 0x4a3220;
export const BRUTE_BRONZE = 0xe0a040;
export const BRUTE_SKIN = 0xc08060;
export const BRUTE_VISOR = 0xff5520;

const torsoGeo = new THREE.BoxGeometry(1.15, 1.05, 0.85);
const headGeo = new THREE.BoxGeometry(0.62, 0.55, 0.58);
const helmCrestGeo = new THREE.BoxGeometry(0.12, 0.28, 0.45);
const shoulderGeo = new THREE.BoxGeometry(0.48, 0.38, 0.42);
const armGeo = new THREE.BoxGeometry(0.32, 0.72, 0.32);
const fistGeo = new THREE.BoxGeometry(0.38, 0.32, 0.38);
const legGeo = new THREE.BoxGeometry(0.36, 0.55, 0.38);
const bootGeo = new THREE.BoxGeometry(0.4, 0.22, 0.48);
const pauldronSpikeGeo = new THREE.ConeGeometry(0.12, 0.32, 5);
const beltGeo = new THREE.BoxGeometry(1.2, 0.16, 0.9);
const eyeGeo = new THREE.BoxGeometry(0.14, 0.08, 0.06);

const sharedArmorMat = createToonMaterial(BRUTE_ARMOR);
const sharedArmorDarkMat = createToonMaterial(BRUTE_ARMOR_DARK);
const sharedBronzeMat = createToonMaterial(BRUTE_BRONZE, {
  emissive: BRUTE_BRONZE,
  emissiveIntensity: 0.12,
});
const sharedSkinMat = createToonMaterial(BRUTE_SKIN);

/** Overall silhouette scale vs. procedural parts (kept out of pose squash). */
const BRUTE_VISUAL_SCALE = 1.2;

/**
 * Armored Brute — slow high-HP melee tank with a telegraphed ground slam.
 * Public surface mirrors {@link Mob} / {@link Spitter} for Game / Combat interchangeability.
 */
export class ArmoredBrute extends Entity {
  readonly kind = 'brute' as const;
  readonly moveSpeed = 1.85;
  readonly aggroRange = 11;
  readonly leashRange = 17;
  readonly attackRange = 2.35;
  /** Slam shockwave radius (world units). */
  readonly slamRadius = 3.4;
  readonly attackDamage = 16;
  readonly attackCooldown = 2.55;
    // Soft body radius used for mob-vs-mob separation.
  readonly sepRadius = 1.25;
  /** Wind-up hold when entering attack (crouch telegraph). */
  readonly windupSeconds = 0.68;

  ai: MobAIState = 'idle';
  attackTimer = 0;
  stunRemain = 0;
  slowRemain = 0;
  readonly home: THREE.Vector3;

  private respawnTimer = 0;
  private readonly bodyMat: THREE.MeshToonMaterial;
  private readonly baseColor: number;
  private readonly velocity = new THREE.Vector3();
  private readonly faceTmp = new THREE.Vector3();

  private readonly visual: THREE.Group;
  private readonly torso: THREE.Mesh;
  private readonly leftArm: THREE.Group;
  private readonly rightArm: THREE.Group;
  private readonly leftLeg: THREE.Mesh;
  private readonly rightLeg: THREE.Mesh;
  private readonly visorMat: THREE.MeshToonMaterial;
  private readonly telegraph: THREE.Mesh;
  private readonly telegraphMat: THREE.MeshBasicMaterial;
  private readonly shadow: THREE.Mesh;
  private readonly shadowMat: THREE.MeshToonMaterial;

  private walkPhase = Math.random() * Math.PI * 2;
  private hitReactT = 0;
  private deathT = -1;
  private slamT = -1;
  private windup = false;
  /** Set by tryAttack — CombatSystem consumes to apply AoE + shockwave FX. */
  private pendingSlam = false;

  constructor(spawn: THREE.Vector3, color = BRUTE_ARMOR) {
    const group = new THREE.Group();
    const visual = new THREE.Group();
    // Tall armored stance — reads bigger than blobs (0.62) and spitters (0.95).
    visual.position.y = 1.35;
    group.add(visual);

    const bodyMat = createToonMaterial(color);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.castShadow = true;
    torso.position.y = 0.15;
    visual.add(torso);

    // Chest plate + belt for armored read.
    const chestPlate = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.55, 0.2),
      sharedArmorDarkMat,
    );
    chestPlate.position.set(0, 0.22, 0.38);
    chestPlate.castShadow = true;
    visual.add(chestPlate);

    const belt = new THREE.Mesh(beltGeo, sharedBronzeMat);
    belt.position.y = -0.42;
    visual.add(belt);

    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 0.88;
    head.castShadow = true;
    visual.add(head);

    const helmCrest = new THREE.Mesh(helmCrestGeo, sharedBronzeMat);
    helmCrest.position.set(0, 1.2, -0.05);
    visual.add(helmCrest);

    const visorMat = createToonMaterial(BRUTE_VISOR, {
      emissive: BRUTE_VISOR,
      emissiveIntensity: 0.45,
    });
    const leftEye = new THREE.Mesh(eyeGeo, visorMat);
    leftEye.position.set(-0.14, 0.9, 0.3);
    const rightEye = new THREE.Mesh(eyeGeo, visorMat);
    rightEye.position.set(0.14, 0.9, 0.3);
    visual.add(leftEye, rightEye);

    // Jaw / under-helm skin peek so it doesn’t read as a pure metal box.
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.2), sharedSkinMat);
    jaw.position.set(0, 0.68, 0.28);
    visual.add(jaw);

    const leftShoulder = new THREE.Mesh(shoulderGeo, sharedArmorDarkMat);
    leftShoulder.position.set(-0.72, 0.48, 0);
    leftShoulder.castShadow = true;
    const rightShoulder = new THREE.Mesh(shoulderGeo, sharedArmorDarkMat);
    rightShoulder.position.set(0.72, 0.48, 0);
    rightShoulder.castShadow = true;
    visual.add(leftShoulder, rightShoulder);

    const leftSpike = new THREE.Mesh(pauldronSpikeGeo, sharedBronzeMat);
    leftSpike.position.set(-0.78, 0.72, 0);
    leftSpike.rotation.z = 0.35;
    const rightSpike = new THREE.Mesh(pauldronSpikeGeo, sharedBronzeMat);
    rightSpike.position.set(0.78, 0.72, 0);
    rightSpike.rotation.z = -0.35;
    visual.add(leftSpike, rightSpike);

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.78, 0.15, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, bodyMat);
    leftArmMesh.position.y = -0.2;
    leftArmMesh.castShadow = true;
    const leftFist = new THREE.Mesh(fistGeo, sharedArmorDarkMat);
    leftFist.position.y = -0.62;
    leftFist.castShadow = true;
    leftArm.add(leftArmMesh, leftFist);
    visual.add(leftArm);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.78, 0.15, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, bodyMat);
    rightArmMesh.position.y = -0.2;
    rightArmMesh.castShadow = true;
    const rightFist = new THREE.Mesh(fistGeo, sharedArmorDarkMat);
    rightFist.position.y = -0.62;
    rightFist.castShadow = true;
    rightArm.add(rightArmMesh, rightFist);
    visual.add(rightArm);

    const leftLeg = new THREE.Mesh(legGeo, sharedArmorMat);
    leftLeg.position.set(-0.28, -0.78, 0);
    leftLeg.castShadow = true;
    const rightLeg = new THREE.Mesh(legGeo, sharedArmorMat);
    rightLeg.position.set(0.28, -0.78, 0);
    rightLeg.castShadow = true;
    visual.add(leftLeg, rightLeg);

    const leftBoot = new THREE.Mesh(bootGeo, sharedArmorDarkMat);
    leftBoot.position.set(-0.28, -1.12, 0.06);
    const rightBoot = new THREE.Mesh(bootGeo, sharedArmorDarkMat);
    rightBoot.position.set(0.28, -1.12, 0.06);
    visual.add(leftBoot, rightBoot);

    // Ground slam telegraph — hidden until wind-up.
    const telegraphMat = new THREE.MeshBasicMaterial({
      color: 0xff5522,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const telegraph = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40), telegraphMat);
    telegraph.rotation.x = -Math.PI / 2;
    telegraph.position.y = 0.06;
    telegraph.visible = false;
    telegraph.renderOrder = 3;
    group.add(telegraph);

    const shadowMat = createToonMaterial(0x1a2818, { transparent: true, opacity: 0.34 });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.15, 18), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    // High HP tank — more durable than blobs (40) / spitters (34).
    super(group, 'enemy', 110, 1.05, spawn);
    this.home = spawn.clone();
    this.bodyMat = bodyMat;
    this.baseColor = color;
    this.visual = visual;
    this.torso = torso;
    this.leftArm = leftArm;
    this.rightArm = rightArm;
    this.leftLeg = leftLeg;
    this.rightLeg = rightLeg;
    this.visorMat = visorMat;
    this.telegraph = telegraph;
    this.telegraphMat = telegraphMat;
    this.shadow = shadow;
    this.shadowMat = shadowMat;
    this.syncMesh();
  }

  update(dt: number): void {
    if (this.deathT >= 0) {
      this.deathT += dt;
      this.applyDeathAnim(this.deathT / 0.7);
      if (this.deathT >= 0.7) {
        this.deathT = -1;
        this.mesh.visible = false;
      }
      this.respawnTimer -= dt;
      return;
    }

    if (!this.alive) {
      this.respawnTimer -= dt;
      return;
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const flash = Math.min(1, this.hitFlash / 0.1);
      this.bodyMat.color.setHex(0xffffff);
      this.bodyMat.emissive.setHex(0xffd090);
      this.bodyMat.emissiveIntensity = 0.35 + flash * 0.85;
    } else if (this.windup && this.ai === 'attack' && this.attackTimer > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(this.attackTimer * 22);
      this.bodyMat.color.setHex(this.baseColor);
      this.bodyMat.color.offsetHSL(0.02, 0.08, 0.06 + pulse * 0.08);
      this.bodyMat.emissive.setHex(0xff5520);
      this.bodyMat.emissiveIntensity = 0.2 + pulse * 0.4;
      this.visorMat.emissiveIntensity = 0.55 + pulse * 0.7;
    } else if (this.slowRemain > 0) {
      this.bodyMat.color.setHex(this.baseColor);
      this.bodyMat.color.lerp(new THREE.Color(0x8ad8ff), 0.45);
      this.bodyMat.emissive.setHex(0x3aa8e8);
      this.bodyMat.emissiveIntensity = 0.2;
      this.visorMat.emissiveIntensity = 0.35;
    } else {
      this.bodyMat.color.setHex(this.baseColor);
      this.bodyMat.emissive.setHex(0x000000);
      this.bodyMat.emissiveIntensity = 0;
      this.visorMat.emissiveIntensity = 0.45;
    }

    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (this.stunRemain > 0) this.stunRemain = Math.max(0, this.stunRemain - dt);
    if (this.slowRemain > 0) this.slowRemain = Math.max(0, this.slowRemain - dt);
    if (this.hitReactT > 0) this.hitReactT = Math.max(0, this.hitReactT - dt);
    if (this.slamT >= 0) {
      this.slamT += dt;
      if (this.slamT >= 0.4) this.slamT = -1;
    }

    const moving = this.stunRemain <= 0 && (this.ai === 'chase' || this.ai === 'leash');
    this.walkPhase += dt * (moving ? 6.2 : this.ai === 'idle' || this.stunRemain > 0 ? 2.8 : 2.2);
    this.applyLivePose();
  }

  get isStunned(): boolean {
    return this.stunRemain > 0;
  }

  get isSlowed(): boolean {
    return this.slowRemain > 0;
  }

  applyKnockback(dx: number, dz: number, dist: number, stunSeconds = 0.85): void {
    if (!this.alive) return;
    const len = Math.hypot(dx, dz);
    // Heavier tank — knockback still applies but travels a bit less.
    const effective = dist * 0.72;
    if (len > 1e-4 && effective > 0) {
      this.position.x += (dx / len) * effective;
      this.position.z += (dz / len) * effective;
    }
    this.stunRemain = Math.max(this.stunRemain, stunSeconds);
    this.windup = false;
    this.slamT = -1;
    this.pendingSlam = false;
    this.hideTelegraph();
    this.attackTimer = Math.max(this.attackTimer, stunSeconds);
    this.hitReactT = Math.max(this.hitReactT, 0.32);
    this.syncMesh();
  }

  applySlow(seconds = 2.4): void {
    if (!this.alive) return;
    this.slowRemain = Math.max(this.slowRemain, seconds);
    this.hitReactT = Math.max(this.hitReactT, 0.18);
  }

  think(playerPos: THREE.Vector3, playerAlive: boolean): void {
    if (!this.alive) {
      this.ai = 'dead';
      return;
    }
    if (!playerAlive) {
      this.ai = 'idle';
      this.windup = false;
      this.hideTelegraph();
      return;
    }
    if (this.stunRemain > 0) {
      this.ai = 'idle';
      this.windup = false;
      this.hideTelegraph();
      return;
    }

    const homeD2 = dist2(this.position.x, this.position.z, this.home.x, this.home.z);
    if (homeD2 > this.leashRange * this.leashRange) {
      this.ai = 'leash';
      this.windup = false;
      this.hideTelegraph();
      return;
    }

    const prev = this.ai;
    const d2 = dist2(this.position.x, this.position.z, playerPos.x, playerPos.z);
    if (d2 <= this.attackRange * this.attackRange) {
      this.ai = 'attack';
      if (prev === 'chase' || prev === 'idle') {
        this.attackTimer = Math.max(this.attackTimer, this.windupSeconds);
        this.windup = true;
      }
      this.faceTmp.set(playerPos.x - this.position.x, 0, playerPos.z - this.position.z);
      if (this.faceTmp.lengthSq() > 1e-4) {
        this.mesh.rotation.y = Math.atan2(this.faceTmp.x, this.faceTmp.z);
      }
    } else if (d2 <= this.aggroRange * this.aggroRange) {
      this.ai = 'chase';
      this.windup = false;
      this.hideTelegraph();
    } else if (this.ai === 'chase' || this.ai === 'attack') {
      const deaggro = this.aggroRange + 2.5;
      this.ai = d2 > deaggro * deaggro ? 'idle' : 'chase';
      this.windup = false;
      this.hideTelegraph();
    } else {
      this.ai = 'idle';
      this.windup = false;
      this.hideTelegraph();
    }
  }

  moveToward(target: THREE.Vector3, dt: number, clampFn: (p: THREE.Vector3) => void): void {
    this.velocity.set(target.x - this.position.x, 0, target.z - this.position.z);
    if (this.velocity.lengthSq() < 1e-4) return;
    const speedMul = this.slowRemain > 0 ? 0.42 : 1;
    this.velocity.normalize().multiplyScalar(this.moveSpeed * speedMul * dt);
    this.position.add(this.velocity);
    clampFn(this.position);
    this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
    this.syncMesh();
  }

  tryAttack(): boolean {
    if (this.ai !== 'attack' || this.attackTimer > 0 || !this.alive || this.stunRemain > 0) {
      return false;
    }
    this.attackTimer = this.attackCooldown;
    this.windup = false;
    this.slamT = 0;
    this.pendingSlam = true;
    this.hideTelegraph();
    return true;
  }

  /** Consume a pending ground-slam request. */
  consumeSlamRequest(): boolean {
    if (!this.pendingSlam) return false;
    this.pendingSlam = false;
    return true;
  }

  playHitReact(): void {
    if (!this.alive) return;
    this.hitReactT = 0.32;
  }

  beginRespawn(delay = 4): void {
    this.respawnTimer = delay;
  }

  readyToRespawn(): boolean {
    return !this.alive && this.respawnTimer <= 0 && this.deathT < 0;
  }

  respawnNearHome(): void {
    const p = randomPointInRing(this.home, 0.6, 2.8);
    this.position.copy(p);
    this.hp = this.maxHp;
    this.alive = true;
    this.ai = 'idle';
    this.attackTimer = 0.85;
    this.stunRemain = 0;
    this.slowRemain = 0;
    this.hitReactT = 0;
    this.slamT = -1;
    this.deathT = -1;
    this.windup = false;
    this.pendingSlam = false;
    this.hideTelegraph();
    this.mesh.visible = true;
    this.mesh.scale.set(1, 1, 1);
    this.visual.scale.set(BRUTE_VISUAL_SCALE, BRUTE_VISUAL_SCALE, BRUTE_VISUAL_SCALE);
    this.visual.position.set(0, 1.35, 0);
    this.visual.rotation.z = 0;
    this.bodyMat.transparent = false;
    this.bodyMat.opacity = 1;
    this.bodyMat.color.setHex(this.baseColor);
    this.bodyMat.emissive.setHex(0x000000);
    this.bodyMat.emissiveIntensity = 0;
    this.visorMat.emissiveIntensity = 0.45;
    this.syncMesh();
  }

  protected override onDeath(): void {
    this.ai = 'dead';
    this.deathT = 0;
    this.windup = false;
    this.slamT = -1;
    this.pendingSlam = false;
    this.hideTelegraph();
    // Slightly longer reform so tank kills feel weighty.
    this.beginRespawn(7.5);
  }

  private hideTelegraph(): void {
    this.telegraph.visible = false;
    this.telegraphMat.opacity = 0;
  }

  private applyLivePose(): void {
    const moving = this.ai === 'chase' || this.ai === 'leash';

    let hop = 0;
    let squashY = 1;
    let squashX = 1;

    if (this.stunRemain > 0) {
      const wobble = Math.sin(this.stunRemain * 14);
      hop = 0.015;
      squashY = 0.9 + wobble * 0.03;
      squashX = 1.1 - wobble * 0.04;
      this.visual.scale.set(
        squashX * BRUTE_VISUAL_SCALE,
        squashY * BRUTE_VISUAL_SCALE,
        squashX * BRUTE_VISUAL_SCALE,
      );
      this.visual.position.set(wobble * 0.05, 1.35 * squashY + hop, 0);
      this.leftArm.rotation.x = 0.35;
      this.rightArm.rotation.x = 0.35;
      this.shadow.scale.setScalar(Math.max(0.55, 1.05 * squashX));
      this.shadowMat.opacity = 0.3;
      this.hideTelegraph();
      return;
    }

    if (moving) {
      const s = Math.sin(this.walkPhase);
      hop = Math.max(0, s) * 0.08;
      squashY = 1 + s * 0.04;
      squashX = 1 - s * 0.03;
      this.leftLeg.rotation.x = s * 0.45;
      this.rightLeg.rotation.x = -s * 0.45;
      this.leftArm.rotation.x = -s * 0.35;
      this.rightArm.rotation.x = s * 0.35;
    } else if (this.ai === 'idle') {
      const s = Math.sin(this.walkPhase);
      hop = Math.abs(s) * 0.025;
      squashY = 1 + s * 0.03;
      squashX = 1 - s * 0.02;
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.leftArm.rotation.x = 0.08;
      this.rightArm.rotation.x = 0.08;
    } else {
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
    }

    if (this.windup && this.ai === 'attack' && this.attackTimer > 0) {
      // Deep crouch telegraph — arms raise, body compresses, slam ring grows.
      const w = clamp01(this.attackTimer / this.windupSeconds);
      const pulse = 0.5 + 0.5 * Math.sin((1 - w) * Math.PI * 5);
      squashY = 0.62 + w * 0.12 - pulse * 0.03;
      squashX = 1.28 - w * 0.1 + pulse * 0.04;
      hop = 0.01;
      this.leftArm.rotation.x = -1.55 + w * 0.2;
      this.rightArm.rotation.x = -1.55 + w * 0.2;
      this.leftLeg.rotation.x = 0.25;
      this.rightLeg.rotation.x = 0.25;

      const progress = 1 - w;
      this.telegraph.visible = true;
      const ringScale = (this.slamRadius / 1.15) * (0.35 + progress * 0.65);
      this.telegraph.scale.setScalar(ringScale);
      this.telegraphMat.opacity = 0.22 + progress * 0.45 + pulse * 0.12;
    } else if (this.slamT >= 0) {
      // Impact: arms smash down, body expands into the shockwave.
      const t = clamp01(this.slamT / 0.4);
      const thrust = Math.sin(Math.min(1, t / 0.35) * Math.PI);
      squashY = 0.72 + thrust * 0.45;
      squashX = 1.35 - thrust * 0.4;
      hop = 0.06 * (1 - t);
      this.leftArm.rotation.x = -0.2 + thrust * 1.4;
      this.rightArm.rotation.x = -0.2 + thrust * 1.4;
      this.hideTelegraph();
    } else {
      this.hideTelegraph();
    }

    if (this.hitReactT > 0) {
      const t = this.hitReactT / 0.32;
      const k = Math.sin(t * Math.PI);
      squashY *= 0.72 + 0.28 * (1 - k);
      squashX *= 1.28 - 0.28 * (1 - k);
      hop *= 0.25;
    }

    this.visual.scale.set(
      squashX * BRUTE_VISUAL_SCALE,
      squashY * BRUTE_VISUAL_SCALE,
      squashX * BRUTE_VISUAL_SCALE,
    );
    this.visual.position.set(0, 1.35 * squashY + hop, 0);
    this.torso.rotation.x = this.windup ? 0.18 : 0;

    const shadowScale = Math.max(0.55, 1.15 * squashX - hop * 0.4);
    this.shadow.scale.setScalar(shadowScale);
    this.shadowMat.opacity = 0.26 + (1 - Math.min(1, hop * 3)) * 0.1;
  }

  private applyDeathAnim(t: number): void {
    const u = clamp01(t);
    if (u < 0.4) {
      const k = smoothstep(u / 0.4);
      this.visual.scale.set(
        (1 + k * 0.35) * BRUTE_VISUAL_SCALE,
        (1 - k * 0.55) * BRUTE_VISUAL_SCALE,
        (1 + k * 0.35) * BRUTE_VISUAL_SCALE,
      );
      this.visual.position.y = 1.35 * (1 - k * 0.55);
      this.visual.rotation.z = k * 0.35;
    } else {
      const k = easeOutCubic((u - 0.4) / 0.6);
      const s = Math.max(0.01, 1.25 * (1 - k));
      this.visual.scale.set(
        s * 1.15 * BRUTE_VISUAL_SCALE,
        s * 0.35 * BRUTE_VISUAL_SCALE,
        s * 1.15 * BRUTE_VISUAL_SCALE,
      );
      this.visual.position.y = 0.18 * (1 - k);
      this.visual.rotation.z = 0.35 + k * 0.4;
      this.bodyMat.transparent = true;
      this.bodyMat.opacity = 1 - k;
    }
    this.shadow.scale.setScalar(Math.max(0.08, 1.2 * (1 - u)));
    this.shadowMat.opacity = 0.34 * (1 - u);
    this.hideTelegraph();
  }
}

/**
 * Starter brutes — east shrine + west grove only (never the starter meadow).
 * One per clearing keeps them memorable without flooding combat.
 */
export function createStarterBrutes(): ArmoredBrute[] {
  const spots = [
    // East shrine clearing — south-east of the crystal, clear of the tower
    new THREE.Vector3(46, 0, 8),
    // West misty grove — near the fallen tree approach
    new THREE.Vector3(-41, 0, 0),
  ];
  return spots.map((p) => new ArmoredBrute(p));
}
