import * as THREE from 'three';
import { Entity } from './Entity';
import { dist2, randomPointInRing } from '../utils/math';
import { Palette, createToonMaterial } from '../render/stylized';

export type MobAIState = 'idle' | 'chase' | 'attack' | 'leash' | 'dead';

const sharedBodyGeo = new THREE.SphereGeometry(0.58, 14, 12);
const sharedBellyGeo = new THREE.SphereGeometry(0.38, 10, 8);
const sharedEyeWhiteGeo = new THREE.SphereGeometry(0.13, 8, 8);
const sharedPupilGeo = new THREE.SphereGeometry(0.07, 6, 6);
const sharedCheekGeo = new THREE.SphereGeometry(0.1, 6, 6);
const sharedSpotGeo = new THREE.SphereGeometry(0.11, 6, 6);
const sharedEarGeo = new THREE.SphereGeometry(0.16, 8, 8);

const sharedEyeWhiteMat = createToonMaterial(0xffffff);
const sharedPupilMat = createToonMaterial(0x1a1a22);
const sharedCheekMat = createToonMaterial(Palette.blobCheek, {
  emissive: Palette.blobCheek,
  emissiveIntensity: 0.15,
});
const sharedBellyMat = createToonMaterial(Palette.blobBelly);
const sharedEarMatCache = new Map<number, THREE.MeshToonMaterial>();

function earMatFor(color: number): THREE.MeshToonMaterial {
  let mat = sharedEarMatCache.get(color);
  if (!mat) {
    // Slightly darker ears for silhouette without a second palette entry per mob.
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
  private wobble = Math.random() * Math.PI * 2;
  private readonly velocity = new THREE.Vector3();
  private readonly faceTmp = new THREE.Vector3();

  constructor(spawn: THREE.Vector3, color = 0xff7eb6) {
    const group = new THREE.Group();
    const bodyMat = createToonMaterial(color);
    const body = new THREE.Mesh(sharedBodyGeo, bodyMat);
    body.position.y = 0.58;
    body.castShadow = true;
    group.add(body);

    // Pale belly — volume + cute read against saturated shell
    const belly = new THREE.Mesh(sharedBellyGeo, sharedBellyMat);
    belly.position.set(0, 0.42, 0.28);
    belly.scale.set(1.05, 0.85, 0.7);
    group.add(belly);

    // Soft ears / nubs for a clearer silhouette from the follow cam
    const earMat = earMatFor(color);
    const leftEar = new THREE.Mesh(sharedEarGeo, earMat);
    leftEar.position.set(-0.32, 1.05, 0.05);
    leftEar.scale.set(0.7, 1.1, 0.7);
    const rightEar = new THREE.Mesh(sharedEarGeo, earMat);
    rightEar.position.set(0.32, 1.05, 0.05);
    rightEar.scale.set(0.7, 1.1, 0.7);
    group.add(leftEar, rightEar);

    const leftWhite = new THREE.Mesh(sharedEyeWhiteGeo, sharedEyeWhiteMat);
    leftWhite.position.set(-0.18, 0.72, 0.46);
    const rightWhite = new THREE.Mesh(sharedEyeWhiteGeo, sharedEyeWhiteMat);
    rightWhite.position.set(0.18, 0.72, 0.46);
    group.add(leftWhite, rightWhite);

    const leftPupil = new THREE.Mesh(sharedPupilGeo, sharedPupilMat);
    leftPupil.position.set(-0.18, 0.72, 0.56);
    const rightPupil = new THREE.Mesh(sharedPupilGeo, sharedPupilMat);
    rightPupil.position.set(0.18, 0.72, 0.56);
    group.add(leftPupil, rightPupil);

    const leftCheek = new THREE.Mesh(sharedCheekGeo, sharedCheekMat);
    leftCheek.position.set(-0.38, 0.52, 0.38);
    const rightCheek = new THREE.Mesh(sharedCheekGeo, sharedCheekMat);
    rightCheek.position.set(0.38, 0.52, 0.38);
    group.add(leftCheek, rightCheek);

    const spot = new THREE.Mesh(sharedSpotGeo, sharedBellyMat);
    spot.position.set(0.28, 0.55, 0.42);
    group.add(spot);

    super(group, 'enemy', 40, 0.55, spawn);
    this.home = spawn.clone();
    this.bodyMat = bodyMat;
    this.baseColor = color;
    this.syncMesh();
  }

  update(dt: number): void {
    this.wobble += dt * 5;
    if (!this.alive) {
      this.respawnTimer -= dt;
      return;
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      this.bodyMat.color.setHex(0xffffff);
    } else {
      this.bodyMat.color.setHex(this.baseColor);
    }

    if (this.attackTimer > 0) this.attackTimer -= dt;

    // squash / stretch idle motion
    const s = 1 + Math.sin(this.wobble) * 0.06;
    this.mesh.scale.set(1 / s, s, 1 / s);
  }

  think(playerPos: THREE.Vector3, playerAlive: boolean): void {
    if (!this.alive) {
      this.ai = 'dead';
      return;
    }
    if (!playerAlive) {
      this.ai = 'idle';
      return;
    }

    const homeD2 = dist2(this.position.x, this.position.z, this.home.x, this.home.z);
    if (homeD2 > this.leashRange * this.leashRange) {
      this.ai = 'leash';
      return;
    }

    const prev = this.ai;
    const d2 = dist2(this.position.x, this.position.z, playerPos.x, playerPos.z);
    if (d2 <= this.attackRange * this.attackRange) {
      this.ai = 'attack';
      // Short wind-up when closing into melee so the first bite is readable
      if (prev === 'chase' || prev === 'idle') {
        this.attackTimer = Math.max(this.attackTimer, 0.32);
      }
      this.faceTmp.set(playerPos.x - this.position.x, 0, playerPos.z - this.position.z);
      if (this.faceTmp.lengthSq() > 1e-4) {
        this.mesh.rotation.y = Math.atan2(this.faceTmp.x, this.faceTmp.z);
      }
    } else if (d2 <= this.aggroRange * this.aggroRange) {
      this.ai = 'chase';
    } else if (this.ai === 'chase' || this.ai === 'attack') {
      // Drop aggro when player slips outside a slightly larger deaggro bubble
      const deaggro = this.aggroRange + 2.5;
      this.ai = d2 > deaggro * deaggro ? 'idle' : 'chase';
    } else {
      this.ai = 'idle';
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
    return true;
  }

  beginRespawn(delay = 4): void {
    this.respawnTimer = delay;
  }

  readyToRespawn(): boolean {
    return !this.alive && this.respawnTimer <= 0;
  }

  respawnNearHome(): void {
    const p = randomPointInRing(this.home, 0.5, 3);
    this.position.copy(p);
    this.hp = this.maxHp;
    this.alive = true;
    this.ai = 'idle';
    this.attackTimer = 0.55;
    this.mesh.visible = true;
    this.mesh.scale.set(1, 1, 1);
    this.syncMesh();
  }

  protected override onDeath(): void {
    super.onDeath();
    this.ai = 'dead';
    this.beginRespawn(5.5);
  }
}

export function createStarterMobs(): Mob[] {
  // Punchier saturation so blobs pop against toon meadow greens
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
