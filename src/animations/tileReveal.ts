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
  opacityDur: number;
  transformDur: number;
  /** GSAP ease string */
  transformEase: string;
};

/**
 * Snappy reveal aligned with the prior ~200ms spring feel: fast ease-out body,
 * optional mild back overshoot from seed. Elastic removed — it reads as slow / dragged early on.
 */
export function revealGsParamsFromSeed(seed: number, delaySec: number): RevealGsParams {
  const { stiffness, mass } = revealSpringFromSeed(seed);
  const transformDur =
    0.2 + mass * 0.05 + ((520 - Math.min(520, stiffness)) / 520) * 0.08;
  const clampedDur = Math.min(0.36, Math.max(0.22, transformDur));

  /** Mostly power3.out (quick onset); ~¼ tiles get light back for variety without long tails */
  const useBack = (seed >>> 4) & 3;
  const backAmt = 1.06 + ((stiffness - 300) / 250) * 0.14;
  const backClamped = Math.min(1.22, Math.max(1.05, backAmt));
  const transformEase = useBack === 0 ? `back.out(${backClamped})` : 'power3.out';

  return {
    delaySec,
    opacityDur: 0.17,
    transformDur: clampedDur,
    transformEase,
  };
}
