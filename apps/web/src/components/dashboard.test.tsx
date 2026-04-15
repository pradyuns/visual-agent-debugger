import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TraceSummary } from "@agent-debugger/engine";
import { Dashboard } from "./dashboard";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  static reset() {
    MockEventSource.instances = [];
  }

  listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  close = vi.fn();

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (event: MessageEvent) => void) {
    const current = this.listeners.get(type) ?? [];
    current.push(cb);
    this.listeners.set(type, current);
  }

  emit(type: string, payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function makeSummary({
  id,
  name,
  ...overrides
}: Partial<TraceSummary> & { id: string; name: string }): TraceSummary {
  return {
    id,
    name,
    framework: "raw",
    status: "ok",
    startedAt: 1000,
    endedAt: 1500,
    durationMs: 500,
    updatedAt: 1500,
    tags: [],
    spanCount: 2,
    errorCount: 0,
    ...overrides,
  };
}

describe("Dashboard", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    MockEventSource.reset();
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("supports compare selection and navigates to comparison view", () => {
    render(
      <Dashboard
        initialTraces={[
          makeSummary({ id: "left", name: "Left Trace" }),
          makeSummary({ id: "right", name: "Right Trace" }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0] as HTMLInputElement);
    fireEvent.click(checkboxes[1] as HTMLInputElement);

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(mocks.push).toHaveBeenCalledWith("/compare?left=left&right=right");
  });

  it("deletes a trace and refreshes list state", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ traces: [] }),
        }),
    );

    render(
      <Dashboard
        initialTraces={[makeSummary({ id: "trace-a", name: "Trace A" })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(
        "/api/traces/trace-a",
      );
      expect(screen.queryByText("Trace A")).toBeNull();
    });
  });

  it("ingests trace:created SSE events into the table", async () => {
    render(
      <Dashboard
        initialTraces={[makeSummary({ id: "existing", name: "Existing Trace" })]}
      />,
    );

    const source = MockEventSource.instances[0];
    expect(source?.url).toBe("/api/traces/stream");

    act(() => {
      source?.emit(
        "trace:created",
        makeSummary({ id: "new-trace", name: "New Trace" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("New Trace")).toBeTruthy();
    });
  });
});
