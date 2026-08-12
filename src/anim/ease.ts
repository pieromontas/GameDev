/** Tiny easing helpers for procedural mesh animation. */

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Attack curve: wind-up then snappy strike. Peak near `strikeAt`. */
export function strikeCurve(t: number, strikeAt = 0.35): number {
  const x = clamp01(t);
  if (x < strikeAt) {
    return smoothstep(x / strikeAt) * 0.35;
  }
  const u = (x - strikeAt) / (1 - strikeAt);
  // Overshoot then settle
  return 0.35 + easeOutCubic(Math.min(1, u * 1.35)) * 0.65;
}
