import * as THREE from 'three';
import { Entity } from './Entity';
import { dist2, randomPointInRing } from '../utils/math';
import { Palette, createToonMaterial } from '../render/stylized';
import { clamp01, easeOutCubic, smoothstep } from '../anim/ease';

export type MobAIState = 'idle' | 'chase' | 'attack' | 'leash' | 'dead';

const sharedBodyGeo = new THREE.SphereGeometry(0.62, 16, 14);
const sharedBellyGeo = new THREE.SphereGeometry(0.4, 12, 10);
const sharedEyeWhiteGeo = new THREE.SphereGeometry(0.15, 8, 8);
const sharedPupilGeo = new THREE.SphereGeometry(0.08, 6, 6);
const sharedCheekGeo = new THREE.SphereGeometry(0.1, 6, 6);
const sharedSpotGeo = new THREE.SphereGeometry(0.11, 6, 6);
const sharedEarGeo = new THREE.SphereGeometry(0.17, 8, 8);
const sharedBrowGeo = new THREE.BoxGeometry(0.1, 0.03, 0.04);
const sharedMouthGeo = new THREE.TorusGeometry(0.1, 0.028, 6, 10, Math.PI);

const sharedEyeWhiteMat = createToonMaterial(0xffffff);
const sharedPupilMat = createToonMaterial(0x1a1a22);
const sharedCheekMat = createToonMaterial(Palette.blobCheek, {
  emissive: Palette.blobCheek,
  emissiveIntensity: 0.15,
});
const sharedBellyMat = createToonMaterial(Palette.blobBelly);
const sharedMouthMat = createToonMaterial(Palette.blobMouth);
const sharedBrowMat = createToonMaterial(0x2a1a22);
const sharedEarMatCache = new Map<number, THREE.MeshToonMaterial>();

function earMatFor(color: number): THREE.MeshToonMaterial {
  let mat = sharedEarMatCache.get(color);
  if (!mat) {
    mat = createToonMaterial(color);
    mat.color.offsetHSL(0, 0, -0.12);
    sharedEarMatCache.set(color, mat);
  }
  return mat;
}

export class Mob extends Entity {
  readonly moveSpeed = 3.45;
  readonly aggroRange = 9.5;
  readonly leashRange = 16;
  readonly attackRange = 1.45;
  readonly attackDamage = 7;
  readonly attackCooldown = 1.25;
  /** Soft body radius used for mob-vs-mob separation. */
  readonly sepRadius = 0.75;

  ai: MobAIState = 'idle';
  attackTimer = 0;
  private respawnTimer = 0;
  readonly home: THREE.Vector3;
  private readonly bodyMat: THREE.MeshToonMaterial;
  private readonly baseColor: number;
  private readonly velocity = new THREE.Vector3();
  private readonly faceTmp = new THREE.Vector3();

  private readonly visual: THREE.Group;
  private readonly leftPupil: THREE.Mesh;
  private readonly rightPupil: THREE.Mesh;
  private readonly leftBrow: THREE.Mesh;
  private readonly rightBrow: THREE.Mesh;
  private readonly mouth: THREE.Mesh;
  private readonly leftEar: THREE.Mesh;
  private readonly rightEar: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly shadowMat: THREE.MeshToonMaterial;

  private hopPhase = Math.random() * Math.PI * 2;
  private hitReactT = 0;
  private deathT = -1;
  private lungeT = -1;
  private windup = false;

