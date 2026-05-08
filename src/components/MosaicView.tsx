import { memo, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { getLivingMotion } from '../animations/tileLiving';
import { revealMicroFromSeed, revealTransitionFromSeed } from '../animations/tileReveal';
import type { MosaicCell } from '../lib/mosaic';
import { GRID_H, GRID_W } from '../lib/waveOrder';

export type MosaicViewProps = {
  generationId: number;
  cells: MosaicCell[];
  canvasBg: string;
  living: boolean;
  emptyLabel: string;
};

type TileProps = {
  cell: MosaicCell;
  living: boolean;
};

const BloomTile = memo(function BloomTile({ cell, living }: TileProps) {
  const { cx, cy, url, delaySec, seed } = cell;
  const livingPreset = getLivingMotion(seed);
  const livingOn = living && livingPreset.type === 'pulseScale';
  const { rotateDeg, yPercent } = revealMicroFromSeed(seed);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${(cx * 100) / GRID_W}%`,
        top: `${(cy * 100) / GRID_H}%`,
        width: `${100 / GRID_W}%`,
        height: `${100 / GRID_H}%`,
        overflow: 'hidden',
      }}
    >
      <motion.div
        style={{
          width: '100%',
          height: '100%',
          transformOrigin: '50% 50%',
        }}
        initial={{
          opacity: 0,
          scale: 0.92,
          rotate: rotateDeg,
          y: `${yPercent}%`,
        }}
        animate={{ opacity: 1, scale: 1, rotate: 0, y: '0%' }}
        transition={revealTransitionFromSeed(seed, delaySec)}
      >
        <motion.div
          style={{
            width: '100%',
            height: '100%',
            transformOrigin: '50% 50%',
          }}
          animate={livingOn ? { scale: livingPreset.animate.scale } : { scale: 1 }}
          transition={
            livingOn
              ? livingPreset.transition
              : { duration: 0 }
          }
        >
          <img
            src={url}
            alt=""
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              display: 'block',
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
});

export const MosaicView = forwardRef<HTMLDivElement, MosaicViewProps>(function MosaicView(
  { generationId, cells, canvasBg, living, emptyLabel },
  ref,
) {
  const hasTiles = cells.length > 0;

  return (
    <div
      ref={ref}
      data-bloom-export-root
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: canvasBg,
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
      }}
    >
      {hasTiles ? (
        <motion.div
          key={generationId}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
          }}
        >
          {cells.map((cell) => (
            <BloomTile key={`${generationId}-${cell.cx}-${cell.cy}`} cell={cell} living={living} />
          ))}
        </motion.div>
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(245,245,245,0.45)',
            fontSize: 15,
            letterSpacing: '0.02em',
          }}
        >
          {emptyLabel}
        </div>
      )}
    </div>
  );
});
