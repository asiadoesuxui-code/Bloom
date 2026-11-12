import { REVEAL_TRANSFORM_DUR_MAX_SEC } from '../animations/tileReveal';
import type { ResolvedTile } from './tileUrls';
import { rgbToOklab, oklabDistanceSquared, type Oklab } from './colorSpace';
import { parseTileKeysFromId } from './tileKeys';
import {
  isBlueCeramicFamily,
  isBrownCeramicFamily,
  isDarkForestSample,
  isLeafyGreenCeramicFamily,
  isLightNeutralCeramicFamily,
  isLightNeutralSample,
  isLilyWaterCeramicFamily,
  isLilyWaterSample,
  isScarletCeramicFamily,
  isTrueScarletSample,
  shouldSuppressConflictingEarthTones,
  isBrightGoldenFlowerSample,
  isClearlyBlueDominantSample,
  isSunflowerSeedCentreSample,
} from './sourceColorClassify';
import { LABEL_FAMILIES, type PaintedScene } from './scenePaint';
import { GRID_H, GRID_W, waveRankMap } from './waveOrder';

export type MosaicFit = 'stretch' | 'cover';

export type MosaicBuildOptions = {
  gridW?: number;
  gridH?: number;
  /** `stretch` maps the whole photo (landscape, unchanged). `cover` center-crops to the grid. */
  fit?: MosaicFit;
};

export const REVEAL_TOTAL_MS = 5000;

/**
 * Wait this long after reveal starts before enabling living GSAP / layout toggles.
 * Last tile starts at `staggerSpanSec = REVEAL_TOTAL_MS/1000 - REVEAL_TILE_DURATION_SEC` and
 * needs up to `REVEAL_TRANSFORM_DUR_MAX_SEC` for its CSS transform to finish.
 */
export function revealLivingHoldMs(): number {
  const staggerSpanSec = REVEAL_TOTAL_MS / 1000 - REVEAL_TILE_DURATION_SEC;
  const lastRevealEndSec = staggerSpanSec + REVEAL_TRANSFORM_DUR_MAX_SEC;
  return Math.ceil(lastRevealEndSec * 1000) + 48;
}
export const REVEAL_TILE_DURATION_SEC = 0.2;
/** Max per-cell time shift vs pure diagonal rank, as a fraction of stagger span (keeps TL→BR while adding irregularity). */
export const REVEAL_CHAOS_FRAC = 0.14;
/** Sinusoidal delay ripple along `cx + cy`; amplitude as fraction of stagger span (set `0` to disable). */
export const REVEAL_RIPPLE_FRAC = 0.085;
/** Ripple spatial frequency in rad per diagonal index — a few gentle bands across the grid. */
export const REVEAL_RIPPLE_K = 0.2;

export type MosaicCell = {
  cx: number;
  cy: number;
  url: string;
  /** Framer Motion stagger delay (seconds) */
  delaySec: number;
  /** Stable seed for living motion */
  seed: number;
};

type MosaicTileLab = ResolvedTile & { lab: Oklab };

type TileMeta = MosaicTileLab & { colorKey: string };

/** Smallest Oklab² gap allowing an alternate hue family — keeps tie-break touches without drifting hue */
const FAMILY_DISTANCE_TIE_OKLAB2 = 0.00042;

/** When the source photo is sunflower: nudge ceramic family picks away from `_brown`, toward `_yellow`. */
const SUNFLOWER_FAMILY_PENALTY_BROWN_OKLAB2 = 0.00115;
const SUNFLOWER_FAMILY_BONUS_YELLOW_OKLAB2 = 0.00075;
/** Extra bias on illuminated yellow petals (`_brown` already dropped outside the seed disk). */
const SUNFLOWER_GOLD_PETAL_EXTRA_YELLOW_OKLAB2 = 0.0005;

function familyDistanceForRanking(
  d2: number,
  colorKey: string,
  sourceStem: string | undefined,
  r: number,
  g: number,
  b: number,
): number {
  if (!sourceStem || sourceStem.toLowerCase() !== 'sunflower') return d2;
  let x = d2;
  if (colorKey === 'brown') x += SUNFLOWER_FAMILY_PENALTY_BROWN_OKLAB2;
  if (colorKey === 'yellow') x -= SUNFLOWER_FAMILY_BONUS_YELLOW_OKLAB2;
  if (colorKey === 'yellow' && isBrightGoldenFlowerSample(r, g, b)) {
    x -= SUNFLOWER_GOLD_PETAL_EXTRA_YELLOW_OKLAB2;
  }
  return x < 0 ? 0 : x;
}

