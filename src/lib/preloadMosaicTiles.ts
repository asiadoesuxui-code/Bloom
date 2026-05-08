import type { MosaicCell } from './mosaic';

/** Warm decode cache before mounting thousands of <img> — avoids multi‑second main-thread stalls after the first tiles paint. */
export async function preloadMosaicTileUrls(cells: MosaicCell[]): Promise<void> {
  const urls = [...new Set(cells.map((c) => c.url))];
  await Promise.all(urls.map(loadAndDecodeTile));
}

function loadAndDecodeTile(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const done = () => resolve();
      const dec = img.decode?.();
      if (dec && typeof dec.then === 'function') {
        dec.then(done).catch(done);
      } else {
        done();
      }
    };
    img.onerror = () => resolve();
    img.src = url;
  });
}
