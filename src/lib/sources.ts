/** Every top-level `*.png` here is eligible; filenames are never hardcoded — swap images and restart dev. */
export type SourceAsset = {
  url: string;
  /** Filename without extension, e.g. `sunflower` from `sunflower.png` — used for per-source mosaic hints. */
  stem: string;
};

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
  return [...stemsFromGlob(fromSources), ...stemsFromGlob(fromSource)];
}

export function loadSourceUrls(): string[] {
  return loadSourceAssets().map((a) => a.url);
}