/** Dark canopy / mulch: forbid blue ceramics and restrict to leafy families so shadow greens never pick darkblue */
function shouldRestrictToLeafyGreenFamilies(r: number, g: number, b: number, lab: Oklab): boolean {
  if (shouldSuppressConflictingEarthTones(r, g, b, lab) === false) return false;

  const sum = r + g + b;
  if (sum > 148) return false;

  const greenExcess = g - 0.5 * (r + b);
  if (greenExcess < 4) return false;

  // Keep teal / aqua background in the leafy bucket (still excludes *blue* ceramic names downstream)
  if (b > g + 38 && r < g - 10) return false;

  return true;
}

function mosaicSpatialSlot(cx: number, cy: number, colorKey: string, seed: number): number {
  let h = seed ^ cx * 738_560_93 ^ cy * 193_496_63;
  for (let i = 0; i < colorKey.length; i++) {
    h = Math.imul(h ^ colorKey.charCodeAt(i), 1_597_334_677);
  }
  return Math.abs(h | 0);
}

function tilesWithLab(tiles: ResolvedTile[]): MosaicTileLab[] {
  return tiles.map((t) => ({ ...t, lab: rgbToOklab(t.r, t.g, t.b) }));
}

function buildTileMeta(tilesLab: MosaicTileLab[]): TileMeta[] {
  return tilesLab.map((t) => {
    const { colorKey } = parseTileKeysFromId(t.id);
    return { ...t, colorKey };
  });
}

function bucketTilesByColor(meta: TileMeta[]): Map<string, TileMeta[]> {
  const m = new Map<string, TileMeta[]>();
  for (const t of meta) {
    let arr = m.get(t.colorKey);
    if (!arr) {
      arr = [];
      m.set(t.colorKey, arr);
    }
    arr.push(t);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.id.localeCompare(b.id));
  }
  return m;
}

function nearestInFamily(sampleLab: Oklab, family: TileMeta[]): number {
  if (family.length === 0) return Infinity;
  let bestD2 = oklabDistanceSquared(sampleLab, family[0]!.lab);
  for (let i = 1; i < family.length; i++) {
    const d2 = oklabDistanceSquared(sampleLab, family[i]!.lab);
    if (d2 < bestD2) bestD2 = d2;
  }
  return bestD2;
}

function eligibleColorKeys(
  buckets: Map<string, TileMeta[]>,
  r: number,
  g: number,
  b: number,
  lab: Oklab,
  sourceStem: string | undefined,
): Set<string> {
  const all = [...buckets.keys()];
  let keys = new Set(all);

  const stem = sourceStem?.toLowerCase();
  if (stem === 'sunflower' && !isSunflowerSeedCentreSample(r, g, b)) {
    for (const k of [...keys]) {
      if (isBrownCeramicFamily(k)) keys.delete(k);
    }
  }

  /**
   * `poppy` and `red` are scarlet ceramics. Pink and magenta stay on `pink` / `blush`.
   * Sunflower gold also fails this, which keeps the old sunflower red gate.
   */
  if (!isTrueScarletSample(r, g, b)) {
    for (const k of [...keys]) {
      if (isScarletCeramicFamily(k)) keys.delete(k);
    }
  }

  /**
   * Sunflower.png: warm petals satisfy `isWarmBrownOrangeSample`, which turns OFF global blue/brown
   * suppression on foliage rules — so blues can win on luminance. Drop them unless the cell is blue.
   */
  if (stem === 'sunflower' && !isClearlyBlueDominantSample(r, g, b)) {
    for (const k of [...keys]) {
      if (isBlueCeramicFamily(k)) keys.delete(k);
    }
  }

  /** three.png / five.png: teal foliage averages should stay off aqua `_seagreen`. `forest` may still be used. */
  const leafyGreenMixNoSeagreen = stem === 'three' || stem === 'five';

  if (shouldRestrictToLeafyGreenFamilies(r, g, b, lab)) {
    keys = new Set(
      all.filter((k) => {
        if (!isLeafyGreenCeramicFamily(k)) return false;
        if (leafyGreenMixNoSeagreen && k === 'seagreen') return false;
        return true;
      }),
    );
    if (keys.size === 0) keys = new Set(all);
  } else if (shouldSuppressConflictingEarthTones(r, g, b, lab)) {
    for (const k of [...keys]) {
      if (isBlueCeramicFamily(k) || isBrownCeramicFamily(k)) keys.delete(k);
    }
  }

  if (leafyGreenMixNoSeagreen) {
    keys.delete('seagreen');
  }

  // Forest only on the darkest green. Mid-tone leaves stay `green` / `lightgreen`.
  if (!isDarkForestSample(r, g, b)) {
    keys.delete('forest');
  }

  // Cream and blush are petal and paper neutrals. A pale cell must not lose them.
  if (isLightNeutralSample(r, g, b)) {
    for (const k of all) {
      if (isLightNeutralCeramicFamily(k)) keys.add(k);
    }
  }

  /**
   * Lily water reads as dark olive because of reflected pads. Force it onto
   * blue / teal ceramics. Pads stay on the green path above.
   */
  if (stem === 'lily' && isLilyWaterSample(r, g, b)) {
    const water = new Set(all.filter((k) => isLilyWaterCeramicFamily(k)));
    if (water.size > 0) return water;
  }

  if (keys.size === 0) {
    const fallback = new Set(all);
    if (!isTrueScarletSample(r, g, b)) {
      for (const k of [...fallback]) {
        if (isScarletCeramicFamily(k)) fallback.delete(k);
      }
    }
    if (!isDarkForestSample(r, g, b)) fallback.delete('forest');
    if (fallback.size > 0) return fallback;
    return new Set(all);
  }
  return keys;
}

