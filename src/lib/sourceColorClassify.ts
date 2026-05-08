import type { Oklab } from './colorSpace';

/** Ceramic variant names that read visually blue — never use on leafy greens */
export function isBlueCeramicFamily(colorKey: string): boolean {
  return colorKey.toLowerCase().includes('blue');
}

/** `_brown`, `darkbrown`, etc. — confusable with dark greens in distance-only matching */
export function isBrownCeramicFamily(colorKey: string): boolean {
  return colorKey.toLowerCase().includes('brown');
}

/**
 * Real brown / ochre / seed-centre pixels where brown ceramics should stay in the running.
 * Kept conservative so pastel peach/sky and foliage are not mistaken for dirt.
 */
export function isWarmBrownOrangeSample(r: number, g: number, b: number): boolean {
  const sum = r + g + b;
  if (sum < 52) return false;

  // Light pastel pinks / skies / cream petals — not seed brown
  if (r > 148 && g > 128 && b > 112) return false;

  // Warm luminant orange-brown (sunflower centres, bark highlights)
  if (r > g + 9 && r > b + 17 && r > 56) return true;

  // Deep earthy brown with clearly weaker blue
  if (r > 88 && g > 48 && b < r - 20 && b < g - 4 && r > g - 12) return true;

  return false;
}

/**
 * Obvious vegetation green (opponent + guards) — same as before, but kept as the strongest signal.
 */
export function isVegetationGreenSample(r: number, g: number, b: number, lab: Oklab): boolean {
  const greenExcess = g - 0.5 * (r + b);
  const chroma = Math.hypot(lab.a, lab.b);

  if (b > g + 20 && b > r + 14) return false;
  if (r > g + 28 && r > b + 12) return false;

  if (greenExcess >= 5) return true;
  if (greenExcess >= 1 && g >= Math.max(r, b) - 6 && b <= g + 12) return true;
  if (chroma >= 0.012 && greenExcess >= -3 && b <= g + 10 && r <= g + 14) return true;
  if (r + g + b < 110 && greenExcess >= -5 && g + 3 >= b && g + 5 >= r) return true;

  return false;
}

/**
 * Field + forest mass tone: dark tree silhouettes, crushed shadow greens, misty mid-tones.
 * These are where brown ceramics incorrectly “win” via ΔE even though there is little true brown in the photo.
 */
function isForestOrFieldMassTone(r: number, g: number, b: number, lab: Oklab): boolean {
  if (b > g + 16 && b > r + 12) return false;
  if (r > g + 26 && r > b + 12) return false;

  const greenExcess = g - 0.5 * (r + b);
  const sum = r + g + b;

  // Dark mass: greens, greys, near-black — brown should not own these in field/forest sources
  if (sum <= 245 && greenExcess >= -14) {
    if (r > g + 22 && r > b + 12) return false;
    return true;
  }

  // Hazy mid foliage / distance — green channel roughly competitive, not a hot red bloom
  if (sum > 245 && sum < 540 && greenExcess >= -10 && b <= g + 18 && r <= g + 20) {
    if (r > g + 24 && r > b + 14) return false;
    return true;
  }

  // Neutral charcoal silhouettes (R≈G≈B) still read as canopy, not soil
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (sum < 165 && spread <= 16 && greenExcess >= -18) return true;

  return false;
}

/**
 * For pixels that are clearly foliage / canopy atmosphere, exclude ceramic blues *and* browns
 * that only matched because of shared low luminance with green shadows.
 */
export function shouldSuppressConflictingEarthTones(r: number, g: number, b: number, lab: Oklab): boolean {
  if (isWarmBrownOrangeSample(r, g, b)) return false;
  if (isVegetationGreenSample(r, g, b, lab)) return true;
  if (isForestOrFieldMassTone(r, g, b, lab)) return true;
  return false;
}

/** @deprecated narrow name — use shouldSuppressConflictingEarthTones */
export function shouldSuppressBlueFamilies(r: number, g: number, b: number, lab: Oklab): boolean {
  return shouldSuppressConflictingEarthTones(r, g, b, lab);
}
