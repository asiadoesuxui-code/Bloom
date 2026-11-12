/**
 * Headless checks for original flower scenes.
 * Renders 50 seeds, fails the process if any scene breaks an art rule,
 * and writes a contact sheet of the first 24.
 *
 *   npm run qa:scene
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEEDS = 50;
const SHEET_SEEDS = 24;
const GRID_W = 60;
const GRID_H = 34;
const MAX_FAMILY_SHARE = 0.4;
const MIN_REGION = 24;
const MIN_LIGHTNESS_GAP = 0.08;

const WARM = new Set(['poppy', 'red', 'pink', 'orange', 'yellow', 'brown']);
const GREEN = new Set(['forest', 'green', 'lightgreen', 'seagreen']);
const BLUE = new Set(['lightblue', 'midblue', 'darkblue']);

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const mosaic = await server.ssrLoadModule('/src/lib/mosaic.ts');
const sceneMod = await server.ssrLoadModule('/src/lib/scenePaint.ts');
const color = await server.ssrLoadModule('/src/lib/colorSpace.ts');

const palette = JSON.parse(await fs.readFile(path.join(root, 'src/generated/element-colors.json'), 'utf8'));
const tiles = palette.tiles.map((tile) => ({ ...tile, url: tile.id }));
const means = sceneMod.familyMeans(tiles);
const rgbById = new Map(tiles.map((tile) => [tile.id, tile]));

function colorKey(id) {
  return id.split('_').pop() ?? id;
}

function checkScene(seed) {
  const painted = sceneMod.paintFlowerScene(seed, GRID_W, GRID_H, means);
  const built = mosaic.buildMosaicFromScene(tiles, seed, painted);
  const failures = [];
  const byLabel = new Map();
  const flowers = new Map();

  let flowerL = 0;
  let flowerN = 0;
  let groundL = 0;
  let groundN = 0;

  for (let i = 0; i < painted.cells.length; i++) {
    const src = painted.cells[i];
    const tileId = built[i].url;
    const key = colorKey(tileId);
    const tile = rgbById.get(tileId);
    const lab = color.rgbToOklab(tile.r, tile.g, tile.b);
    const bucket = byLabel.get(src.label) ?? [];
    bucket.push(key);
    byLabel.set(src.label, bucket);

    if (src.label === 'petal' || src.label === 'centre') {
      flowerL += lab.L;
      flowerN += 1;
      if (src.flowerId > 0) {
        const row = flowers.get(src.flowerId) ?? { petal: 0, centre: 0 };
        if (src.label === 'petal') row.petal += 1;
        else row.centre += 1;
        flowers.set(src.flowerId, row);
      }
    }
    if (src.label === 'sky' || src.label === 'water' || src.label === 'ground') {
      groundL += lab.L;
      groundN += 1;
    }

    if ((src.label === 'water' || src.label === 'sky') && WARM.has(key)) {
      failures.push(`${src.label} used warm family ${key}`);
    }
    if (src.label === 'petal' && GREEN.has(key)) {
      failures.push(`petal used green family ${key}`);
    }
    if ((src.label === 'leaf' || src.label === 'stem') && BLUE.has(key)) {
      failures.push(`${src.label} used blue family ${key}`);
    }
  }

  for (const [label, keys] of byLabel) {
    if (keys.length < MIN_REGION) continue;
    const counts = new Map();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const [key, n] of counts) {
      const share = n / keys.length;
      if (share > MAX_FAMILY_SHARE + 1e-6) {
        failures.push(`${label} family ${key} is ${(share * 100).toFixed(1)}%`);
      }
    }
  }

  const gap = flowerN && groundN ? Math.abs(flowerL / flowerN - groundL / groundN) : 0;
  if (gap < MIN_LIGHTNESS_GAP) {
    failures.push(`flower/background lightness gap ${gap.toFixed(3)} < ${MIN_LIGHTNESS_GAP}`);
  }

  for (const [id, row] of flowers) {
    if (row.petal > 0 && row.centre < 1) failures.push(`flower ${id} has no centre`);
  }
  if (flowers.size < 4) failures.push(`only ${flowers.size} flowers`);

  const used = new Set(built.map((cell) => colorKey(cell.url)));
  for (const required of ['forest', 'midblue', 'cream', 'blush', 'poppy']) {
    if (!used.has(required)) failures.push(`missing palette colour ${required}`);
  }

  return { seed, failures: [...new Set(failures)], built, painted, gap };
}

const results = [];
for (let n = 0; n < SEEDS; n++) {
  const seed = (n + 1) * 7919 + 17;
  results.push(checkScene(seed));
}

const failed = results.filter((row) => row.failures.length > 0);
console.log(`seeds ${results.length}  failed ${failed.length}`);
console.log('| seed | result | notes |');
console.log('| --- | --- | --- |');
for (const row of results) {
  const notes = row.failures.length ? row.failures.slice(0, 3).join('; ') : `gap ${row.gap.toFixed(3)}`;
  console.log(`| ${row.seed} | ${row.failures.length ? 'fail' : 'pass'} | ${notes} |`);
}

const cell = 3;
const tileW = GRID_W * cell;
const tileH = GRID_H * cell;
const labelH = 16;
const cols = 6;
const sheet = [];
for (let i = 0; i < SHEET_SEEDS; i++) {
  const row = results[i];
  const pixels = Buffer.alloc(tileW * tileH * 3);
  for (let c = 0; c < row.built.length; c++) {
    const tile = rgbById.get(row.built[c].url);
    const cx = c % GRID_W;
    const cy = Math.floor(c / GRID_W);
    for (let yy = 0; yy < cell; yy++) {
      for (let xx = 0; xx < cell; xx++) {
        const o = ((cy * cell + yy) * tileW + (cx * cell + xx)) * 3;
        pixels[o] = tile.r;
        pixels[o + 1] = tile.g;
        pixels[o + 2] = tile.b;
      }
    }
  }
  const mosaic = await sharp(pixels, { raw: { width: tileW, height: tileH, channels: 3 } }).png().toBuffer();
  const caption = await sharp(
    Buffer.from(
      `<svg width="${tileW}" height="${labelH}"><rect width="100%" height="100%" fill="#12141a"/><text x="4" y="12" fill="#f4f4f8" font-size="11" font-family="sans-serif">${row.seed}${row.failures.length ? ' fail' : ''}</text></svg>`,
    ),
  )
    .png()
    .toBuffer();
  const card = await sharp({
    create: { width: tileW, height: tileH + labelH, channels: 3, background: '#12141a' },
  })
    .composite([
      { input: mosaic, top: 0, left: 0 },
      { input: caption, top: tileH, left: 0 },
    ])
    .png()
    .toBuffer();
  sheet.push({ input: card, left: (i % cols) * (tileW + 8), top: Math.floor(i / cols) * (tileH + labelH + 8) });
}

const sheetW = cols * (tileW + 8) - 8;
const sheetH = Math.ceil(SHEET_SEEDS / cols) * (tileH + labelH + 8) - 8;
const outDir = process.env.QA_OUT ?? '/tmp/bloom-qa';
await fs.mkdir(outDir, { recursive: true });
const sheetPath = path.join(outDir, 'generative-contact-sheet.png');
await sharp({
  create: { width: sheetW, height: sheetH, channels: 3, background: '#07080b' },
})
  .composite(sheet)
  .png()
  .toFile(sheetPath);
await fs.writeFile(path.join(outDir, 'generative-qa.json'), JSON.stringify(results.map(({ seed, failures, gap }) => ({ seed, failures, gap })), null, 2));
console.log(`sheet ${sheetPath}`);

await server.close();
if (failed.length) process.exit(1);