function pickTileForPixel(
  r: number,
  g: number,
  b: number,
  cx: number,
  cy: number,
  buckets: Map<string, TileMeta[]>,
  seed: number,
  sourceStem: string | undefined,
  /** When set, photo-specific gates are skipped and only these families compete. */
  restrictKeys?: ReadonlySet<string> | null,
): TileMeta | null {
  const sampleLab = rgbToOklab(r, g, b);

  let eligible = restrictKeys
    ? new Set([...restrictKeys].filter((key) => (buckets.get(key)?.length ?? 0) > 0))
    : eligibleColorKeys(buckets, r, g, b, sampleLab, sourceStem);

  const famDists: { key: string; d2: number }[] = [];
  for (const key of eligible) {
    const fam = buckets.get(key);
    if (!fam || fam.length === 0) continue;
    const rawD2 = nearestInFamily(sampleLab, fam);
    famDists.push({ key, d2: familyDistanceForRanking(rawD2, key, sourceStem, r, g, b) });
  }

  if (famDists.length === 0 && !restrictKeys) {
    for (const key of buckets.keys()) {
      const fam = buckets.get(key);
      if (!fam || fam.length === 0) continue;
      const rawD2 = nearestInFamily(sampleLab, fam);
      famDists.push({ key, d2: familyDistanceForRanking(rawD2, key, sourceStem, r, g, b) });
    }
  }

  if (famDists.length === 0) return null;

  famDists.sort((a, b) => a.d2 - b.d2);
  const bestD2 = famDists[0]!.d2;
  let hi = 0;
  while (hi + 1 < famDists.length && famDists[hi + 1]!.d2 <= bestD2 + FAMILY_DISTANCE_TIE_OKLAB2) {
    hi++;
  }
  const tied = famDists.slice(0, hi + 1);
  const pickFamIdx = mosaicSpatialSlot(cx, cy, '*fam*', seed) % tied.length;
  const pickedKey = tied[pickFamIdx]!.key;
  const famTiles = buckets.get(pickedKey);
  if (!famTiles?.length) return null;

  const sorted = [...famTiles].sort(
    (a, b) => oklabDistanceSquared(sampleLab, a.lab) - oklabDistanceSquared(sampleLab, b.lab),
  );
  const slot = mosaicSpatialSlot(cx, cy, pickedKey, seed);
  const shapeIdx = slot % sorted.length;
  return sorted[shapeIdx]!;
}

type SampleRegion = { x: number; y: number; w: number; h: number };

/** Full frame, or a center cover-crop whose aspect matches the grid. */
function sampleRegion(srcW: number, srcH: number, gridW: number, gridH: number, fit: MosaicFit): SampleRegion {
  if (fit !== 'cover' || srcW <= 0 || srcH <= 0 || gridW <= 0 || gridH <= 0) {
    return { x: 0, y: 0, w: srcW, h: srcH };
  }
  const srcAspect = srcW / srcH;
  const gridAspect = gridW / gridH;
  if (srcAspect > gridAspect) {
    const w = srcH * gridAspect;
    return { x: (srcW - w) / 2, y: 0, w, h: srcH };
  }
  const h = srcW / gridAspect;
  return { x: 0, y: (srcH - h) / 2, w: srcW, h };
}

