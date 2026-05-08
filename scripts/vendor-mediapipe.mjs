/**
 * Copies @mediapipe/tasks-vision WASM into public/mediapipe/wasm and downloads the lite hand model once.
 * Run after `npm install` (invoked from predev/prebuild).
 */
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const wasmSrc = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDest = path.join(root, 'public/mediapipe/wasm');
/** Official float16 hand bundle (Google’s bucket does not publish a separate “lite” .task file). */
const taskDest = path.join(root, 'public/mediapipe/hand_landmarker.task');
const TASK_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(
      '[vendor-mediapipe] Skipping: node_modules/@mediapipe/tasks-vision/wasm not found. Run npm install.',
    );
    return false;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
  return true;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          file.close();
          fs.unlink(dest, () => {});
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        file.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function main() {
  if (copyDirRecursive(wasmSrc, wasmDest)) {
    console.log('[vendor-mediapipe] Copied WASM to public/mediapipe/wasm');
  }
  if (fs.existsSync(taskDest) && fs.statSync(taskDest).size > 1000) {
    console.log('[vendor-mediapipe] Model already present:', taskDest);
    return;
  }
  try {
    await downloadFile(TASK_URL, taskDest);
    console.log('[vendor-mediapipe] Downloaded hand_landmarker.task');
  } catch (e) {
    console.warn('[vendor-mediapipe] Could not download lite model:', e.message);
    console.warn('  You can manually place hand_landmarker_lite.task in public/mediapipe/');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
