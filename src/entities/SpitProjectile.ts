import * as THREE from 'three';
import { createToonMaterial } from '../render/stylized';
import { dist2 } from '../utils/math';

const sharedGeo = new THREE.SphereGeometry(0.22, 10, 8);
const sharedTrailGeo = new THREE.SphereGeometry(0.12, 6, 6);

/**
 * Slow acid spit from Spitter blobs — readable arc, modest speed so players can sidestep.
 */
export class SpitProjectile {
  readonly mesh: THREE.Group;
  readonly velocity = new THREE.Vector3();
  readonly damage: number;
  readonly radius = 0.35;
  alive = true;

  private life: number;
  private readonly bodyMat: THREE.MeshToonMaterial;
  private readonly trailMat: THREE.MeshToonMaterial;
  private readonly spin = Math.random() * Math.PI * 2;

  constructor(origin: THREE.Vector3, dirX: number, dirZ: number, damage = 9, speed = 7.2) {
    const group = new THREE.Group();
    this.bodyMat = createToonMaterial(0xb8ff4a, {
      emissive: 0x6aad20,
      emissiveIntensity: 0.55,
    });
    const body = new THREE.Mesh(sharedGeo, this.bodyMat);
    body.castShadow = true;
    body.scale.set(1.15, 0.85, 1.35);
    group.add(body);

    this.trailMat = createToonMaterial(0xe8ff9a, {
      transparent: true,
      opacity: 0.55,
      emissive: 0xa0e040,
      emissiveIntensity: 0.35,
    });
    const trail = new THREE.Mesh(sharedTrailGeo, this.trailMat);
    trail.position.set(0, 0, -0.28);
    trail.scale.setScalar(0.85);
    group.add(trail);

    group.position.set(origin.x, 1.05, origin.z);
    this.mesh = group;

    const len = Math.hypot(dirX, dirZ) || 1;
    this.velocity.set((dirX / len) * speed, 0, (dirZ / len) * speed);
    this.damage = damage;
    this.life = 2.6;
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }

    this.mesh.position.x += this.velocity.x * dt;
    this.mesh.position.z += this.velocity.z * dt;
    // Gentle lob so the shot reads in the air, not as a ground skim.
    const t = 1 - this.life / 2.6;
    this.mesh.position.y = 1.05 + Math.sin(t * Math.PI) * 0.55;
    this.mesh.rotation.y = this.spin + t * 6;
    this.mesh.rotation.x = t * 2.2;
    this.trailMat.opacity = 0.35 + (1 - t) * 0.35;
  }

  hits(px: number, pz: number, playerRadius: number): boolean {
    if (!this.alive) return false;
    const reach = this.radius + playerRadius;
    return dist2(this.mesh.position.x, this.mesh.position.z, px, pz) <= reach * reach;
  }

  dispose(): void {
    this.bodyMat.dispose();
    this.trailMat.dispose();
  }
}
