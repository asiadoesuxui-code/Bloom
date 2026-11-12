import { useEffect, type MutableRefObject, type RefObject } from 'react';
import type { HandCanvasNorm } from './useHandTrackingRuntime';

/**
 * Feeds the existing ripple with the mouse (hover) or a finger (drag).
 * A real hand sample, when hand tracking is on, still wins in the provider.
 */
export function usePointerRipple(
  targetRef: RefObject<HTMLElement | null>,
  pointerRef: MutableRefObject<HandCanvasNorm | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const el = targetRef.current;
    if (!enabled || !el) {
      pointerRef.current = null;
      return;
    }

    const write = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      if (x < 0 || y < 0 || x > 1 || y > 1) {
        pointerRef.current = null;
        return;
      }
      pointerRef.current = { x, y };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      write(event.clientX, event.clientY);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.buttons === 0) return;
      write(event.clientX, event.clientY);
    };

    const endContact = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      pointerRef.current = null;
    };

    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointerRef.current = null;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endContact);
    el.addEventListener('pointercancel', endContact);
    el.addEventListener('pointerleave', onPointerLeave);
    // Lift anywhere, including after the finger slides off the mosaic.
    window.addEventListener('pointerup', endContact);
    window.addEventListener('pointercancel', endContact);
    return () => {
      pointerRef.current = null;
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endContact);
      el.removeEventListener('pointercancel', endContact);
      el.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerup', endContact);
      window.removeEventListener('pointercancel', endContact);
    };
  }, [enabled, pointerRef, targetRef]);
}
