import gsap from 'gsap';
import { memo, forwardRef, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { getLivingMotionParams } from '../animations/tileLiving';
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

const LIVING_LAYER: CSSProperties = {
  width: '100%',
  height: '100%',
  transformOrigin: '50% 50%',
  backfaceVisibility: 'hidden',
  borderRadius: 2,
};

const BloomTile = memo(function BloomTile({ cell, living, genT0 }: TileProps) {
  const { cx, cy, url, delaySec, seed } = cell;
  const livingOn = living;
  const { rotateDeg, yPercent } = revealMicroFromSeed(seed);
  const livingParams = useMemo(() => getLivingMotionParams(seed), [seed]);
  const popsAboveGrid = livingOn && livingParams.kind !== 'static';

  const revealRef = useRef<HTMLDivElement>(null);
  const livingScaleRef = useRef<HTMLDivElement>(null);

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
    const el = livingScaleRef.current;
    if (!el) return;

    const reset = () => {
      gsap.killTweensOf(el);
      gsap.set(el, {
        scale: 1,
        z: 0,
        force3D: true,
      });
    };

    if (!livingOn) {
      reset();
      return;
    }

    const p = livingParams;
    if (p.kind === 'static') {
      reset();
      return;
    }

    const zPeak = p.kind === 'pulse' ? 8 + (seed & 7) * 1.8 : 16 + (seed & 7) * 2.8;

    gsap.set(el, { transformOrigin: '50% 50%', force3D: true });

    const ease = p.kind === 'pulse' ? 'power2.inOut' : 'power3.inOut';
    /** Only transform props (GPU); skip box-shadow — it repaints every frame and tanks 2k tiles */
    const tw = gsap.fromTo(
      el,
      { scale: 1, z: 0 },
      {
        scale: p.scalePeak,
        z: zPeak,
        duration: p.scaleHalfSec,
        delay: p.scalePhaseSec,
        ease,
        repeat: -1,
        yoyo: true,
        force3D: true,
      },
    );

    return () => {
      tw.kill();
      reset();
    };
  }, [livingOn, seed, livingParams]);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${(cx * 100) / GRID_W}%`,
        top: `${(cy * 100) / GRID_H}%`,
        width: `${100 / GRID_W}%`,
        height: `${100 / GRID_H}%`,
        overflow: popsAboveGrid ? 'visible' : 'hidden',
        zIndex: popsAboveGrid ? 4 + (seed & 31) : undefined,
      }}
    >
      <div
        ref={revealRef}
        style={{
          width: '100%',
          height: '100%',
          transformOrigin: '50% 50%',
          opacity: 0,
        }}
      >
        <div ref={livingScaleRef} style={LIVING_LAYER}>
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
            ...(living
              ? { perspective: 900, transformStyle: 'preserve-3d' as const }
              : {}),
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
