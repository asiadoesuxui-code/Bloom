import type { ElementColorEntry } from '../types/tiles';

export type TileKeys = { shapeKey: string; colorKey: string };

/** Filename pattern: `{shape}_{color}.png` — color is the last `_` segment. */
export function parseTileKeysFromId(id: string): TileKeys {
  const stem = id
    .replace(/\.png$/i, '')
    .split('/')
    .pop()!;
  const i = stem.lastIndexOf('_');
  if (i <= 0) return { shapeKey: stem, colorKey: 'default' };
  return { shapeKey: stem.slice(0, i), colorKey: stem.slice(i + 1) };
}

export function getTileKeys(entry: Pick<ElementColorEntry, 'id'> & Partial<TileKeys>): TileKeys {
  if (entry.colorKey != null && entry.shapeKey != null) {
    return { shapeKey: entry.shapeKey, colorKey: entry.colorKey };
  }
  return parseTileKeysFromId(entry.id);
}
