import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Chrome } from './components/Chrome';
import { MosaicView } from './components/MosaicView';
import { buildMosaicFromImageUrl, REVEAL_TOTAL_MS, type MosaicCell } from './lib/mosaic';
import { preloadMosaicTileUrls } from './lib/preloadMosaicTiles';
import { loadResolvedTiles } from './lib/tileUrls';
import { loadSourceAssets, createFairSourcePicker, randomIntegerBelow } from './lib/sources';

const BG_SWATCHES = ['#0e0f12', '#14161c', '#1a1424'] as const;
const DEFAULT_BG = BG_SWATCHES[0]!;

type Phase = 'idle' | 'computing' | 'revealing' | 'done';

export default function App() {
  const mosaicRef = useRef<HTMLDivElement>(null);
  const tiles = useMemo(() => loadResolvedTiles(), []);
  const sourceAssets = useMemo(() => loadSourceAssets(), []);
  const sourcePicker = useMemo(() => createFairSourcePicker(sourceAssets), [sourceAssets]);
  const lastPickedStemRef = useRef<string | null>(null);

  const [canvasBg, setCanvasBg] = useState(DEFAULT_BG);
  const [phase, setPhase] = useState<Phase>('idle');
  const [generationId, setGenerationId] = useState(0);
  const [cells, setCells] = useState<MosaicCell[]>([]);
  const [living, setLiving] = useState(false);

  const missingTiles = tiles.length === 0;
  const missingSources = sourceAssets.length === 0;

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

  const savePng = useCallback(async () => {
    const node = mosaicRef.current;
    if (!node) return;
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: canvasBg,
        cacheBust: true,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `bloom-${Date.now()}.png`;
      a.click();
    } catch (e) {
      console.error(e);
    }
  }, [canvasBg]);

  const computeBusy = phase === 'computing';
  const hasCells = cells.length > 0;
  const artworkReady = phase === 'done';

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        background: 'radial-gradient(1200px 700px at 50% -10%, rgba(92, 108, 168, 0.22), transparent 55%), #07080b',
      }}
    >
      <Chrome
        canvasBg={canvasBg}
        swatches={BG_SWATCHES}
        onPickBg={setCanvasBg}
        onGenerate={runGenerate}
        onSave={savePng}
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
        }}
      >
        <div
          style={{
            width: 'min(100%, calc((100svh - 200px) * 16 / 9))',
            maxWidth: '100%',
            aspectRatio: '16 / 9',
            maxHeight: 'calc(100svh - 200px)',
          }}
        >
          <MosaicView
            ref={mosaicRef}
            generationId={generationId}
            cells={cells}
            canvasBg={canvasBg}
            living={living}
            emptyLabel={computeBusy ? 'Painting mosaic…' : 'Press Generate'}
          />
        </div>
      </main>
    </div>
  );
}
