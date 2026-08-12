import * as THREE from 'three';
import { dist2 } from '../utils/math';

const coinGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.12, 16);
const glowGeo = new THREE.SphereGeometry(0.22, 8, 8);

export class LootPickup {
  readonly mesh: THREE.Group;
  readonly position: THREE.Vector3;
  alive = true;
  private age = 0;
  private readonly spinSpeed: number;
  private readonly coin: THREE.Mesh;

  constructor(position: THREE.Vector3) {
    this.position = position.clone();
    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);

    const coinMat = new THREE.MeshLambertMaterial({
      color: 0xffd166,
      emissive: 0xaa7700,
      emissiveIntensity: 0.45,
    });
    this.coin = new THREE.Mesh(coinGeo, coinMat);
    this.coin.position.y = 0.55;
    this.coin.castShadow = true;
    this.mesh.add(this.coin);

    const glow = new THREE.Mesh(
      glowGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    glow.position.y = 0.55;
    this.mesh.add(glow);

    this.spinSpeed = 2.4 + Math.random();
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.age += dt;
    this.coin.rotation.y += dt * this.spinSpeed;
    this.mesh.position.y = Math.sin(this.age * 4) * 0.14;
  }

  /** Soft magnet + collect. Returns true when picked up. */
  tryCollect(collector: THREE.Vector3, radius: number, dt: number): boolean {
    if (!this.alive) return false;
    let d2 = dist2(this.position.x, this.position.z, collector.x, collector.z);
    const magnet = radius * 2.2;
    if (d2 <= magnet * magnet && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const pull = Math.min(10 * dt, d);
      this.position.x += ((collector.x - this.position.x) / d) * pull;
      this.position.z += ((collector.z - this.position.z) / d) * pull;
      this.mesh.position.x = this.position.x;
      this.mesh.position.z = this.position.z;
      d2 = dist2(this.position.x, this.position.z, collector.x, collector.z);
    }
    if (d2 <= radius * radius) {
      this.alive = false;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }
}
