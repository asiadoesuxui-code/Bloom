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

export type SceneComposition = 'meadow' | 'bouquet' | 'vase' | 'hero' | 'field';

export type PaintedScene = {
  gridW: number;
  gridH: number;
  cells: SceneCell[];
  composition: SceneComposition;
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
  ground: ['cream', 'beige', 'blush'],
  leaf: ['lightgreen', 'green', 'forest'],
  stem: ['lightgreen', 'green', 'forest'],
  petal: ['poppy', 'pink', 'blush', 'yellow', 'orange', 'cream', 'red', 'midblue'],
  centre: ['yellow', 'orange', 'brown', 'darkblue', 'cream'],
};

const WARM_PETALS = new Set(['poppy', 'red', 'pink', 'blush', 'orange', 'yellow']);

export function centreFamiliesForPetal(petal: string): readonly string[] {
  if (petal === 'yellow' || petal === 'orange') return ['poppy', 'cream', 'pink'];
  if (petal === 'midblue' || petal === 'lightblue' || petal === 'darkblue') return ['yellow', 'cream', 'orange'];
  if (petal === 'cream' || petal === 'blush') return ['yellow', 'orange', 'poppy'];
  if (WARM_PETALS.has(petal)) return ['yellow', 'cream', 'orange'];
  return ['yellow', 'orange', 'cream'];
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

type FlowerShape = 'daisy' | 'tulip' | 'poppy' | 'rose' | 'cluster';

type Flower = {
  id: number;
  x: number;
  y: number;
  radius: number;
  angle: number;
  petal: string;
  /** A second petal colour inside the bloom, so the flower has a real edge. */
  inner: string;
  centre: string;
  shape: FlowerShape;
};

const COMPOSITIONS: SceneComposition[] = ['meadow', 'bouquet', 'vase', 'hero', 'field'];

export function compositionForSeed(seed: number): SceneComposition {
  const n = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return COMPOSITIONS[n % COMPOSITIONS.length]!;
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];


/**
 * Paint one original flower scene. `seed` fully determines the picture for a given grid.
 * The composition is part of the seed, so two seeds are different pictures, not a reshuffle.
 */
export function paintFlowerScene(
  seed: number,
  gridW: number,
  gridH: number,
  means: Record<string, Rgb>,
): PaintedScene {
  const rnd = mulberry32(seed || 1);
  const composition = compositionForSeed(seed);
  const cells: SceneCell[] = Array.from({ length: gridW * gridH }, () => ({
    r: 0,
    g: 0,
    b: 0,
    label: 'sky' as SceneLabel,
    flowerId: 0,
  }));

  const horizon = horizonFor(composition, gridH, rnd);
  const background = backgroundFor(composition);
  const vase = composition === 'vase' ? vaseFor(seed, gridW, gridH) : null;
  const flowers = placeFlowers(composition, gridW, gridH, horizon, rnd, vase);

  for (let y = 0; y < gridH; y += 1) {
    for (let x = 0; x < gridW; x += 1) {
      const cell = cells[y * gridW + x]!;
      if (vase && (pointInVase(x, y, vase) || y >= gridH * 0.9)) {
        cell.label = 'ground';
      } else if (background === 'wall') {
        cell.label = 'ground';
      } else if (background === 'foliage' || y >= horizon) {
        cell.label = 'leaf';
      } else {
        cell.label = 'sky';
      }
    }
  }

  if (vase) {
    const mouth = vase.top;
    for (let y = Math.floor(mouth - 6); y < mouth + 1; y += 1) {
      for (let x = Math.floor(vase.cx - 1); x <= Math.ceil(vase.cx + 1); x += 1) {
        const cell = cells[y * gridW + x];
        if (cell && cell.flowerId === 0) cell.label = 'stem';
      }
    }
  }

  const centreFamilies: Record<number, readonly string[]> = {};
  for (const flower of flowers) {
    centreFamilies[flower.id] = [flower.centre];
    stampFlower(cells, gridW, gridH, flower);
  }
  for (const flower of flowers) stampCentre(cells, gridW, gridH, flower);
  // A later bloom can cover an earlier one. Put a covered flower back so its colour survives.
  for (const flower of flowers) {
    if (cells.some((cell) => cell.flowerId === flower.id && cell.label === 'petal')) continue;
    stampFlower(cells, gridW, gridH, flower);
  }
  for (const flower of flowers) {
    const hasPetal = cells.some((cell) => cell.flowerId === flower.id && cell.label === 'petal');
    const hasCentre = cells.some((cell) => cell.flowerId === flower.id && cell.label === 'centre');
    if (hasPetal && !hasCentre) stampCentre(cells, gridW, gridH, flower);
  }

  if (vase) outlineVase(cells, gridW, vase);
  colorByLabel(cells, gridW, gridH, means, seed);
  colorFlowers(cells, gridW, flowers, means, seed);
  return { gridW, gridH, cells, composition, centreFamilies };
}

/** Each bloom keeps its outer petal, a contrasting inner petal, and its centre. */
function colorFlowers(
  cells: SceneCell[],
  gridW: number,
  flowers: Flower[],
  means: Record<string, Rgb>,
  seed: number,
): void {
  const byId = new Map(flowers.map((flower) => [flower.id, flower]));
  cells.forEach((cell, index) => {
    const flower = byId.get(cell.flowerId);
    if (!flower || (cell.label !== 'petal' && cell.label !== 'centre')) return;
    let family = flower.centre;
    if (cell.label === 'petal') {
      const dx = (index % gridW) + 0.5 - flower.x;
      const dy = Math.floor(index / gridW) + 0.5 - flower.y;
      family = Math.hypot(dx, dy) < flower.radius * 0.5 ? flower.inner : flower.petal;
    }
    const rgb = means[family] ?? { r: 210, g: 170, b: 90 };
    const painted = jitter(rgb, mulberry32((seed + index * 17) >>> 0), 6);
    cell.r = painted.r;
    cell.g = painted.g;
    cell.b = painted.b;
  });
}

type VaseGeom = { cx: number; top: number; bot: number; halfTop: number; halfBot: number };

function vaseFor(seed: number, gridW: number, gridH: number): VaseGeom {
  const rnd = mulberry32((seed ^ 0x51ed) || 1);
  return {
    cx: gridW * (0.22 + rnd() * 0.56),
    top: gridH * (0.5 + rnd() * 0.1),
    bot: gridH * 0.9,
    halfTop: gridW * (0.04 + rnd() * 0.02),
    halfBot: gridW * (0.065 + rnd() * 0.03),
  };
}

function pointInVase(x: number, y: number, vase: VaseGeom): boolean {
  if (y < vase.top || y > vase.bot) return false;
  const t = (y - vase.top) / (vase.bot - vase.top || 1);
  const half = vase.halfTop + (vase.halfBot - vase.halfTop) * t;
  return Math.abs(x - vase.cx) <= half;
}

/** A one-cell green contour so the vase reads as an object on the wall. */
function outlineVase(cells: SceneCell[], gridW: number, vase: VaseGeom): void {
  for (let i = 0; i < cells.length; i += 1) {
    const x = i % gridW;
    const y = Math.floor(i / gridW);
    if (cells[i]!.flowerId !== 0 || !pointInVase(x, y, vase)) continue;
    const edge =
      !pointInVase(x - 1, y, vase) ||
      !pointInVase(x + 1, y, vase) ||
      !pointInVase(x, y - 1, vase) ||
      !pointInVase(x, y + 1, vase);
    if (edge) cells[i]!.label = 'stem';
  }
}

function horizonFor(composition: SceneComposition, gridH: number, rnd: () => number): number {
  const span =
    composition === 'meadow'
      ? [0.08, 0.2]
      : composition === 'field'
        ? [0.42, 0.62]
        : composition === 'hero'
          ? [0.28, 0.46]
          : [0, 0];
  if (span[1] === 0) return gridH + 2;
  return Math.round(gridH * (span[0] + rnd() * (span[1] - span[0])));
}

function backgroundFor(composition: SceneComposition): 'sky' | 'wall' | 'foliage' {
  if (composition === 'vase' || composition === 'bouquet') return 'wall';
  if (composition === 'meadow') return 'foliage';
  return 'sky';
}

function placeFlowers(
  composition: SceneComposition,
  gridW: number,
  gridH: number,
  horizon: number,
  rnd: () => number,
  vase: VaseGeom | null,
): Flower[] {
  const shapes: FlowerShape[] = ['daisy', 'tulip', 'poppy', 'rose', 'cluster'];
  const count =
    composition === 'meadow'
      ? 14 + Math.floor(rnd() * 8)
      : composition === 'bouquet'
        ? 4 + Math.floor(rnd() * 2)
        : composition === 'vase'
          ? 4 + Math.floor(rnd() * 3)
          : composition === 'hero'
            ? 1
            : 5 + Math.floor(rnd() * 4);
  const petals = paletteFor(composition, rnd);
  const flowers: Flower[] = [];
  let guard = 0;
  while (flowers.length < count && guard < 400) {
    guard += 1;
    const i = flowers.length;
    const radius =
      composition === 'meadow'
        ? 1.7 + rnd() * 1.5
        : composition === 'bouquet'
          ? 6.2 + rnd() * 3.2
          : composition === 'hero'
            ? 8 + rnd() * 2.4
            : composition === 'vase'
              ? 3.4 + rnd() * 2.2
              : 2.6 + rnd() * 2.4;
    let x = radius + 1 + rnd() * (gridW - radius * 2 - 2);
    let y = radius + 1 + rnd() * (gridH - radius * 2 - 2);
    if (composition === 'field' || composition === 'hero') {
      y = Math.max(horizon + radius * 0.4, y);
    }
    if (composition === 'vase' && vase) {
      x = vase.cx + (rnd() - 0.5) * gridW * 0.34;
      y = vase.top - flowerRadiusRoom(radius, rnd);
    }
    if (composition === 'bouquet') {
      x = gridW * (0.22 + rnd() * 0.56);
      y = gridH * (0.22 + rnd() * 0.56);
    }
    if (composition === 'hero' && flowers.length === 0) {
      x = gridW * (0.26 + rnd() * 0.48);
      y = gridH * (0.32 + rnd() * 0.28);
    }
    x = Math.max(radius + 0.5, Math.min(gridW - radius - 0.5, x));
    y = Math.max(radius + 0.5, Math.min(gridH - radius - 0.5, y));
    const clash = flowers.some((other) => {
      const dx = other.x - x;
      const dy = other.y - y;
      const min = (other.radius + radius) * (composition === 'bouquet' ? 0.55 : 0.7);
      return dx * dx + dy * dy < min * min;
    });
    if (clash && guard < 320) continue;
    const petal = petals[i % petals.length]!;
    flowers.push(makeFlower(flowers.length + 1, x, y, radius, rnd() * Math.PI, petal, shapes[Math.floor(rnd() * shapes.length)]!, rnd));
  }
  for (const petal of petals) {
    if (flowers.some((flower) => flower.petal === petal || flower.inner === petal)) continue;
    const radius = composition === 'meadow' ? 1.6 : 2.2;
    flowers.push(
      makeFlower(
        flowers.length + 1,
        radius + rnd() * (gridW - radius * 2),
        radius + rnd() * (gridH - radius * 2),
        radius,
        rnd() * Math.PI,
        petal,
        'daisy',
        rnd,
      ),
    );
  }
  if (composition === 'hero' && flowers[0]) {
    const hero = flowers[0];
    hero.petal = rnd() < 0.5 ? 'yellow' : 'cream';
    hero.inner = 'poppy';
    hero.centre = 'orange';
    const buds = ['blush', 'cream', 'yellow'] as const;
    for (let bud = 0; bud < buds.length; bud += 1) {
      const petal = buds[bud]!;
      flowers.push({
        id: flowers.length + 1,
        x: gridW * (0.16 + bud * 0.28) + rnd() * 3,
        y: gridH * (0.58 + rnd() * 0.12),
        radius: 1.8 + rnd() * 0.8,
        angle: rnd() * Math.PI,
        petal,
        inner: innerPetal(petal),
        centre: centreFamiliesForPetal(petal)[0]!,
        shape: 'tulip',
      });
    }
  }
  return flowers;
}

function innerPetal(petal: string): string {
  if (petal === 'poppy' || petal === 'red' || petal === 'pink') return 'yellow';
  if (petal === 'midblue') return 'cream';
  if (petal === 'orange') return 'cream';
  return 'poppy';
}

function makeFlower(
  id: number,
  x: number,
  y: number,
  radius: number,
  angle: number,
  petal: string,
  shape: FlowerShape,
  rnd: () => number,
): Flower {
  return {
    id,
    x,
    y,
    radius,
    angle,
    petal,
    inner: innerPetal(petal),
    centre: centreFamiliesForPetal(petal)[Math.floor(rnd() * 3) % centreFamiliesForPetal(petal).length]!,
    shape,
  };
}

function paletteFor(composition: SceneComposition, rnd: () => number): string[] {
  const pools: Record<SceneComposition, string[]> = {
    meadow: ['yellow', 'cream', 'blush', 'orange', 'pink', 'poppy', 'midblue'],
    bouquet: ['poppy', 'red', 'orange', 'midblue', 'pink'],
    vase: ['poppy', 'red', 'orange', 'midblue', 'pink'],
    hero: ['yellow', 'cream', 'blush', 'orange'],
    field: ['cream', 'blush', 'yellow', 'cream', 'blush', 'poppy'],
  };
  const pool = pools[composition].slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  if (composition !== 'hero' && !pool.includes('poppy')) pool.unshift('poppy');
  return pool;
}

function flowerRadiusRoom(radius: number, rnd: () => number): number {
  return radius * (0.7 + rnd() * 0.5);
}

function stampFlower(cells: SceneCell[], gridW: number, gridH: number, flower: Flower): void {
  const reach = flower.radius * (flower.shape === 'tulip' ? 1.15 : 1.45);
  const x0 = Math.max(0, Math.floor(flower.x - reach - 1));
  const x1 = Math.min(gridW - 1, Math.ceil(flower.x + reach + 1));
  const y0 = Math.max(0, Math.floor(flower.y - reach - 1));
  const y1 = Math.min(gridH - 1, Math.ceil(flower.y + reach + 1));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - flower.x;
      const dy = y + 0.5 - flower.y;
      const ang = Math.atan2(dy, dx) - flower.angle;
      if (!insideBloom(flower, dx, dy, ang)) continue;
      const cell = cells[y * gridW + x]!;
      cell.label = 'petal';
      cell.flowerId = flower.id;
    }
  }
  stampLeaf(cells, gridW, gridH, flower);
}

