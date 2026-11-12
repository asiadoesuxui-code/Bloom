/**
 * Shrink tile and source PNGs to the size the mosaic actually samples.
 *
 * Tiles render at about 20–60 CSS pixels, so a 128px edge stays sharp on retina
 * displays. Source photos are never shown; Generate only averages them into the
 * 60×34 landscape grid (and a cover-crop on portrait phones). Photos are stored
 * at 960px wide.
 *
 * Colour matching must not move. After resizing, each tile is nudged until
 * `build-element-index.mjs` reports the same average RGB, and each photo is
 * nudged until every landscape cell averages to the same RGB as the original.
 * Files already within the size cap are left untouched, so running this twice
 * does not recompress them.
 *
 * Landscape cell size is the 60×34 grid in `src/lib/waveOrder.ts`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const elementsDir = path.join(root, 'src', 'elements');
const sourcesDir = path.join(root, 'src', 'sources');
const publicDir = path.join(root, 'public');

const TILE_MAX_EDGE = 128;
const SOURCE_MAX_WIDTH = 960;
const LANDSCAPE_GRID_W = 60;
const LANDSCAPE_GRID_H = 34;

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

async function listPngs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.png'))
    .map((e) => path.join(dir, e.name))
    .sort();
}

/** Same 32×32 average as `scripts/build-element-index.mjs`. */
async function tileAverage(input) {
  const { data, info } = await sharp(input)
    .resize(32, 32, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += channels) {
    const alpha = channels === 4 ? data[i + 3] / 255 : 1;
    if (alpha < 0.05) continue;
    r += data[i] * alpha;
    g += data[i + 1] * alpha;
    b += data[i + 2] * alpha;
    n += alpha;
  }
  if (n <= 0) {
    return { r: 128, g: 128, b: 128, rf: 128, gf: 128, bf: 128 };
  }
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
    rf: r / n,
    gf: g / n,
    bf: b / n,
  };
}

async function optimizeTile(file) {
  const before = await fs.stat(file);
  const meta = await sharp(file).metadata();
  const edge = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (edge > 0 && edge <= TILE_MAX_EDGE) {
    return { file, skipped: true, before: before.size, after: before.size };
  }

  const target = await tileAverage(file);
  let buf = await sharp(file)
    .resize({
      width: TILE_MAX_EDGE,
      height: TILE_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'lanczos3',
    })
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();

  let matched = false;
  for (let iter = 0; iter < 8; iter++) {
    const cur = await tileAverage(buf);
    if (cur.r === target.r && cur.g === target.g && cur.b === target.b) {
      matched = true;
      break;
    }
    const dr = Math.sign(target.r - cur.r);
    const dg = Math.sign(target.g - cur.g);
    const db = Math.sign(target.b - cur.b);
    const gap = Math.max(
      Math.abs(target.rf - cur.rf),
      Math.abs(target.gf - cur.gf),
      Math.abs(target.bf - cur.bf),
    );
    const frac = Math.min(1, Math.max(0.15, gap));
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 13) continue;
      const apply = frac >= 0.99 || (i / 4) % 1000 < frac * 1000;
      if (!apply) continue;
      data[i] = clampByte(data[i] + dr);
      data[i + 1] = clampByte(data[i + 1] + dg);
      data[i + 2] = clampByte(data[i + 2] + db);
    }
    buf = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }
  if (!matched) {
    throw new Error(`Could not preserve tile colour for ${path.basename(file)}`);
  }

  await writeAtomic(file, buf);
  return { file, skipped: false, before: before.size, after: buf.length };
}

function cellBox(srcW, srcH, gridW, gridH, cx, cy) {
  let x0 = Math.floor((cx * srcW) / gridW);
  let x1 = Math.floor(((cx + 1) * srcW) / gridW);
  let y0 = Math.floor((cy * srcH) / gridH);
  let y1 = Math.floor(((cy + 1) * srcH) / gridH);
  x0 = Math.max(0, Math.min(srcW, x0));
  x1 = Math.max(0, Math.min(srcW, x1));
  y0 = Math.max(0, Math.min(srcH, y0));
  y1 = Math.max(0, Math.min(srcH, y1));
  if (x1 <= x0) x1 = Math.min(srcW, x0 + 1);
  if (y1 <= y0) y1 = Math.min(srcH, y0 + 1);
  return { x0, x1, y0, y1 };
}

