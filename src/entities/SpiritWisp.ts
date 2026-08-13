import * as THREE from 'three';
import { Entity } from './Entity';
import type { MobAIState } from './Mob';
import {
  clampEnemyCollisionRadius,
  clampEnemyRootScale,
  clampEnemyVisualScale,
} from './enemyScale';
import { dist2, randomPointInRing } from '../utils/math';
import { createToonMaterial } from '../render/stylized';
import { clamp01, easeOutCubic, smoothstep } from '../anim/ease';
import { isInsideSpawnSafe, pushOutOfSpawnSafe } from '../world/spawnSafe';

/** Soft cyan-violet spirit — glowing orb, distinct from blobs / spitters / brutes. */
export const WISP_CORE = 0xa8e8ff;
export const WISP_GLOW = 0x7ad0ff;
export const WISP_PETAL = 0xc8a8ff;
export const WISP_TRAIL = 0x88c8ff;

const coreGeo = new THREE.SphereGeometry(0.28, 12, 10);
const haloGeo = new THREE.SphereGeometry(0.42, 12, 10);
const petalGeo = new THREE.SphereGeometry(0.12, 8, 6);
const trailGeo = new THREE.SphereGeometry(0.1, 6, 6);
const eyeGeo = new THREE.SphereGeometry(0.055, 6, 6);

const sharedPetalMat = createToonMaterial(WISP_PETAL, {
  emissive: WISP_PETAL,
  emissiveIntensity: 0.55,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
});
const sharedTrailMat = createToonMaterial(WISP_TRAIL, {
  emissive: WISP_TRAIL,
  emissiveIntensity: 0.7,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});
const sharedEyeMat = createToonMaterial(0x1a2840, {
  emissive: 0x204060,
  emissiveIntensity: 0.2,
});

/** Hover height of the visual center above ground. */
const HOVER_Y = 1.15;

/**
 * Spirit Wisp — small floating hostile: drifts toward the player and zaps
 * at short range (telegraphed flash → small damage). Not a spit projectile
 * and not a slam. Public surface mirrors {@link Mob} / {@link Spitter}.
 */
export class SpiritWisp extends Entity {
  readonly kind = 'wisp' as const;
  /** Faster than blobs — annoying / mobile. */
  readonly moveSpeed = 4.35;
  readonly aggroRange = 11.5;
  readonly leashRange = 16.5;
  /** Short-range zap reach. */
  readonly attackRange = 2.9;
  readonly attackDamage = 6;
  readonly attackCooldown = 1.7;
  readonly sepRadius = 0.55;
  /** Wind-up hold when entering zap range (flash telegraph). */
  readonly windupSeconds = 0.38;

  ai: MobAIState = 'idle';
  attackTimer = 0;
  stunRemain = 0;
  slowRemain = 0;
  readonly home: THREE.Vector3;

  private respawnTimer = 0;
  private readonly bodyMat: THREE.MeshToonMaterial;
  private readonly haloMat: THREE.MeshToonMaterial;
  private readonly baseColor: number;
  private readonly velocity = new THREE.Vector3();
  private readonly faceTmp = new THREE.Vector3();

  private readonly visual: THREE.Group;
  private readonly petals: THREE.Mesh[];
  private readonly trails: THREE.Mesh[];
  private readonly telegraph: THREE.Mesh;
  private readonly telegraphMat: THREE.MeshBasicMaterial;
  private readonly shadow: THREE.Mesh;
  private readonly shadowMat: THREE.MeshToonMaterial;

  private hoverPhase = Math.random() * Math.PI * 2;
  private hitReactT = 0;
  private deathT = -1;
  private zapT = -1;
  private windup = false;
  /** Set by tryAttack — CombatSystem consumes to apply zap damage + FX. */
  private pendingZap = false;

