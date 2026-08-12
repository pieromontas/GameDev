import * as THREE from 'three';
import { Entity } from './Entity';
import type { MobAIState } from './Mob';
import { dist2, randomPointInRing } from '../utils/math';
import { createToonMaterial } from '../render/stylized';
import { clamp01, easeOutCubic, smoothstep } from '../anim/ease';

/** Acid-green ranged blob — taller snouted silhouette, kites and spits. */
export const SPITTER_COLOR = 0x6fdc3a;
export const SPITTER_BELLY = 0xd8ff9a;
export const SPITTER_SPIKE = 0x3a9e28;

const bodyGeo = new THREE.SphereGeometry(0.55, 14, 12);
const bellyGeo = new THREE.SphereGeometry(0.32, 10, 8);
const snoutGeo = new THREE.ConeGeometry(0.22, 0.48, 8);
const spikeGeo = new THREE.ConeGeometry(0.12, 0.42, 6);
const eyeWhiteGeo = new THREE.SphereGeometry(0.12, 8, 8);
const pupilGeo = new THREE.SphereGeometry(0.07, 6, 6);
const browGeo = new THREE.BoxGeometry(0.12, 0.035, 0.04);
const mouthGeo = new THREE.SphereGeometry(0.09, 8, 6);

const sharedEyeWhiteMat = createToonMaterial(0xfff8e0);
const sharedPupilMat = createToonMaterial(0x1a2210);
const sharedBellyMat = createToonMaterial(SPITTER_BELLY);
const sharedSpikeMat = createToonMaterial(SPITTER_SPIKE);
const sharedMouthMat = createToonMaterial(0x2a4018, {
  emissive: 0x4a8020,
  emissiveIntensity: 0.25,
});
const sharedBrowMat = createToonMaterial(0x1a3010);

/**
 * Spitter — second enemy type: keeps distance, telegraphs, fires slow acid spit.
 * Public surface mirrors {@link Mob} so Game / Combat can treat them interchangeably.
 */
export class Spitter extends Entity {
  readonly kind = 'spitter' as const;
  readonly moveSpeed = 2.85;
  readonly aggroRange = 13.5;
  readonly leashRange = 18;
  /** Preferred stand-off distance while shooting. */
  readonly preferredRange = 7.2;
  /** Back away when the player closes inside this. */
  readonly retreatRange = 4.4;
  /** Max spit range. */
  readonly attackRange = 11.5;
  readonly attackDamage = 9;
  readonly attackCooldown = 1.85;
  readonly sepRadius = 0.82;
  /** Projectile flight speed handed to CombatSystem. */
  readonly spitSpeed = 7.0;

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
  private readonly leftPupil: THREE.Mesh;
  private readonly rightPupil: THREE.Mesh;
  private readonly leftBrow: THREE.Mesh;
  private readonly rightBrow: THREE.Mesh;
  private readonly snout: THREE.Mesh;
  private readonly spikes: THREE.Mesh[];
  private readonly shadow: THREE.Mesh;
  private readonly shadowMat: THREE.MeshToonMaterial;

  private hopPhase = Math.random() * Math.PI * 2;
  private hitReactT = 0;
  private deathT = -1;
  private spitT = -1;
  private windup = false;
  /** Set by tryAttack — CombatSystem consumes to spawn a projectile. */
  private pendingSpit = false;

