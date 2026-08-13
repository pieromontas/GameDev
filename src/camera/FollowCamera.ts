import * as THREE from 'three';
import { clamp } from '../utils/math';

/** Default orbit distance — pulled back so spawn meadow hill doesn’t swallow the hero. */
const DEFAULT_DISTANCE = 21;
const MIN_DISTANCE = 7.5;
const MAX_DISTANCE = 26;

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = Math.PI * 0.25;
  /** Slightly steeper + higher than street-combat framing so boot spawn stays readable. */
  private readonly pitch = 0.92;
  /** Smoothed orbit radius (lerps toward `distanceTarget`). */
  private distance = DEFAULT_DISTANCE;
  private distanceTarget = DEFAULT_DISTANCE;
  private readonly lookHeight = 1.4;
  private readonly follow = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  /** Brief impact punch (0–1-ish); decays each frame. */
  private impactPunch = 0;

  constructor(aspect: number) {
    // Slightly wider FOV keeps the iso-ish frame without going FPS.
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 280);
    // Initial pose matches snap defaults (distance 21 / pitch 0.92 / yaw π/4).
    this.camera.position.set(9, 17, 9);
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

  /**
   * Zoom by changing orbit distance. Positive delta zooms out, negative zooms in.
   * Clamped so the camera never clips the hero or flies into outer space.
   */
  addZoom(delta: number): void {
    if (delta === 0) return;
    this.distanceTarget = clamp(this.distanceTarget + delta, MIN_DISTANCE, MAX_DISTANCE);
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
    // Snappier follow for combat circles; still soft enough for city walks.
    this.follow.lerp(target, clamp(1 - Math.pow(0.00012, dt), 0, 1));

    // Smooth zoom — exponential approach, not hard jumps.
    this.distance +=
      (this.distanceTarget - this.distance) * clamp(1 - Math.pow(0.00002, dt), 0, 1);

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

    this.camera.position.lerp(this.desired, clamp(1 - Math.pow(0.00008, dt), 0, 1));
    this.lookAt.set(this.follow.x, this.follow.y + lookH, this.follow.z);
    this.camera.lookAt(this.lookAt);
  }

  snapTo(target: THREE.Vector3): void {
    this.follow.copy(target);
    this.distance = this.distanceTarget;
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
