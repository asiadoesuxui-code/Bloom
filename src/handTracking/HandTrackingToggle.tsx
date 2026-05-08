type Props = {
  enabled: boolean;
  onChange: (v: boolean) => void;
  permissionDenied?: boolean;
};

export function HandTrackingToggle({ enabled, onChange, permissionDenied }: Props) {
  return (
    <div
      data-bloom-hand-ui
      style={{
        position: 'absolute',
        bottom: 10,
        right: 10,
        zIndex: 50_000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 6,
        pointerEvents: 'auto',
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          color: 'rgba(235,238,248,0.88)',
          fontSize: 12,
          letterSpacing: '0.04em',
          userSelect: 'none',
          padding: '6px 10px',
          borderRadius: 8,
          background: 'rgba(12,14,22,0.72)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: '#8fb4ff' }}
        />
        Hand track
      </label>
      {permissionDenied && (
        <div
          style={{
            maxWidth: 220,
            fontSize: 11,
            lineHeight: 1.45,
            color: 'rgba(255,205,190,0.95)',
            textAlign: 'right',
            padding: '6px 10px',
            borderRadius: 8,
            background: 'rgba(40,18,14,0.75)',
            border: '1px solid rgba(255,140,100,0.25)',
          }}
        >
          Camera access is needed to map your hand over the mosaic. You can turn this off anytime.
        </div>
      )}
    </div>
  );
}
