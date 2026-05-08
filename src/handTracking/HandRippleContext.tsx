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
import { animate, motionValue, type MotionValue, motion } from 'framer-motion';
import { GRID_H, GRID_W } from '../lib/waveOrder';
import { rippleDisplacementPx } from './handRippleMath';
import type { HandCanvasNorm } from './useHandTrackingRuntime';

export function tileFlatIndex(cx: number, cy: number): number {
  return cy * GRID_W + cx;
}

type MotionRegs = {
  tx: MotionValue<number>;
  ty: MotionValue<number>;
};

type Entry = MotionRegs & { cx: number; cy: number };

const DISPLACE_SPRING = { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.32 };

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
      const tsec = performance.now() / 1000;

      if (!hand) {
        if (hadHand) {
          for (const [, e] of reg) {
            animate(e.tx, 0, DISPLACE_SPRING);
            animate(e.ty, 0, DISPLACE_SPRING);
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
        const { influence, dx, dy } = rippleDisplacementPx({
          tileCxPx: tpx,
          tileCyPx: tpy,
          handHxPx: hx,
          handHyPx: hy,
          canvasW: w,
          canvasH: h,
          timeSec: tsec,
        });
        dampen.current[tileFlatIndex(cx, cy)] = influence;

        if (influence > 0.0025) {
          animate(e.tx, dx, DISPLACE_SPRING);
          animate(e.ty, dy, DISPLACE_SPRING);
        } else {
          animate(e.tx, 0, DISPLACE_SPRING);
          animate(e.ty, 0, DISPLACE_SPRING);
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
  /** Only after reveal — avoids Framer/filter layers (~2k tiles) during GSAP reveal */
  rippleActive: boolean;
  children: ReactNode;
};

/** motion shell + register — wraps the living/image layer inside reveal, not reveal itself */
export function HandRippleTileShell({ cx, cy, rippleActive, children }: ShellProps) {
  const ctx = useHandRippleRegister();

  const txMv = useMemo(() => motionValue(0), []);
  const tyMv = useMemo(() => motionValue(0), []);

  useEffect(() => {
    if (!ctx?.enabled || !rippleActive) return;
    return ctx.register(cx, cy, {
      tx: txMv,
      ty: tyMv,
    });
  }, [ctx, rippleActive, cx, cy, txMv, tyMv]);

  if (!ctx?.enabled) return <>{children}</>;

  /** Reveal phase: identical DOM depth as hand-tracking off (`revealRef` directly wraps the tile face). */
  if (!rippleActive) return <>{children}</>;

  return (
    <motion.div
      style={{
        width: '100%',
        height: '100%',
        transformOrigin: '50% 50%',
        backfaceVisibility: 'hidden',
        x: txMv,
        y: tyMv,
        willChange: 'transform',
      }}
    >
      {children}
    </motion.div>
  );
}