  constructor(spawn: THREE.Vector3, color = SPITTER_COLOR) {
    const group = new THREE.Group();
    const visual = new THREE.Group();
    // Taller stance than meadow blobs (0.62) — reads immediately as a different type.
    visual.position.y = 0.95;
    group.add(visual);

    const bodyMat = createToonMaterial(color);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(0.92, 1.35, 0.95);
    body.castShadow = true;
    visual.add(body);

    const belly = new THREE.Mesh(bellyGeo, sharedBellyMat);
    belly.position.set(0, -0.28, 0.22);
    belly.scale.set(1.05, 0.9, 0.75);
    visual.add(belly);

    // Forward snout — ranged silhouette cue.
    const snout = new THREE.Mesh(snoutGeo, bodyMat);
    snout.position.set(0, -0.05, 0.62);
    snout.rotation.x = Math.PI / 2;
    snout.scale.set(1.05, 1.2, 0.85);
    visual.add(snout);

    const mouth = new THREE.Mesh(mouthGeo, sharedMouthMat);
    mouth.position.set(0, -0.02, 0.88);
    mouth.scale.set(1.1, 0.7, 0.7);
    visual.add(mouth);

    const spikes: THREE.Mesh[] = [];
    const spikeOffsets = [
      { x: 0, y: 0.72, z: -0.05, rx: -0.15 },
      { x: -0.28, y: 0.58, z: -0.08, rx: -0.35 },
      { x: 0.28, y: 0.58, z: -0.08, rx: -0.35 },
      { x: -0.18, y: 0.42, z: -0.22, rx: -0.55 },
      { x: 0.18, y: 0.42, z: -0.22, rx: -0.55 },
    ];
    for (const s of spikeOffsets) {
      const spike = new THREE.Mesh(spikeGeo, sharedSpikeMat);
      spike.position.set(s.x, s.y, s.z);
      spike.rotation.x = s.rx;
      spike.castShadow = true;
      visual.add(spike);
      spikes.push(spike);
    }

    const leftWhite = new THREE.Mesh(eyeWhiteGeo, sharedEyeWhiteMat);
    leftWhite.position.set(-0.2, 0.18, 0.42);
    leftWhite.scale.set(1.05, 0.85, 1);
    const rightWhite = new THREE.Mesh(eyeWhiteGeo, sharedEyeWhiteMat);
    rightWhite.position.set(0.2, 0.18, 0.42);
    rightWhite.scale.set(1.05, 0.85, 1);
    visual.add(leftWhite, rightWhite);

    const leftPupil = new THREE.Mesh(pupilGeo, sharedPupilMat);
    leftPupil.position.set(-0.2, 0.18, 0.52);
    const rightPupil = new THREE.Mesh(pupilGeo, sharedPupilMat);
    rightPupil.position.set(0.2, 0.18, 0.52);
    visual.add(leftPupil, rightPupil);

    const leftBrow = new THREE.Mesh(browGeo, sharedBrowMat);
    leftBrow.position.set(-0.2, 0.3, 0.5);
    const rightBrow = new THREE.Mesh(browGeo, sharedBrowMat);
    rightBrow.position.set(0.2, 0.3, 0.5);
    visual.add(leftBrow, rightBrow);

    const cheekMat = createToonMaterial(0xa8e050, {
      emissive: 0x80c040,
      emissiveIntensity: 0.12,
    });
    // Toxic blotches — different from cute pink cheeks on meadow blobs
    const blotchGeo = new THREE.SphereGeometry(0.09, 6, 6);
    const b1 = new THREE.Mesh(blotchGeo, cheekMat);
    b1.position.set(-0.38, -0.05, 0.28);
    const b2 = new THREE.Mesh(blotchGeo, cheekMat);
    b2.position.set(0.36, 0.05, 0.3);
    visual.add(b1, b2);

    const shadowMat = createToonMaterial(0x1a2818, { transparent: true, opacity: 0.3 });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    super(group, 'enemy', 34, 0.6, spawn);
    this.home = spawn.clone();
    this.bodyMat = bodyMat;
    this.baseColor = color;
    this.visual = visual;
    this.leftPupil = leftPupil;
    this.rightPupil = rightPupil;
    this.leftBrow = leftBrow;
    this.rightBrow = rightBrow;
    this.snout = snout;
    this.spikes = spikes;
    this.shadow = shadow;
    this.shadowMat = shadowMat;
    this.syncMesh();
    this.setFace('idle');
  }

