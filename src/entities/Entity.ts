import * as THREE from 'three';

export type Team = 'player' | 'enemy' | 'neutral';

export abstract class Entity {
  readonly id: number;
  readonly mesh: THREE.Object3D;
  readonly position: THREE.Vector3;
  readonly team: Team;

  maxHp: number;
  hp: number;
  alive = true;
  radius: number;
  hitFlash = 0;

  private static nextId = 1;

  constructor(
    mesh: THREE.Object3D,
    team: Team,
    maxHp: number,
    radius: number,
    position?: THREE.Vector3,
  ) {
    this.id = Entity.nextId++;
    this.mesh = mesh;
    this.team = team;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.radius = radius;
    this.position = position?.clone() ?? new THREE.Vector3();
    this.mesh.position.copy(this.position);
  }

  get hpRatio(): number {
    return this.maxHp <= 0 ? 0 : this.hp / this.maxHp;
  }

  takeDamage(amount: number): number {
    if (!this.alive) return 0;
    const dealt = Math.min(this.hp, Math.max(0, Math.round(amount)));
    this.hp -= dealt;
    this.hitFlash = 0.15;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.onDeath();
    }
    return dealt;
  }

  heal(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  syncMesh(): void {
    this.mesh.position.copy(this.position);
  }

  protected onDeath(): void {
    this.mesh.visible = false;
  }

  abstract update(dt: number): void;
}
