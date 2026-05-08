import gsap from 'gsap';
import { memo, forwardRef, useEffect, useMemo, useRef } from 'react';
import { getLivingPulseParams } from '../animations/tileLiving';
import { revealGsParamsFromSeed, revealMicroFromSeed } from '../animations/tileReveal';
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
  genT0: number;
};

const BloomTile = memo(function BloomTile({ cell, living, genT0 }: TileProps) {
  const { cx, cy, url, delaySec, seed } = cell;
  const livingOn = living && getLivingPulseParams(seed).type === 'pulseScale';
  const { rotateDeg, yPercent } = revealMicroFromSeed(seed);

  const revealRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  /** Spread tween registration across frames so one commit doesn’t freeze the tab */
  const deferFrames = Math.min(14, Math.floor((cy * GRID_W + cx) / 145));

  useEffect(() => {
    const revealEl = revealRef.current;
    if (!revealEl) return;

    let cancelled = false;
    let raf = 0;
    let framesLeft = deferFrames;
    let tw1: gsap.core.Tween | undefined;
    let tw2: gsap.core.Tween | undefined;

    const arm = () => {
      if (cancelled) return;
      const params = revealGsParamsFromSeed(seed, delaySec);
      const elapsedSec = (performance.now() - genT0) / 1000;
      const delayLeft = Math.max(0, params.delaySec - elapsedSec);

      gsap.set(revealEl, {
        opacity: 0,
        scale: 0.92,
        rotation: rotateDeg,
        yPercent,
        transformOrigin: '50% 50%',
      });

      tw1 = gsap.to(revealEl, {
        opacity: 1,
        duration: params.opacityDur,
        ease: 'power3.out',
        delay: delayLeft,
        overwrite: 'auto',
      });
      tw2 = gsap.to(revealEl, {
        scale: 1,
        rotation: 0,
        yPercent: 0,
        duration: params.transformDur,
        ease: params.transformEase,
        delay: delayLeft,
        overwrite: 'auto',
      });
    };

    const tick = () => {
      if (cancelled) return;
      if (framesLeft-- > 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      arm();
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      tw1?.kill();
      tw2?.kill();
      gsap.killTweensOf(revealEl);
    };
  }, [genT0, seed, delaySec, rotateDeg, yPercent, deferFrames]);

  useEffect(() => {
    const innerEl = innerRef.current;
    if (!innerEl) return;

    if (!livingOn) {
      gsap.killTweensOf(innerEl);
      gsap.set(innerEl, { scale: 1 });
      return;
    }

    const pulse = getLivingPulseParams(seed);
    const legDur = pulse.cycleDurationSec / 2;
    const tween = gsap.to(innerEl, {
      scale: pulse.scalePeak,
      duration: legDur,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
      delay: pulse.phaseDelaySec,
    });

    return () => {
      tween.kill();
      gsap.set(innerEl, { scale: 1 });
    };
  }, [livingOn, seed]);

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
      <div
        ref={revealRef}
        style={{
          width: '100%',
          height: '100%',
          transformOrigin: '50% 50%',
          opacity: 0,
          willChange: 'transform, opacity',
        }}
      >
        <div
          ref={innerRef}
          style={{
            width: '100%',
            height: '100%',
            transformOrigin: '50% 50%',
          }}
        >
          <img
            src={url}
            alt=""
            draggable={false}
            decoding="async"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              display: 'block',
            }}
          />
        </div>
      </div>
    </div>
  );
});

export const MosaicView = forwardRef<HTMLDivElement, MosaicViewProps>(function MosaicView(
  { generationId, cells, canvasBg, living, emptyLabel },
  ref,
) {
  const hasTiles = cells.length > 0;
  const genT0 = useMemo(() => performance.now(), [generationId]);

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
        <div
          key={generationId}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
          }}
        >
          {cells.map((cell) => (
            <BloomTile
              key={`${generationId}-${cell.cx}-${cell.cy}`}
              cell={cell}
              living={living}
              genT0={genT0}
            />
          ))}
        </div>
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