  update(dt: number): void {
    if (this.deathT >= 0) {
      this.deathT += dt;
      this.applyDeathAnim(this.deathT / 0.55);
      if (this.deathT >= 0.55) {
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
      this.bodyMat.emissive.setHex(0xd8ff80);
      this.bodyMat.emissiveIntensity = 0.35 + flash * 0.9;
    } else if (this.windup && this.ai === 'attack' && this.attackTimer > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(this.attackTimer * 26);
      this.bodyMat.color.setHex(this.baseColor);
      this.bodyMat.color.offsetHSL(0.05, 0.15, 0.06 + pulse * 0.12);
      this.bodyMat.emissive.setHex(0xa0ff30);
      this.bodyMat.emissiveIntensity = 0.28 + pulse * 0.45;
    } else if (this.slowRemain > 0) {
      this.bodyMat.color.setHex(this.baseColor);
      this.bodyMat.color.lerp(new THREE.Color(0x8ad8ff), 0.55);
      this.bodyMat.emissive.setHex(0x3aa8e8);
      this.bodyMat.emissiveIntensity = 0.22;
    } else {
      this.bodyMat.color.setHex(this.baseColor);
      this.bodyMat.emissive.setHex(0x000000);
      this.bodyMat.emissiveIntensity = 0;
    }

    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (this.stunRemain > 0) this.stunRemain = Math.max(0, this.stunRemain - dt);
    if (this.slowRemain > 0) this.slowRemain = Math.max(0, this.slowRemain - dt);
    if (this.hitReactT > 0) this.hitReactT = Math.max(0, this.hitReactT - dt);
    if (this.spitT >= 0) {
      this.spitT += dt;
      if (this.spitT >= 0.32) this.spitT = -1;
    }

    const moving =
      this.stunRemain <= 0 && (this.ai === 'chase' || this.ai === 'leash' || this.ai === 'retreat');
    this.hopPhase += dt * (moving ? 8.2 : this.ai === 'idle' || this.stunRemain > 0 ? 3.6 : 2.6);
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
    if (len > 1e-4 && dist > 0) {
      this.position.x += (dx / len) * dist;
      this.position.z += (dz / len) * dist;
    }
    this.stunRemain = Math.max(this.stunRemain, stunSeconds);
    this.windup = false;
    this.spitT = -1;
    this.pendingSpit = false;
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
      return;
    }
    if (this.stunRemain > 0) {
      this.ai = 'idle';
      this.windup = false;
      return;
    }

    const homeD2 = dist2(this.position.x, this.position.z, this.home.x, this.home.z);
    if (homeD2 > this.leashRange * this.leashRange) {
      this.ai = 'leash';
      this.windup = false;
      return;
    }

    const prev = this.ai;
    const d2 = dist2(this.position.x, this.position.z, playerPos.x, playerPos.z);
    const d = Math.sqrt(d2);

    this.faceTmp.set(playerPos.x - this.position.x, 0, playerPos.z - this.position.z);
    if (this.faceTmp.lengthSq() > 1e-4) {
      this.mesh.rotation.y = Math.atan2(this.faceTmp.x, this.faceTmp.z);
    }

    if (d2 > this.aggroRange * this.aggroRange) {
      if (this.ai === 'chase' || this.ai === 'attack' || this.ai === 'retreat') {
        const deaggro = this.aggroRange + 2.5;
        this.ai = d2 > deaggro * deaggro ? 'idle' : 'chase';
      } else {
        this.ai = 'idle';
      }
      this.windup = false;
      return;
    }

    // Too close — kite back.
    if (d < this.retreatRange) {
      this.ai = 'retreat';
      this.windup = false;
      return;
    }

    // In spit band — hold and telegraph.
    if (d <= this.attackRange && d >= this.retreatRange * 0.92) {
      this.ai = 'attack';
      if (prev === 'chase' || prev === 'idle' || prev === 'retreat') {
        this.attackTimer = Math.max(this.attackTimer, 0.42);
        this.windup = true;
      }
      return;
    }

    // Too far to spit — close in.
    this.ai = 'chase';
    this.windup = false;
  }

