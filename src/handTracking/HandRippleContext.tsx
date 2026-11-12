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
import { motionValue, type MotionValue, motion } from 'framer-motion';
import { rippleDisplacementPx, rippleInfluenceReachPx } from './handRippleMath';
import type { HandCanvasNorm } from './useHandTrackingRuntime';

export function tileFlatIndex(cx: number, cy: number, gridW: number): number {
  return cy * gridW + cx;
}

type MotionRegs = {
  tx: MotionValue<number>;
  ty: MotionValue<number>;
  s: MotionValue<number>;
};

type Entry = MotionRegs & { cx: number; cy: number };

const FOLLOW_HAND = 0.97;
const SETTLE_NO_HAND = 0.31;

function clampScalar(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}



/** Only tiles at or beyond this damping influence keep the carry-over footprint. */
const CARRY_EPS = 0.00085;
const CARRY_MOTION_EPS = 0.22;
const SCALE_CARRY_EPS = 0.0016;

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
  gridW: number;
  gridH: number;
  handCanvasNormRef: RefObject<HandCanvasNorm | null>;
  /** Mouse or touch, in the same 0–1 mosaic space as the hand. Used when no hand is present. */
  pointerCanvasNormRef: RefObject<HandCanvasNorm | null>;
  mapTargetRef: RefObject<HTMLElement | null>;
  children: ReactNode;
};

