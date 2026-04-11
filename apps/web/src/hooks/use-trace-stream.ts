"use client";

import { useEffect, useRef, useState } from "react";
import type { SpanRecord, TraceBundle, TraceStatus } from "@agent-debugger/engine";
import type { PlaybackControls } from "./use-playback-engine";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface UseTraceStreamParams {
  traceId: string;
  enabled: boolean;
  playbackControls: PlaybackControls;
  onSnapshot?: (bundle: TraceBundle) => void;
  onStatusChange?: (status: TraceStatus) => void;
}

export function useTraceStream({
  traceId,
  enabled,
  playbackControls,
  onSnapshot,
  onStatusChange,
}: UseTraceStreamParams) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const controlsRef = useRef(playbackControls);
  controlsRef.current = playbackControls;
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  const onStatusRef = useRef(onStatusChange);
  onStatusRef.current = onStatusChange;

  useEffect(() => {
    if (!enabled) {
      setConnectionStatus("disconnected");
      return;
    }

    setConnectionStatus("connecting");

    const eventSource = new EventSource(`/api/traces/${encodeURIComponent(traceId)}/stream`);

    eventSource.onopen = () => {
      setConnectionStatus("connected");
    };

    eventSource.addEventListener("snapshot", (event) => {
      try {
        const bundle: TraceBundle = JSON.parse(event.data);
        onSnapshotRef.current?.(bundle);
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener("span", (event) => {
      try {
        const span: SpanRecord = JSON.parse(event.data);
        controlsRef.current.appendSpans([span]);
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener("status", (event) => {
      try {
        const { status } = JSON.parse(event.data) as { status: TraceStatus };
        onStatusRef.current?.(status);
      } catch {
        // ignore parse errors
      }
    });

    eventSource.onerror = () => {
      setConnectionStatus("disconnected");
    };

    return () => {
      eventSource.close();
      setConnectionStatus("disconnected");
    };
  }, [traceId, enabled]);

  return { connectionStatus };
}
