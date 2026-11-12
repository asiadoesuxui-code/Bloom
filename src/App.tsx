import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { Chrome } from './components/Chrome';
import { MosaicView } from './components/MosaicView';
import { buildMosaicFromImageUrl, revealLivingHoldMs, type MosaicCell } from './lib/mosaic';
import { preloadMosaicTileUrls } from './lib/preloadMosaicTiles';
import { loadResolvedTiles } from './lib/tileUrls';
import { loadSourceAssets, createFairSourcePicker, randomIntegerBelow } from './lib/sources';
import { gridSizeForPortrait } from './lib/waveOrder';
import { useHandTrackingRuntime, type HandCanvasNorm } from './handTracking/useHandTrackingRuntime';
import { HandRippleProvider } from './handTracking/HandRippleContext';
import { usePointerRipple } from './handTracking/usePointerRipple';
import { HandTrackingToggle } from './handTracking/HandTrackingToggle';
import { HandTrackingErrorBanner } from './handTracking/HandTrackingErrorBanner';

const CANVAS_BG = '#0e0f12';

type Phase = 'idle' | 'computing' | 'revealing' | 'done';

type SourceChoice = { url: string; stem: string };

type LastBuild = { choice: SourceChoice; seed: number };

function useVisualViewportBox() {
  const read = () => {
    const vv = window.visualViewport;
    return {
      width: vv?.width ?? window.innerWidth,
      height: vv?.height ?? window.innerHeight,
      offsetTop: vv?.offsetTop ?? 0,
      offsetLeft: vv?.offsetLeft ?? 0,
    };
  };
  const [box, setBox] = useState(() =>
    typeof window === 'undefined'
      ? { width: 1280, height: 800, offsetTop: 0, offsetLeft: 0 }
      : read(),
  );
  useEffect(() => {
    const update = () => setBox(read());
    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return box;
}

function usePortraitViewport(): boolean {
  const [portrait, setPortrait] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(orientation: portrait)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const onChange = () => setPortrait(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return portrait;
}

export default function App() {
  const mosaicRef = useRef<HTMLDivElement>(null);
  const tiles = useMemo(() => loadResolvedTiles(), []);
  const sourceAssets = useMemo(() => loadSourceAssets(), []);
  const sourcePicker = useMemo(() => createFairSourcePicker(sourceAssets), [sourceAssets]);
  const lastPickedStemRef = useRef<string | null>(null);
  const lastBuildRef = useRef<LastBuild | null>(null);
  const requestRef = useRef(0);

  const viewport = useVisualViewportBox();
  const portrait = usePortraitViewport();
  const grid = gridSizeForPortrait(portrait);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  const [generationId, setGenerationId] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [cells, setCells] = useState<MosaicCell[]>([]);
  const [living, setLiving] = useState(false);
  const [handTracking, setHandTracking] = useState(false);

  const missingTiles = tiles.length === 0;
  const missingSources = sourceAssets.length === 0;

  const hasCells = cells.length > 0;
  const handPipelineOn = hasCells && handTracking;
  /** Ripple shells after the reveal, or sooner if hand tracking is already on. */
  const rippleOn = hasCells && (living || handTracking);
  const pointerCanvasNormRef = useRef<HandCanvasNorm | null>(null);
  usePointerRipple(mosaicRef, pointerCanvasNormRef, rippleOn);

  const handRt = useHandTrackingRuntime({
    enabled: handPipelineOn,
    mapTargetRef: mosaicRef,
  });

  const landedRef = useRef(0);
  const settleRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (phase !== 'revealing') return;
    landedRef.current = 0;
    setLiving(false);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setPhase('done');
      setLiving(true);
    };
    settleRef.current = finish;
    // Fallback if a reveal animation never reports that it landed.
    const id = window.setTimeout(finish, revealLivingHoldMs());
    return () => {
      window.clearTimeout(id);
      settleRef.current = () => {};
    };
  }, [phase, generationId]);

  const onTileLanded = useCallback(() => {
    landedRef.current += 1;
    const { gridW, gridH } = gridRef.current;
    if (landedRef.current >= gridW * gridH) settleRef.current();
  }, []);

  const runBuild = useCallback(
    async (choice: SourceChoice, varietySeed: number, advancePicker: boolean) => {
      if (missingTiles || missingSources) return;
      const requestId = ++requestRef.current;
      setLiving(false);
      setPhase('computing');
      setCells([]);
      const { gridW, gridH } = gridRef.current;
      try {
        const built = await buildMosaicFromImageUrl(choice.url, tiles, varietySeed, choice.stem, {
          gridW,
          gridH,
          fit: gridH > gridW ? 'cover' : 'stretch',
        });
        if (requestId !== requestRef.current) return;
        await preloadMosaicTileUrls(built);
        if (requestId !== requestRef.current) return;
        setCells(built);
        if (advancePicker) {
          sourcePicker.advanceAfterSuccess();
          lastPickedStemRef.current = choice.stem;
        }
        lastBuildRef.current = { choice, seed: varietySeed };
        setGenerationId((g) => g + 1);
        setPhase('revealing');
      } catch (e) {
        if (requestId !== requestRef.current) return;
        console.error(e);
        setPhase('idle');
      }
    },
    [missingTiles, missingSources, sourcePicker, tiles],
  );

  const portraitRef = useRef(portrait);
  useEffect(() => {
    if (portraitRef.current === portrait) return;
    portraitRef.current = portrait;
    const last = lastBuildRef.current;
    if (!last) return;
    void runBuild(last.choice, last.seed, false);
  }, [portrait, runBuild]);

  const runGenerate = useCallback(async () => {
    if (missingTiles || missingSources) return;
    const choice = sourcePicker.peekNext(lastPickedStemRef.current);
    const varietySeed = randomIntegerBelow(0x7fff_ffff + 1);
    await runBuild(choice, varietySeed, true);
  }, [missingSources, missingTiles, runBuild, sourcePicker]);

  const computeBusy = phase === 'computing';
  const artworkReady = phase === 'done';
  const compact = portrait || viewport.height < 720;
  const frameStyle = {
    position: 'relative' as const,
    aspectRatio: `${grid.gridW} / ${grid.gridH}`,
    width: `min(100cqw, calc(100cqh * ${grid.gridW} / ${grid.gridH}))`,
    height: `min(100cqh, calc(100cqw * ${grid.gridH} / ${grid.gridW}))`,
    maxWidth: '100%',
    maxHeight: '100%',
    borderRadius: 12,
    boxSizing: 'border-box' as const,
  };

  return (
    <HandRippleProvider
      enabled={rippleOn}
      gridW={grid.gridW}
      gridH={grid.gridH}
      handCanvasNormRef={handRt.handCanvasNormRef}
      pointerCanvasNormRef={pointerCanvasNormRef}
      mapTargetRef={mosaicRef}
    >
      <div
        data-portrait={portrait ? 'true' : 'false'}
        style={{
          position: 'fixed',
          top: viewport.offsetTop,
          left: viewport.offsetLeft,
          width: viewport.width,
          height: viewport.height,
          maxHeight: '100dvh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          background:
            'radial-gradient(1200px 700px at 50% -10%, rgba(92, 108, 168, 0.22), transparent 55%), #07080b',
        }}
      >
        <main
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: compact ? 8 : 12,
            position: 'relative',
            containerType: 'size',
          }}
        >
          <HandTrackingToggle
            enabled={handTracking}
            onChange={setHandTracking}
            permissionDenied={handRt.error === 'denied'}
          />

          <div style={frameStyle}>
            {handTracking && hasCells ? <HandTrackingErrorBanner error={handRt.error} /> : null}
            <MosaicView
              ref={mosaicRef}
              generationId={generationId}
              cells={cells}
              canvasBg={CANVAS_BG}
              living={living}
              emptyLabel={
                computeBusy ? 'Painting mosaic…' : 'Press generate to create your artwork'
              }
              handTileRipple={hasCells}
              gridW={grid.gridW}
              gridH={grid.gridH}
              onTileLanded={onTileLanded}
            />
          </div>
        </main>
        <Chrome
          compact={compact}
          onGenerate={runGenerate}
          computeBusy={computeBusy}
          hasCells={hasCells}
          artworkReady={artworkReady}
          missingTiles={missingTiles}
          missingSources={missingSources}
        />
        {handPipelineOn ? (
          <video
            ref={handRt.videoRef as Ref<HTMLVideoElement>}
            muted
            playsInline
            autoPlay
            style={{
              position: 'fixed',
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: 'none',
              bottom: 0,
              right: 0,
            }}
          />
        ) : null}
      </div>
    </HandRippleProvider>
  );
}
