import { useEffect, useRef } from 'react';
import type { HandCanvasNorm } from './useHandTrackingRuntime';

type Props = {
  handCanvasNormRef: React.RefObject<HandCanvasNorm | null>;
  handPresentRef: React.RefObject<boolean>;
  active: boolean;
};

/** Imperative overlay — avoids React re-renders on every hand tick */
export function HandCursorOverlay({ handCanvasNormRef, handPresentRef, active }: Props) {
  const dotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      const el = dotRef.current;
      const n = handCanvasNormRef.current;
      const present = handPresentRef.current;
      if (el) {
        if (n && present) {
          el.style.opacity = '0.85';
          el.style.left = `${n.x * 100}%`;
          el.style.top = `${n.y * 100}%`;
        } else {
          el.style.opacity = '0';
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, handCanvasNormRef, handPresentRef]);

  if (!active) return null;

  return (
    <div
      ref={dotRef}
      data-bloom-hand-ui
      style={{
        position: 'absolute',
        width: 14,
        height: 14,
        marginLeft: -7,
        marginTop: -7,
        borderRadius: '999px',
        pointerEvents: 'none',
        left: 0,
        top: 0,
        opacity: 0,
        background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.95), rgba(160,200,255,0.45) 45%, rgba(80,140,255,0.2) 100%)',
        boxShadow: '0 0 18px rgba(140,190,255,0.55)',
        zIndex: 10_000,
      }}
    />
  );
}
