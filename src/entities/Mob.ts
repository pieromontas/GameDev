import * as THREE from 'three';
import { Entity } from './Entity';
import { dist2, randomPointInRing } from '../utils/math';

export type MobAIState = 'idle' | 'chase' | 'attack' | 'leash' | 'dead';

const sharedBodyGeo = new THREE.SphereGeometry(0.55, 12, 10);
const sharedEyeGeo = new THREE.SphereGeometry(0.1, 6, 6);
const sharedSpotGeo = new THREE.SphereGeometry(0.12, 6, 6);

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
  private readonly bodyMat: THREE.MeshLambertMaterial;
  private readonly baseColor: number;
  private wobble = Math.random() * Math.PI * 2;
  private readonly velocity = new THREE.Vector3();
  private readonly faceTmp = new THREE.Vector3();

  constructor(spawn: THREE.Vector3, color = 0xff7eb6) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(sharedBodyGeo, bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);

    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const left = new THREE.Mesh(sharedEyeGeo, eyeMat);
    left.position.set(-0.18, 0.7, 0.42);
    const right = new THREE.Mesh(sharedEyeGeo, eyeMat);
    right.position.set(0.18, 0.7, 0.42);
    group.add(left, right);

    const spot = new THREE.Mesh(
      sharedSpotGeo,
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    spot.position.set(0.25, 0.45, 0.35);
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
  const colors = [0xff7eb6, 0x7ec8ff, 0xffc857, 0xb8f2e6, 0xff9f68];
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
