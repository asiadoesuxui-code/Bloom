export const GRID_W = 60;
export const GRID_H = 34;

export type GridPos = { cx: number; cy: number };

/** Top-left to bottom-right diagonal wave (deterministic tie-break). */
export function diagonalWaveOrder(): GridPos[] {
  const cells: GridPos[] = [];
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
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

export function waveRankMap(): Map<string, number> {
  const wave = diagonalWaveOrder();
  const map = new Map<string, number>();
  wave.forEach((p, i) => map.set(`${p.cx},${p.cy}`, i));
  return map;
}
