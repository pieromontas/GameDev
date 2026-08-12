import * as THREE from 'three';
import { clamp } from '../utils/math';

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = Math.PI * 0.25;
  private readonly pitch = 0.82;
  private readonly distance = 13.5;
  private readonly lookHeight = 1.35;
  private readonly follow = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  /** Brief impact punch (0–1-ish); decays each frame. */
  private impactPunch = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
    this.camera.position.set(10, 12, 10);
  }

  /** Subtle forward nudge on heavy impacts (Quake). Keep tiny. */
  addImpactPunch(amount = 0.16): void {
    this.impactPunch = Math.min(0.28, Math.max(this.impactPunch, amount));
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
    // Single snappy follow — less double-lerp lag in combat circles.
    this.follow.lerp(target, clamp(1 - Math.pow(0.00008, dt), 0, 1));

    if (this.impactPunch > 0) {
      this.impactPunch = Math.max(0, this.impactPunch - dt * 3.4);
    }
    const punch = this.impactPunch;
    const dist = this.distance - punch * 0.85;
    const lookH = this.lookHeight - punch * 0.12;

    const horizontal = Math.cos(this.pitch) * dist;
    const vertical = Math.sin(this.pitch) * dist;

    this.desired.set(
      this.follow.x + Math.sin(this.yaw) * horizontal,
      this.follow.y + vertical,
      this.follow.z + Math.cos(this.yaw) * horizontal,
    );

    this.camera.position.lerp(this.desired, clamp(1 - Math.pow(0.00005, dt), 0, 1));
    this.lookAt.set(this.follow.x, this.follow.y + lookH, this.follow.z);
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
