import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaybackEngine } from "./use-playback-engine";
import type { SpanRecord } from "@agent-debugger/engine";

function makeSpan(overrides: Partial<SpanRecord> & { id: string }): SpanRecord {
  return {
    traceId: "trace-1",
    kind: "custom",
    name: overrides.id,
    status: "ok",
    provenance: "sdk",
    startedAt: 0,
    payload: { type: "custom" },
    ...overrides,
  } as SpanRecord;
}

// A simple tree:
//   root (t=0)
//     child-a (t=1)
//       grandchild (t=3)
//     child-b (t=2)
// DFS pre-order sorted by startedAt: root, child-a, grandchild, child-b
const rootSpan = makeSpan({ id: "root", startedAt: 0 });
const childA = makeSpan({ id: "child-a", parentSpanId: "root", startedAt: 1 });
const childB = makeSpan({ id: "child-b", parentSpanId: "root", startedAt: 2 });
const grandchild = makeSpan({ id: "grandchild", parentSpanId: "child-a", startedAt: 3 });
const testSpans = [rootSpan, childA, childB, grandchild];

describe("usePlaybackEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------- Initialization ----------

  describe("initialization", () => {
    it("orders spans in DFS pre-order", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root" }),
      );
      const [state] = result.current;
      expect(state.allSpans.map((s) => s.id)).toEqual([
        "root",
        "child-a",
        "grandchild",
        "child-b",
      ]);
    });

    it("defaults startAtEnd=true, cursor at end, mode=live", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root" }),
      );
      const [state] = result.current;
      expect(state.cursor).toBe(3);
      expect(state.mode).toBe("live");
      expect(state.visibleSpanIds.size).toBe(4);
    });

    it("startAtEnd=false sets cursor=0 and mode=paused", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );
      const [state] = result.current;
      expect(state.cursor).toBe(0);
      expect(state.mode).toBe("paused");
      expect(state.visibleSpanIds.size).toBe(1);
      expect(state.visibleSpanIds.has("root")).toBe(true);
    });

    it("handles empty spans", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: [] }),
      );
      const [state] = result.current;
      expect(state.allSpans).toEqual([]);
      expect(state.cursor).toBe(0);
      expect(state.visibleSpanIds.size).toBe(0);
    });

    it("handles single span", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: [rootSpan], startAtEnd: false }),
      );
      const [state] = result.current;
      expect(state.cursor).toBe(0);
      expect(state.visibleSpanIds.size).toBe(1);
    });
  });

  // ---------- visibleSpanIds ----------

  describe("visibleSpanIds", () => {
    it("includes only spans up to cursor", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );

      // cursor=0 -> only root
      expect(result.current[0].visibleSpanIds).toEqual(new Set(["root"]));

      act(() => result.current[1].seekTo(2));

      // cursor=2 -> root, child-a, grandchild
      expect(result.current[0].visibleSpanIds).toEqual(
        new Set(["root", "child-a", "grandchild"]),
      );
    });
  });

  // ---------- step ----------

  describe("step", () => {
    it("steps forward by 1", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );
      expect(result.current[0].cursor).toBe(0);

      act(() => result.current[1].step(1));
      expect(result.current[0].cursor).toBe(1);
    });

    it("steps backward by 1", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root" }),
      );
      expect(result.current[0].cursor).toBe(3);

      act(() => result.current[1].step(-1));
      expect(result.current[0].cursor).toBe(2);
    });

    it("clamps at start (does not go below 0)", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );
      act(() => result.current[1].step(-5));
      expect(result.current[0].cursor).toBe(0);
    });

    it("clamps at end (does not exceed allSpans.length - 1)", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root" }),
      );
      act(() => result.current[1].step(100));
      expect(result.current[0].cursor).toBe(3);
    });
  });

  // ---------- seekTo ----------

  describe("seekTo", () => {
    it("jumps to a specific index", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );
      act(() => result.current[1].seekTo(2));
      expect(result.current[0].cursor).toBe(2);
    });

    it("clamps negative index to 0", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );
      act(() => result.current[1].seekTo(-3));
      expect(result.current[0].cursor).toBe(0);
    });

    it("clamps index beyond length to last index", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );
      act(() => result.current[1].seekTo(999));
      expect(result.current[0].cursor).toBe(3);
    });
  });

  // ---------- play / pause ----------

  describe("play and pause", () => {
    it("auto-advances cursor and sets mode to playing", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );

      act(() => result.current[1].play(100));
      expect(result.current[0].mode).toBe("playing");

      act(() => vi.advanceTimersByTime(100));
      expect(result.current[0].cursor).toBe(1);

      act(() => vi.advanceTimersByTime(100));
      expect(result.current[0].cursor).toBe(2);
    });

    it("stops at end and sets mode to paused", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );

      act(() => result.current[1].play(100));

      // Advance through all spans
      act(() => vi.advanceTimersByTime(400));
      expect(result.current[0].cursor).toBe(3);
      expect(result.current[0].mode).toBe("paused");
    });

    it("pause stops playback", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );

      act(() => result.current[1].play(100));
      act(() => vi.advanceTimersByTime(100));
      expect(result.current[0].cursor).toBe(1);

      act(() => result.current[1].pause());
      expect(result.current[0].mode).toBe("paused");

      act(() => vi.advanceTimersByTime(300));
      // Should still be at 1 since we paused
      expect(result.current[0].cursor).toBe(1);
    });

    it("defaults to 500ms interval", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );

      act(() => result.current[1].play());

      // At 400ms, no advancement yet
      act(() => vi.advanceTimersByTime(400));
      expect(result.current[0].cursor).toBe(0);

      // At 500ms, first tick
      act(() => vi.advanceTimersByTime(100));
      expect(result.current[0].cursor).toBe(1);
    });

    it("cleans up interval on unmount", () => {
      const { result, unmount } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );

      act(() => result.current[1].play(100));
      unmount();
      // No error thrown; interval is cleaned up
    });
  });

  // ---------- goLive ----------

  describe("goLive", () => {
    it("sets mode to live and moves cursor to end", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );
      expect(result.current[0].cursor).toBe(0);

      act(() => result.current[1].goLive());
      expect(result.current[0].mode).toBe("live");
      expect(result.current[0].cursor).toBe(3);
    });

    it("stops any playing interval", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: testSpans, rootSpanId: "root", startAtEnd: false }),
      );

      act(() => result.current[1].play(100));
      act(() => vi.advanceTimersByTime(100));
      expect(result.current[0].cursor).toBe(1);

      act(() => result.current[1].goLive());
      expect(result.current[0].mode).toBe("live");
      expect(result.current[0].cursor).toBe(3);

      // Interval should be cleared
      act(() => vi.advanceTimersByTime(500));
      expect(result.current[0].cursor).toBe(3);
    });
  });

  // ---------- appendSpans ----------

  describe("appendSpans", () => {
    it("merges new spans and re-orders", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: [rootSpan, childA], rootSpanId: "root" }),
      );
      expect(result.current[0].allSpans.length).toBe(2);

      act(() => result.current[1].appendSpans([childB]));
      expect(result.current[0].allSpans.length).toBe(3);
      expect(result.current[0].allSpans.map((s) => s.id)).toEqual([
        "root",
        "child-a",
        "child-b",
      ]);
    });

    it("upserts existing spans by id", () => {
      const runningChild = makeSpan({
        id: "child-a",
        parentSpanId: "root",
        startedAt: 1,
        status: "running",
      });
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: [rootSpan, runningChild], rootSpanId: "root" }),
      );

      const finalizedChild = makeSpan({
        id: "child-a",
        parentSpanId: "root",
        startedAt: 1,
        status: "ok",
        endedAt: 50,
        latencyMs: 49,
      });

      act(() => result.current[1].appendSpans([finalizedChild, childB]));
      expect(result.current[0].allSpans.length).toBe(3);
      const updatedChild = result.current[0].allSpans.find((span) => span.id === "child-a");
      expect(updatedChild?.status).toBe("ok");
      expect(updatedChild?.endedAt).toBe(50);
    });

    it("auto-advances cursor in live mode", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: [rootSpan, childA], rootSpanId: "root" }),
      );
      // Default startAtEnd=true -> mode=live, cursor at end (1)
      expect(result.current[0].mode).toBe("live");
      expect(result.current[0].cursor).toBe(1);

      act(() => result.current[1].appendSpans([childB, grandchild]));
      // In live mode, cursor should advance to new end
      expect(result.current[0].cursor).toBe(3);
      expect(result.current[0].visibleSpanIds.size).toBe(4);
    });

    it("does not auto-advance cursor in paused mode", () => {
      const { result } = renderHook(() =>
        usePlaybackEngine({ spans: [rootSpan, childA], rootSpanId: "root", startAtEnd: false }),
      );
      expect(result.current[0].mode).toBe("paused");
      expect(result.current[0].cursor).toBe(0);

      act(() => result.current[1].appendSpans([childB]));
      // Cursor should stay at 0
      expect(result.current[0].cursor).toBe(0);
      expect(result.current[0].allSpans.length).toBe(3);
    });
  });

  // ---------- Re-initialization on span change ----------

  describe("re-initialization", () => {
    it("recomputes when spans prop changes", () => {
      const { result, rerender } = renderHook(
        (props) => usePlaybackEngine(props),
        { initialProps: { spans: [rootSpan], rootSpanId: "root" as string | undefined } },
      );
      expect(result.current[0].allSpans.length).toBe(1);

      rerender({ spans: testSpans, rootSpanId: "root" });
      expect(result.current[0].allSpans.length).toBe(4);
      expect(result.current[0].cursor).toBe(3);
    });
  });
});
