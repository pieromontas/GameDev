import * as THREE from 'three';
import { Entity } from './Entity';
import { SkillId, SkillState, createWarriorSkills } from '../combat/Skills';

export class Player extends Entity {
  readonly moveSpeed = 7.5;
  readonly skills: Record<SkillId, SkillState>;
  facing = new THREE.Vector3(0, 0, -1);
  invuln = 0;
  private bob = 0;
  private readonly body: THREE.Mesh;
  private readonly bodyMat: THREE.MeshLambertMaterial;
  private readonly baseColor = 0x3b7ddd;

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

    super(group, 'player', 120, 0.55);
    this.body = body;
    this.bodyMat = bodyMat;
    this.skills = createWarriorSkills();
    this.position.set(0, 0, 6);
    this.syncMesh();
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

  faceDirection(dir: THREE.Vector3): void {
    if (dir.lengthSq() < 1e-6) return;
    this.facing.copy(dir).normalize();
    const yaw = Math.atan2(this.facing.x, this.facing.z);
    this.mesh.rotation.y = yaw;
  }

  update(dt: number): void {
    this.bob += dt * 8;
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      this.bodyMat.color.setHex(0xffffff);
    } else {
      this.bodyMat.color.setHex(this.baseColor);
    }
    // subtle idle bob on body
    this.body.position.y = 0.9 + Math.sin(this.bob) * 0.02;
  }

  respawn(): void {
    this.alive = true;
    this.hp = this.maxHp;
    this.position.set(0, 0, 6);
    this.mesh.visible = true;
    this.invuln = 1.5;
    this.syncMesh();
  }
}