  constructor(spawn: THREE.Vector3, color = 0xff7eb6) {
    const group = new THREE.Group();
    const visual = new THREE.Group();
    visual.position.y = 0.62;
    group.add(visual);

    const bodyMat = createToonMaterial(color);
    const body = new THREE.Mesh(sharedBodyGeo, bodyMat);
    body.castShadow = true;
    visual.add(body);

    const belly = new THREE.Mesh(sharedBellyGeo, sharedBellyMat);
    belly.position.set(0, -0.16, 0.3);
    belly.scale.set(1.05, 0.85, 0.7);
    visual.add(belly);

    const earMat = earMatFor(color);
    const leftEar = new THREE.Mesh(sharedEarGeo, earMat);
    leftEar.position.set(-0.34, 0.5, 0.02);
    leftEar.scale.set(0.7, 1.15, 0.7);
    const rightEar = new THREE.Mesh(sharedEarGeo, earMat);
    rightEar.position.set(0.34, 0.5, 0.02);
    rightEar.scale.set(0.7, 1.15, 0.7);
    visual.add(leftEar, rightEar);

    const leftWhite = new THREE.Mesh(sharedEyeWhiteGeo, sharedEyeWhiteMat);
    leftWhite.position.set(-0.18, 0.12, 0.5);
    const rightWhite = new THREE.Mesh(sharedEyeWhiteGeo, sharedEyeWhiteMat);
    rightWhite.position.set(0.18, 0.12, 0.5);
    visual.add(leftWhite, rightWhite);

    const leftPupil = new THREE.Mesh(sharedPupilGeo, sharedPupilMat);
    leftPupil.position.set(-0.18, 0.12, 0.6);
    const rightPupil = new THREE.Mesh(sharedPupilGeo, sharedPupilMat);
    rightPupil.position.set(0.18, 0.12, 0.6);
    visual.add(leftPupil, rightPupil);

    const leftBrow = new THREE.Mesh(sharedBrowGeo, sharedBrowMat);
    leftBrow.position.set(-0.18, 0.24, 0.58);
    const rightBrow = new THREE.Mesh(sharedBrowGeo, sharedBrowMat);
    rightBrow.position.set(0.18, 0.24, 0.58);
    visual.add(leftBrow, rightBrow);

    const mouth = new THREE.Mesh(sharedMouthGeo, sharedMouthMat);
    mouth.position.set(0, -0.08, 0.56);
    mouth.rotation.x = Math.PI;
    mouth.scale.set(1, 0.85, 1);
    visual.add(mouth);

    const leftCheek = new THREE.Mesh(sharedCheekGeo, sharedCheekMat);
    leftCheek.position.set(-0.38, -0.08, 0.42);
    const rightCheek = new THREE.Mesh(sharedCheekGeo, sharedCheekMat);
    rightCheek.position.set(0.38, -0.08, 0.42);
    visual.add(leftCheek, rightCheek);

    const spot = new THREE.Mesh(sharedSpotGeo, sharedBellyMat);
    spot.position.set(0.3, -0.02, 0.48);
    visual.add(spot);

    const shadowMat = createToonMaterial(0x1a2818, { transparent: true, opacity: 0.28 });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.48, 14), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    super(group, 'enemy', 40, 0.55, spawn);
    this.home = spawn.clone();
    this.bodyMat = bodyMat;
    this.baseColor = color;
    this.visual = visual;
    this.leftPupil = leftPupil;
    this.rightPupil = rightPupil;
    this.leftBrow = leftBrow;
    this.rightBrow = rightBrow;
    this.mouth = mouth;
    this.leftEar = leftEar;
    this.rightEar = rightEar;
    this.shadow = shadow;
    this.shadowMat = shadowMat;
    this.syncMesh();
    this.setFace('happy');
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
      // Stronger hit flash: hot white + emissive punch that falls off quickly.
      const flash = Math.min(1, this.hitFlash / 0.1);
      this.bodyMat.color.setHex(0xffffff);
      this.bodyMat.emissive.setHex(0xffe8a8);
      this.bodyMat.emissiveIntensity = 0.35 + flash * 0.9;
    } else if (this.windup && this.ai === 'attack' && this.attackTimer > 0) {
      // Readable attack telegraph: warm warning tint while winding up.
      const pulse = 0.5 + 0.5 * Math.sin(this.attackTimer * 28);
      this.bodyMat.color.setHex(this.baseColor);
      this.bodyMat.color.offsetHSL(0.02, 0.12, 0.08 + pulse * 0.1);
      this.bodyMat.emissive.setHex(0xff6644);
      this.bodyMat.emissiveIntensity = 0.22 + pulse * 0.38;
    } else {
      this.bodyMat.color.setHex(this.baseColor);
      this.bodyMat.emissive.setHex(0x000000);
      this.bodyMat.emissiveIntensity = 0;
    }

    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (this.hitReactT > 0) this.hitReactT = Math.max(0, this.hitReactT - dt);
    if (this.lungeT >= 0) {
      this.lungeT += dt;
      if (this.lungeT >= 0.28) this.lungeT = -1;
    }

    const moving = this.ai === 'chase' || this.ai === 'leash';
    this.hopPhase += dt * (moving ? 9.5 : this.ai === 'idle' ? 4.2 : 3.0);
    this.applyLivePose();
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

    const homeD2 = dist2(this.position.x, this.position.z, this.home.x, this.home.z);
    if (homeD2 > this.leashRange * this.leashRange) {
      this.ai = 'leash';
      this.windup = false;
      return;
    }

    const prev = this.ai;
    const d2 = dist2(this.position.x, this.position.z, playerPos.x, playerPos.z);
    if (d2 <= this.attackRange * this.attackRange) {
      this.ai = 'attack';
      if (prev === 'chase' || prev === 'idle') {
        this.attackTimer = Math.max(this.attackTimer, 0.32);
        this.windup = true;
      }
      this.faceTmp.set(playerPos.x - this.position.x, 0, playerPos.z - this.position.z);
      if (this.faceTmp.lengthSq() > 1e-4) {
        this.mesh.rotation.y = Math.atan2(this.faceTmp.x, this.faceTmp.z);
      }
    } else if (d2 <= this.aggroRange * this.aggroRange) {
      this.ai = 'chase';
      this.windup = false;
    } else if (this.ai === 'chase' || this.ai === 'attack') {
      const deaggro = this.aggroRange + 2.5;
      this.ai = d2 > deaggro * deaggro ? 'idle' : 'chase';
      this.windup = false;
    } else {
      this.ai = 'idle';
      this.windup = false;
    }
  }

  moveToward(target: THREE.Vector3, dt: number, clampFn: (p: THREE.Vector3) => void): void {
    this.velocity.set(target.x - this.position.x, 0, target.z - this.position.z);
    if (this.velocity.lengthSq() < 1e-4) return;
    this.velocity.normalize().multiplyScalar(this.moveSpeed * dt);
    this.position.add(this.velocity);
    clampFn(this.position);
    this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
    this.syncMesh();
  }

  tryAttack(): boolean {
    if (this.ai !== 'attack' || this.attackTimer > 0 || !this.alive) return false;
    this.attackTimer = this.attackCooldown;
    this.windup = false;
    this.lungeT = 0;
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
    const p = randomPointInRing(this.home, 0.5, 3);
    this.position.copy(p);
    this.hp = this.maxHp;
    this.alive = true;
    this.ai = 'idle';
    this.attackTimer = 0.55;
    this.hitReactT = 0;
    this.lungeT = -1;
    this.deathT = -1;
    this.windup = false;
    this.mesh.visible = true;
    this.mesh.scale.set(1, 1, 1);
    this.visual.scale.set(1, 1, 1);
    this.visual.position.set(0, 0.62, 0);
    this.bodyMat.transparent = false;
    this.bodyMat.opacity = 1;
    this.bodyMat.color.setHex(this.baseColor);
    this.bodyMat.emissive.setHex(0x000000);
    this.bodyMat.emissiveIntensity = 0;
    this.setFace('happy');
    this.syncMesh();
  }

  protected override onDeath(): void {
    this.ai = 'dead';
    this.deathT = 0;
    this.windup = false;
    this.lungeT = -1;
    this.setFace('hurt');
    this.beginRespawn(5.5);
  }

  private setFace(mood: 'happy' | 'mad' | 'hurt' | 'windup'): void {
    if (mood === 'happy') {
      this.leftPupil.scale.set(1, 1, 1);
      this.rightPupil.scale.set(1, 1, 1);
      this.leftPupil.position.y = 0.12;
      this.rightPupil.position.y = 0.12;
      this.leftBrow.rotation.z = 0.15;
      this.rightBrow.rotation.z = -0.15;
      this.leftBrow.position.y = 0.24;
      this.rightBrow.position.y = 0.24;
      this.mouth.rotation.x = Math.PI;
      this.mouth.position.y = -0.08;
      this.mouth.scale.set(1, 0.85, 1);
    } else if (mood === 'mad' || mood === 'windup') {
      this.leftPupil.scale.set(1.1, 1.1, 1);
      this.rightPupil.scale.set(1.1, 1.1, 1);
      this.leftPupil.position.y = 0.12;
      this.rightPupil.position.y = 0.12;
      this.leftBrow.rotation.z = -0.35;
      this.rightBrow.rotation.z = 0.35;
      this.leftBrow.position.y = 0.26;
      this.rightBrow.position.y = 0.26;
      this.mouth.rotation.x = 0;
      this.mouth.position.y = -0.1;
      this.mouth.scale.set(0.9, 0.7, 1);
    } else {
      this.leftPupil.scale.set(1.25, 0.22, 1);
      this.rightPupil.scale.set(1.25, 0.22, 1);
      this.leftPupil.position.y = 0.13;
      this.rightPupil.position.y = 0.13;
      this.leftBrow.rotation.z = 0.5;
      this.rightBrow.rotation.z = -0.5;
      this.mouth.rotation.x = 0;
      this.mouth.position.y = -0.12;
      this.mouth.scale.set(0.85, 0.55, 1);
    }
  }

  private applyLivePose(): void {
    const moving = this.ai === 'chase' || this.ai === 'leash';

    if (this.hitReactT > 0) this.setFace('hurt');
    else if (this.windup && this.ai === 'attack') this.setFace('windup');
    else if (this.ai === 'attack' || this.ai === 'chase') this.setFace('mad');
    else this.setFace('happy');

    let hop = 0;
    let squashY = 1;
    let squashX = 1;
    let zOff = 0;

    if (moving) {
      const s = Math.sin(this.hopPhase);
      const land = Math.cos(this.hopPhase);
      hop = Math.max(0, s) * 0.3;
      if (s > 0) {
        squashY = 1 + s * 0.2;
        squashX = 1 - s * 0.14;
      } else {
        squashY = 1 + land * 0.14;
        squashX = 1 - land * 0.12;
      }
    } else if (this.ai === 'idle') {
      const s = Math.sin(this.hopPhase);
      hop = Math.abs(s) * 0.045;
      squashY = 1 + s * 0.07;
      squashX = 1 - s * 0.045;
    }

    if (this.windup && this.ai === 'attack' && this.attackTimer > 0) {
      // Clearer wind-up telegraph: deeper crouch + rhythmic scale pulse.
      const w = clamp01(this.attackTimer / 0.32);
      const pulse = 0.5 + 0.5 * Math.sin((1 - w) * Math.PI * 4);
      squashY = 0.68 + w * 0.14 - pulse * 0.04;
      squashX = 1.32 - w * 0.12 + pulse * 0.06;
      hop = 0.015;
      zOff = -0.18 * (1 - w);
      this.leftEar.rotation.z = 0.55;
      this.rightEar.rotation.z = -0.55;
    } else {
      this.leftEar.rotation.z = Math.sin(this.hopPhase) * 0.18;
      this.rightEar.rotation.z = -Math.sin(this.hopPhase) * 0.18;
    }

    if (this.lungeT >= 0) {
      const t = clamp01(this.lungeT / 0.28);
      const thrust = Math.sin(t * Math.PI);
      zOff = 0.32 * thrust;
      squashY = 1.18 - thrust * 0.28;
      squashX = 0.82 + thrust * 0.22;
      hop = 0.1 * thrust;
    }

    if (this.hitReactT > 0) {
      const t = this.hitReactT / 0.32;
      const k = Math.sin(t * Math.PI);
      squashY *= 0.62 + 0.38 * (1 - k);
      squashX *= 1.38 - 0.38 * (1 - k);
      hop *= 0.2;
    }

    // Keep visual center above ground when squashed
    this.visual.scale.set(squashX, squashY, squashX);
    this.visual.position.set(0, 0.62 * squashY + hop, zOff);

    const shadowScale = Math.max(0.4, 1.05 * squashX - hop * 0.55);
    this.shadow.scale.setScalar(shadowScale);
    this.shadowMat.opacity = 0.2 + (1 - Math.min(1, hop * 2)) * 0.1;
  }

  private applyDeathAnim(t: number): void {
    const u = clamp01(t);
    if (u < 0.45) {
      const k = smoothstep(u / 0.45);
      this.visual.scale.set(1 + k * 0.6, 1 - k * 0.78, 1 + k * 0.6);
      this.visual.position.y = 0.62 * (1 - k * 0.78);
      this.setFace('hurt');
    } else {
      const k = easeOutCubic((u - 0.45) / 0.55);
      const s = Math.max(0.01, 1.5 * (1 - k));
      this.visual.scale.set(s * 1.25, s * 0.3, s * 1.25);
      this.visual.position.y = 0.12 * (1 - k);
      this.bodyMat.transparent = true;
      this.bodyMat.opacity = 1 - k;
    }
    this.shadow.scale.setScalar(Math.max(0.08, 1.15 * (1 - u)));
    this.shadowMat.opacity = 0.28 * (1 - u);
  }
}

export function createStarterMobs(): Mob[] {
  const colors = [0xff5fa8, 0x5eb8ff, 0xffc23a, 0x6ef0d2, 0xff8a4c, 0xc58cff];
  const spots = [
    new THREE.Vector3(8, 0, -4),
    new THREE.Vector3(-7, 0, -8),
    new THREE.Vector3(12, 0, 8),
    new THREE.Vector3(-10, 0, 4),
    new THREE.Vector3(2, 0, -14),
    new THREE.Vector3(-4, 0, 14),
  ];
  return spots.map((p, i) => new Mob(p, colors[i % colors.length]));
}
