import gsap from 'gsap';
import {
  memo,
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react';
import { getLivingMotionParams } from '../animations/tileLiving';
import { revealGsParamsFromSeed, revealMicroFromSeed } from '../animations/tileReveal';
import type { MosaicCell } from '../lib/mosaic';
import { GRID_H, GRID_W } from '../lib/waveOrder';
import { HandRippleTileShell, tileFlatIndex, useHandRippleRegister } from '../handTracking/HandRippleContext';

export type MosaicViewProps = {
  generationId: number;
  cells: MosaicCell[];
  canvasBg: string;
  living: boolean;
  emptyLabel: string;
  /** Wrap tiles with hand ripple shell (expects HandRippleProvider above) */
  handTileRipple?: boolean;
};

type TileProps = {
  cell: MosaicCell;
  living: boolean;
  rippleShell: boolean;
};

const LIVING_LAYER: CSSProperties = {
  width: '100%',
  height: '100%',
  transformOrigin: '50% 50%',
  backfaceVisibility: 'hidden',
  borderRadius: 2,
};

const BloomTile = memo(function BloomTile({ cell, living, rippleShell }: TileProps) {
  const { cx, cy, url, delaySec, seed } = cell;
  const livingOn = living;
  const livingParams = useMemo(() => getLivingMotionParams(seed), [seed]);
  const popsAboveGrid = livingOn && livingParams.kind !== 'static';
  const handRipple = useHandRippleRegister();

  const livingScaleRef = useRef<HTMLDivElement>(null);

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

    const dampenBuf = handRipple?.livingDampen;
    const dIdx = tileFlatIndex(cx, cy);
    let tickBlend: (() => void) | undefined;
    if (dampenBuf) {
      tickBlend = () => {
        const inf = dampenBuf[dIdx] ?? 0;
        tw.timeScale(0.06 + 0.94 * (1 - Math.min(1, inf)));
      };
      gsap.ticker.add(tickBlend);
    }

    return () => {
      if (tickBlend) gsap.ticker.remove(tickBlend);
      tw.kill();
      reset();
    };
  }, [livingOn, seed, livingParams, cx, cy, handRipple?.livingDampen]);

  const livingLayer = (
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
  );

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
        data-bloom-reveal
        data-delay={delaySec}
        data-seed={seed}
        style={{
          width: '100%',
          height: '100%',
          transformOrigin: '50% 50%',
          backfaceVisibility: 'hidden',
        }}
      >
        {rippleShell ? (
          <HandRippleTileShell cx={cx} cy={cy} rippleActive={livingOn}>
            {livingLayer}
          </HandRippleTileShell>
        ) : (
          livingLayer
        )}
      </div>
    </div>
  );
});

function applyRevealAnimations(root: HTMLElement): () => void {
  const reveals = Array.from(root.querySelectorAll<HTMLElement>('[data-bloom-reveal]'));

  /** One timestamp for the whole batch — avoids ~2k per-tile layout effects drifting the stagger mid-queue. */
  const tAssign = performance.now();

  for (const revealEl of reveals) {
    const delaySec = Number(revealEl.dataset.delay);
    const seed = Number(revealEl.dataset.seed);
    if (!Number.isFinite(delaySec) || !Number.isFinite(seed)) continue;

    const { rotateDeg, yPercent } = revealMicroFromSeed(seed);
    const params = revealGsParamsFromSeed(seed, delaySec);
    const elapsedSec = (performance.now() - tAssign) / 1000;
    const delayLeft = Math.max(0, params.delaySec - elapsedSec);

    revealEl.style.setProperty('--bloom-reveal-y-pct', String(yPercent));
    revealEl.style.setProperty('--bloom-reveal-r-deg', String(rotateDeg));

    revealEl.style.animation = `bloomTileReveal ${params.transformDur}s ${params.cssTimingFunction} ${delayLeft}s both`;
  }

  return () => {
    for (const revealEl of reveals) {
      revealEl.style.animation = '';
      revealEl.style.removeProperty('--bloom-reveal-y-pct');
      revealEl.style.removeProperty('--bloom-reveal-r-deg');
    }
  };
}

export const MosaicView = forwardRef<HTMLDivElement, MosaicViewProps>(function MosaicView(
  {
    generationId,
    cells,
    canvasBg,
    living,
    emptyLabel,
    handTileRipple = false,
  },
  ref,
) {
  const hasTiles = cells.length > 0;
  const mosaicGridRef = useRef<HTMLDivElement>(null);

  /** Bulk-assign after all tiles commit. One `performance.now()` for the batch — avoids ~2k `useLayoutEffect`s stretching the stagger while the queue runs. Depends on `cells` with `generationId` so `living`/`ripple` toggles alone do not reschedule reveal. */
  useLayoutEffect(() => {
    const root = mosaicGridRef.current;
    if (!root || cells.length === 0) return;
    return applyRevealAnimations(root);
  }, [generationId, cells]);

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
          ref={mosaicGridRef}
          key={generationId}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            /** 3D stacking only when living kicks in (~GSAP z). */
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
              rippleShell={handTileRipple}
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
