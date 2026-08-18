import * as THREE from 'three';

/**
 * Phone / iPad GPU profile vs desktop.
 *
 * `?touch=1` is a desktop overlay preview — it must not drop quality.
 * iPadOS-as-desktop (Safari “Request Desktop Website”) is caught via
 * maxTouchPoints + MacIntel / iPad UA, not the overlay query.
 * macOS Safari with a mouse stays on the desktop GPU path.
 */

export type MobilePlayEnv = {
  matchMedia: (query: string) => boolean;
  hasOntouchstart: boolean;
  maxTouchPoints: number;
  platform: string;
  userAgent: string;
  vendor: string;
};

let cachedMobile: boolean | undefined;
let cachedIos: boolean | undefined;

/** True when this session is real phone/iPad play (not a desktop mouse). */
export function isMobilePlay(): boolean {
  if (cachedMobile !== undefined) return cachedMobile;
  cachedMobile = detectMobilePlay(readBrowserEnv());
  return cachedMobile;
}

/**
 * iPhone / iPad (Safari, and Chrome/Firefox on iOS — all WebKit).
 * Safari must get the strict cap; Chrome on iPad can share it.
 * macOS Safari with no touch stays false.
 */
export function isIosPlay(): boolean {
  if (cachedIos !== undefined) return cachedIos;
  cachedIos = detectIosPlay(readBrowserEnv());
  return cachedIos;
}

/** Pure detector — used by `isMobilePlay()` and by tests. */
export function detectMobilePlay(env: MobilePlayEnv | null): boolean {
  if (!env) return false;
  if (detectIosPlay(env)) return true;
  if (env.matchMedia('(pointer: coarse)')) return true;
  if (env.hasOntouchstart && env.matchMedia('(hover: none)')) return true;
  return false;
}

/** Pure iOS / iPadOS detector — Safari desktop-mode iPad included. */
export function detectIosPlay(env: MobilePlayEnv | null): boolean {
  if (!env) return false;
  if (/iPad|iPhone|iPod/.test(env.userAgent)) return true;
  // iPadOS “Request Desktop Website”: Macintosh UA, but it is still a touch iPad.
  // Chrome/Firefox on iPad often share this UA — they can take the strict cap.
  if (env.maxTouchPoints > 1 && env.platform === 'MacIntel') return true;
  return false;
}

export function cappedPixelRatio(
  dpr = defaultDpr(),
  mobile = isMobilePlay(),
  ios = isIosPlay(),
): number {
  // Safari iPad desktop-mode is often 1024–1366 CSS px at dpr 2 — 1.0 is the extra cut.
  if (ios) return Math.min(dpr, 1);
  if (mobile) return Math.min(dpr, 1.25);
  return Math.min(dpr, 2);
}

/** Drawable CSS size. iOS/iPadOS Safari uses visualViewport (URL bar / desktop-mode). */
export function drawingBufferSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 1, height: 1 };
  if (isIosPlay()) {
    const vv = window.visualViewport;
    if (vv && vv.width > 1 && vv.height > 1) {
      return { width: vv.width, height: vv.height };
    }
  }
  return { width: window.innerWidth, height: window.innerHeight };
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
    vendor: navigator.vendor ?? '',
  };
}

function mq(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}
