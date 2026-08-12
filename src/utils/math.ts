import * as THREE from 'three';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomPointInRing(
  center: THREE.Vector3,
  minRadius: number,
  maxRadius: number,
): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const radius = randomRange(minRadius, maxRadius);
  return new THREE.Vector3(
    center.x + Math.cos(angle) * radius,
    0,
    center.z + Math.sin(angle) * radius,
  );
}

/** Flatten a world direction onto XZ and normalize; returns false if near-zero. */
export function flattenDirection(
  source: THREE.Vector3,
  out: THREE.Vector3,
): boolean {
  out.set(source.x, 0, source.z);
  if (out.lengthSq() < 1e-6) return false;
  out.normalize();
  return true;
}
