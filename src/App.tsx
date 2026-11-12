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
  const lastBuildRef = useRef<{ choice: SourceChoice; seed: number } | null>(null);
  const requestRef = useRef(0);

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

  useEffect(() => {
    if (phase !== 'revealing') return;
    setLiving(false);
    const id = window.setTimeout(() => {
      setPhase('done');
      setLiving(true);
    }, revealLivingHoldMs());
    return () => window.clearTimeout(id);
  }, [phase, generationId]);

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

  const landscapeFrame = {
    position: 'relative' as const,
    width: 'min(100%, calc((100svh - 200px) * 16 / 9))',
    maxWidth: '100%',
    aspectRatio: '16 / 9',
    maxHeight: 'calc(100svh - 200px)',
    borderRadius: 12,
    boxSizing: 'border-box' as const,
  };

  const portraitFrame = {
    position: 'relative' as const,
    aspectRatio: '9 / 16',
    width: 'min(100cqw, calc(100cqh * 9 / 16))',
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
          minHeight: '100svh',
          height: portrait ? '100svh' : undefined,
          overflow: portrait ? 'hidden' : undefined,
          display: 'flex',
          flexDirection: 'column',
          background:
            'radial-gradient(1200px 700px at 50% -10%, rgba(92, 108, 168, 0.22), transparent 55%), #07080b',
        }}
      >
        <Chrome
          portrait={portrait}
          onGenerate={runGenerate}
          computeBusy={computeBusy}
          hasCells={hasCells}
          artworkReady={artworkReady}
          missingTiles={missingTiles}
          missingSources={missingSources}
        />

        <main
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: portrait ? '4px 10px 10px' : '8px 28px 12px',
            minHeight: 0,
            position: 'relative',
            containerType: portrait ? 'size' : undefined,
          }}
        >
          <HandTrackingToggle
            enabled={handTracking}
            onChange={setHandTracking}
            permissionDenied={handRt.error === 'denied'}
          />

          <div style={portrait ? portraitFrame : landscapeFrame}>
            {handTracking && hasCells ? <HandTrackingErrorBanner error={handRt.error} /> : null}
            <MosaicView
              ref={mosaicRef}
              generationId={generationId}
              cells={cells}
              canvasBg={CANVAS_BG}
              living={living}
              emptyLabel={computeBusy ? 'Painting mosaic…' : 'Press generate to create your artwork'}
              handTileRipple={rippleOn}
              gridW={grid.gridW}
              gridH={grid.gridH}
            />
          </div>
        </main>
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
