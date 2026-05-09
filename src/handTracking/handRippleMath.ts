/** Pure math for hand-driven mosaic ripple — planar displacement + micro-scale only. */

const TWO_PI = Math.PI * 2;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Used only for spatial ROI (keep workset to a few hundred cells on large canvases). */
export function rippleInfluenceReachPx(canvasW: number, canvasH: number): number {
  return Math.min(canvasW, canvasH) * 0.246;
}

/**
 * Travelling-wave displacement + micro-scale swell for seam coverage.
 * `presence`: palm on canvas. `wake`: motion — boosts ring crests vs quiet hover.
 */
export function rippleDisplacementPx(args: {
  tileCxPx: number;
  tileCyPx: number;
  handHxPx: number;
  handHyPx: number;
  canvasW: number;
  canvasH: number;
  timeSec: number;
  presence: number;
  wake: number;
}): { influence: number; dx: number; dy: number; scale: number } {
  const {
    tileCxPx,
    tileCyPx,
    handHxPx,
    handHyPx,
    canvasW,
    canvasH,
    timeSec,
    presence,
    wake,
  } = args;

  const minDim = Math.min(canvasW, canvasH);
  /** Visual fall-off radius — wider than ROI from `rippleInfluenceReachPx` so rings don’t hard-stop at sample edge. */
  const reach = minDim * 0.392;

  const rdx = tileCxPx - handHxPx;
  const rdy = tileCyPx - handHyPx;
  const dist = Math.hypot(rdx, rdy);

  /** 1 near palm → 0 beyond `reach`. Softer rim so large motion doesn’t cliff-edge visibly. */
  const radialWindow = Math.max(0, 1 - smoothstep(reach * 0.06, reach * 1.05, dist));
  const env = radialWindow;

  const creep = minDim * 0.28;
  const tRet = Math.max(0, timeSec - dist / creep);

  const ringAttack = 1 - Math.exp(-Math.max(tRet, 0) * 20);
  const ringDecay = Math.exp(-tRet * 1.06);
  const ringCarrierLinear = 0.5 + 0.5 * Math.cos(TWO_PI * 1.34 * tRet - (TWO_PI / Math.max(minDim * 0.071, 1)) * dist);
  /** Bias cosine toward crests/troughs so bands read as sharper rings, not muddy mid-values. */
  const ringCarrier = ringCarrierLinear ** 0.55;

  const ringAmpUnclamped =
    presence *
      (wake * wake * 8.8 + wake * 1.15 + wake * presence * 0.92 + presence * 0.18) +
    presence ** 1.2 * 1.85;
  const ringAmp = Math.max(0, Math.min(8.8, ringAmpUnclamped));
  const ring = ringAmp * ringAttack * ringDecay * ringCarrier;

  const sigma = reach * 0.29;
  const core = presence * Math.exp(-(dist * dist) / Math.max(2 * sigma * sigma, 1e-6));

  /** Almost all ring-driven for obvious outward propagation. */
  const blendRaw = env * (0.1 * core + 0.9 * ring);

  /** Allows >1 crest strength; hard cap avoids pathological spikes if refs peg. */
  const blend = Math.min(2.85, blendRaw);

  const soften = Math.max(reach * 0.068, minDim * 0.009);
  const len = Math.hypot(rdx, rdy);
  let ux = 0;
  let uy = 0;
  if (len > 1e-4) {
    ux = rdx / len;
    uy = rdy / len;
  } else {
    const inv = 1 / soften;
    const nx = rdx * inv;
    const ny = rdy * inv;
    const nlen = Math.hypot(nx, ny);
    if (nlen > 1e-6) {
      ux = nx / nlen;
      uy = ny / nlen;
    }
  }

  const near = smoothstep(reach * 0.42, reach * 0.02, dist);
  ux *= 1 - 0.04 * near;
  uy *= 1 - 0.04 * near;

  const un = Math.hypot(ux, uy);
  if (un > 1e-6) {
    ux /= un;
    uy /= un;
  }

  /** Main visibility lever after fixing spring-vs-target fighting in the provider. */
  const maxPushPx = minDim * 0.062;

  /** Subjective gain: cosine carrier averages <1; restores intended peak motion. */
  const pushGain = 1.82;
  const mag = maxPushPx * blend * pushGain;

  /** Normalised 0…1-ish for GSAP dampening (saturation avoids runaway slowdown). */
  const influence = Math.min(1, blendRaw * 0.45 + presence * radialWindow * 0.08);

  const scaleCover =
    presence * radialWindow * 0.11 * (Math.abs(ringCarrierLinear * ringDecay) + 0.35 * core);
  const scaleBoost = 1 + Math.min(0.055, scaleCover);

  return {
    influence,
    dx: ux * mag,
    dy: uy * mag,
    scale: scaleBoost,
  };
}
