type ChromeProps = {
  canvasBg: string;
  swatches: readonly string[];
  onPickBg: (hex: string) => void;
  onGenerate: () => void;
  onSave: () => void;
  /** Disable generate while computing mosaic */
  computeBusy: boolean;
  /** Show mosaic area */
  hasCells: boolean;
  /** After reveal timeline — Regenerate + Save */
  artworkReady: boolean;
  /** Missing configuration messages */
  missingTiles: boolean;
  missingSources: boolean;
};

export function Chrome({
  canvasBg,
  swatches,
  onPickBg,
  onGenerate,
  onSave,
  computeBusy,
  hasCells,
  artworkReady,
  missingTiles,
  missingSources,
}: ChromeProps) {
  const cantRun = missingTiles || missingSources || computeBusy;
  const warn = missingTiles || missingSources;

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 28px 10px',
          gap: 16,
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: '0.04em',
            fontWeight: 600,
            color: 'rgba(248,248,252,0.95)',
          }}
        >
          Bloom
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {swatches.map((hex) => {
            const active = hex.toLowerCase() === canvasBg.toLowerCase();
            return (
              <button
                key={hex}
                type="button"
                title={`Background ${hex}`}
                onClick={() => onPickBg(hex)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '999px',
                  border: active ? '2px solid rgba(255,255,255,0.85)' : '2px solid rgba(255,255,255,0.22)',
                  backgroundColor: hex,
                  padding: 0,
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)',
                }}
              />
            );
          })}
        </div>
      </header>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: '16px 28px 26px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={onGenerate}
          disabled={cantRun}
          style={{
            minWidth: 168,
            padding: '12px 22px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.14)',
            background:
              cantRun && !computeBusy
                ? 'rgba(255,255,255,0.06)'
                : 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))',
            color: cantRun && !computeBusy ? 'rgba(245,245,245,0.45)' : 'rgba(248,248,252,0.94)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
          }}
        >
          {computeBusy ? 'Generating…' : artworkReady && hasCells ? 'Regenerate' : 'Generate'}
        </button>

        {artworkReady && hasCells ? (
          <button
            type="button"
            onClick={onSave}
            style={{
              minWidth: 148,
              padding: '12px 22px',
              borderRadius: 999,
              border: '1px solid rgba(122, 162, 247, 0.35)',
              background: 'rgba(122, 162, 247, 0.12)',
              color: 'rgba(226, 235, 255, 0.95)',
            }}
          >
            Save image
          </button>
        ) : null}

        {warn ? (
          <span style={{ fontSize: 13, color: 'rgba(245,245,245,0.55)', width: '100%', textAlign: 'center' }}>
            {missingTiles ? 'Add PNG tiles under src/elements, then restart dev server. ' : ''}
            {missingSources ? 'Add floral PNG sources under src/sources, then restart dev server.' : ''}
          </span>
        ) : null}
      </footer>
    </>
  );
}
