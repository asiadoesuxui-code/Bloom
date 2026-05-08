/** Every top-level `*.png` here is eligible; filenames are never hardcoded — swap images and restart dev. */
export type SourceAsset = {
  url: string;
  /** Filename without extension, e.g. `sunflower` from `sunflower.png` — used for per-source mosaic hints. */
  stem: string;
};

/** Uniform integer in [0, n) — prefers `crypto.getRandomValues` when available. */
export function randomIntegerBelow(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 0;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return Math.floor((u[0]! / 4294967296) * n);
  }
  return Math.floor(Math.random() * n);
}

function normalizeStem(stem: string): string {
  return stem.toLowerCase();
}

/** One entry per basename so `sources/foo.png` and `source/foo.png` are not weighted 2×. */
function dedupeSourceAssetsByStem(assets: SourceAsset[]): SourceAsset[] {
  const seen = new Set<string>();
  const out: SourceAsset[] = [];
  for (const a of assets) {
    const key = normalizeStem(a.stem);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/** Fisher–Yates; `rnd(n)` yields uniform integers in `[0, n)`. */
export function shuffleArrayInPlace<T>(arr: T[], rnd: (n: number) => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

/**
 * Fair picker: each image appears exactly once every N successful generations, then reshuffle.
 * When N&gt;1, the first tile after reshuffle differs from `priorStem` when possible (no back-to-back same image).
 *
 * Call `peekNext` → build → `advanceAfterSuccess` only if the build succeeds.
 */
export function createFairSourcePicker(assetList: SourceAsset[]) {
  const assets = dedupeSourceAssetsByStem(assetList);

  let deck: SourceAsset[] = [];

  const refill = (priorStem: string | null) => {
    deck = [...assets];
    shuffleArrayInPlace(deck, randomIntegerBelow);
    const prior = priorStem?.toLowerCase() ?? null;
    if (prior !== null && deck.length > 1 && normalizeStem(deck[0]!.stem) === prior) {
      const k = deck.findIndex((a, idx) => idx > 0 && normalizeStem(a.stem) !== prior);
      if (k > 0) {
        const tmp = deck[0]!;
        deck[0] = deck[k]!;
        deck[k] = tmp;
      }
    }
  };

  return {
    assets,
    /**
     * Returns the next mosaic source without consuming it — call `advanceAfterSuccess()` only after
     * `buildMosaicFromImageUrl` succeeds so failed runs do not skip a fair slot.
     */
    peekNext(priorStem: string | null): SourceAsset {
      if (assets.length === 0) throw new Error('No source images available');
      if (assets.length === 1) return assets[0]!;
      if (deck.length === 0) refill(priorStem);
      return deck[0]!;
    },
    /** Remove the peeked tile from the fair queue (call once after a successful generation). */
    advanceAfterSuccess(): void {
      if (deck.length === 0) return;
      deck.shift();
    },
  };
}

/**
 * @deprecated Prefer `createFairSourcePicker()` for strictly equal frequencies over time.
 * Uniform random among assets excluding consecutive same stem — still biased if stems are duplicated.
 */
export function pickSourceAssetUniformly(assets: SourceAsset[], excludeStem: string | null): SourceAsset {
  const unique = dedupeSourceAssetsByStem(assets);

  let pool = unique;
  if (excludeStem != null && unique.length > 1) {
    const ex = normalizeStem(excludeStem);
    const filtered = unique.filter((a) => normalizeStem(a.stem) !== ex);
    if (filtered.length > 0) pool = filtered;
  }

  return pool[randomIntegerBelow(pool.length)]!;
}

function stemsFromGlob(modules: Record<string, string>): SourceAsset[] {
  return Object.entries(modules).map(([path, url]) => {
    const file = path.split('/').pop() ?? path;
    const stem = file.replace(/\.png$/i, '');
    return { url, stem };
  });
}

/** All PNG sources from `src/sources/` and optionally `src/source/`. */
export function loadSourceAssets(): SourceAsset[] {
  const fromSources = import.meta.glob('/src/sources/*.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>;
  /** Singular folder name works too if you prefer `src/source/`. */
  const fromSource = import.meta.glob('/src/source/*.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>;
  return dedupeSourceAssetsByStem([
    ...stemsFromGlob(fromSources),
    ...stemsFromGlob(fromSource),
  ]);
}

export function loadSourceUrls(): string[] {
  return loadSourceAssets().map((a) => a.url);
}