function insideBloom(flower: Flower, dx: number, dy: number, ang: number): boolean {
  const dist = Math.hypot(dx, dy);
  if (flower.shape === 'daisy') {
    const lobes = 0.55 + 0.45 * Math.cos(ang * 8);
    return dist < flower.radius * (0.35 + lobes);
  }
  if (flower.shape === 'tulip') {
    const cup = Math.exp(-((ang * 1.1) ** 2) / 0.9);
    return dy < flower.radius * 0.85 && dist < flower.radius * (0.55 + cup * 0.7);
  }
  if (flower.shape === 'poppy') {
    const lobes = 0.72 + 0.28 * Math.cos(ang * 4);
    return dist < flower.radius * lobes;
  }
  if (flower.shape === 'rose') {
    const spiral = 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(ang * 5 + dist));
    return dist < flower.radius * spiral;
  }
  const cluster = 0.4 + 0.6 * Math.abs(Math.cos(ang * 3));
  return dist < flower.radius * cluster;
}

function stampLeaf(cells: SceneCell[], gridW: number, gridH: number, flower: Flower): void {
  const ox = flower.x + Math.cos(flower.angle) * flower.radius * 1.3;
  const oy = flower.y + Math.sin(flower.angle) * flower.radius * 0.5;
  const x0 = Math.max(0, Math.floor(ox - flower.radius));
  const x1 = Math.min(gridW - 1, Math.ceil(ox + flower.radius));
  const y0 = Math.max(0, Math.floor(oy - flower.radius * 0.6));
  const y1 = Math.min(gridH - 1, Math.ceil(oy + flower.radius * 0.6));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = (x + 0.5 - ox) / (flower.radius * 0.85);
      const dy = (y + 0.5 - oy) / (flower.radius * 0.42);
      if (dx * dx + dy * dy > 1) continue;
      const cell = cells[y * gridW + x]!;
      if (cell.flowerId !== 0) continue;
      cell.label = 'leaf';
      cell.flowerId = flower.id;
    }
  }
}

