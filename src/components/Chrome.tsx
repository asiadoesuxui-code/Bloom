type ChromeProps = {
  onGenerate: () => void;
  /** Disable generate while computing mosaic */
  computeBusy: boolean;
  /** Show mosaic area */
  hasCells: boolean;
  /** After reveal timeline — Regenerate label */
  artworkReady: boolean;
  /** Missing configuration messages */
  missingTiles: boolean;
  missingSources: boolean;
  /** Portrait phones: title and Generate share one top bar so the mosaic can fill the screen. */
  portrait?: boolean;
};

export function Chrome({
  onGenerate,
  computeBusy,
  hasCells,
  artworkReady,
  missingTiles,
  missingSources,
  portrait = false,
}: ChromeProps) {
  const cantRun = missingTiles || missingSources || computeBusy;
  const warn = missingTiles || missingSources;

  const button = (
    <button
      type="button"
      onClick={onGenerate}
      disabled={cantRun}
      style={{
        minWidth: portrait ? 132 : 168,
        padding: portrait ? '10px 16px' : '12px 22px',
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
  );

  const warning = warn ? (
    <span
      style={{
        fontSize: portrait ? 12 : 13,
        color: 'rgba(245,245,245,0.55)',
        width: portrait ? undefined : '100%',
        maxWidth: portrait ? 220 : undefined,
        textAlign: portrait ? 'right' : 'center',
      }}
    >
      {missingTiles ? 'Add PNG tiles under src/elements, then restart dev server. ' : ''}
      {missingSources ? 'Add floral PNG sources under src/sources, then restart dev server.' : ''}
    </span>
  ) : null;

  if (portrait) {
    return (
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 12px 8px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 20,
            letterSpacing: '0.04em',
            fontWeight: 600,
            color: 'rgba(248,248,252,0.95)',
          }}
        >
          Bloom
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {button}
          {warning}
        </div>
      </header>
    );
  }

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '18px 28px 10px',
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
        {button}
        {warning}
      </footer>
    </>
  );
}
