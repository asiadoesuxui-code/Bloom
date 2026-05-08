/** Pure math for hand-driven mosaic ripple — used by the shared tick loop. */

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function rippleTargets(args: {
  distPx: number;
  radiusPx: number;
  timeSec: number;
}): { influence: number; scale: number; rotateDeg: number; brightness: number } {
  const { distPx, radiusPx, timeSec } = args;
  const envelope = 1 - smoothstep(radiusPx * 0.12, radiusPx * 1.08, distPx);
  const infl = Math.max(0, envelope);

  const wave = Math.sin(timeSec * 2.15 - distPx * 0.038);
  const pulse = infl * (0.52 + 0.48 * wave);

  return {
    influence: infl,
    scale: 1 + 0.052 * pulse,
    rotateDeg: pulse * 2.6 * infl,
    brightness: 1 + 0.065 * pulse * infl,
  };
}
