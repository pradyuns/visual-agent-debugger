import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SpanRecord } from "@agent-debugger/engine";
import { computeSpanOrder } from "../lib/graph";

export interface PlaybackState {
  allSpans: SpanRecord[];
  cursor: number;
  mode: "paused" | "playing" | "live";
  visibleSpanIds: Set<string>;
}

export interface PlaybackControls {
  step(delta: number): void;
  seekTo(index: number): void;
  play(intervalMs?: number): void;
  pause(): void;
  goLive(): void;
  appendSpans(spans: SpanRecord[]): void;
}

interface UsePlaybackEngineParams {
  spans: SpanRecord[];
  rootSpanId?: string;
  /** When true (default), cursor starts at end showing all spans. Set false for replay-from-start. */
  startAtEnd?: boolean;
}

function buildChildrenByParent(spans: SpanRecord[]): Map<string, SpanRecord[]> {
  const map = new Map<string, SpanRecord[]>();
  for (const span of spans) {
    if (!span.parentSpanId) continue;
    const siblings = map.get(span.parentSpanId) ?? [];
    siblings.push(span);
    map.set(span.parentSpanId, siblings);
  }
  return map;
}

function orderSpans(spans: SpanRecord[], rootSpanId: string | undefined): SpanRecord[] {
  if (spans.length === 0) return [];
  const childrenByParent = buildChildrenByParent(spans);
  return computeSpanOrder(spans, rootSpanId, childrenByParent);
}

/**
 * Build a fingerprint from span ids so we can detect when the caller provides
 * a genuinely different trace vs. simply re-creating the same array on each
 * render.
 */
function spanFingerprint(spans: SpanRecord[]): string {
  return spans.map((s) => s.id).join("\0");
}

export function usePlaybackEngine({
  spans,
  rootSpanId,
  startAtEnd = true,
}: UsePlaybackEngineParams): [PlaybackState, PlaybackControls] {
  // Fingerprint the incoming prop spans so we can detect when the caller
  // provides a genuinely different trace vs. just re-creating the same array
  // on every render.  We track the *prop* fingerprint separately from the
  // internal allSpans state so that appendSpans (which grows allSpans
  // internally) doesn't trigger a spurious reset.
  const incomingFp = spanFingerprint(spans);
  const prevPropFpRef = useRef(incomingFp);
  const prevRootSpanIdRef = useRef(rootSpanId);
  const prevStartAtEndRef = useRef(startAtEnd);

  const [allSpans, setAllSpans] = useState<SpanRecord[]>(() =>
    orderSpans(spans, rootSpanId),
  );
  const [cursor, setCursor] = useState<number>(() => {
    const ordered = orderSpans(spans, rootSpanId);
    return startAtEnd ? Math.max(0, ordered.length - 1) : 0;
  });
  const [mode, setMode] = useState<"paused" | "playing" | "live">(
    startAtEnd ? "live" : "paused",
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const rootSpanIdRef = useRef(rootSpanId);
  rootSpanIdRef.current = rootSpanId;

  const allSpansRef = useRef(allSpans);
  allSpansRef.current = allSpans;

  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  // Re-order when initial spans change (e.g. new trace loaded).
  // We detect changes by comparing a fingerprint of the *prop* span ids
  // rather than referential equality, since callers often create fresh
  // arrays each render.
  if (
    incomingFp !== prevPropFpRef.current ||
    rootSpanId !== prevRootSpanIdRef.current ||
    startAtEnd !== prevStartAtEndRef.current
  ) {
    prevPropFpRef.current = incomingFp;
    prevRootSpanIdRef.current = rootSpanId;
    prevStartAtEndRef.current = startAtEnd;

    const ordered = orderSpans(spans, rootSpanId);
    setAllSpans(ordered);
    setCursor(startAtEnd ? Math.max(0, ordered.length - 1) : 0);
    setMode(startAtEnd ? "live" : "paused");
  }

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const step = useCallback((delta: number) => {
    setCursor((prev) => {
      const maxIdx = Math.max(0, allSpansRef.current.length - 1);
      return Math.max(0, Math.min(prev + delta, maxIdx));
    });
  }, []);

  const seekTo = useCallback((index: number) => {
    const maxIdx = Math.max(0, allSpansRef.current.length - 1);
    setCursor(Math.max(0, Math.min(index, maxIdx)));
  }, []);

  const play = useCallback(
    (intervalMs = 500) => {
      clearTimer();
      setMode("playing");
      intervalRef.current = setInterval(() => {
        const maxIdx = Math.max(0, allSpansRef.current.length - 1);
        // Read + write the cursor ref synchronously to handle rapid
        // interval ticks (fake timers fire all ticks in one microtask).
        const next = cursorRef.current + 1;
        if (cursorRef.current >= maxIdx) {
          clearTimer();
          setMode("paused");
          return;
        }
        const clamped = Math.min(next, maxIdx);
        cursorRef.current = clamped;
        setCursor(clamped);
      }, intervalMs);
    },
    [clearTimer],
  );

  const pause = useCallback(() => {
    clearTimer();
    setMode("paused");
  }, [clearTimer]);

  const goLive = useCallback(() => {
    clearTimer();
    setMode("live");
    setCursor(Math.max(0, allSpansRef.current.length - 1));
  }, [clearTimer]);

  const appendSpans = useCallback((newSpans: SpanRecord[]) => {
    setAllSpans((prev) => {
      const existingIds = new Set(prev.map((s) => s.id));
      const merged = [...prev];
      for (const s of newSpans) {
        if (!existingIds.has(s.id)) {
          merged.push(s);
        }
      }
      const ordered = orderSpans(merged, rootSpanIdRef.current);
      if (modeRef.current === "live") {
        setCursor(Math.max(0, ordered.length - 1));
      }
      return ordered;
    });
  }, []);

  const visibleSpanIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i <= cursor && i < allSpans.length; i++) {
      ids.add(allSpans[i]!.id);
    }
    return ids;
  }, [allSpans, cursor]);

  const state: PlaybackState = {
    allSpans,
    cursor,
    mode,
    visibleSpanIds,
  };

  const controls: PlaybackControls = useMemo(
    () => ({ step, seekTo, play, pause, goLive, appendSpans }),
    [step, seekTo, play, pause, goLive, appendSpans],
  );

  return [state, controls];
}
