import type { ElementColorEntry } from '../types/tiles';
import elementColors from '../generated/element-colors.json';

const modules = import.meta.glob('/src/elements/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export type ResolvedTile = ElementColorEntry & { url: string };

export function loadResolvedTiles(): ResolvedTile[] {
  const { tiles } = elementColors as { tiles: ElementColorEntry[] };
  const resolved: ResolvedTile[] = [];
  for (const t of tiles) {
    const key = `/src/${t.srcRelative}`;
    const url = modules[key];
    if (!url) continue;
    resolved.push({ ...t, url });
  }
  return resolved;
}