  constructor(spawn: THREE.Vector3, color = WISP_CORE) {
    const group = new THREE.Group();
    const visual = new THREE.Group();
    visual.position.y = HOVER_Y;
    group.add(visual);

    const bodyMat = createToonMaterial(color, {
      emissive: WISP_GLOW,
      emissiveIntensity: 0.65,
    });
    const core = new THREE.Mesh(coreGeo, bodyMat);
    core.castShadow = true;
    visual.add(core);

    // Soft outer halo — reads as glow at dusk fog.
    const haloMat = createToonMaterial(WISP_GLOW, {
      emissive: WISP_GLOW,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    visual.add(halo);

    // Orbiting petals / wisps for silhouette readability from isometric camera.
    const petals: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const petal = new THREE.Mesh(petalGeo, sharedPetalMat);
      const ang = (i / 5) * Math.PI * 2;
      petal.position.set(Math.cos(ang) * 0.38, Math.sin(ang * 1.3) * 0.12, Math.sin(ang) * 0.38);
      petal.scale.set(0.85, 1.2, 0.7);
      visual.add(petal);
      petals.push(petal);
    }

    // Soft trailing orbs behind the core (local -Z).
    const trails: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const trail = new THREE.Mesh(trailGeo, sharedTrailMat);
      trail.position.set(0, -0.05 - i * 0.08, -0.28 - i * 0.22);
      const s = 0.9 - i * 0.22;
      trail.scale.setScalar(s);
      visual.add(trail);
      trails.push(trail);
    }

    // Tiny eyes so it reads as a creature, not a particle.
    const leftEye = new THREE.Mesh(eyeGeo, sharedEyeMat);
    leftEye.position.set(-0.1, 0.06, 0.22);
    const rightEye = new THREE.Mesh(eyeGeo, sharedEyeMat);
    rightEye.position.set(0.1, 0.06, 0.22);
    visual.add(leftEye, rightEye);

    // Zap telegraph ring — hidden until wind-up.
    const telegraphMat = new THREE.MeshBasicMaterial({
      color: 0xb8f0ff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const telegraph = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.85, 32), telegraphMat);
    telegraph.rotation.x = -Math.PI / 2;
    telegraph.position.y = 0.06;
    telegraph.visible = false;
    telegraph.renderOrder = 3;
    group.add(telegraph);

    const shadowMat = createToonMaterial(0x1a2830, { transparent: true, opacity: 0.22 });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 14), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    // Fragile — lower HP than blobs (40) / spitters (34); far below brutes (110).
    super(group, 'enemy', 28, clampEnemyCollisionRadius(0.45), spawn);
    this.home = spawn.clone();
    this.bodyMat = bodyMat;
    this.haloMat = haloMat;
    this.baseColor = color;
    this.visual = visual;
    this.petals = petals;
    this.trails = trails;
    this.telegraph = telegraph;
    this.telegraphMat = telegraphMat;
    this.shadow = shadow;
    this.shadowMat = shadowMat;
    this.mesh.scale.set(1, 1, 1);
    this.visual.scale.set(1, 1, 1);
    clampEnemyRootScale(this.mesh);
    clampEnemyVisualScale(this.visual);
    this.syncMesh();
  }

  update(dt: number): void {
    if (this.deathT >= 0) {
      this.deathT += dt;
      this.applyDeathAnim(this.deathT / 0.5);
      clampEnemyRootScale(this.mesh);
      clampEnemyVisualScale(this.visual);
      if (this.deathT >= 0.5) {
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
      this.bodyMat.emissive.setHex(0xe8ffff);
      this.bodyMat.emissiveIntensity = 0.7 + flash * 1.1;
      this.haloMat.emissiveIntensity = 1.0 + flash * 0.8;
    } else if (this.windup && this.ai === 'attack' && this.attackTimer > 0) {
      // Zap telegraph — bright cyan flash pulse.
      const pulse = 0.5 + 0.5 * Math.sin(this.attackTimer * 32);
      this.bodyMat.color.setHex(this.baseColor);
      this.bodyMat.color.offsetHSL(0, 0.05, 0.1 + pulse * 0.15);
      this.bodyMat.emissive.setHex(0xd0ffff);
      this.bodyMat.emissiveIntensity = 0.9 + pulse * 0.95;
      this.haloMat.emissiveIntensity = 1.1 + pulse * 0.7;
      this.haloMat.opacity = 0.5 + pulse * 0.35;
    } else if (this.slowRemain > 0) {
      this.bodyMat.color.setHex(this.baseColor);
      this.bodyMat.color.lerp(new THREE.Color(0x8ad8ff), 0.4);
      this.bodyMat.emissive.setHex(0x3aa8e8);
      this.bodyMat.emissiveIntensity = 0.45;
      this.haloMat.emissiveIntensity = 0.55;
    } else {
      this.bodyMat.color.setHex(this.baseColor);
      this.bodyMat.emissive.setHex(WISP_GLOW);
      // Gentle idle glow so it pops through dusk fog.
      const idleGlow = 0.55 + 0.2 * Math.sin(this.hoverPhase * 1.4);
      this.bodyMat.emissiveIntensity = idleGlow;
      this.haloMat.emissiveIntensity = 0.75 + idleGlow * 0.2;
      this.haloMat.opacity = 0.42;
    }

    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (this.stunRemain > 0) this.stunRemain = Math.max(0, this.stunRemain - dt);
    if (this.slowRemain > 0) this.slowRemain = Math.max(0, this.slowRemain - dt);
    if (this.hitReactT > 0) this.hitReactT = Math.max(0, this.hitReactT - dt);
    if (this.zapT >= 0) {
      this.zapT += dt;
      if (this.zapT >= 0.28) this.zapT = -1;
    }

    const moving = this.stunRemain <= 0 && (this.ai === 'chase' || this.ai === 'leash');
    this.hoverPhase += dt * (moving ? 7.5 : this.ai === 'idle' || this.stunRemain > 0 ? 3.8 : 2.8);
    this.applyLivePose();
    clampEnemyRootScale(this.mesh);
    clampEnemyVisualScale(this.visual);
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
    // Light body — knockback travels a bit farther than blobs.
    const effective = dist * 1.12;
    if (len > 1e-4 && effective > 0) {
      this.position.x += (dx / len) * effective;
      this.position.z += (dz / len) * effective;
    }
    this.stunRemain = Math.max(this.stunRemain, stunSeconds);
    this.windup = false;
    this.zapT = -1;
    this.pendingZap = false;
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
    this.zapT = 0;
    this.pendingZap = true;
    this.hideTelegraph();
    return true;
  }

  /** Consume a pending short-range zap request. */
  consumeZapRequest(): boolean {
    if (!this.pendingZap) return false;
    this.pendingZap = false;
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
    const p = randomPointInRing(this.home, 0.5, 2.8);
    this.position.copy(p);
    if (isInsideSpawnSafe(this.position.x, this.position.z)) {
      pushOutOfSpawnSafe(this.position);
    }
    this.hp = this.maxHp;
    this.alive = true;
    this.ai = 'idle';
    this.attackTimer = 0.6;
    this.stunRemain = 0;
    this.slowRemain = 0;
    this.hitReactT = 0;
    this.zapT = -1;
    this.deathT = -1;
    this.windup = false;
    this.pendingZap = false;
    this.hideTelegraph();
    this.mesh.visible = true;
    this.mesh.scale.set(1, 1, 1);
    this.visual.scale.set(1, 1, 1);
    clampEnemyRootScale(this.mesh);
    clampEnemyVisualScale(this.visual);
    this.visual.position.set(0, HOVER_Y, 0);
    this.bodyMat.transparent = false;
    this.bodyMat.opacity = 1;
    this.bodyMat.color.setHex(this.baseColor);
    this.bodyMat.emissive.setHex(WISP_GLOW);
    this.bodyMat.emissiveIntensity = 0.65;
    this.haloMat.opacity = 0.45;
    this.haloMat.emissiveIntensity = 0.85;
    this.syncMesh();
  }

  protected override onDeath(): void {
    this.ai = 'dead';
    this.deathT = 0;
    this.windup = false;
    this.zapT = -1;
    this.pendingZap = false;
    this.hideTelegraph();
    this.beginRespawn(5.5);
  }

  private hideTelegraph(): void {
    this.telegraph.visible = false;
    this.telegraphMat.opacity = 0;
  }

  private applyLivePose(): void {
    const moving = this.ai === 'chase' || this.ai === 'leash';

    let hover = 0;
    let squashY = 1;
    let squashX = 1;

    if (this.stunRemain > 0) {
      const wobble = Math.sin(this.stunRemain * 20);
      hover = 0.04;
      squashY = 0.9 + wobble * 0.05;
      squashX = 1.12 - wobble * 0.06;
      this.visual.scale.set(squashX, squashY, squashX);
      this.visual.position.set(wobble * 0.08, HOVER_Y * squashY + hover, 0);
      this.shadow.scale.setScalar(Math.max(0.35, 0.95 * squashX));
      this.shadowMat.opacity = 0.2;
      this.hideTelegraph();
      return;
    }

    // Soft bob — always floating, stronger when drifting.
    const bob = Math.sin(this.hoverPhase);
    hover = bob * (moving ? 0.18 : 0.1);
    squashY = 1 + bob * 0.06;
    squashX = 1 - bob * 0.04;

    // Orbit petals for a living silhouette.
    for (let i = 0; i < this.petals.length; i++) {
      const petal = this.petals[i]!;
      const ang = (i / this.petals.length) * Math.PI * 2 + this.hoverPhase * 0.85;
      const radius = 0.36 + Math.sin(this.hoverPhase * 1.2 + i) * 0.04;
      petal.position.set(
        Math.cos(ang) * radius,
        Math.sin(ang * 1.4 + this.hoverPhase) * 0.14,
        Math.sin(ang) * radius,
      );
      petal.rotation.y = ang;
    }

    // Trail sways opposite to motion feel.
    for (let i = 0; i < this.trails.length; i++) {
      const trail = this.trails[i]!;
      const lag = i + 1;
      trail.position.x = Math.sin(this.hoverPhase * 0.9 + lag) * 0.04 * lag;
      trail.position.y = -0.05 - i * 0.08 + bob * 0.03;
      trail.position.z = -0.28 - i * 0.22;
    }

    if (this.windup && this.ai === 'attack' && this.attackTimer > 0) {
      const w = clamp01(this.attackTimer / this.windupSeconds);
      const pulse = 0.5 + 0.5 * Math.sin((1 - w) * Math.PI * 6);
      squashY = 0.78 + w * 0.1 - pulse * 0.06;
      squashX = 1.22 - w * 0.08 + pulse * 0.08;
      hover = 0.06 + pulse * 0.05;

      const progress = 1 - w;
      this.telegraph.visible = true;
      const ringScale = (this.attackRange / 0.85) * (0.35 + progress * 0.65);
      this.telegraph.scale.setScalar(ringScale);
      this.telegraphMat.opacity = 0.3 + progress * 0.55 + pulse * 0.2;
    } else if (this.zapT >= 0) {
      // Discharge pulse — expand then settle.
      const t = clamp01(this.zapT / 0.28);
      const thrust = Math.sin(Math.min(1, t / 0.4) * Math.PI);
      squashY = 1.15 - thrust * 0.35;
      squashX = 0.75 + thrust * 0.45;
      hover = 0.12 * thrust;
      this.hideTelegraph();
    } else {
      this.hideTelegraph();
    }

    if (this.hitReactT > 0) {
      const t = this.hitReactT / 0.32;
      const k = Math.sin(t * Math.PI);
      squashY *= 0.7 + 0.3 * (1 - k);
      squashX *= 1.3 - 0.3 * (1 - k);
      hover *= 0.3;
    }

    this.visual.scale.set(squashX, squashY, squashX);
    this.visual.position.set(0, HOVER_Y * squashY + hover, 0);

    const shadowScale = Math.max(0.3, 0.95 * squashX - Math.abs(hover) * 0.35);
    this.shadow.scale.setScalar(shadowScale);
    this.shadowMat.opacity = 0.14 + (1 - Math.min(1, Math.abs(hover) * 3)) * 0.1;
  }

  private applyDeathAnim(t: number): void {
    const u = clamp01(t);
    if (u < 0.4) {
      const k = smoothstep(u / 0.4);
      this.visual.scale.set(1 + k * 0.7, 1 + k * 0.5, 1 + k * 0.7);
      this.visual.position.y = HOVER_Y + k * 0.35;
      this.bodyMat.emissiveIntensity = 0.65 + k * 1.2;
    } else {
      const k = easeOutCubic((u - 0.4) / 0.6);
      const s = Math.max(0.01, 1.6 * (1 - k));
      this.visual.scale.set(s, s, s);
      this.visual.position.y = HOVER_Y + 0.35 + k * 0.5;
      this.bodyMat.transparent = true;
      this.bodyMat.opacity = 1 - k;
      this.haloMat.opacity = 0.45 * (1 - k);
    }
    this.shadow.scale.setScalar(Math.max(0.05, 0.95 * (1 - u)));
    this.shadowMat.opacity = 0.22 * (1 - u);
    this.hideTelegraph();
  }
}

/**
 * Starter wisps — west misty grove + north ruins only (spirit theming).
 * Kept out of the meadow start so early combat stays readable.
 */
export function createStarterWisps(): SpiritWisp[] {
  const spots = [
    // West misty grove — among the fog, clear of the brute / spitters
    new THREE.Vector3(-52, 0, 10),
    new THREE.Vector3(-58, 0, -3),
    new THREE.Vector3(-44, 0, -5),
    // North ruins courtyard — near crumbled stone, clear of columns / brute
    new THREE.Vector3(-8, 0, 52),
    new THREE.Vector3(4, 0, 58),
    new THREE.Vector3(-5, 0, 60),
  ];
  return spots.map((p) => new SpiritWisp(p));
}