  /**
   * World point to walk toward this frame (player for chase, flee point for retreat, home for leash).
   */
  getMoveTarget(playerPos: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 | null {
    if (this.ai === 'chase') {
      // Approach only until preferred range — don't glue to the player.
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const stop = this.preferredRange * 0.92;
      if (d <= stop) return null;
      out.set(
        this.position.x + (dx / d) * (d - stop),
        0,
        this.position.z + (dz / d) * (d - stop),
      );
      return out;
    }
    if (this.ai === 'retreat') {
      const dx = this.position.x - playerPos.x;
      const dz = this.position.z - playerPos.z;
      const d = Math.hypot(dx, dz) || 1;
      out.set(
        this.position.x + (dx / d) * 4.5,
        0,
        this.position.z + (dz / d) * 4.5,
      );
      return out;
    }
    if (this.ai === 'leash') {
      out.copy(this.home);
      return out;
    }
    return null;
  }

  moveToward(target: THREE.Vector3, dt: number, clampFn: (p: THREE.Vector3) => void): void {
    this.velocity.set(target.x - this.position.x, 0, target.z - this.position.z);
    if (this.velocity.lengthSq() < 1e-4) return;
    const speedMul = this.slowRemain > 0 ? 0.42 : this.ai === 'retreat' ? 1.15 : 1;
    this.velocity.normalize().multiplyScalar(this.moveSpeed * speedMul * dt);
    this.position.add(this.velocity);
    clampFn(this.position);
    // Face movement when retreating/chasing; attack facing is handled in think.
    if (this.ai !== 'attack') {
      this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
    }
    this.syncMesh();
  }

  /**
   * Returns true when a spit should be spawned. CombatSystem reads facing from mesh yaw.
   */
  tryAttack(): boolean {
    if (this.ai !== 'attack' || this.attackTimer > 0 || !this.alive || this.stunRemain > 0) {
      return false;
    }
    this.attackTimer = this.attackCooldown;
    this.windup = false;
    this.spitT = 0;
    this.pendingSpit = true;
    return true;
  }

  /** Consume a pending spit request (direction is current mesh facing). */
  consumeSpitRequest(): boolean {
    if (!this.pendingSpit) return false;
    this.pendingSpit = false;
    return true;
  }

  getSpitOrigin(out: THREE.Vector3): THREE.Vector3 {
    const yaw = this.mesh.rotation.y;
    out.set(
      this.position.x + Math.sin(yaw) * 0.85,
      0,
      this.position.z + Math.cos(yaw) * 0.85,
    );
    return out;
  }

  getFacingXZ(out: THREE.Vector3): THREE.Vector3 {
    const yaw = this.mesh.rotation.y;
    out.set(Math.sin(yaw), 0, Math.cos(yaw));
    return out;
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
    const p = randomPointInRing(this.home, 0.5, 3);
    this.position.copy(p);
    this.hp = this.maxHp;
    this.alive = true;
    this.ai = 'idle';
    this.attackTimer = 0.7;
    this.stunRemain = 0;
    this.slowRemain = 0;
    this.hitReactT = 0;
    this.spitT = -1;
    this.deathT = -1;
    this.windup = false;
    this.pendingSpit = false;
    this.mesh.visible = true;
    this.mesh.scale.set(1, 1, 1);
    this.visual.scale.set(1, 1, 1);
    this.visual.position.set(0, 0.95, 0);
    this.bodyMat.transparent = false;
    this.bodyMat.opacity = 1;
    this.bodyMat.color.setHex(this.baseColor);
    this.bodyMat.emissive.setHex(0x000000);
    this.bodyMat.emissiveIntensity = 0;
    this.setFace('idle');
    this.syncMesh();
  }

  protected override onDeath(): void {
    this.ai = 'dead';
    this.deathT = 0;
    this.windup = false;
    this.spitT = -1;
    this.pendingSpit = false;
    this.setFace('hurt');
    this.beginRespawn(5.5);
  }

  private setFace(mood: 'idle' | 'mad' | 'hurt' | 'windup'): void {
    if (mood === 'idle') {
      this.leftPupil.scale.set(1, 1, 1);
      this.rightPupil.scale.set(1, 1, 1);
      this.leftBrow.rotation.z = -0.25;
      this.rightBrow.rotation.z = 0.25;
      this.leftBrow.position.y = 0.3;
      this.rightBrow.position.y = 0.3;
    } else if (mood === 'mad' || mood === 'windup') {
      this.leftPupil.scale.set(1.15, 1.15, 1);
      this.rightPupil.scale.set(1.15, 1.15, 1);
      this.leftBrow.rotation.z = -0.55;
      this.rightBrow.rotation.z = 0.55;
      this.leftBrow.position.y = 0.32;
      this.rightBrow.position.y = 0.32;
    } else {
      this.leftPupil.scale.set(1.2, 0.25, 1);
      this.rightPupil.scale.set(1.2, 0.25, 1);
      this.leftBrow.rotation.z = 0.4;
      this.rightBrow.rotation.z = -0.4;
    }
  }

  private applyLivePose(): void {
    const moving = this.ai === 'chase' || this.ai === 'leash' || this.ai === 'retreat';

    if (this.stunRemain > 0 || this.hitReactT > 0) this.setFace('hurt');
    else if (this.windup && this.ai === 'attack') this.setFace('windup');
    else if (this.ai === 'attack' || this.ai === 'chase' || this.ai === 'retreat') this.setFace('mad');
    else this.setFace('idle');

    let hop = 0;
    let squashY = 1;
    let squashX = 1;
    let zOff = 0;

    if (this.stunRemain > 0) {
      const wobble = Math.sin(this.stunRemain * 18);
      hop = 0.02;
      squashY = 0.88 + wobble * 0.04;
      squashX = 1.14 - wobble * 0.05;
      this.visual.scale.set(squashX, squashY, squashX);
      this.visual.position.set(wobble * 0.06, 0.95 * squashY + hop, 0);
      this.shadow.scale.setScalar(Math.max(0.4, 1.1 * squashX));
      this.shadowMat.opacity = 0.28;
      return;
    }

    if (moving) {
      const s = Math.sin(this.hopPhase);
      const land = Math.cos(this.hopPhase);
      hop = Math.max(0, s) * 0.22;
      if (s > 0) {
        squashY = 1 + s * 0.16;
        squashX = 1 - s * 0.12;
      } else {
        squashY = 1 + land * 0.12;
        squashX = 1 - land * 0.1;
      }
    } else if (this.ai === 'idle') {
      const s = Math.sin(this.hopPhase);
      hop = Math.abs(s) * 0.04;
      squashY = 1 + s * 0.06;
      squashX = 1 - s * 0.04;
    }

    if (this.windup && this.ai === 'attack' && this.attackTimer > 0) {
      const w = clamp01(this.attackTimer / 0.42);
      const pulse = 0.5 + 0.5 * Math.sin((1 - w) * Math.PI * 5);
      squashY = 0.72 + w * 0.12 - pulse * 0.05;
      squashX = 1.28 - w * 0.1 + pulse * 0.05;
      hop = 0.02;
      zOff = -0.12 * (1 - w);
      // Snout pulls back then fires.
      this.snout.scale.set(1.05, 1.05 + (1 - w) * 0.35, 0.85);
      this.snout.position.z = 0.55 + w * 0.07;
    } else {
      this.snout.scale.set(1.05, 1.2, 0.85);
      this.snout.position.z = 0.62;
    }

    if (this.spitT >= 0) {
      const t = clamp01(this.spitT / 0.32);
      const thrust = Math.sin(t * Math.PI);
      zOff = 0.18 * thrust;
      squashY = 1.12 - thrust * 0.2;
      squashX = 0.88 + thrust * 0.16;
      hop = 0.08 * thrust;
      this.snout.position.z = 0.62 + thrust * 0.22;
      this.snout.scale.set(1.05, 1.2 + thrust * 0.45, 0.85);
    }

    if (this.hitReactT > 0) {
      const t = this.hitReactT / 0.32;
      const k = Math.sin(t * Math.PI);
      squashY *= 0.62 + 0.38 * (1 - k);
      squashX *= 1.38 - 0.38 * (1 - k);
      hop *= 0.2;
    }

    for (let i = 0; i < this.spikes.length; i++) {
      const spike = this.spikes[i]!;
      spike.rotation.z = Math.sin(this.hopPhase + i) * 0.08;
    }

    this.visual.scale.set(squashX, squashY, squashX);
    this.visual.position.set(0, 0.95 * squashY + hop, zOff);

    const shadowScale = Math.max(0.45, 1.12 * squashX - hop * 0.5);
    this.shadow.scale.setScalar(shadowScale);
    this.shadowMat.opacity = 0.22 + (1 - Math.min(1, hop * 2)) * 0.1;
  }

  private applyDeathAnim(t: number): void {
    const u = clamp01(t);
    if (u < 0.45) {
      const k = smoothstep(u / 0.45);
      this.visual.scale.set(1 + k * 0.55, 1 - k * 0.75, 1 + k * 0.55);
      this.visual.position.y = 0.95 * (1 - k * 0.75);
      this.setFace('hurt');
    } else {
      const k = easeOutCubic((u - 0.45) / 0.55);
      const s = Math.max(0.01, 1.45 * (1 - k));
      this.visual.scale.set(s * 1.2, s * 0.28, s * 1.2);
      this.visual.position.y = 0.12 * (1 - k);
      this.bodyMat.transparent = true;
      this.bodyMat.opacity = 1 - k;
    }
    this.shadow.scale.setScalar(Math.max(0.08, 1.15 * (1 - u)));
    this.shadowMat.opacity = 0.3 * (1 - u);
  }
}

export function createStarterSpitters(): Spitter[] {
  const spots = [
    // Meadow — noticeable without hunting
    new THREE.Vector3(6, 0, 10),
    new THREE.Vector3(-12, 0, -2),
    // East shrine clearing
    new THREE.Vector3(40, 0, 6),
    new THREE.Vector3(38, 0, -2),
    // West misty grove clearing
    new THREE.Vector3(-38, 0, 4),
    new THREE.Vector3(-42, 0, -4),
    // North ruins courtyard
    new THREE.Vector3(0, 0, 42),
    new THREE.Vector3(5, 0, 37),
    // South river ford clearing
    new THREE.Vector3(0, 0, -42),
    new THREE.Vector3(-5, 0, -37),
  ];
  return spots.map((p) => new Spitter(p));
}
