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
import { HandRippleTileShell, tileFlatIndex, useHandRippleRegister } from '../handTracking/HandRippleContext';

export type MosaicViewProps = {
  generationId: number;
  cells: MosaicCell[];
  canvasBg: string;
  living: boolean;
  emptyLabel: string;
  /** Wrap tiles with hand ripple shell (expects HandRippleProvider above) */
  handTileRipple?: boolean;
  gridW: number;
  gridH: number;
  /** Fired once per tile when its reveal animation has landed. */
  onTileLanded?: () => void;
};

type TileProps = {
  cell: MosaicCell;
  living: boolean;
  rippleShell: boolean;
  gridW: number;
  gridH: number;
  onTileLanded?: () => void;
};

const LIVING_LAYER: CSSProperties = {
  width: '100%',
  height: '100%',
  transformOrigin: '50% 50%',
  backfaceVisibility: 'hidden',
  borderRadius: 2,
};

const BloomTile = memo(function BloomTile({ cell, living, rippleShell, gridW, gridH, onTileLanded }: TileProps) {
  const { cx, cy, url, delaySec, seed } = cell;
  const livingParams = useMemo(() => getLivingMotionParams(seed), [seed]);
  const handRipple = useHandRippleRegister();
  const dampenRef = useRef(handRipple?.livingDampen);
  dampenRef.current = handRipple?.livingDampen;

  const cellRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const livingScaleRef = useRef<HTMLDivElement>(null);
  const onLandedRef = useRef(onTileLanded);
  onLandedRef.current = onTileLanded;

  useEffect(() => {
    const scaleEl = livingScaleRef.current;
    const revealEl = revealRef.current;
    const cellEl = cellRef.current;
    if (!scaleEl || !revealEl) return;

    let tween: gsap.core.Tween | undefined;
    let tickBlend: (() => void) | undefined;
    let started = false;

    const reset = () => {
      tween?.kill();
      tween = undefined;
      gsap.killTweensOf(scaleEl);
      gsap.set(scaleEl, { scale: 1, z: 0, force3D: true });
    };

    const start = () => {
      if (started) return;
      started = true;
      const p = livingParams;
      if (p.kind !== 'static' && cellEl) {
        cellEl.style.overflow = 'visible';
        cellEl.style.zIndex = String(4 + (seed & 31));
      }
      if (p.kind !== 'static') {
        const zPeak = p.kind === 'pulse' ? 8 + (seed & 7) * 1.8 : 16 + (seed & 7) * 2.8;
        const ease = p.kind === 'pulse' ? 'power2.inOut' : 'power3.inOut';
        gsap.set(scaleEl, { transformOrigin: '50% 50%', force3D: true });
        // Rest pose matches the reveal's last frame, then the swell begins at once.
        tween = gsap.fromTo(
          scaleEl,
          { scale: 1, z: 0 },
          {
            scale: p.scalePeak,
            z: zPeak,
            duration: p.scaleHalfSec,
            delay: 0,
            ease,
            repeat: -1,
            yoyo: true,
            force3D: true,
          },
        );
        const dIdx = tileFlatIndex(cx, cy, gridW);
        if (tween) {
          const tw = tween;
          tickBlend = () => {
            const inf = dampenRef.current?.[dIdx] ?? 0;
            tw.timeScale(0.06 + 0.94 * (1 - Math.min(1, inf)));
          };
          gsap.ticker.add(tickBlend);
        }
      }
      onLandedRef.current?.();
    };

    const onEnd = (event: AnimationEvent) => {
      if (event.target !== revealEl || event.animationName !== 'bloomTileReveal') return;
      start();
    };
    revealEl.addEventListener('animationend', onEnd);
    const params = revealGsParamsFromSeed(seed, delaySec);
    const backup = window.setTimeout(start, (params.delaySec + params.transformDur) * 1000 + 24);

    return () => {
      revealEl.removeEventListener('animationend', onEnd);
      window.clearTimeout(backup);
      if (tickBlend) gsap.ticker.remove(tickBlend);
      reset();
    };
  }, [seed, delaySec, livingParams, cx, cy, gridW]);

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
      ref={cellRef}
      style={{
        position: 'absolute',
        left: `${(cx * 100) / gridW}%`,
        top: `${(cy * 100) / gridH}%`,
        width: `${100 / gridW}%`,
        height: `${100 / gridH}%`,
        overflow: 'hidden',
      }}
    >
      <div
        ref={revealRef}
        data-bloom-reveal
        data-delay={delaySec}
        data-seed={seed}
        style={{
          width: '100%',
          height: '100%',
          transformOrigin: '50% 50%',
          backfaceVisibility: 'hidden',
          perspective: 900,
        }}
      >
        {rippleShell ? (
          <HandRippleTileShell cx={cx} cy={cy} rippleActive={living}>
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
    gridW,
    gridH,
    onTileLanded,
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
        touchAction: 'pinch-zoom',
        userSelect: 'none',
        WebkitUserSelect: 'none',
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
          }}
        >
          {cells.map((cell) => (
            <BloomTile
              key={`${generationId}-${cell.cx}-${cell.cy}`}
              cell={cell}
              living={living}
              rippleShell={handTileRipple}
              gridW={gridW}
              gridH={gridH}
              onTileLanded={onTileLanded}
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
