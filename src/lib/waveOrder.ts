/** Landscape mosaic. 60×34 keeps the original 16:9 framing and tile count. */
export const GRID_W = 60;
export const GRID_H = 34;

/**
 * Portrait phones. Same cell count as landscape (34×60 = 2040) so the wave
 * and the breathing still have the same amount of work, in a 9:16 frame.
 */
export const PORTRAIT_GRID_W = 34;
export const PORTRAIT_GRID_H = 60;

export function gridSizeForPortrait(portrait: boolean): { gridW: number; gridH: number } {
  return portrait
    ? { gridW: PORTRAIT_GRID_W, gridH: PORTRAIT_GRID_H }
    : { gridW: GRID_W, gridH: GRID_H };
}

export type GridPos = { cx: number; cy: number };

/** Top-left to bottom-right diagonal wave (deterministic tie-break). */
export function diagonalWaveOrder(gridW = GRID_W, gridH = GRID_H): GridPos[] {
  const cells: GridPos[] = [];
  for (let cy = 0; cy < gridH; cy++) {
    for (let cx = 0; cx < gridW; cx++) {
      cells.push({ cx, cy });
    }
  }
  cells.sort((a, b) => {
    const da = a.cx + a.cy;
    const db = b.cx + b.cy;
    if (da !== db) return da - db;
    if (a.cx !== b.cx) return a.cx - b.cx;
    return a.cy - b.cy;
  });
  return cells;
}

export function waveRankMap(gridW = GRID_W, gridH = GRID_H): Map<string, number> {
  const wave = diagonalWaveOrder(gridW, gridH);
  const map = new Map<string, number>();
  wave.forEach((p, i) => map.set(`${p.cx},${p.cy}`, i));
  return map;
}
