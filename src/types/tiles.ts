export type ElementColorEntry = {
  id: string;
  /** Path relative to `src/`, e.g. `elements/foo.png` */
  srcRelative: string;
  r: number;
  g: number;
  b: number;
};

export type ElementColorsFile = {
  tiles: ElementColorEntry[];
};
