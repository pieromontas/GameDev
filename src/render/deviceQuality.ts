import * as THREE from 'three';

/**
 * Phone / iPad GPU profile vs desktop.
 *
 * `?touch=1` is a desktop overlay preview — it must not drop quality.
 * iPadOS-as-desktop (Safari “Request Desktop Website”) is caught via
 * maxTouchPoints + MacIntel / iPad UA, not the overlay query.
 */

export type MobilePlayEnv = {
  matchMedia: (query: string) => boolean;
  hasOntouchstart: boolean;
  maxTouchPoints: number;
  platform: string;
  userAgent: string;
};

let cached: boolean | undefined;

/** True when this session is real phone/iPad play (not a desktop mouse). */
export function isMobilePlay(): boolean {
  if (cached !== undefined) return cached;
  cached = detectMobilePlay(readBrowserEnv());
  return cached;
}

/** Pure detector — used by `isMobilePlay()` and by tests. */
export function detectMobilePlay(env: MobilePlayEnv | null): boolean {
  if (!env) return false;
  if (env.matchMedia('(pointer: coarse)')) return true;
  if (env.hasOntouchstart && env.matchMedia('(hover: none)')) return true;

  const iPadOsAsDesktop =
    env.maxTouchPoints > 1 &&
    (env.platform === 'MacIntel' || /iPad|iPhone|iPod/.test(env.userAgent));
  return iPadOsAsDesktop;
}

export function cappedPixelRatio(dpr = defaultDpr(), mobile = isMobilePlay()): number {
  return Math.min(dpr, mobile ? 1.25 : 2);
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

function defaultDpr(): number {
  return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
}

function readBrowserEnv(): MobilePlayEnv | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return null;
  }
  return {
    matchMedia: (query) => mq(query),
    hasOntouchstart: 'ontouchstart' in window,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    platform: navigator.platform ?? '',
    userAgent: navigator.userAgent ?? '',
  };
}

function mq(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}
