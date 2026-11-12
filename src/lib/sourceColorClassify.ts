import type { Oklab } from './colorSpace';

/**
 * Ceramic blues — `darkblue`, `lightblue`, and `midblue`.
 * `seagreen` does not match. These stay off foliage unless the sample is actually blue.
 */
export function isBlueCeramicFamily(colorKey: string): boolean {
  return colorKey.toLowerCase().includes('blue');
}

/**
 * A cell with a real green cast. Used to keep `forest` off charcoal and grey walls.
 */
export function isGreenLeaningSample(r: number, g: number, b: number): boolean {
  const greenExcess = g - 0.5 * (r + b);
  if (greenExcess < 10) return false;
  if (b > g + 6) return false;
  if (r > g + 14) return false;
  return true;
}

/**
 * Only the dark mass of a leaf. Mid-tone foliage stays on `green` / `lightgreen`
 * so a field of pads does not collapse into `forest`.
 */
export function isDarkForestSample(r: number, g: number, b: number): boolean {
  if (!isGreenLeaningSample(r, g, b)) return false;
  const sum = r + g + b;
  if (sum > 150) return false;
  if (g > 72) return false;
  return true;
}

/** Pink and magenta: blue participates, so these are not scarlet. */
export function isPinkOrMagentaSample(r: number, g: number, b: number): boolean {
  if (r < 90) return false;
  if (b > g + 6 && r > g + 12 && r >= b - 30) return true;
  if (b > 95 && g > 80 && r > g && r > b && b > r * 0.48 && r < 245 && g > 70) return true;
  return false;
}

/**
 * Blood red / poppy scarlet. Pink, magenta, orange, and gold fail this.
 * `poppy` and `red` ceramics are legal only here.
 */
export function isTrueScarletSample(r: number, g: number, b: number): boolean {
  if (isPinkOrMagentaSample(r, g, b)) return false;
  if (r < 120) return false;
  if (g > 140) return false;
  if (r < g + 72) return false;
  if (r < b + 58) return false;
  if (b > g + 8) return false;
  return true;
}

/**
 * Soil, seed centres, and branches: warm, but red stays close to green.
 * A saturated red, pink, or orange fails this.
 */
export function isGenuineBrownSample(r: number, g: number, b: number): boolean {
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread < 10 || spread > 72) return false;
  if (r < 36 || g < 24) return false;
  if (b > g + 6) return false;
  if (g > r + 12) return false;
  if (r > g + 32) return false;
  return r > b + 8;
}

/**
 * A red that is too dark or too shaded for `poppy`, but still red.
 * Pink, gold, and genuine brown stay out.
 */
export function isShadedRedSample(r: number, g: number, b: number): boolean {
  if (isPinkOrMagentaSample(r, g, b) || isGenuineBrownSample(r, g, b)) return false;
  if (g > 88 && g > r * 0.58) return false;
  if (r < 48 || r < g + 28 || r < b + 18) return false;
  if (b > g + 12) return false;
  return true;
}

/** Red, pink, and orange hues. Brown ceramics are the wrong family for these. */
export function isRedPinkOrOrangeHue(r: number, g: number, b: number): boolean {
  if (isGenuineBrownSample(r, g, b)) return false;
  if (isPinkOrMagentaSample(r, g, b) || isTrueScarletSample(r, g, b) || isShadedRedSample(r, g, b)) return true;
  return r > 80 && r > g + 8 && g > b + 12 && r > b + 28 && g > 40;
}

/** Foliage ceramics. `forest` belongs with `green`, `lightgreen`, and `seagreen`. */
export function isLeafyGreenCeramicFamily(colorKey: string): boolean {
  switch (colorKey.toLowerCase()) {
    case 'green':
    case 'lightgreen':
    case 'seagreen':
    case 'forest':
      return true;
    default:
      return false;
  }
}

/** Deep `red` and bright `poppy` share the true-red gate. */
export function isScarletCeramicFamily(colorKey: string): boolean {
  const key = colorKey.toLowerCase();
  return key === 'red' || key === 'poppy';
}

/** Pale petal and paper colours. They stay eligible on light grounds. */
export function isLightNeutralCeramicFamily(colorKey: string): boolean {
  const key = colorKey.toLowerCase();
  return key === 'cream' || key === 'blush';
}

/**
 * A pale, weakly hued cell: cream paper, a white petal, a blush wash.
 * Saturated blooms fall outside this, so cream and blush are not pushed onto them.
 */
export function isLightNeutralSample(r: number, g: number, b: number): boolean {
  const sum = r + g + b;
  if (sum < 460) return false;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return spread < 62;
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
function isForestOrFieldMassTone(r: number, g: number, b: number, _lab: Oklab): boolean {
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

/**
 * True only for compressed dark sunflower seed disks — petals, leaves, sky, bright gold stay false
 * so `sunflower` sources can ban `_brown` except in the nucleus.
 */
export function isSunflowerSeedCentreSample(r: number, g: number, b: number): boolean {
  const minRg = Math.min(r, g);
  if (minRg - b > 32 && r + g > 205) return false;

  const sum = r + g + b;
  if (sum > 302) return false;
  if (r < 60) return false;

  if (g > r + 14 && b < r + 20) return false;

  // Grey / violet shadows on petals — not the seed plate
  if (b > g - 5 && r < 138) return false;

  if (r > 102 && r > g + 4 && r > b + 24 && sum < 232) return true;
  if (r > 88 && r > g + 2 && r > b + 16 && sum < 208) return true;

  if (r > 70 && r >= g - 10 && r > b + 9 && sum < 198) return true;

  return false;
}

/** Sunlit petals: prefer `_yellow` over neighbouring warm families during sunflower tweaks. */
export function isBrightGoldenFlowerSample(r: number, g: number, b: number): boolean {
  const minRg = Math.min(r, g);
  if (minRg - b < 24 || r + g < 268) return false;
  return r > 102 && g > 92 && b < 146;
}

/** Sky / open shade pigments where *blue* ceramics are warranted (not teal leaf or grey shadow). */
export function isClearlyBlueDominantSample(r: number, g: number, b: number): boolean {
  if (b <= r + 18 || b <= g + 14) return false;

  const greenExcess = g - 0.5 * (r + b);
  if (g > r + 36 && r < 118 && greenExcess > 2 && b <= g + 52) return false;

  if (b > r + 30 && b > g + 24) return true;
  if (b > g + 10 && b > r + 22 && r + g + b > 305) return true;
  if (b > 175 && r < 178 && g < 198 && r + g + b > 420) return true;

  return false;
}

/**
 * True scarlet / blood red / magenta bloom — excludes sunflower orange (high R and G together).
 * Lets `_red` stay legal only when the sample is actually red-magenta, not gold.
 */
export function isClearlyScarletOrMagentaRedSample(r: number, g: number, b: number): boolean {
  const sum = r + g + b;
  const minRg = Math.min(r, g);
  if (sum < 68) return false;

  // Magenta / fuchsia leaning
  if (r > 85 && b > g + 20 && r > g + 6 && b > 68) return true;

  // True red / near-red: dominant R, subdued G vs orange blossom
  if (r > g + 48 && r > b + 34 && r > 112) {
    if (g > 118 && minRg - b > 28 && r < 246) return false;
    return true;
  }

  return false;
}
