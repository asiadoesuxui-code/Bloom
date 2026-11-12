/**
 * Maps MediaPipe normalized image coordinates (relative to video frame dimensions)
 * into target element normalized coordinates [0,1], assuming the video is shown
 * with the same layout as `object-fit: cover` filling `targetRect`.
 */
export function mapNormalizedImagePointToElementNorm(
  nx: number,
  ny: number,
  videoWidth: number,
  videoHeight: number,
  targetWidthPx: number,
  targetHeightPx: number,
  mirrorX: boolean,
): { x: number; y: number } {
  let u = nx;
  const v = ny;
  if (mirrorX) u = 1 - u;

  const ix = u * videoWidth;
  const iy = v * videoHeight;

  const ew = targetWidthPx;
  const eh = targetHeightPx;
  const vw = videoWidth;
  const vh = videoHeight;

  const scale = Math.max(ew / vw, eh / vh);
  const dx = (ew - vw * scale) / 2;
  const dy = (eh - vh * scale) / 2;

  const px = ix * scale + dx;
  const py = iy * scale + dy;

  return {
    x: clamp01(px / ew),
    y: clamp01(py / eh),
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Stretch the camera image so a hand that stays inside the frame can still
 * reach every edge and corner of the mosaic.
 */
export function mapHandReachToMosaic(nx: number, ny: number, mirrorX: boolean): { x: number; y: number } {
  const u = mirrorX ? 1 - nx : nx;
  return {
    x: clamp01((u - 0.5) / 0.7 + 0.5),
    y: clamp01((ny - 0.5) / 0.7 + 0.5),
  };
}

export function isNormInsideCanvas(x: number, y: number, pad = 0.02): boolean {
  return x >= -pad && x <= 1 + pad && y >= -pad && y <= 1 + pad;
}
