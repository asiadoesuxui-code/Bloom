/** Pure math for hand-driven mosaic ripple — radial displacement wave only. */

const TWO_PI = Math.PI * 2;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Outward translation (px on the mosaic plane) plus an influence scalar for GSAP dampening.
 * Travelling-wave phase uses retarded time so the crest reaches farther tiles slightly later.
 */
export function rippleDisplacementPx(args: {
  tileCxPx: number;
  tileCyPx: number;
  handHxPx: number;
  handHyPx: number;
  canvasW: number;
  canvasH: number;
  timeSec: number;
}): { influence: number; dx: number; dy: number } {
  const { tileCxPx, tileCyPx, handHxPx, handHyPx, canvasW, canvasH, timeSec } = args;

  const rdx = tileCxPx - handHxPx;
  const rdy = tileCyPx - handHyPx;
  const dist = Math.hypot(rdx, rdy);

  const minDim = Math.min(canvasW, canvasH);
  const reach = minDim * 0.54;
  const envelope = Math.max(0, 1 - smoothstep(reach * 0.06, reach * 1.02, dist));

  let ux = rdx / dist;
  let uy = rdy / dist;
  if (!(dist > 6)) {
    ux = 0;
    uy = 0;
  }

  /** Wavelength along radius (controls ring spacing). */
  const waveLen = minDim * 0.086;
  const k = TWO_PI / Math.max(waveLen, 1);
  /** Retarded clock: disturbance reaches larger `dist` later → sequential neighbor motion. */
  const creep = minDim * 0.55;
  const tLocal = Math.max(0, timeSec - dist / creep);
  /** Temporal carrier frequency (slow so it reads as fluid surface, not a “breathe”). */
  const driveHz = 0.92;
  const phase = k * dist - TWO_PI * driveHz * tLocal;
  /** 0..1 bump — outward push only (no trough pulling tiles past rest). */
  let wave = 0.5 * (1 + Math.cos(phase));
  wave **= 1.75;

  const maxPushPx = minDim * 0.0072;
  const mag = maxPushPx * envelope * wave;

  return {
    influence: envelope * wave,
    dx: ux * mag,
    dy: uy * mag,
  };
}
