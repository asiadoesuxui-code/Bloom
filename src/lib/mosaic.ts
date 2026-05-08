import type { ResolvedTile } from './tileUrls';
import { GRID_H, GRID_W, waveRankMap } from './waveOrder';

export const REVEAL_TOTAL_MS = 5000;
export const REVEAL_TILE_DURATION_SEC = 0.2;

/** Extra RGB distance allowed beyond the best match for random tie-breaks */
const MATCH_TOLERANCE = 26;

export type MosaicCell = {
  cx: number;
  cy: number;
  url: string;
  /** Framer Motion stagger delay (seconds) */
  delaySec: number;
  /** Stable seed for living motion */
  seed: number;
};

export function rgbDistanceSq(r: number, g: number, b: number, tile: ResolvedTile): number {
  const dr = r - tile.r;
  const dg = g - tile.g;
  const db = b - tile.b;
  return dr * dr + dg * dg + db * db;
}

function pickRandomTile(r: number, g: number, b: number, tiles: ResolvedTile[]): ResolvedTile {
  if (tiles.length === 0) {
    throw new Error('No tiles available for mosaic');
  }
  let best = Infinity;
  for (const t of tiles) {
    const d = rgbDistanceSq(r, g, b, t);
    if (d < best) best = d;
  }
  const candidates = tiles.filter((t) => rgbDistanceSq(r, g, b, t) <= best + MATCH_TOLERANCE);
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

function averageColorForCell(
  data: Uint8ClampedArray,
  stride: number,
  srcW: number,
  srcH: number,
  cx: number,
  cy: number,
): [number, number, number] {
  const x0 = Math.floor((cx * srcW) / GRID_W);
  const x1 = Math.floor(((cx + 1) * srcW) / GRID_W);
  const y0 = Math.floor((cy * srcH) / GRID_H);
  const y1 = Math.floor(((cy + 1) * srcH) / GRID_H);

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

export async function buildMosaicFromImageUrl(imageUrl: string, tiles: ResolvedTile[]): Promise<MosaicCell[]> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create canvas context');
  ctx.drawImage(img, 0, 0);
  const { data, width: srcW, height: srcH } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const stride = 4;

  const ranks = waveRankMap();
  const totalCells = GRID_W * GRID_H;
  const maxRank = Math.max(1, totalCells - 1);
  const staggerSpanSec = REVEAL_TOTAL_MS / 1000 - REVEAL_TILE_DURATION_SEC;

  const cells: MosaicCell[] = [];
  let processed = 0;

  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const [r, g, b] = averageColorForCell(data, stride, srcW, srcH, cx, cy);
      const choice = pickRandomTile(r, g, b, tiles);
      const rank = ranks.get(`${cx},${cy}`) ?? 0;
      const delaySec = (rank / maxRank) * staggerSpanSec;
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
