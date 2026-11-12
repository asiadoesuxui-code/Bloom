import {
  memo,
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getLivingMotionParams } from '../animations/tileLiving';
import { revealGsParamsFromSeed } from '../animations/tileReveal';
import type { MosaicCell } from '../lib/mosaic';

export type MosaicViewProps = {
  generationId: number;
  cells: MosaicCell[];
  canvasBg: string;
  living: boolean;
  emptyLabel: string;
  gridW: number;
  gridH: number;
  /** Fired once per tile when its reveal animation has landed. */
  onTileLanded?: () => void;
};

type TileProps = {
  cell: MosaicCell;
  gridW: number;
  gridH: number;
};

const BloomTile = memo(function BloomTile({ cell, gridW, gridH }: TileProps) {
  const { cx, cy, url, delaySec, seed } = cell;
  const livingParams = useMemo(() => getLivingMotionParams(seed), [seed]);
  const breathes = livingParams.kind !== 'static';

  return (
    <img
      src={url}
      alt=""
      draggable={false}
      decoding="async"
      data-bloom-tile
      data-bloom-reveal
      data-cx={cx}
      data-cy={cy}
      data-delay={delaySec}
      data-seed={seed}
      data-peak={breathes ? livingParams.scalePeak.toFixed(3) : ''}
      data-breathe={breathes ? (livingParams.scaleHalfSec * 2).toFixed(3) : ''}
      style={{
        position: 'absolute',
        left: `${(cx * 100) / gridW}%`,
        top: `${(cy * 100) / gridH}%`,
        width: `${100 / gridW}%`,
        height: `${100 / gridH}%`,
        objectFit: 'fill',
        display: 'block',
        borderRadius: 2,
        pointerEvents: 'none',
        transformOrigin: '50% 50%',
      }}
    />
  );
});

function applyRevealAnimations(root: HTMLElement, onEach: () => void, onDone: () => void): () => void {
  const reveals = Array.from(root.querySelectorAll<HTMLElement>('[data-bloom-reveal]'));
  const tAssign = performance.now();
  let cancelled = false;
  const pending = reveals
    .map((el) => ({
      el,
      delay: Number(el.dataset.delay),
      seed: Number(el.dataset.seed),
    }))
    .sort((a, b) => a.delay - b.delay);
  let next = 0;

  const onEnd = (event: AnimationEvent) => {
    if (event.animationName !== 'bloomTileReveal') return;
    const revealEl = event.target as HTMLElement;
    if (!revealEl.hasAttribute('data-bloom-reveal')) return;
    const dur = revealEl.dataset.breathe;
    const peak = revealEl.dataset.peak;
    revealEl.dataset.landed = '1';
    if (dur && peak) {
      revealEl.dataset.breatheStart = String(performance.now());
      revealEl.style.setProperty('--bloom-peak', peak);
      revealEl.style.animation = `bloomBreathe ${dur}s ease-in-out 0s infinite`;
    } else {
      revealEl.style.animation = 'none';
    }
    landed += 1;
    onEach();
    if (landed >= reveals.length) onDone();
  };
  let landed = 0;
  root.addEventListener('animationend', onEnd);

  // Start each tile only as its delay arrives, and only a few dozen per frame.
  // An animation on all 2040 tiles promotes every layer for the whole reveal.
  const pump = () => {
    if (cancelled) return;
    const elapsed = (performance.now() - tAssign) / 1000;
    let started = 0;
    while (next < pending.length && started < 8 && pending[next]!.delay <= elapsed + 0.04) {
      const tile = pending[next]!;
      next += 1;
      if (!Number.isFinite(tile.delay) || !Number.isFinite(tile.seed)) continue;
      const params = revealGsParamsFromSeed(tile.seed, tile.delay);
      const delayLeft = Math.max(0, tile.delay - elapsed);
      tile.el.style.animation = `bloomTileReveal ${params.transformDur}s ${params.cssTimingFunction} ${delayLeft}s forwards`;
      started += 1;
    }
    if (next < pending.length) requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);

  return () => {
    cancelled = true;
    root.removeEventListener('animationend', onEnd);
    for (const revealEl of reveals) {
      revealEl.style.animation = '';
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
    gridW,
    gridH,
    onTileLanded,
  },
  ref,
) {
  const hasTiles = cells.length > 0;
  const mosaicGridRef = useRef<HTMLDivElement>(null);
  const [sheen, setSheen] = useState(false);

  useEffect(() => {
    setSheen(false);
  }, [generationId]);

  const onEachRef = useRef(onTileLanded);
  onEachRef.current = onTileLanded;

  /** Bulk-assign after all tiles commit. Chunked so one frame does not style every tile. */
  useLayoutEffect(() => {
    const root = mosaicGridRef.current;
    if (!root || cells.length === 0) return;
    return applyRevealAnimations(
      root,
      () => onEachRef.current?.(),
      () => setSheen(true),
    );
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
          data-living={living ? '1' : '0'}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {cells.map((cell) => (
            <BloomTile
              key={`${generationId}-${cell.cx}-${cell.cy}`}
              cell={cell}
              gridW={gridW}
              gridH={gridH}
            />
          ))}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background:
                'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.55) 50%, transparent 62%)',
              opacity: 0,
              animation: sheen ? 'bloomSheen 1.05s ease-out 1' : undefined,
            }}
          />
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
