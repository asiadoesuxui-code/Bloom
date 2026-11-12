/** One tile’s post-reveal motion: either still, snappy pulse, or a strong “step toward” the viewer */
export type TileLivingKind = 'static' | 'pulse' | 'loom';

type LivingStatic = { kind: 'static' };

type LivingPulse = {
  kind: 'pulse';
  scalePeak: number;
  scaleHalfSec: number;
  scalePhaseSec: number;
};

type LivingLoom = {
  kind: 'loom';
  scalePeak: number;
  scaleHalfSec: number;
  scalePhaseSec: number;
};

export type LivingMotionParams = LivingStatic | LivingPulse | LivingLoom;

/** Pulse: quicker rhythm (~1.2–6.5s full cycle) */
function pulseCycleSec(fragment: number): number {
  return 1.2 + (fragment % 531) / 100;
}

/** Loom: weightier, still readable (~1.6–8.2s) */
function loomCycleSec(fragment: number): number {
  return 1.6 + (fragment % 661) / 100;
}

/**
 * About one tile in five breathes. The old ~80% kept a compositor layer
 * on most of the mosaic and fell to ~30fps under a 4x CPU throttle.
 */
function livingKindFromSeed(seed: number): TileLivingKind {
  const t = (Math.imul(seed ^ 0x85ebca6b, 0xc2b2ae35) >>> 0) % 100;
  if (t < 78) return 'static';
  if (t < 90) return 'pulse';
  return 'loom';
}

/**
 * Bold scale-only motion: large enough to read across ~2k tiles.
 * - **pulse**: fast breathe, ~7–18% swell
 * - **loom**: “surface” push, ~14–26% swell, slightly longer legs
 */
export function getLivingMotionParams(seed: number): LivingMotionParams {
  const s = seed | 0;
  const kind = livingKindFromSeed(s);

  if (kind === 'static') {
    return { kind: 'static' };
  }

  if (kind === 'pulse') {
    const cycle = pulseCycleSec(s);
    return {
      kind: 'pulse',
      scalePeak: 1.07 + (s & 7) * 0.014,
      scaleHalfSec: cycle / 2,
      scalePhaseSec: ((s >>> 8) % 1000) / 1000 * cycle,
    };
  }

  const cycle = loomCycleSec(s >>> 10) * (1.05 + ((s >>> 12) & 7) * 0.045);
  return {
    kind: 'loom',
    scalePeak: 1.14 + (s & 7) * 0.016,
    scaleHalfSec: cycle / 2,
    scalePhaseSec: ((s >>> 14) % 1000) / 1000 * cycle,
  };
}
