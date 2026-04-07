import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rawAdapter } from "../adapters/raw.js";
import { agentsSdkAdapter } from "../adapters/agents-sdk.js";
import { detectAndNormalize, UnsupportedFormatError } from "../adapters/index.js";

const fixturesDir = resolve(__dirname, "../../../../fixtures/traces");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), "utf8"));
}

describe("rawAdapter", () => {
  it("detects a canonical raw bundle", () => {
    const fixture = loadFixture("simple-raw-bundle.json");
    expect(rawAdapter.canParse(fixture)).toBe(true);
  });

  it("does not detect an Agents SDK trace as raw", () => {
    const fixture = loadFixture("agents-sdk-simple.json");
    expect(rawAdapter.canParse(fixture)).toBe(false);
  });

  it("normalizes a raw bundle and preserves spans", () => {
    const fixture = loadFixture("simple-raw-bundle.json");
    const bundle = rawAdapter.normalize(fixture);
    expect(bundle.spans).toHaveLength(4);
    expect(bundle.trace.framework).toBe("raw");
  });

  it("passes through rawSource if present", () => {
    const fixture = loadFixture("simple-raw-bundle.json") as Record<string, unknown>;
    fixture["rawSource"] = { original: true };
    const bundle = rawAdapter.normalize(fixture);
    expect(bundle.rawSource).toEqual({ original: true });
  });
});

describe("agentsSdkAdapter", () => {
  it("detects an Agents SDK simple trace", () => {
    const fixture = loadFixture("agents-sdk-simple.json");
    expect(agentsSdkAdapter.canParse(fixture)).toBe(true);
  });

  it("detects an Agents SDK handoff trace", () => {
    const fixture = loadFixture("agents-sdk-handoff.json");
    expect(agentsSdkAdapter.canParse(fixture)).toBe(true);
  });

  it("does not detect a canonical raw bundle as Agents SDK", () => {
    const fixture = loadFixture("simple-raw-bundle.json");
    expect(agentsSdkAdapter.canParse(fixture)).toBe(false);
  });

  it("normalizes a simple Agents SDK trace with correct span count", () => {
    const fixture = loadFixture("agents-sdk-simple.json");
    const bundle = agentsSdkAdapter.normalize(fixture);
    // 3 spans from fixture; no synthetic root needed since span_001 has no parent
    expect(bundle.spans.length).toBeGreaterThanOrEqual(3);
    expect(bundle.trace.framework).toBe("agents-sdk");
  });

  it("normalizes a handoff trace with correct span count and edges", () => {
    const fixture = loadFixture("agents-sdk-handoff.json");
    const bundle = agentsSdkAdapter.normalize(fixture);
    expect(bundle.spans.length).toBeGreaterThanOrEqual(8);
    // Should have at least one handoff edge
    const handoffEdges = bundle.edges.filter((e) => e.kind === "handoff");
    expect(handoffEdges.length).toBeGreaterThanOrEqual(1);
  });

  it("sets the trace name from the input", () => {
    const fixture = loadFixture("agents-sdk-simple.json");
    const bundle = agentsSdkAdapter.normalize(fixture);
    expect(bundle.trace.name).toBe("Single-agent customer support run");
  });

  it("includes rawSource from the original input", () => {
    const fixture = loadFixture("agents-sdk-simple.json");
    const bundle = agentsSdkAdapter.normalize(fixture);
    expect(bundle.rawSource).toBeDefined();
  });

  it("derives token totals from llm spans", () => {
    const fixture = loadFixture("agents-sdk-simple.json");
    const bundle = agentsSdkAdapter.normalize(fixture);
    expect(bundle.trace.totalTokens).toEqual({ input: 45, output: 22 });
  });
});

describe("detectAndNormalize", () => {
  it("picks the raw adapter for canonical bundles", () => {
    const fixture = loadFixture("simple-raw-bundle.json");
    const bundle = detectAndNormalize(fixture);
    expect(bundle.trace.framework).toBe("raw");
  });

  it("picks the agents-sdk adapter for Agents SDK traces", () => {
    const fixture = loadFixture("agents-sdk-simple.json");
    const bundle = detectAndNormalize(fixture);
    expect(bundle.trace.framework).toBe("agents-sdk");
  });

  it("throws UnsupportedFormatError for unknown formats", () => {
    expect(() => detectAndNormalize({ completely: "unknown" })).toThrow(
      UnsupportedFormatError
    );
    expect(() => detectAndNormalize(null)).toThrow(UnsupportedFormatError);
    expect(() => detectAndNormalize("string")).toThrow(UnsupportedFormatError);
  });
});
