/** Vite base-aware URLs for files in /public/mediapipe */
export function publicMediapipeBase(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmed}/mediapipe`;
}

export function mediapipeWasmDirectoryUrl(): string {
  return `${publicMediapipeBase()}/wasm`;
}

export function handLandmarkerModelUrl(): string {
  return `${publicMediapipeBase()}/hand_landmarker.task`;
}
