# Bloom

Bloom builds a ceramic-tile mosaic from a photo in `src/sources`. The tiles come from `src/elements` (`shape_color.png`), arrive in a diagonal wave, then breathe. Move the mouse — or drag a finger on the mosaic — and a ripple runs through them. **Hand track** is optional and uses the camera.

On a portrait screen the mosaic fills the phone and cover-crops the photo. Landscape stays a 16:9 frame.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints, then press Generate.

## Production build

```bash
npm run build
npm run preview
```

## Pictures

Tiles are stored with a longest edge of 128px, which covers the cells on screen (about 20–60px, including retina). Photos are stored at 960px wide. Dev and build run `scripts/optimize-assets.mjs` first, so a newly added full-size PNG is shrunk before `scripts/build-element-index.mjs` averages each tile into `src/generated/element-colors.json`. That average is what picks the tile colour. Restart `npm run dev` after adding or replacing files.
