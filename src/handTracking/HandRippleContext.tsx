import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { HandCanvasNorm } from './useHandTrackingRuntime';

export type ShockPulse = { x: number; y: number; at: number };

type TileRec = {
  el: HTMLElement;
  cx: number;
  cy: number;
  peak: number;
  period: number;
  lift: number;
  rx: number;
  ry: number;
  landed: boolean;
  breatheStart: number;
  held: boolean;
  written: string;
};

type ProviderProps = {
  enabled: boolean;
  gridW: number;
  gridH: number;
  handCanvasNormRef: RefObject<HandCanvasNorm | null>;
  pointerCanvasNormRef: RefObject<HandCanvasNorm | null>;
  mapTargetRef: RefObject<HTMLElement | null>;
  shockRef: RefObject<ShockPulse | null>;
  children: ReactNode;
};

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smooth(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function breatheScale(peak: number, period: number, start: number, now: number) {
  if (period <= 0 || start <= 0) return 1;
  const phase = (((now - start) / 1000) % period) / period;
  const wave = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  return 1 + (peak - 1) * wave;
}

/** One Euro filter: low lag when the hand moves, heavier smoothing when it is still. */
class OneEuro {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private x = 0;
  private dx = 0;
  private lastT = 0;
  private has = false;

  constructor(minCutoff = 1.15, beta = 0.045, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  filter(value: number, tMs: number) {
    const dt = this.has ? Math.max(0.001, (tMs - this.lastT) / 1000) : 1 / 60;
    this.lastT = tMs;
    const rawD = this.has ? (value - this.x) / dt : 0;
    const aD = this.alpha(this.dCutoff, dt);
    this.dx = this.has ? aD * rawD + (1 - aD) * this.dx : rawD;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = this.alpha(cutoff, dt);
    this.x = this.has ? a * value + (1 - a) * this.x : value;
    this.has = true;
    return this.x;
  }

  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
}

function scanTiles(root: HTMLElement, gridW: number, gridH: number): TileRec[] {
  const nodes = root.querySelectorAll<HTMLElement>('[data-bloom-tile]');
  if (nodes.length !== gridW * gridH) return [];
  const tiles: TileRec[] = new Array(gridW * gridH);
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i]!;
    const cx = Number(el.dataset.cx);
    const cy = Number(el.dataset.cy);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return [];
    tiles[cy * gridW + cx] = {
      el,
      cx,
      cy,
      peak: Number(el.dataset.peak) || 1,
      period: Number(el.dataset.breathe) || 0,
      lift: 0,
      rx: 0,
      ry: 0,
      landed: el.dataset.landed === '1',
      breatheStart: Number(el.dataset.breatheStart) || 0,
      held: false,
      written: '',
    };
  }
  return tiles;
}

