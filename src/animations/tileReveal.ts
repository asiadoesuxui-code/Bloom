/** Upper clamp for `transformDur` — keep in sync with `revealLivingHoldMs` in `lib/mosaic.ts`. */
export const REVEAL_TRANSFORM_DUR_MAX_SEC = 0.36;

/** Per-tile spring-ish physics hints from seed (maps to GSAP duration / ease). */
export function revealSpringFromSeed(seed: number): {
  stiffness: number;
  damping: number;
  mass: number;
} {
  const s = seed | 0;
  const stiffness = 300 + (Math.imul(s, 0x9e3779b1) >>> 0) % 250;
  const damping = 18 + ((s >>> 11) % 12);
  const mass = 0.78 + (((s >>> 19) & 0x1f) * 0.006);
  return { stiffness, damping, mass };
}

export type RevealMicro = {
  rotateDeg: number;
  yPercent: number;
};

/** Small rotation and vertical offset for a less uniform pop-in. */
export function revealMicroFromSeed(seed: number): RevealMicro {
  const s = seed | 0;
  const a = Math.imul(s ^ 0x4f1bbcdc, 0x7feb352d) >>> 0;
  const b = Math.imul(s ^ 0xf4a98d1d, 0x846ca68b) >>> 0;
  const rotateDeg = ((a / 0x1_0000_0000) - 0.5) * 6;
  const yPercent = ((b / 0x1_0000_0000) - 0.5) * 8;
  return { rotateDeg, yPercent };
}

export type RevealGsParams = {
  delaySec: number;
  transformDur: number;
  /** GSAP ease hint (parity; CSS uses monotone cubic-bezier below). */
  transformEase: string;
  /** Compositor timing for CSS transform keyframes — monotonic to avoid clip pops with overflow:hidden. */
  cssTimingFunction: string;
};

/** GSAP-ish power3.out for CSS — stays within [0,1] on Y so transforms never extrapolate past the final keyframe. */
const CSS_TRANSFORM_EASE_MONOTONE = 'cubic-bezier(0.33, 1, 0.68, 1)';

/**
 * Snappy reveal aligned with the prior ~200ms spring feel: fast ease-out body,
 * per-tile duration jitter from seed. Omit ease-out-back on CSS transforms: that easing pushes
 * interpolation past the `to` keyframe (scale > 1, rotation past 0°); tiles stay
 * `overflow:hidden` during reveal → overshoot clips against cell edges and reads as a hard jump.
 */
export function revealGsParamsFromSeed(seed: number, delaySec: number): RevealGsParams {
  const { stiffness, mass } = revealSpringFromSeed(seed);
  const transformDur =
    0.2 + mass * 0.05 + ((520 - Math.min(520, stiffness)) / 520) * 0.08;
  const clampedDur = Math.min(REVEAL_TRANSFORM_DUR_MAX_SEC, Math.max(0.22, transformDur));

  return {
    delaySec,
    transformDur: clampedDur,
    transformEase: 'power3.out',
    cssTimingFunction: CSS_TRANSFORM_EASE_MONOTONE,
  };
}
