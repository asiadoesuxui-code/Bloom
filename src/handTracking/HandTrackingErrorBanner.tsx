import { useMemo } from 'react';
import type { HandTrackingErrorKind } from './useHandTrackingRuntime';

type Props = {
  error: HandTrackingErrorKind | null;
};

export function HandTrackingErrorBanner({ error }: Props) {
  const message = useMemo(() => {
    if (error === 'denied')
      return 'Camera access was denied. Allow the camera to see tracking over the mosaic.';
    if (error === 'no_device') return 'No camera found.';
    if (error === 'init_failed') return 'Could not start hand tracking.';
    if (error === 'not_found') return 'Camera could not be opened.';
    return null;
  }, [error]);

  if (!message) return null;

  return (
    <div
      data-bloom-hand-ui
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        left: 0,
        right: 0,
        top: -36,
        zIndex: 40_001,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          textAlign: 'center',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.45,
          color: 'rgba(255,210,190,0.95)',
          background: 'rgba(28,14,12,0.78)',
          border: '1px solid rgba(255,140,100,0.22)',
        }}
      >
        {message}
      </div>
    </div>
  );
}
