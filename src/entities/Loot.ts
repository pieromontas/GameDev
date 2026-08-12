import * as THREE from 'three';
import { dist2 } from '../utils/math';

const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.1, 12);
const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd166, emissive: 0x664400, emissiveIntensity: 0.2 });

export class LootPickup {
  readonly mesh: THREE.Mesh;
  readonly position: THREE.Vector3;
  alive = true;
  private age = 0;
  private readonly spinSpeed: number;

  constructor(position: THREE.Vector3) {
    this.position = position.clone();
    this.mesh = new THREE.Mesh(coinGeo, coinMat.clone());
    this.mesh.position.copy(this.position);
    this.mesh.position.y = 0.4;
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.castShadow = true;
    this.spinSpeed = 2 + Math.random();
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.age += dt;
    this.mesh.rotation.z += dt * this.spinSpeed;
    this.mesh.position.y = 0.4 + Math.sin(this.age * 4) * 0.12;
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
}
