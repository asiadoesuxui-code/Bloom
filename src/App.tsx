import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { Chrome } from './components/Chrome';
import { MosaicView } from './components/MosaicView';
import { buildMosaicFromImageUrl, REVEAL_TOTAL_MS, type MosaicCell } from './lib/mosaic';
import { preloadMosaicTileUrls } from './lib/preloadMosaicTiles';
import { loadResolvedTiles } from './lib/tileUrls';
import { loadSourceAssets, createFairSourcePicker, randomIntegerBelow } from './lib/sources';
import { useHandTrackingRuntime } from './handTracking/useHandTrackingRuntime';
import { HandRippleProvider } from './handTracking/HandRippleContext';
import { HandTrackingToggle } from './handTracking/HandTrackingToggle';
import { HandTrackingErrorBanner } from './handTracking/HandTrackingErrorBanner';

const CANVAS_BG = '#0e0f12';

type Phase = 'idle' | 'computing' | 'revealing' | 'done';

export default function App() {
  const mosaicRef = useRef<HTMLDivElement>(null);
  const tiles = useMemo(() => loadResolvedTiles(), []);
  const sourceAssets = useMemo(() => loadSourceAssets(), []);
  const sourcePicker = useMemo(() => createFairSourcePicker(sourceAssets), [sourceAssets]);
  const lastPickedStemRef = useRef<string | null>(null);

  const [generationId, setGenerationId] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [cells, setCells] = useState<MosaicCell[]>([]);
  const [living, setLiving] = useState(false);
  const [handTracking, setHandTracking] = useState(false);

  const missingTiles = tiles.length === 0;
  const missingSources = sourceAssets.length === 0;

  const hasCells = cells.length > 0;
  const handPipelineOn = hasCells && handTracking;

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
    }, REVEAL_TOTAL_MS);
    return () => window.clearTimeout(id);
  }, [phase, generationId]);

  const runGenerate = useCallback(async () => {
    if (missingTiles || missingSources) return;
    setLiving(false);
    setPhase('computing');
    setCells([]);
    const choice = sourcePicker.peekNext(lastPickedStemRef.current);
    try {
      const varietySeed = randomIntegerBelow(0x7fff_ffff + 1);
      const built = await buildMosaicFromImageUrl(choice.url, tiles, varietySeed, choice.stem);
      await preloadMosaicTileUrls(built);
      setCells(built);
      sourcePicker.advanceAfterSuccess();
      lastPickedStemRef.current = choice.stem;
      setGenerationId((g) => g + 1);
      setPhase('revealing');
    } catch (e) {
      console.error(e);
      setPhase('idle');
    }
  }, [missingTiles, missingSources, sourcePicker, tiles]);

  const computeBusy = phase === 'computing';
  const artworkReady = phase === 'done';

  return (
    <HandRippleProvider
      enabled={handPipelineOn}
      handCanvasNormRef={handRt.handCanvasNormRef}
      mapTargetRef={mosaicRef}
    >
      <div
        style={{
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          background:
            'radial-gradient(1200px 700px at 50% -10%, rgba(92, 108, 168, 0.22), transparent 55%), #07080b',
        }}
      >
        <Chrome
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
            padding: '8px 28px 12px',
            minHeight: 0,
            position: 'relative',
          }}
        >
          <HandTrackingToggle
            enabled={handTracking}
            onChange={setHandTracking}
            permissionDenied={handRt.error === 'denied'}
          />

          <div
            style={{
              position: 'relative',
              width: 'min(100%, calc((100svh - 200px) * 16 / 9))',
              maxWidth: '100%',
              aspectRatio: '16 / 9',
              maxHeight: 'calc(100svh - 200px)',
              borderRadius: 12,
              boxSizing: 'border-box',
            }}
          >
            {handTracking && hasCells ? <HandTrackingErrorBanner error={handRt.error} /> : null}
            <MosaicView
              ref={mosaicRef}
              generationId={generationId}
              cells={cells}
              canvasBg={CANVAS_BG}
              living={living}
              emptyLabel={computeBusy ? 'Painting mosaic…' : 'Press generate to create your artwork'}
              handTileRipple={handPipelineOn}
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
