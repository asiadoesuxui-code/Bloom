/**
 * Procedural flower scene at mosaic-cell resolution.
 * Each cell carries a colour and a label. Tile choice follows the label, then the colour.
 * No photo is read or uploaded.
 */

export type SceneLabel = 'sky' | 'water' | 'ground' | 'leaf' | 'stem' | 'petal' | 'centre';

export type SceneCell = {
  r: number;
  g: number;
  b: number;
  label: SceneLabel;
  /** 0 when the cell is not part of a flower. */
  flowerId: number;
};

export type PaintedScene = {
  gridW: number;
  gridH: number;
  cells: SceneCell[];
  /** Contrast families allowed on each flower's centre. */
  centreFamilies: Record<number, readonly string[]>;
};

export type Rgb = { r: number; g: number; b: number };

/**
 * Families a label may use, light to dark.
 * Each background region stays inside one short group of close colours.
 * Navy is not a sky or water field. Leaves, stems, and ground contain no blue.
 */
export const LABEL_FAMILIES: Record<SceneLabel, readonly string[]> = {
  sky: ['lightblue', 'midblue', 'seagreen'],
  water: ['lightblue', 'midblue', 'seagreen'],
  ground: ['cream', 'beige', 'brown'],
  leaf: ['lightgreen', 'green', 'forest'],
  stem: ['lightgreen', 'green', 'forest'],
  petal: ['poppy', 'pink', 'blush', 'yellow', 'orange', 'cream', 'red'],
  centre: ['yellow', 'orange', 'brown', 'darkblue', 'cream'],
};

const WARM_PETALS = new Set(['poppy', 'red', 'pink', 'blush', 'orange', 'yellow']);

export function centreFamiliesForPetal(petal: string): readonly string[] {
  if (petal === 'yellow') return ['brown', 'darkblue', 'orange'];
  if (petal === 'orange') return ['yellow', 'darkblue', 'brown'];
  if (petal === 'midblue' || petal === 'lightblue' || petal === 'darkblue') return ['yellow', 'orange', 'cream'];
  if (petal === 'cream' || petal === 'blush') return ['poppy', 'orange', 'midblue'];
  if (WARM_PETALS.has(petal)) return ['yellow', 'cream', 'darkblue'];
  return ['yellow', 'orange', 'darkblue'];
}