function stampCentre(cells: SceneCell[], gridW: number, gridH: number, flower: Flower): void {
  const rad = Math.max(1.05, flower.radius * (flower.shape === 'daisy' ? 0.34 : 0.28));
  const x0 = Math.max(0, Math.floor(flower.x - rad));
  const x1 = Math.min(gridW - 1, Math.ceil(flower.x + rad));
  const y0 = Math.max(0, Math.floor(flower.y - rad));
  const y1 = Math.min(gridH - 1, Math.ceil(flower.y + rad));
  let painted = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - flower.x;
      const dy = y + 0.5 - flower.y;
      if (dx * dx + dy * dy > rad * rad) continue;
      const cell = cells[y * gridW + x]!;
      if (cell.flowerId !== flower.id && cell.flowerId !== 0) continue;
      cell.label = 'centre';
      cell.flowerId = flower.id;
      painted += 1;
    }
  }
  if (painted > 0) return;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i]!.flowerId !== flower.id) continue;
    const dx = (i % gridW) + 0.5 - flower.x;
    const dy = Math.floor(i / gridW) + 0.5 - flower.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0) {
    cells[best]!.label = 'centre';
    cells[best]!.flowerId = flower.id;
  }
}

/**
 * Colour a label with a soft dither between neighbouring families.
 * The decision is shared by a 3×3 block, so the wash reads as a gradient
 * and a single row never flips family all at once.
 */
