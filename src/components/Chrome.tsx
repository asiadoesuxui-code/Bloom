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
  /** Tighter padding when the viewport is short. */
  compact?: boolean;
};

export function Chrome({
  onGenerate,
  computeBusy,
  hasCells,
  artworkReady,
  missingTiles,
  missingSources,
  compact = false,
}: ChromeProps) {
  const cantRun = missingTiles || missingSources || computeBusy;
  const warn = missingTiles || missingSources;

  return (
    <footer
      style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 4 : 8,
        padding: compact ? '6px 12px 8px' : '8px 16px 12px',
        zIndex: 2,
      }}
    >
      <button
        type="button"
        onClick={onGenerate}
        disabled={cantRun}
        style={{
          minWidth: compact ? 132 : 168,
          padding: compact ? '8px 16px' : '12px 22px',
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
      {warn ? (
        <span
          style={{
            fontSize: 12,
            color: 'rgba(245,245,245,0.55)',
            textAlign: 'center',
            maxWidth: 420,
          }}
        >
          {missingTiles ? 'Add PNG tiles under src/elements, then restart dev server. ' : ''}
          {missingSources ? 'Add floral PNG sources under src/sources, then restart dev server.' : ''}
        </span>
      ) : null}
    </footer>
  );
}
