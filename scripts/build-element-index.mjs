import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const elementsDir = path.join(root, 'src', 'elements');
const outDir = path.join(root, 'src', 'generated');
const outFile = path.join(outDir, 'element-colors.json');

async function collectPngs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await collectPngs(full)));
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.png')) {
      files.push(full);
    }
  }
  return files.sort();
}

async function averageRgb(imagePath) {
  const { data, info } = await sharp(imagePath)
    .resize(32, 32, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < data.length; i += channels) {
    const alpha = channels === 4 ? data[i + 3] / 255 : 1;
    if (alpha < 0.05) continue;
    r += data[i] * alpha;
    g += data[i + 1] * alpha;
    b += data[i + 2] * alpha;
    n += alpha;
  }
  if (n <= 0) {
    return { r: 128, g: 128, b: 128 };
  }
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
  };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const tiles = [];
  await fs.mkdir(elementsDir, { recursive: true });
  const pngPaths = await collectPngs(elementsDir);

  for (const abs of pngPaths) {
    const srcRelative = path.relative(path.join(root, 'src'), abs).split(path.sep).join('/');
    const { r, g, b } = await averageRgb(abs);
    const id = srcRelative.replace(/^elements\//, '').replace(/\.png$/i, '');
    tiles.push({
      id,
      srcRelative,
      r,
      g,
      b,
    });
  }

  await fs.writeFile(outFile, JSON.stringify({ tiles }, null, 2), 'utf8');
  console.log(`Wrote ${tiles.length} tile colour entr(y|ies) to ${path.relative(root, outFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
