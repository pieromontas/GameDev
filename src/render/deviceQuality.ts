import * as THREE from 'three';

/**
 * Phone / iPad GPU profile vs desktop.
 *
 * `?touch=1` is a desktop overlay preview — it must not drop quality.
 * iPadOS-as-desktop (Safari “Request Desktop Website”) is caught via
 * maxTouchPoints + MacIntel / iPad UA, not the overlay query.
 */

let cached: boolean | undefined;

/** True when this session is real phone/iPad play (not a desktop mouse). */
export function isMobilePlay(): boolean {
  if (cached !== undefined) return cached;
  cached = detectMobilePlay();
  return cached;
}

export function cappedPixelRatio(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(dpr, isMobilePlay() ? 1.25 : 2);
}

/**
 * Extra MeshToon point lights (lanterns, forge, chapel, braziers).
 * Lamp meshes stay; on mobile we add none.
 */
export function addDynamicPointLight(
  parent: THREE.Object3D,
  color: number,
  intensity: number,
  distance: number,
  decay = 2,
): THREE.PointLight | null {
  if (isMobilePlay()) return null;
  const light = new THREE.PointLight(color, intensity, distance, decay);
  parent.add(light);
  return light;
}

function detectMobilePlay(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  if (mq('(pointer: coarse)')) return true;
  if ('ontouchstart' in window && mq('(hover: none)')) return true;

  const ua = navigator.userAgent ?? '';
  const platform = navigator.platform ?? '';
  const iPadOsAsDesktop =
    navigator.maxTouchPoints > 1 &&
    (platform === 'MacIntel' || /iPad|iPhone|iPod/.test(ua));
  if (iPadOsAsDesktop) return true;

  return false;
}

function mq(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}