/** Box average, matching `averageColorForCell` in `src/lib/mosaic.ts` for a full-frame stretch. */
function averageCell(data, width, channels, box) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    let i = (y * width + box.x0) * channels;
    for (let x = box.x0; x < box.x1; x++) {
      const alpha = channels === 4 ? data[i + 3] / 255 : 1;
      if (alpha >= 0.02) {
        r += data[i] * alpha;
        g += data[i + 1] * alpha;
        b += data[i + 2] * alpha;
        n += alpha;
      }
      i += channels;
    }
  }
  if (n <= 0) return [128, 128, 128];
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function shiftCellToTarget(data, width, channels, box, target) {
  const pixels = [];
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) pixels.push((y * width + x) * channels);
  }
  for (let c = 0; c < 3; c++) {
    let sum = 0;
    let n = 0;
    for (const i of pixels) {
      const alpha = channels === 4 ? data[i + 3] / 255 : 1;
      if (alpha < 0.02) continue;
      sum += data[i + c] * alpha;
      n += alpha;
    }
    if (n <= 0) continue;
    let delta = Math.round(target[c] * n - sum);
    const step = delta > 0 ? 1 : -1;
    let guard = 0;
    while (delta !== 0 && guard < pixels.length * 4) {
      let moved = false;
      for (const i of pixels) {
        if (delta === 0) break;
        const alpha = channels === 4 ? data[i + 3] / 255 : 1;
        if (alpha < 0.02) continue;
        const next = data[i + c] + step;
        if (next < 0 || next > 255) continue;
        data[i + c] = next;
        delta -= step;
        moved = true;
      }
      if (!moved) break;
      guard++;
    }
  }
}

async function optimizeSource(file) {
  const before = await fs.stat(file);
  const meta = await sharp(file).metadata();
  if ((meta.width ?? 0) > 0 && (meta.width ?? 0) <= SOURCE_MAX_WIDTH) {
    return { file, skipped: true, before: before.size, after: before.size };
  }

  const full = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const targets = [];
  for (let cy = 0; cy < LANDSCAPE_GRID_H; cy++) {
    for (let cx = 0; cx < LANDSCAPE_GRID_W; cx++) {
      targets.push(
        averageCell(
          full.data,
          full.info.width,
          full.info.channels,
          cellBox(full.info.width, full.info.height, LANDSCAPE_GRID_W, LANDSCAPE_GRID_H, cx, cy),
        ),
      );
    }
  }

  const resized = await sharp(file)
    .resize({ width: SOURCE_MAX_WIDTH, withoutEnlargement: true, kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const data = Buffer.from(resized.data);
  const width = resized.info.width;
  const height = resized.info.height;
  const channels = resized.info.channels;

  for (let cy = 0; cy < LANDSCAPE_GRID_H; cy++) {
    for (let cx = 0; cx < LANDSCAPE_GRID_W; cx++) {
      const box = cellBox(width, height, LANDSCAPE_GRID_W, LANDSCAPE_GRID_H, cx, cy);
      shiftCellToTarget(data, width, channels, box, targets[cy * LANDSCAPE_GRID_W + cx]);
      const got = averageCell(data, width, channels, box);
      const target = targets[cy * LANDSCAPE_GRID_W + cx];
      if (got[0] !== target[0] || got[1] !== target[1] || got[2] !== target[2]) {
        throw new Error(
          `Could not preserve cell colour ${cx},${cy} in ${path.basename(file)} (${got.join(',')} vs ${target.join(',')})`,
        );
      }
    }
  }

  const encoded = await sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const check = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let cy = 0; cy < LANDSCAPE_GRID_H; cy++) {
    for (let cx = 0; cx < LANDSCAPE_GRID_W; cx++) {
      const got = averageCell(
        check.data,
        check.info.width,
        check.info.channels,
        cellBox(check.info.width, check.info.height, LANDSCAPE_GRID_W, LANDSCAPE_GRID_H, cx, cy),
      );
      const target = targets[cy * LANDSCAPE_GRID_W + cx];
      if (got[0] !== target[0] || got[1] !== target[1] || got[2] !== target[2]) {
        throw new Error(`Source colour drifted after encode for ${path.basename(file)} at ${cx},${cy}`);
      }
    }
  }

  await writeAtomic(file, encoded);
  return { file, skipped: false, before: before.size, after: encoded.length };
}

async function writeAtomic(file, buf) {
  const tmp = `${file}.opt-tmp`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, file);
}

function pngToIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);
  entry.writeUInt8(32, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

async function writeFavicon() {
  const preferred = path.join(elementsDir, 'flower6_pink.png');
  let tile = preferred;
  try {
    await fs.access(tile);
  } catch {
    const pngs = await listPngs(elementsDir);
    tile = pngs.find((p) => path.basename(p).startsWith('flower')) ?? pngs[0];
  }
  if (!tile) return;
  const png = await sharp(tile)
    .resize(32, 32, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await fs.mkdir(publicDir, { recursive: true });
  await fs.writeFile(path.join(publicDir, 'favicon.png'), png);
  await fs.writeFile(path.join(publicDir, 'favicon.ico'), pngToIco(png));
  console.log(`favicon from ${path.basename(tile)}`);
}

function report(label, rows) {
  const before = rows.reduce((s, r) => s + r.before, 0);
  const after = rows.reduce((s, r) => s + r.after, 0);
  const rewritten = rows.filter((r) => !r.skipped).length;
  console.log(
    `${label}: ${rows.length} files, rewrote ${rewritten}, ${(before / 1024 / 1024).toFixed(2)} MB → ${(after / 1024 / 1024).toFixed(2)} MB`,
  );
}

async function main() {
  const tiles = [];
  for (const file of await listPngs(elementsDir)) tiles.push(await optimizeTile(file));
  report('tiles', tiles);

  const sources = [];
  for (const file of await listPngs(sourcesDir)) sources.push(await optimizeSource(file));
  report('sources', sources);

  await writeFavicon();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
