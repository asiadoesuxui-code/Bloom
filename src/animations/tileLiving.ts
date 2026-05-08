import type { Transition } from 'framer-motion';

/** Discriminator for swapping in hand-tracking / webcam presets later */
export type TileLivingPresetKind = 'pulseScale';

export type LivingMotionPreset = {
  type: TileLivingPresetKind;
  animate: { scale: number[] };
  transition: Transition;
};

/** Subtle breathing scale — replace/extend with new `type` arms when needed */
export function getLivingMotion(seed: number): LivingMotionPreset {
  const duration = 6 + (seed % 401) / 100;
  const delay = ((seed >>> 8) % 1000) / 1000 * duration;
  return {
    type: 'pulseScale',
    animate: {
      scale: [1, 1.018, 1],
    },
    transition: {
      duration,
      repeat: Infinity,
      repeatType: 'mirror',
      ease: 'easeInOut',
      delay,
    },
  };
}