export function HandRippleProvider({
  enabled,
  gridW,
  gridH,
  handCanvasNormRef,
  pointerCanvasNormRef,
  mapTargetRef,
  children,
}: ProviderProps) {
  const registry = useRef(new Map<string, Entry>());
  const dampen = useRef(new Float32Array(gridW * gridH));
  if (dampen.current.length !== gridW * gridH) {
    dampen.current = new Float32Array(gridW * gridH);
  }

  const register = useCallback((cx: number, cy: number, mvs: MotionRegs) => {
    const key = `${cx},${cy}`;
    registry.current.set(key, { ...mvs, cx, cy });
    return () => {
      registry.current.delete(key);
    };
  }, []);

  const wakeRef = useRef(0);
  const presenceRef = useRef(0);
  /** Last palm sample keyed by quantized norm — Mediapipe often ~30Hz; RAF deltas would read as zero between samples. */
  const mediapipeKeyRef = useRef<string | null>(null);
  const normSnapPxRef = useRef<{ px: number; py: number } | null>(null);
  const prevHandPxRef = useRef<{ x: number; y: number } | null>(null);
  const workSetRef = useRef(new Set<number>());
  const carryRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;

    const tick = () => {
      const rect = mapTargetRef.current?.getBoundingClientRect();
      const hand = handCanvasNormRef.current ?? pointerCanvasNormRef.current;
      const reg = registry.current;

      if (!rect || rect.width < 2 || rect.height < 2) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const tsec = now / 1000;
      const w = rect.width;
      const h = rect.height;

      dampen.current.fill(0);

      let presence = presenceRef.current;
      let wake = wakeRef.current;
      const minDim = Math.min(w, h);

      if (!hand) {
        presence *= 0.87;
        wake *= 0.87;
        prevHandPxRef.current = null;
        mediapipeKeyRef.current = null;
        normSnapPxRef.current = null;
      } else {
        const hx = hand.x * w;
        const hy = hand.y * h;
        presence = Math.min(1, presence * 0.988 + 0.052);

        const sampleKey = `${hand.x.toFixed(6)}:${hand.y.toFixed(6)}`;
        let sampleJumpPx = 0;
        if (mediapipeKeyRef.current !== sampleKey) {
          const snap = normSnapPxRef.current;
          if (snap && mediapipeKeyRef.current !== null) {
            sampleJumpPx = Math.hypot(hx - snap.px, hy - snap.py);
          }
          mediapipeKeyRef.current = sampleKey;
          normSnapPxRef.current = { px: hx, py: hy };
        }

        const prev = prevHandPxRef.current;
        const rafDx = prev ? Math.hypot(hx - prev.x, hy - prev.y) : sampleJumpPx;
        const palmMove = Math.max(rafDx, sampleJumpPx);

        if (prev) {
          const spur = Math.min(1, palmMove / Math.max(minDim * 0.0078, 1));
          const moveBoost =
            palmMove > minDim * 0.022 ? 0.95 : palmMove > minDim * 0.0065 ? 0.62 : palmMove > 0.72 ? 0.32 : 0.075;
          const wakeBleed = palmMove < 2.85 ? 0.955 : palmMove < 11 ? 0.88 : 0.795;
          wake = Math.min(1, wake * wakeBleed + spur * moveBoost + presence * 0.12);
        } else {
          wake = Math.min(1, wake * 0.9 + 0.46);
        }
        prevHandPxRef.current = { x: hx, y: hy };
      }
      presenceRef.current = presence;
      wakeRef.current = wake;

      const reachPx = rippleInfluenceReachPx(w, h);
      /** Extra halo so retarded-wave tiles at the ROI rim still animate; width capped vs grid size. */
      const marginPx = reachPx + minDim * 0.072;
      const cellWpx = w / gridW;
      const cellHpx = h / gridH;
      const cellMin = Math.min(cellWpx, cellHpx);
      const tcx = hand ? (hand.x * w) / cellWpx - 0.5 : 0;
      const tcy = hand ? (hand.y * h) / cellHpx - 0.5 : 0;

      const radialCells = Math.ceil(marginPx / cellMin) + 2;
      /** Must cover displacement falloff (~`minDim * 0.392`), else rings clip at ROI edge. Still hard-capped for perf. */
      const waveBandCells = Math.ceil((minDim * 0.392) / cellMin) + 3;
      const mCells = clampScalar(Math.min(radialCells, Math.max(waveBandCells, 10), 20), 3, Math.max(gridW, gridH));

      const fsx = clampScalar(Math.floor(tcx - mCells), 0, gridW - 1);
      const fex = clampScalar(Math.ceil(tcx + mCells), 0, gridW - 1);
      const fsy = clampScalar(Math.floor(tcy - mCells), 0, gridH - 1);
      const fey = clampScalar(Math.ceil(tcy + mCells), 0, gridH - 1);

      const work = workSetRef.current;
      work.clear();

      if (hand) {
        for (let cy = fsy; cy <= fey; cy++) {
          for (let cx = fsx; cx <= fex; cx++) {
            work.add(tileFlatIndex(cx, cy, gridW));
          }
        }
      }

      const carryPrev = carryRef.current;
      for (let i = 0; i < carryPrev.length; i++) work.add(carryPrev[i]);

      const nextCarry: number[] = [];

      const baseHx = hand ? hand.x * w : -99999;
      const baseHy = hand ? hand.y * h : -99999;

      for (const id of work) {
        const cx = id % gridW;
        const cy = Math.floor(id / gridW);
        const e = reg.get(`${cx},${cy}`);
        if (!e) continue;

        const tpx = ((cx + 0.5) / gridW) * w;
        const tpy = ((cy + 0.5) / gridH) * h;

        let dx = 0;
        let dy = 0;
        let influence = 0;
        let scale = 1;

        if (hand) {
          const res = rippleDisplacementPx({
            tileCxPx: tpx,
            tileCyPx: tpy,
            handHxPx: baseHx,
            handHyPx: baseHy,
            canvasW: w,
            canvasH: h,
            timeSec: tsec,
            presence,
            wake,
          });
          dx = res.dx;
          dy = res.dy;
          influence = res.influence;
          scale = res.scale;
        }

        dampen.current[id] = influence;

        /** Springs per frame fight a moving ripple target (`dx`/`dy` change ~60fps) and read as mush.
         *  Lerp snaps closely to computed wave while smoothing hand-off settles. */
        const kBlend = hand ? FOLLOW_HAND : SETTLE_NO_HAND;
        e.tx.set(e.tx.get() + (dx - e.tx.get()) * kBlend);
        e.ty.set(e.ty.get() + (dy - e.ty.get()) * kBlend);
        e.s.set(e.s.get() + (scale - e.s.get()) * kBlend);

        const abx = Math.abs(e.tx.get());
        const aby = Math.abs(e.ty.get());
        const scl = Math.abs(e.s.get() - 1);
        if (
          influence > CARRY_EPS ||
          abx + aby > CARRY_MOTION_EPS ||
          scl > SCALE_CARRY_EPS
        ) {
          nextCarry.push(id);
        }
      }

      carryRef.current = nextCarry;

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, gridW, gridH, handCanvasNormRef, pointerCanvasNormRef, mapTargetRef]);

  const value = useMemo<HandRippleInner>(
    () => ({
      enabled,
      register,
      livingDampen: enabled ? dampen.current : null,
    }),
    [enabled, register, gridW, gridH],
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

/** Motion shell + register — wraps the living/image layer inside reveal, not reveal itself */
export function HandRippleTileShell({ cx, cy, rippleActive, children }: ShellProps) {
  const ctx = useHandRippleRegister();

  const txMv = useMemo(() => motionValue(0), []);
  const tyMv = useMemo(() => motionValue(0), []);
  const sMv = useMemo(() => motionValue(1), []);

  useEffect(() => {
    if (!ctx?.enabled || !rippleActive) return;
    return ctx.register(cx, cy, {
      tx: txMv,
      ty: tyMv,
      s: sMv,
    });
  }, [ctx, rippleActive, cx, cy, txMv, tyMv, sMv]);

  return (
    <motion.div
      style={{
        width: '100%',
        height: '100%',
        transformOrigin: '50% 50%',
        backfaceVisibility: 'hidden',
        x: txMv,
        y: tyMv,
        scale: sMv,
        willChange: 'transform',
      }}
    >
      {children}
    </motion.div>
  );
}
