/** Discriminator for swapping in hand-tracking / webcam presets later */
export type TileLivingPresetKind = 'pulseScale';

export type LivingPulseParams = {
  type: TileLivingPresetKind;
  scalePeak: number;
  /** Full cycle sec for scale 1 → peak → 1 (matches prior mirror repeat window). */
  cycleDurationSec: number;
  phaseDelaySec: number;
};

/** Subtle breathing scale — replace/extend with new `type` arms when needed */
export function getLivingPulseParams(seed: number): LivingPulseParams {
  const cycleDurationSec = 6 + (seed % 401) / 100;
  const phaseDelaySec = ((seed >>> 8) % 1000) / 1000 * cycleDurationSec;
  return {
    type: 'pulseScale',
    scalePeak: 1.015,
    cycleDurationSec,
    phaseDelaySec,
  };
}
