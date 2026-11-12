import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { handLandmarkerModelUrl, mediapipeWasmDirectoryUrl } from './mediapipeAssets';
import { mapNormalizedImagePointToElementNorm, isNormInsideCanvas } from './mapHandToCanvas';

export type HandTrackingErrorKind = 'denied' | 'no_device' | 'not_found' | 'init_failed';

export type HandCanvasNorm = { x: number; y: number };

const THROTTLE_MS = 1000 / 30;

function palmAnchorFromLandmarks(hand: HandLandmarkerResult): { nx: number; ny: number } | null {
  const lm = hand.landmarks[0];
  if (!lm || lm.length < 10) return null;
  const w = lm[0]!;
  const m = lm[9]!;
  return { nx: (w.x + m.x) / 2, ny: (w.y + m.y) / 2 };
}

export type UseHandTrackingRuntimeOptions = {
  enabled: boolean;
  mapTargetRef: RefObject<HTMLElement | null>;
};

export type HandTrackingRuntime = {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Updated ~30fps when enabled — prefer reading in rAF, not React state */
  handCanvasNormRef: RefObject<HandCanvasNorm | null>;
  handPresentRef: RefObject<boolean>;
  error: HandTrackingErrorKind | null;
  isStreamActive: boolean;
};

async function createHandLandmarker(delegate: 'GPU' | 'CPU') {
  const vision = await FilesetResolver.forVisionTasks(mediapipeWasmDirectoryUrl());
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: handLandmarkerModelUrl(),
      delegate,
    },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export function useHandTrackingRuntime({
  enabled,
  mapTargetRef,
}: UseHandTrackingRuntimeOptions): HandTrackingRuntime {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef(0);
  const lastEmitRef = useRef(0);
  const handCanvasNormRef = useRef<HandCanvasNorm | null>(null);
  const handPresentRef = useRef(false);

  const [error, setError] = useState<HandTrackingErrorKind | null>(null);
  const [isStreamActive, setStreamActive] = useState(false);

  const mapToTarget = (nx: number, ny: number, vw: number, vh: number): HandCanvasNorm | null => {
    const el = mapTargetRef.current;
    if (!el) return handCanvasNormRef.current;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return handCanvasNormRef.current;
    return mapNormalizedImagePointToElementNorm(nx, ny, vw, vh, rect.width, rect.height, true);
  };

  useEffect(() => {
    if (!enabled) {
      setError(null);
      handCanvasNormRef.current = null;
      handPresentRef.current = false;
      return;
    }

    let stream: MediaStream | null = null;
    let cancelled = false;

    const stopLoop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };

    const runFrame = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const lm = landmarkerRef.current;
      if (!video || !lm || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(runFrame);
        return;
      }

      const now = performance.now();
      let result: HandLandmarkerResult;
      try {
        result = lm.detectForVideo(video, now);
      } catch {
        rafRef.current = requestAnimationFrame(runFrame);
        return;
      }

      const anchor = palmAnchorFromLandmarks(result);
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      if (!anchor || vw < 2 || vh < 2) {
        if (now - lastEmitRef.current >= THROTTLE_MS) {
          lastEmitRef.current = now;
          handCanvasNormRef.current = null;
          handPresentRef.current = false;
        }
        rafRef.current = requestAnimationFrame(runFrame);
        return;
      }

      const mapped = mapToTarget(anchor.nx, anchor.ny, vw, vh);
      if (mapped && now - lastEmitRef.current >= THROTTLE_MS) {
        lastEmitRef.current = now;
        handCanvasNormRef.current = mapped;
        handPresentRef.current = isNormInsideCanvas(mapped.x, mapped.y, 0.08);
      }

      rafRef.current = requestAnimationFrame(runFrame);
    };

    (async () => {
      try {
        setError(null);
        let landmarker: HandLandmarker;
        try {
          landmarker = await createHandLandmarker('GPU');
        } catch {
          landmarker = await createHandLandmarker('CPU');
        }
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 } },
          });
        } catch (e: unknown) {
          const err = e as DOMException;
          if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
            setError('denied');
          } else if (err?.name === 'NotFoundError') {
            setError('no_device');
          } else {
            setError('not_found');
          }
          return;
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          landmarker.close();
          return;
        }

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            setError('init_failed');
            stream.getTracks().forEach((t) => t.stop());
            landmarker.close();
            return;
          }
        }

        setStreamActive(true);
        rafRef.current = requestAnimationFrame(runFrame);
      } catch {
        if (!cancelled) setError('init_failed');
      }
    })();

    return () => {
      cancelled = true;
      stopLoop();
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
      setStreamActive(false);
      handCanvasNormRef.current = null;
      handPresentRef.current = false;
    };
  }, [enabled, mapTargetRef]);

  return { videoRef, handCanvasNormRef, handPresentRef, error, isStreamActive };
}
