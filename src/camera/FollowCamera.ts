import * as THREE from 'three';
import { clamp } from '../utils/math';

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = Math.PI * 0.25;
  private readonly pitch = 0.85;
  private readonly distance = 14;
  private readonly lookHeight = 1.2;
  private readonly follow = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
    this.camera.position.set(10, 12, 10);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  addYaw(delta: number): void {
    this.yaw += delta;
  }

  /** Camera-forward flattened onto XZ for WASD relative movement. */
  getFlatForward(out: THREE.Vector3): THREE.Vector3 {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return out;
  }

  getFlatRight(out: THREE.Vector3): THREE.Vector3 {
    out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return out;
  }

  update(target: THREE.Vector3, dt: number): void {
    this.follow.lerp(target, clamp(1 - Math.pow(0.001, dt), 0, 1));

    const horizontal = Math.cos(this.pitch) * this.distance;
    const vertical = Math.sin(this.pitch) * this.distance;

    this.desired.set(
      this.follow.x + Math.sin(this.yaw) * horizontal,
      this.follow.y + vertical,
      this.follow.z + Math.cos(this.yaw) * horizontal,
    );

    this.camera.position.lerp(this.desired, clamp(1 - Math.pow(0.0005, dt), 0, 1));
    this.lookAt.set(this.follow.x, this.follow.y + this.lookHeight, this.follow.z);
    this.camera.lookAt(this.lookAt);
  }

  snapTo(target: THREE.Vector3): void {
    this.follow.copy(target);
    const horizontal = Math.cos(this.pitch) * this.distance;
    const vertical = Math.sin(this.pitch) * this.distance;
    this.camera.position.set(
      target.x + Math.sin(this.yaw) * horizontal,
      target.y + vertical,
      target.z + Math.cos(this.yaw) * horizontal,
    );
    this.lookAt.set(target.x, target.y + this.lookHeight, target.z);
    this.camera.lookAt(this.lookAt);
  }
}
