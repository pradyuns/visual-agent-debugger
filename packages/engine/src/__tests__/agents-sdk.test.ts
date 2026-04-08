import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentsSdkTraceAdapter } from "../adapters/agents-sdk";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string) {
  const fixturePath = path.resolve(
    testDir,
    "../../../../fixtures/traces/agents-sdk",
    name,
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

describe("AgentsSdkTraceAdapter", () => {
  const adapter = new AgentsSdkTraceAdapter();

  it("detects and normalizes a simple run", () => {
    const input = loadFixture("simple-run.json");

    expect(adapter.canParse(input)).toBe(true);

    const normalized = adapter.normalize(input);
    const llmSpan = normalized.spans.find((span) => span.kind === "llm");
    const toolSpan = normalized.spans.find((span) => span.kind === "tool");

    expect(normalized.trace.framework).toBe("agents-sdk");
    expect(normalized.spans).toHaveLength(3);
    expect(llmSpan?.payload.kind).toBe("llm");
    expect(toolSpan?.payload.kind).toBe("tool");
  });

  it("creates a handoff edge when the trace contains a handoff span", () => {
    const input = loadFixture("handoff-run.json");
    const normalized = adapter.normalize(input);

    expect(normalized.edges).toHaveLength(1);
    expect(normalized.edges[0]).toMatchObject({
      kind: "handoff",
      toSpanId: "agent_billing",
    });
    expect(
      normalized.spans.some((span) => span.kind === "handoff"),
    ).toBe(true);
  });
});