export function HandRippleProvider({
  enabled,
  gridW,
  gridH,
  handCanvasNormRef,
  pointerCanvasNormRef,
  mapTargetRef,
  shockRef,
  children,
}: ProviderProps) {
  const euroX = useRef(new OneEuro());
  const euroY = useRef(new OneEuro());
  const prevRef = useRef({ x: 0.5, y: 0.5 });
  const velRef = useRef({ x: 0, y: 0 });
  const activeShock = useRef<ShockPulse | null>(null);
  const seenShockAt = useRef(0);
  const hotRef = useRef<number[]>([]);
  const tilesRef = useRef<TileRec[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = performance.now();
    let glowEl: HTMLDivElement | null = null;
    let ringEl: HTMLDivElement | null = null;
    let glowOpacity = 0;
    let fieldSuspended = false;
    let suspendCursor = 0;
    let resumeCursor = 0;
    let sizeW = 0;
    let sizeH = 0;
    const measure = () => {
      const root = mapTargetRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      sizeW = rect.width;
      sizeH = rect.height;
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    if (mapTargetRef.current) resizeObserver.observe(mapTargetRef.current);

    const ensureFx = (root: HTMLElement) => {
      if (glowEl?.isConnected && ringEl?.isConnected) return;
      glowEl = document.createElement('div');
      glowEl.setAttribute('data-bloom-glow', '');
      glowEl.style.cssText =
        'position:absolute;left:0;top:0;width:280px;height:280px;margin:-140px 0 0 -140px;border-radius:50%;pointer-events:none;z-index:5;background:radial-gradient(circle, rgba(255,248,230,0.55) 0%, rgba(255,236,200,0.16) 46%, rgba(255,236,200,0) 72%);opacity:0;will-change:transform,opacity;';
      ringEl = document.createElement('div');
      ringEl.setAttribute('data-bloom-shock', '');
      ringEl.style.cssText =
        'position:absolute;left:0;top:0;width:160px;height:160px;margin:-80px 0 0 -80px;border-radius:50%;pointer-events:none;z-index:6;border:1px solid rgba(255,255,255,0.55);box-shadow:0 0 28px rgba(255,255,255,0.45), inset 0 0 18px rgba(255,255,255,0.25);opacity:0;will-change:transform,opacity;';
      root.appendChild(glowEl);
      root.appendChild(ringEl);
    };

    const release = (tile: TileRec, now: number) => {
      tile.held = false;
      tile.lift = 0;
      tile.rx = 0;
      tile.ry = 0;
      tile.written = '';
      tile.el.style.transform = '';
      tile.el.style.filter = '';
      tile.el.style.willChange = 'auto';
      if (!fieldSuspended && tile.period > 0) {
        const start = tile.breatheStart || Number(tile.el.dataset.breatheStart) || now;
        const elapsed = ((now - start) / 1000) % tile.period;
        tile.el.style.animation = `bloomBreathe ${tile.period}s ease-in-out ${-elapsed}s infinite`;
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const root = mapTargetRef.current;
      let tiles = tilesRef.current;
      if (!root || tiles.length === 0 || !tiles[0]?.el.isConnected) {
        tiles = root ? scanTiles(root, gridW, gridH) : [];
        tilesRef.current = tiles;
        hotRef.current = [];
      }

      const pending = shockRef.current;
      if (pending && pending.at !== seenShockAt.current) {
        seenShockAt.current = pending.at;
        activeShock.current = pending;
      }
      if (activeShock.current && now - activeShock.current.at > 900) activeShock.current = null;

      const raw = handCanvasNormRef.current ?? pointerCanvasNormRef.current;
      const shock = activeShock.current;
      const hot = hotRef.current;
      if ((!raw && !shock && hot.length === 0) || tiles.length === 0 || !root) {
        raf = requestAnimationFrame(tick);
        return;
      }

      if (sizeW < 2 || sizeH < 2) measure();
      if (sizeW < 2 || sizeH < 2) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const w = sizeW;
      const h = sizeH;
      const minDim = Math.min(w, h);
      const cell = Math.min(w / gridW, h / gridH);
      // About five cells. A wider falloff means more than ~80 style writes a frame,
      // which drops this page under 50fps while the field is also breathing.
      const reach = cell * 3.6;
      let hx = 0;
      let hy = 0;
      let present = false;
      if (raw) {
        const sx = euroX.current.filter(raw.x, now);
        const sy = euroY.current.filter(raw.y, now);
        const prev = prevRef.current;
        const vx = (sx - prev.x) / dt;
        const vy = (sy - prev.y) / dt;
        velRef.current.x += (vx - velRef.current.x) * 0.35;
        velRef.current.y += (vy - velRef.current.y) * 0.35;
        prev.x = sx;
        prev.y = sy;
        hx = sx * w;
        hy = sy * h;
        present = true;
      } else {
        velRef.current.x *= 0.9;
        velRef.current.y *= 0.9;
      }

      const cellW = w / gridW;
      const cellH = h / gridH;
      const speed = Math.hypot(velRef.current.x, velRef.current.y);
      const follow = 1 - Math.exp(-dt / 0.07);
      const settle = 1 - Math.exp(-dt / 0.62);
      const nextHot: number[] = [];
      const HOT_CAP = 36;
      const cands: { index: number; target: number; rx: number; ry: number }[] = [];
      const seen = new Uint8Array(tiles.length);

      const consider = (index: number) => {
        if (seen[index]) return;
        seen[index] = 1;
        const tile = tiles[index];
        if (!tile) return;
        if (!tile.landed) {
          if (tile.el.dataset.landed !== '1') return;
          tile.landed = true;
          tile.breatheStart = Number(tile.el.dataset.breatheStart) || 0;
        }
        const tpx = (tile.cx + 0.5) * cellW;
        const tpy = (tile.cy + 0.5) * cellH;
        let target = 0;
        let rx = 0;
        let ry = 0;
        if (present) {
          const dx = tpx - hx;
          const dy = tpy - hy;
          const dist = Math.hypot(dx, dy);
          if (dist < reach * 1.15) {
            const lift = 1 - smooth(reach * 0.08, reach, dist);
            const along = speed > 0.15 ? (-dx * velRef.current.x - dy * velRef.current.y) / (minDim * speed) : 0;
            const wake = clamp(along, 0, 1) * clamp(speed * 0.35, 0, 1) * (1 - smooth(reach * 0.2, reach, dist));
            target = clamp(lift * 0.85 + wake * 0.55, 0, 1);
            const faceAmt = lift * 14;
            rx = clamp((dy / reach) * faceAmt, -14, 14);
            ry = clamp((-dx / reach) * faceAmt, -14, 14);
          }
        }
        if (target === 0 && tile.lift < 0.012 && Math.abs(tile.rx) < 0.2 && Math.abs(tile.ry) < 0.2) {
          if (tile.held) release(tile, now);
          return;
        }
        cands.push({ index, target, rx, ry });
      };

      if (present) {
        const margin = Math.ceil(reach / Math.min(cellW, cellH)) + 1;
        const x0 = clamp(Math.floor(hx / cellW - margin), 0, gridW - 1);
        const x1 = clamp(Math.ceil(hx / cellW + margin), 0, gridW - 1);
        const y0 = clamp(Math.floor(hy / cellH - margin), 0, gridH - 1);
        const y1 = clamp(Math.ceil(hy / cellH + margin), 0, gridH - 1);
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) consider(cy * gridW + cx);
        }
      }
      for (let i = 0; i < hot.length; i++) consider(hot[i]!);

      cands.sort((a, b) => b.target - a.target || Number(tiles[b.index]!.held) - Number(tiles[a.index]!.held));
      for (let i = 0; i < cands.length; i++) {
        const cand = cands[i]!;
        const tile = tiles[cand.index]!;
        if (i >= HOT_CAP) {
          if (cand.target === 0 && tile.held) release(tile, now);
          continue;
        }
        if (!tile.held) {
          tile.held = true;
          if (!tile.breatheStart) tile.breatheStart = Number(tile.el.dataset.breatheStart) || now;
          tile.el.style.animation = 'none';
          tile.el.style.willChange = 'transform';
        }
        const k = cand.target > tile.lift ? follow : settle;
        tile.lift += (cand.target - tile.lift) * k;
        tile.rx += (cand.rx - tile.rx) * k;
        tile.ry += (cand.ry - tile.ry) * k;
        if (Math.abs(cand.target - tile.lift) < 0.012) tile.lift = cand.target;
        if (Math.abs(cand.rx - tile.rx) < 0.15) tile.rx = cand.rx;
        if (Math.abs(cand.ry - tile.ry) < 0.15) tile.ry = cand.ry;
        const breathe = fieldSuspended ? 1 : breatheScale(tile.peak, tile.period, tile.breatheStart, now);
        const scale = Math.round(breathe * (1 + tile.lift * 0.22) * 50) / 50;
        const lean = Math.max(-10, Math.min(10, cand.ry * 0.55));
        const next = `translate3d(0,${(-tile.lift * 18).toFixed(0)}px,0) rotate(${lean.toFixed(0)}deg) scale(${scale.toFixed(2)})`;
        if (next !== tile.written) {
          tile.written = next;
          tile.el.style.transform = next;
        }
        nextHot.push(cand.index);
      }
      hotRef.current = nextHot;

      const wantFieldOff = present || nextHot.length > 0;
      if (wantFieldOff && !fieldSuspended) {
        fieldSuspended = true;
        resumeCursor = tiles.length;
        suspendCursor = 0;
      } else if (!wantFieldOff && fieldSuspended && suspendCursor >= tiles.length) {
        fieldSuspended = false;
        suspendCursor = tiles.length;
        resumeCursor = 0;
      }
      if (fieldSuspended && suspendCursor < tiles.length) {
        const end = Math.min(tiles.length, suspendCursor + 100);
        for (let i = suspendCursor; i < end; i++) {
          const tile = tiles[i];
          if (!tile || tile.held || tile.period <= 0) continue;
          tile.el.style.animation = 'none';
        }
        suspendCursor = end;
      } else if (!fieldSuspended && resumeCursor < tiles.length) {
        const end = Math.min(tiles.length, resumeCursor + 100);
        for (let i = resumeCursor; i < end; i++) {
          const tile = tiles[i];
          if (!tile || tile.held || tile.period <= 0 || tile.el.dataset.landed !== '1') continue;
          const start = Number(tile.el.dataset.breatheStart) || now;
          const elapsed = ((now - start) / 1000) % tile.period;
          tile.el.style.animation = `bloomBreathe ${tile.period}s ease-in-out ${-elapsed}s infinite`;
        }
        resumeCursor = end;
      }

      ensureFx(root);
      const targetGlow = present ? 0.9 : 0;
      glowOpacity += (targetGlow - glowOpacity) * (1 - Math.exp(-dt / 0.12));
      if (glowEl) {
        const glowScale = reach / 140;
        glowEl.style.opacity = glowOpacity < 0.02 ? '0' : glowOpacity.toFixed(2);
        glowEl.style.transform = present
          ? `translate3d(${hx.toFixed(1)}px,${hy.toFixed(1)}px,0) scale(${glowScale.toFixed(3)})`
          : glowEl.style.transform;
      }
      if (ringEl) {
        if (shock) {
          const p = clamp((now - shock.at) / 860, 0, 1);
          const cover = Math.hypot(w, h) / 80;
          ringEl.style.opacity = ((1 - p) * 0.85).toFixed(2);
          ringEl.style.transform = `translate3d(${(shock.x * w).toFixed(1)}px,${(shock.y * h).toFixed(1)}px,0) scale(${(0.25 + p * cover).toFixed(3)})`;
        } else if (ringEl.style.opacity !== '0') {
          ringEl.style.opacity = '0';
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      glowEl?.remove();
      ringEl?.remove();
      for (const tile of tilesRef.current) {
        if (tile?.held) release(tile, performance.now());
      }
      tilesRef.current = [];
      hotRef.current = [];
    };
  }, [enabled, gridW, gridH, handCanvasNormRef, pointerCanvasNormRef, mapTargetRef, shockRef]);

  return children;
}