function colorByLabel(
  cells: SceneCell[],
  gridW: number,
  gridH: number,
  means: Record<string, Rgb>,
  seed: number,
): void {
  const groups = new Map<SceneLabel, number[]>();
  cells.forEach((cell, index) => {
    const list = groups.get(cell.label) ?? [];
    list.push(index);
    groups.set(cell.label, list);
  });

  for (const [label, indexes] of groups) {
    if (label === 'petal' || label === 'centre') continue;
    const families = LABEL_FAMILIES[label];
    const tone = indexes.map((index) => {
      const x = index % gridW;
      const y = Math.floor(index / gridW);
      if (label === 'leaf' || label === 'stem') return fbm(x / 32, y / 26, seed + 5);
      const tilt = (hash01(3, 5, seed) - 0.5) * 1.1;
      const phase = hash01(7, 1, seed) * 0.7;
      return ((y / gridH) + phase + (x / gridW) * tilt) * 0.75 + fbm(x / 36, y / 30, seed + 9) * 0.25;
    });
    const ranked = indexes
      .map((index, order) => ({ index, tone: tone[order]! }))
      .sort((a, b) => a.tone - b.tone || a.index - b.index);
    const pickByIndex = balancedFamilyPicks(ranked, families.length, gridW, seed + label.length);
    indexes.forEach((index) => {
      const pick = pickByIndex.get(index) ?? 0;
      const rgb = means[families[pick]!] ?? { r: 180, g: 170, b: 150 };
      const painted = jitter(rgb, mulberry32((seed + index * 13) >>> 0), 3);
      const cell = cells[index]!;
      cell.r = painted.r;
      cell.g = painted.g;
      cell.b = painted.b;
    });
  }
}