function averageColorForCell(
  data: Uint8ClampedArray,
  stride: number,
  srcW: number,
  srcH: number,
  cx: number,
  cy: number,
  gridW: number,
  gridH: number,
  region: SampleRegion,
): [number, number, number] {
  let x0 = Math.floor(region.x + (cx * region.w) / gridW);
  let x1 = Math.floor(region.x + ((cx + 1) * region.w) / gridW);
  let y0 = Math.floor(region.y + (cy * region.h) / gridH);
  let y1 = Math.floor(region.y + ((cy + 1) * region.h) / gridH);
  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x1 > srcW) x1 = srcW;
  if (y1 > srcH) y1 = srcH;
  if (x1 <= x0 && x0 < srcW) x1 = x0 + 1;
  if (y1 <= y0 && y0 < srcH) y1 = y0 + 1;

  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * srcW * stride;
    for (let x = x0; x < x1; x++) {
      const i = row + x * stride;
      const alpha = stride === 4 ? data[i + 3]! / 255 : 1;
      if (alpha < 0.02) continue;
      r += data[i]! * alpha;
      g += data[i + 1]! * alpha;
      b += data[i + 2]! * alpha;
      n += alpha;
    }
  }
  if (n <= 0) return [128, 128, 128];
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

async function yieldToMain(): Promise<void> {
  await new Promise<void>((resolve) => {
    const ric = (globalThis as typeof globalThis & { requestIdleCallback?: typeof requestAnimationFrame })
      .requestIdleCallback;
    if (typeof ric === 'function') {
      ric(() => resolve(), { timeout: 32 });
    } else {
      requestAnimationFrame(() => resolve());
    }
  });
}

function familiesForSceneCell(scene: PaintedScene, index: number): ReadonlySet<string> {
  const cell = scene.cells[index]!;
  if (cell.label === 'centre' && cell.flowerId > 0) {
    const listed = scene.centreFamilies[cell.flowerId];
    if (listed && listed.length > 0) return new Set(listed);
  }
  return new Set(LABEL_FAMILIES[cell.label]);
}

/** Tile a painted scene. Labels choose the family set; colour chooses within it. */
export function buildMosaicFromScene(
  tiles: ResolvedTile[],
  varietySeed: number,
  scene: PaintedScene,
): MosaicCell[] {
  const gridW = scene.gridW;
  const gridH = scene.gridH;
  const meta = buildTileMeta(tilesWithLab(tiles));
  const buckets = bucketTilesByColor(meta);
  const ranks = waveRankMap(gridW, gridH);
  const totalCells = gridW * gridH;
  const maxRank = Math.max(1, totalCells - 1);
  const staggerSpanSec = REVEAL_TOTAL_MS / 1000 - REVEAL_TILE_DURATION_SEC;
  const chaosMaxSec = staggerSpanSec * REVEAL_CHAOS_FRAC;
  const rippleMaxSec = staggerSpanSec * REVEAL_RIPPLE_FRAC;
  const ripplePhiRad = ripplePhaseRad(varietySeed);
  const cells: MosaicCell[] = [];

  for (let i = 0; i < scene.cells.length; i++) {
    const painted = scene.cells[i]!;
    const cx = i % gridW;
    const cy = Math.floor(i / gridW);
    const choice = pickTileForPixel(
      painted.r,
      painted.g,
      painted.b,
      cx,
      cy,
      buckets,
      varietySeed,
      undefined,
      familiesForSceneCell(scene, i),
    );
    if (!choice) throw new Error(`No tile for ${painted.label} cell ${cx},${cy}`);
    const rank = ranks.get(`${cx},${cy}`) ?? 0;
    const baseDelaySec = (rank / maxRank) * staggerSpanSec;
    const delaySec = Math.min(
      staggerSpanSec,
      Math.max(
        0,
        baseDelaySec +
          revealChaosOffsetSec(cx, cy, varietySeed, chaosMaxSec) +
          revealRippleOffsetSec(cx, cy, ripplePhiRad, rippleMaxSec),
      ),
    );
    cells.push({
      cx,
      cy,
      url: choice.url,
      delaySec,
      seed: hashSeed(cx, cy, choice.id),
    });
  }

  if (cells.length !== totalCells) {
    throw new Error('Scene grid does not match the painted cells');
  }
  return cells;
}

