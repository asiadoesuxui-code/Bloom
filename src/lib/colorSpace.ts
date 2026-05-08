/** Linear sRGB channel 0–1 */
function linearSrgbByte(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** Björn Ottosson Oklab — good perceptual uniformity for hue discrimination (greens vs blues). */
export type Oklab = { L: number; a: number; b: number };

export function rgbToOklab(rByte: number, gByte: number, bByte: number): Oklab {
  const r = linearSrgbByte(rByte);
  const g = linearSrgbByte(gByte);
  const b = linearSrgbByte(bByte);

  const l = 0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b;
  const m = 0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b;
  const s = 0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.210_454_255_3 * l_ + 0.793_617_785 * m_ - 0.004_072_046_8 * s_,
    a: 1.977_998_495_1 * l_ - 2.428_592_205 * m_ + 0.450_593_709_9 * s_,
    b: 0.025_904_037_1 * l_ + 0.782_771_766_2 * m_ - 0.808_675_766 * s_,
  };
}

/**
 * Weight chroma (a, b) slightly higher than lightness so wrong-hue tiles (e.g. blue vs leafy green)
 * lose to same-lightness correct-hue families.
 */
const CHROMA_WEIGHT = 1.48;

export function oklabDistanceSquared(s: Oklab, t: Oklab): number {
  const dL = s.L - t.L;
  const da = (s.a - t.a) * CHROMA_WEIGHT;
  const db = (s.b - t.b) * CHROMA_WEIGHT;
  return dL * dL + da * da + db * db;
}