/** Quantile bands with a balanced Bayer handoff, so each family keeps an equal share. */
function balancedFamilyPicks(
  ranked: { index: number; tone: number }[],
  count: number,
  gridW: number,
  seed: number,
): Map<number, number> {
  const picks = new Map<number, number>();
  const total = ranked.length;
  if (total === 0) return picks;
  ranked.forEach((item, rank) => {
    picks.set(item.index, Math.min(count - 1, Math.floor((rank * count) / total)));
  });
  if (count <= 1) return picks;
  const feather = total < 90 ? 1 : Math.max(4, Math.floor(total * 0.11));
  for (let edge = 1; edge < count; edge += 1) {
    const cut = Math.floor((edge * total) / count);
    const from = Math.max(0, cut - feather);
    const to = Math.min(total, cut + feather);
    const window = ranked.slice(from, to);
    if (window.length < 2) continue;
    const scored = window.map((item, order) => {
      const x = item.index % gridW;
      const y = Math.floor(item.index / gridW);
      const bx = Math.floor(x / 3);
      const by = Math.floor(y / 3);
      const wobble = (fbm(bx / 7, by / 6, seed + edge * 13) - 0.5) * 0.35;
      const threshold = (BAYER[by & 3]![bx & 3]! + 0.5) / 16 + wobble;
      const frac = order / (window.length - 1);
      return { index: item.index, score: frac - threshold };
    });
    scored.sort((a, b) => a.score - b.score || a.index - b.index);
    const upper = Math.round(window.length / 2);
    scored.forEach((row, order) => {
      picks.set(row.index, order >= scored.length - upper ? edge : edge - 1);
    });
  }
  return picks;
}