export async function buildMosaicFromImageUrl(
  imageUrl: string,
  tiles: ResolvedTile[],
  varietySeed: number,
  /** Filename stem (e.g. `sunflower`) for optional palette hints — does not force colors. */
  sourceStem?: string,
  options?: MosaicBuildOptions,
): Promise<MosaicCell[]> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create canvas context');
  ctx.drawImage(img, 0, 0);
  const { data, width: srcW, height: srcH } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const stride = 4;
  const gridW = options?.gridW ?? GRID_W;
  const gridH = options?.gridH ?? GRID_H;
  const region = sampleRegion(srcW, srcH, gridW, gridH, options?.fit ?? 'stretch');

  const meta = buildTileMeta(tilesWithLab(tiles));
  const buckets = bucketTilesByColor(meta);

  const ranks = waveRankMap(gridW, gridH);
  const totalCells = gridW * gridH;
  const maxRank = Math.max(1, totalCells - 1);
  const staggerSpanSec = REVEAL_TOTAL_MS / 1000 - REVEAL_TILE_DURATION_SEC;
  const chaosMaxSec = staggerSpanSec * REVEAL_CHAOS_FRAC;
  const rippleMaxSec = staggerSpanSec * REVEAL_RIPPLE_FRAC;
  const ripplePhiRad = ripplePhaseRad(varietySeed);

  const cells: MosaicCell[] = [];
  let processed = 0;

  for (let cy = 0; cy < gridH; cy++) {
    for (let cx = 0; cx < gridW; cx++) {
      const [r, g, b] = averageColorForCell(data, stride, srcW, srcH, cx, cy, gridW, gridH, region);
      const choice = pickTileForPixel(r, g, b, cx, cy, buckets, varietySeed, sourceStem);
      if (!choice) {
        throw new Error('No tiles available for mosaic');
      }
      const rank = ranks.get(`${cx},${cy}`) ?? 0;
      const baseDelaySec = (rank / maxRank) * staggerSpanSec;
      const delaySec = Math.min(
        staggerSpanSec,
        Math.max(
          0,
          baseDelaySec +
            revealChaosOffsetSec(cx, cy, varietySeed, chaosMaxSec) +
            revealRippleOffsetSec(cx, cy, ripplePhiRad, rippleMaxSec),
        ),
      );
      const seed = hashSeed(cx, cy, choice.id);
      cells.push({
        cx,
        cy,
        url: choice.url,
        delaySec,
        seed,
      });
      processed++;
      if (processed % 128 === 0) await yieldToMain();
    }
  }

  return cells;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function hashSeed(cx: number, cy: number, tileId: string): number {
  let h = cx * 374761393 + cy * 668265263;
  for (let i = 0; i < tileId.length; i++) {
    h = Math.imul(h ^ tileId.charCodeAt(i), 2654435761);
  }
  return Math.abs(h | 0);
}

function unitHash01(seed: number, cx: number, cy: number, salt: number): number {
  let h = seed ^ Math.imul(cx, 0x1e35a7bd) ^ Math.imul(cy, 0x26c93077) ^ salt;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 0x1_0000_0000;
}

/** Blended two-noise offset in ~[-maxOffsetSec, maxOffsetSec] for less grid-like jitter. */
function revealChaosOffsetSec(cx: number, cy: number, varietySeed: number, maxOffsetSec: number): number {
  if (maxOffsetSec <= 0) return 0;
  const u = unitHash01(varietySeed, cx, cy, 0x27d4eb2d);
  const v = unitHash01(varietySeed, cx, cy, 0xf4a98d1d);
  const blended = u + v - 1;
  return blended * maxOffsetSec;
}

function ripplePhaseRad(varietySeed: number): number {
  const u = Math.imul(varietySeed ^ 0x45d9f3b3, 0x9e3779b1) >>> 0;
  return (u / 0x1_0000_0000) * Math.PI * 2;
}

/** Slow traveling bump along diagonals: sin((cx+cy)*k + φ) * amplitude. */
function revealRippleOffsetSec(cx: number, cy: number, phiRad: number, amplitudeSec: number): number {
  if (amplitudeSec <= 0) return 0;
  return Math.sin((cx + cy) * REVEAL_RIPPLE_K + phiRad) * amplitudeSec;
}
