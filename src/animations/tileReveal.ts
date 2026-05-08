import type { Transition } from 'framer-motion';

/** Per-tile spring for the diagonal reveal (seed keeps variation stable per cell). */
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

export function revealTransitionFromSeed(seed: number, delaySec: number): Transition {
  const { stiffness, damping, mass } = revealSpringFromSeed(seed);
  const d = delaySec;
  /** Per-key `delay` so opacity tween is not left at t=0 while springs wait (Framer does not always inherit root delay onto nested tweens). */
  const spring = { type: 'spring' as const, stiffness, damping, mass, delay: d };
  return {
    opacity: { type: 'tween', ease: 'easeOut', duration: 0.22, delay: d },
    scale: spring,
    rotate: spring,
    y: spring,
  };
}
