import * as THREE from 'three';
import { dist2 } from '../utils/math';
import { Palette, createToonMaterial } from '../render/stylized';

const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.1, 12);
const coinMat = createToonMaterial(Palette.lootGold, {
  emissive: Palette.lootGold,
  emissiveIntensity: 0.45,
});

export class LootPickup {
  readonly mesh: THREE.Mesh;
  readonly position: THREE.Vector3;
  alive = true;
  private age = 0;
  private readonly spinSpeed: number;
  private readonly pop = 0.35;

  constructor(position: THREE.Vector3) {
    this.position = position.clone();
    // Slight scatter so stacked kills don't bury coins on the same point
    this.position.x += (Math.random() - 0.5) * 0.8;
    this.position.z += (Math.random() - 0.5) * 0.8;
    this.mesh = new THREE.Mesh(coinGeo, coinMat.clone());
    this.mesh.position.copy(this.position);
    this.mesh.position.y = 0.55;
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.castShadow = true;
    this.mesh.scale.setScalar(0.01);
    this.spinSpeed = 2.6 + Math.random();
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.age += dt;
    this.mesh.rotation.z += dt * this.spinSpeed;
    // Spawn pop then gentle bob
    const grow = Math.min(1, this.age / this.pop);
    const ease = 1 - (1 - grow) * (1 - grow);
    this.mesh.scale.setScalar(0.85 + ease * 0.35);
    this.mesh.position.y = 0.45 + Math.sin(this.age * 4.5) * 0.14 + (1 - ease) * 0.35;
  }

  tryCollect(collector: THREE.Vector3, radius: number): boolean {
    if (!this.alive) return false;
    if (dist2(this.position.x, this.position.z, collector.x, collector.z) <= radius * radius) {
      this.alive = false;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }

  dispose(): void {
    // Geometry is shared; only the per-pickup material is owned.
    (this.mesh.material as THREE.Material).dispose();
  }
}