export function familyMeans(tiles: { id: string; r: number; g: number; b: number }[]): Record<string, Rgb> {
  const acc = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (const tile of tiles) {
    const key = tile.id.split('_').pop() ?? tile.id;
    const row = acc.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    row.r += tile.r;
    row.g += tile.g;
    row.b += tile.b;
    row.n += 1;
    acc.set(key, row);
  }
  const out: Record<string, Rgb> = {};
  for (const [key, row] of acc) {
    out[key] = { r: Math.round(row.r / row.n), g: Math.round(row.g / row.n), b: Math.round(row.b / row.n) };
  }
  return out;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash01(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash01(x0, y0, seed);
  const n10 = hash01(x0 + 1, y0, seed);
  const n01 = hash01(x0, y0 + 1, seed);
  const n11 = hash01(x0 + 1, y0 + 1, seed);
  return n00 * (1 - sx) * (1 - sy) + n10 * sx * (1 - sy) + n01 * (1 - sx) * sy + n11 * sx * sy;
}

function fbm(x: number, y: number, seed: number): number {
  return valueNoise(x, y, seed) * 0.62 + valueNoise(x * 2.1, y * 2.1, seed + 11) * 0.38;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function jitter(rgb: Rgb, rnd: () => number, amount = 7): Rgb {
  return {
    r: clampByte(rgb.r + (rnd() - 0.5) * amount * 2),
    g: clampByte(rgb.g + (rnd() - 0.5) * amount * 2),
    b: clampByte(rgb.b + (rnd() - 0.5) * amount * 2),
  };
}

type Flower = {
  id: number;
  x: number;
  y: number;
  radius: number;
  angle: number;
  petal: string;
  centre: string;
};

/**
 * Paint one original flower scene. `seed` fully determines the picture for a given grid.
 */
export function paintFlowerScene(
  seed: number,
  gridW: number,
  gridH: number,
  means: Record<string, Rgb>,
): PaintedScene {
  const rnd = mulberry32(seed || 1);
  const cells: SceneCell[] = Array.from({ length: gridW * gridH }, () => ({
    r: 0,
    g: 0,
    b: 0,
    label: 'sky' as SceneLabel,
    flowerId: 0,
  }));
  const at = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= gridW || y >= gridH) return null;
    return cells[y * gridW + x]!;
  };

  const horizonBase = gridH * (0.38 + (seed % 97) / 97 * 0.12);
  const horizon = (x: number) => {
    const wobble = fbm(x * 0.16, 0.35, seed + 3) - 0.5;
    const fine = fbm(x * 0.48, 2.2, seed + 19) - 0.5;
    return horizonBase + wobble * gridH * 0.22 + fine * gridH * 0.07;
  };

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const h = horizon(x);
      const cell = at(x, y)!;
      const below = y > h;
      cell.label = below ? 'water' : 'sky';
      cell.flowerId = 0;
    }
  }

  // Irregular ground shoals. The edge follows noise, not a second straight line.
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const shore = fbm(x * 0.22, y * 0.22, seed + 27);
      const depth = (y - horizon(x)) / gridH;
      if (depth > 0.18 && shore > 0.62) {
        const cell = at(x, y)!;
        if (cell.label === 'water') cell.label = 'ground';
      }
    }
  }

  colorByLabel(cells, gridW, gridH, 'sky', LABEL_FAMILIES.sky, means, seed + 1, 'wash');
  colorByLabel(cells, gridW, gridH, 'water', LABEL_FAMILIES.water, means, seed + 2, 'wash');
  colorByLabel(cells, gridW, gridH, 'ground', LABEL_FAMILIES.ground, means, seed + 3, 'soft');

  const paintDisk = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rot: number,
    label: SceneLabel,
    flowerId: number,
    rgb: Rgb,
  ) => {
    const pad = Math.ceil(Math.max(rx, ry) + 1.2);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let y = Math.floor(cy - pad); y <= Math.ceil(cy + pad); y++) {
      for (let x = Math.floor(cx - pad); x <= Math.ceil(cx + pad); x++) {
        const cell = at(x, y);
        if (!cell) continue;
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;
        const d = (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry);
        if (d > 1.2) continue;
        const cover = d < 0.75 ? 1 : Math.max(0, (1.2 - d) / 0.45);
        cell.r = clampByte(cell.r * (1 - cover) + rgb.r * cover);
        cell.g = clampByte(cell.g * (1 - cover) + rgb.g * cover);
        cell.b = clampByte(cell.b * (1 - cover) + rgb.b * cover);
        if (cover > 0.5) {
          cell.label = label;
          cell.flowerId = flowerId;
        }
      }
    }
  };

  // Background clumps, painted before flowers so blooms stay on top.
  const clumps = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < clumps; i++) {
    const cx = rnd() * gridW;
    const cy = horizonBase + rnd() * (gridH - horizonBase) * 0.85;
    paintDisk(cx, cy, 3 + rnd() * 4, 2 + rnd() * 2.5, rnd() * Math.PI, 'leaf', 0, means.green ?? { r: 80, g: 120, b: 70 });
  }

  // Every scene uses the new palette: poppy, blush, and cream as petals, midblue in the sky, forest in the leaves.
  const petalChoices = shuffle(['poppy', 'yellow', 'pink', 'cream', 'blush'], rnd);
  const flowerCount = petalChoices.length;
  const flowers: Flower[] = [];
  const usedCentres = new Set<string>();
  for (let i = 0; i < flowerCount; i++) {
    const petal = petalChoices[i]!;
    const centreList = centreFamiliesForPetal(petal);
    const centre = centreList.find((name) => !usedCentres.has(name)) ?? centreList[0]!;
    usedCentres.add(centre);
    let placed = false;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      const x = 5 + rnd() * (gridW - 10);
      const y = gridH * (0.16 + rnd() * 0.48);
      const radius = 4.1;
      const hit = flowers.some((f) => Math.hypot(f.x - x, f.y - y) < f.radius + radius + 1.2);
      if (hit) continue;
      flowers.push({ id: i + 1, x, y, radius, angle: rnd() * Math.PI * 2, petal, centre });
      placed = true;
    }
  }

  const centreFamilies: Record<number, readonly string[]> = {};
  for (const flower of flowers) {
    centreFamilies[flower.id] = centreFamiliesForPetal(flower.petal);
    const stemRgb = means.green ?? { r: 70, g: 110, b: 60 };
    let px = flower.x;
    let py = flower.y + flower.radius * 0.4;
    const sway = (rnd() - 0.5) * 0.55;
    for (let step = 0; py < gridH + 1; step++) {
      py += 0.85;
      px += sway + Math.sin(py * 0.45 + flower.angle) * 0.35;
      const cell = at(Math.round(px), Math.round(py));
      if (!cell) continue;
      if (cell.label === 'petal' || cell.label === 'centre') continue;
      cell.label = 'stem';
      cell.flowerId = flower.id;
      cell.r = stemRgb.r;
      cell.g = stemRgb.g;
      cell.b = stemRgb.b;
      if (step % 4 === 2) {
        const side = step % 8 === 2 ? 1 : -1;
        paintDisk(
          px + side * 2.2,
          py,
          2.1,
          1.1,
          side * 0.8,
          'leaf',
          0,
          means.lightgreen ?? stemRgb,
        );
      }
    }

    const petalRgb = jitter(means[flower.petal] ?? { r: 200, g: 80, b: 80 }, rnd, 5);
    const petals = 6;
    for (let p = 0; p < petals; p++) {
      const a = flower.angle + (p / petals) * Math.PI * 2;
      const ox = Math.cos(a) * flower.radius * 0.52;
      const oy = Math.sin(a) * flower.radius * 0.52;
      paintDisk(flower.x + ox, flower.y + oy, flower.radius * 0.62, flower.radius * 0.4, a, 'petal', flower.id, petalRgb);
    }
    const centreRgb = jitter(means[flower.centre] ?? { r: 220, g: 180, b: 40 }, rnd, 4);
    paintDisk(flower.x, flower.y, 1.7, 1.7, 0, 'centre', flower.id, centreRgb);
  }

  // One soft light-to-dark shading shared by leaves and stems. No teal, no blue.
  colorByLabel(cells, gridW, gridH, 'leaf', LABEL_FAMILIES.leaf, means, seed + 4, 'soft');
  colorByLabel(cells, gridW, gridH, 'stem', LABEL_FAMILIES.stem, means, seed + 4, 'soft');

  // Petals were blended at the rim. Snap each flower back to its family colour.
  for (const flower of flowers) {
    const rgb = means[flower.petal];
    const centre = means[flower.centre];
    if (!rgb || !centre) continue;
    for (const cell of cells) {
      if (cell.flowerId !== flower.id) continue;
      if (cell.label === 'petal') {
        cell.r = rgb.r;
        cell.g = rgb.g;
        cell.b = rgb.b;
      } else if (cell.label === 'centre') {
        cell.r = centre.r;
        cell.g = centre.g;
        cell.b = centre.b;
      }
    }
  }

  // Repaint what the flowers did not cover, so the background stays a slow wash.
  colorByLabel(cells, gridW, gridH, 'sky', LABEL_FAMILIES.sky, means, seed + 1, 'wash');
  colorByLabel(cells, gridW, gridH, 'water', LABEL_FAMILIES.water, means, seed + 2, 'wash');
  colorByLabel(cells, gridW, gridH, 'ground', LABEL_FAMILIES.ground, means, seed + 3, 'soft');

  return { gridW, gridH, cells, centreFamilies };
}

