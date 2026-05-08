import { useRef, useMemo, type Ref } from 'react';
import { useHandTrackingRuntime } from './useHandTrackingRuntime';
import { HandCursorOverlay } from './HandCursorOverlay';

/**
 * Isolated dev harness: maps hand position to a dot inside a 16:9 frame.
 * Open with ?handpoc=1 in development.
 */
export function HandTrackingPoc() {
  const boxRef = useRef<HTMLDivElement>(null);
  const { videoRef, handCanvasNormRef, handPresentRef, error, isStreamActive } = useHandTrackingRuntime({
    enabled: true,
    mapTargetRef: boxRef,
  });

  const hud = useMemo(() => {
    if (error === 'denied') return 'Camera access was denied. Allow the camera to see the tracking dot.';
    if (error === 'no_device') return 'No camera found.';
    if (error === 'init_failed') return 'Could not start hand tracking.';
    if (error === 'not_found') return 'Camera could not be opened.';
    return null;
  }, [error]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100_000,
        background: 'rgba(5,6,10,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ color: 'rgba(250,250,255,0.85)', fontSize: 14 }}>Hand tracking POC — mapped dot</div>
      {hud && (
        <div style={{ color: 'rgba(255,200,180,0.9)', fontSize: 13, maxWidth: 360, textAlign: 'center' }}>
          {hud}
        </div>
      )}
      <div
        ref={boxRef}
        style={{
          width: 'min(92vw, calc((92vh - 120px) * 16 / 9))',
          aspectRatio: '16 / 9',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.12)',
          position: 'relative',
          background: '#12141a',
        }}
      >
        <HandCursorOverlay
          handCanvasNormRef={handCanvasNormRef}
          handPresentRef={handPresentRef}
          active={Boolean(isStreamActive && !error)}
        />
      </div>
      <video
        ref={videoRef as Ref<HTMLVideoElement>}
        muted
        playsInline
        autoPlay
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
          bottom: 0,
          right: 0,
        }}
      />
    </div>
  );
}
