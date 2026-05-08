import { memo, forwardRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getLivingMotion } from '../animations/tileLiving';
import type { MosaicCell } from '../lib/mosaic';
import { GRID_H, GRID_W } from '../lib/waveOrder';
import { REVEAL_TILE_DURATION_SEC } from '../lib/mosaic';

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

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${(cx * 100) / GRID_W}%`,
        top: `${(cy * 100) / GRID_H}%`,
        width: `${100 / GRID_W}%`,
        height: `${100 / GRID_H}%`,
        overflow: 'hidden',
      }}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={
        living && livingPreset.type === 'pulseScale'
          ? { opacity: 1, scale: livingPreset.animate.scale }
          : { opacity: 1, scale: 1 }
      }
      transition={
        living && livingPreset.type === 'pulseScale'
          ? livingPreset.transition
          : {
              duration: REVEAL_TILE_DURATION_SEC,
              ease: 'easeOut',
              delay: delaySec,
            }
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
        <AnimatePresence initial={false}>
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
        </AnimatePresence>
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