function colorByLabel(
  cells: SceneCell[],
  gridW: number,
  gridH: number,
  label: SceneLabel,
  families: readonly string[],
  means: Record<string, Rgb>,
  seed: number,
  kind: 'wash' | 'soft',
) {
  const usable = families.filter((f) => means[f]);
  if (usable.length === 0) return;
  const indices: number[] = [];
  for (let i = 0; i < cells.length; i++) if (cells[i]!.label === label) indices.push(i);
  if (indices.length === 0) return;
  const field = (index: number) => {
    const y = Math.floor(index / gridW);
    const x = index - y * gridW;
    const drift = fbm(x * 0.055, y * 0.055, seed);
    if (kind === 'wash') return y / gridH + (drift - 0.5) * 0.22;
    return drift;
  };
  const ordered = [...indices].sort((a, b) => field(a) - field(b) || a - b);
  const bands = usable.length;
  const base = Math.floor(ordered.length / bands);
  let extra = ordered.length - base * bands;
  let cursor = 0;
  for (const family of usable) {
    const count = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    const rgb = means[family]!;
    for (let k = 0; k < count; k++) {
      const cell = cells[ordered[cursor++]!]!;
      cell.r = rgb.r;
      cell.g = rgb.g;
      cell.b = rgb.b;
    }
  }
  dissolveSpecks(cells, gridW, gridH, label, usable, means);
}

/** Drop isolated background tiles so neighbours usually share a family. */
function dissolveSpecks(
  cells: SceneCell[],
  gridW: number,
  gridH: number,
  label: SceneLabel,
  families: readonly string[],
  means: Record<string, Rgb>,
) {
  const familyOf = (cell: SceneCell) => {
    let best = families[0]!;
    let bestD = Infinity;
    for (const family of families) {
      const rgb = means[family]!;
      const d = (cell.r - rgb.r) ** 2 + (cell.g - rgb.g) ** 2 + (cell.b - rgb.b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = family;
      }
    }
    return best;
  };
  for (let pass = 0; pass < 2; pass++) {
    const assigned = cells.map((cell) => (cell.label === label ? familyOf(cell) : ''));
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const index = y * gridW + x;
        if (cells[index]!.label !== label) continue;
        const votes = new Map<string, number>();
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
          const neighbour = assigned[ny * gridW + nx]!;
          if (!neighbour) continue;
          votes.set(neighbour, (votes.get(neighbour) ?? 0) + 1);
        }
        let winner = assigned[index]!;
        let winnerN = 0;
        for (const [family, n] of votes) {
          if (n > winnerN) {
            winner = family;
            winnerN = n;
          }
        }
        const own = votes.get(assigned[index]!) ?? 0;
        if (winnerN >= 3 && winner !== assigned[index] && own <= 1) {
          const rgb = means[winner]!;
          cells[index]!.r = rgb.r;
          cells[index]!.g = rgb.g;
          cells[index]!.b = rgb.b;
        }
      }
    }
  }
}

function shuffle<T>(list: readonly T[], rnd: () => number): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}
