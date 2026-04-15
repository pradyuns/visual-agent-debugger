import { fireEvent, render, screen } from "@testing-library/react";
import type { SpanRecord, TraceBundle } from "@agent-debugger/engine";
import { RunViewer } from "./run-viewer";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  usePlaybackEngine: vi.fn(),
  useTraceStream: vi.fn(),
  appendSpans: vi.fn(),
  seekTo: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("../hooks/use-playback-engine", () => ({
  usePlaybackEngine: (...args: unknown[]) => mocks.usePlaybackEngine(...args),
}));

vi.mock("../hooks/use-trace-stream", () => ({
  useTraceStream: (...args: unknown[]) => mocks.useTraceStream(...args),
}));

vi.mock("./trace-graph", () => ({
  TraceGraph: (props: { onSelectSpan: (spanId: string) => void }) => (
    <button type="button" onClick={() => props.onSelectSpan("child-span")}>
      Select Child Span
    </button>
  ),
}));

vi.mock("./span-inspector", () => ({
  SpanInspector: (props: { span: { id: string } }) => (
    <div>Inspector {props.span.id}</div>
  ),
}));

vi.mock("./transport-controls", () => ({
  TransportControls: () => <div>Transport Controls</div>,
}));

function makeSpan({
  id,
  ...overrides
}: Partial<SpanRecord> & { id: string }): SpanRecord {
  return {
    id,
    traceId: "trace-1",
    kind: "custom",
    name: id,
    status: "ok",
    provenance: "recorded",
    startedAt: 0,
    payload: { kind: "custom" },
    ...overrides,
  };
}

function makeBundle(status: "ok" | "error" | "running" = "ok"): TraceBundle {
  const root = makeSpan({ id: "root-span", kind: "root", payload: { kind: "root" } });
  const child = makeSpan({ id: "child-span", parentSpanId: "root-span" });
  return {
    trace: {
      schemaVersion: 1,
      id: "trace-1",
      name: "Trace 1",
      framework: "raw",
      status,
      startedAt: 0,
      endedAt: 10,
      createdAt: 0,
      importedAt: 0,
      updatedAt: 0,
      rootSpanId: "root-span",
      tags: [],
      metadata: {},
    },
    spans: [root, child],
    edges: [],
  };
}

describe("RunViewer", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.useTraceStream.mockReset();
    mocks.appendSpans.mockReset();
    mocks.seekTo.mockReset();
    mocks.searchParams = new URLSearchParams();

    mocks.usePlaybackEngine.mockReturnValue([
      {
        allSpans: makeBundle().spans,
        visibleSpanIds: new Set(["root-span", "child-span"]),
      },
      {
        appendSpans: mocks.appendSpans,
        seekTo: mocks.seekTo,
      },
    ]);
  });

  it("adds replay query param when replay button is clicked", () => {
    render(<RunViewer bundle={makeBundle("ok")} />);

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(mocks.replace).toHaveBeenCalledWith("?replay=true", { scroll: false });
  });

  it("seeks playback when selecting a span in replay mode", () => {
    mocks.searchParams = new URLSearchParams("replay=true");
    render(<RunViewer bundle={makeBundle("ok")} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Child Span" }));

    expect(mocks.replace).toHaveBeenCalledWith(
      expect.stringContaining("span=child-span"),
      { scroll: false },
    );
    expect(mocks.seekTo).toHaveBeenCalledWith(1);
  });

  it("enables trace streaming while trace status is running", () => {
    render(<RunViewer bundle={makeBundle("running")} />);
    const args = mocks.useTraceStream.mock.calls[0]?.[0] as {
      enabled: boolean;
      traceId: string;
    };

    expect(args.traceId).toBe("trace-1");
    expect(args.enabled).toBe(true);
  });
});
