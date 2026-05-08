import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
  type RefObject,
} from 'react';
import { animate, motionValue, useTransform, type MotionValue, motion } from 'framer-motion';
import { GRID_H, GRID_W } from '../lib/waveOrder';
import { rippleTargets } from './handRippleMath';
import type { HandCanvasNorm } from './useHandTrackingRuntime';

export function tileFlatIndex(cx: number, cy: number): number {
  return cy * GRID_W + cx;
}

type MotionRegs = {
  scale: MotionValue<number>;
  rotate: MotionValue<number>;
  brightness: MotionValue<number>;
};

type Entry = MotionRegs & { cx: number; cy: number };

const SPRING = { type: 'spring' as const, stiffness: 200, damping: 24, mass: 0.4 };

type HandRippleInner = {
  enabled: boolean;
  register: (cx: number, cy: number, mvs: MotionRegs) => () => void;
  livingDampen: Float32Array | null;
};

const HandRippleCtx = createContext<HandRippleInner | null>(null);

export function useHandRippleRegister(): HandRippleInner | null {
  return useContext(HandRippleCtx);
}

type ProviderProps = {
  enabled: boolean;
  handCanvasNormRef: RefObject<HandCanvasNorm | null>;
  mapTargetRef: RefObject<HTMLElement | null>;
  children: ReactNode;
};

export function HandRippleProvider({
  enabled,
  handCanvasNormRef,
  mapTargetRef,
  children,
}: ProviderProps) {
  const registry = useRef(new Map<string, Entry>());
  const dampen = useRef(new Float32Array(GRID_W * GRID_H));

  const register = useCallback((cx: number, cy: number, mvs: MotionRegs) => {
    const key = `${cx},${cy}`;
    registry.current.set(key, { ...mvs, cx, cy });
    return () => {
      registry.current.delete(key);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    let hadHand = false;
    let lastRippleWork = 0;
    const tick = () => {
      const now = performance.now();
      const rect = mapTargetRef.current?.getBoundingClientRect();
      const hand = handCanvasNormRef.current;
      const reg = registry.current;

      if (!rect || rect.width < 2 || rect.height < 2) {
        raf = requestAnimationFrame(tick);
        return;
      }

      if (hand && now - lastRippleWork < 32) {
        raf = requestAnimationFrame(tick);
        return;
      }

      dampen.current.fill(0);

      if (hand) lastRippleWork = now;

      const w = rect.width;
      const h = rect.height;
      const R = Math.min(w, h) * 0.2;
      const tsec = performance.now() / 1000;

      if (!hand) {
        if (hadHand) {
          for (const [, e] of reg) {
            animate(e.scale, 1, SPRING);
            animate(e.rotate, 0, SPRING);
            animate(e.brightness, 1, SPRING);
          }
        }
        hadHand = false;
        raf = requestAnimationFrame(tick);
        return;
      }

      hadHand = true;
      const hx = hand.x * w;
      const hy = hand.y * h;

      for (const [, e] of reg) {
        const { cx, cy } = e;
        const tpx = ((cx + 0.5) / GRID_W) * w;
        const tpy = ((cy + 0.5) / GRID_H) * h;
        const dist = Math.hypot(tpx - hx, tpy - hy);
        const { influence, scale, rotateDeg, brightness } = rippleTargets({
          distPx: dist,
          radiusPx: R,
          timeSec: tsec,
        });
        dampen.current[tileFlatIndex(cx, cy)] = influence;

        if (influence > 0.003) {
          animate(e.scale, scale, SPRING);
          animate(e.rotate, rotateDeg, SPRING);
          animate(e.brightness, brightness, SPRING);
        } else {
          animate(e.scale, 1, SPRING);
          animate(e.rotate, 0, SPRING);
          animate(e.brightness, 1, SPRING);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, handCanvasNormRef, mapTargetRef]);

  const value = useMemo<HandRippleInner>(
    () => ({
      enabled,
      register,
      livingDampen: enabled ? dampen.current : null,
    }),
    [enabled, register],
  );

  return <HandRippleCtx.Provider value={value}>{children}</HandRippleCtx.Provider>;
}

type ShellProps = {
  cx: number;
  cy: number;
  children: ReactNode;
};

/** motion shell + register — wraps tile content without editing inner tile GSAP code paths beyond this hook */
export function HandRippleTileShell({ cx, cy, children }: ShellProps) {
  const ctx = useHandRippleRegister();

  const scaleMv = useMemo(() => motionValue(1), []);
  const rotateMv = useMemo(() => motionValue(0), []);
  const brightnessMv = useMemo(() => motionValue(1), []);

  useEffect(() => {
    if (!ctx?.enabled) return;
    return ctx.register(cx, cy, {
      scale: scaleMv,
      rotate: rotateMv,
      brightness: brightnessMv,
    });
  }, [ctx, cx, cy, scaleMv, rotateMv, brightnessMv]);

  const filt = useTransform(brightnessMv, (b) => `brightness(${b})`);

  if (!ctx?.enabled) return <>{children}</>;

  return (
    <motion.div
      style={{
        width: '100%',
        height: '100%',
        transformOrigin: '50% 50%',
        scale: scaleMv,
        rotate: rotateMv,
        filter: filt,
        willChange: 'transform, filter',
      }}
    >
      {children}
    </motion.div>
  );
}
