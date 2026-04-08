import { formatDuration, formatTokens } from "./format";

describe("formatDuration", () => {
  it("renders running when no duration exists", () => {
    expect(formatDuration()).toBe("Running");
  });

  it("renders milliseconds for short spans", () => {
    expect(formatDuration(320)).toBe("320 ms");
  });

  it("renders seconds for longer spans", () => {
    expect(formatDuration(5_400)).toBe("5.4 s");
    expect(formatDuration(12_000)).toBe("12 s");
  });
});

describe("formatTokens", () => {
  it("renders an empty marker when token usage is absent", () => {
    expect(formatTokens()).toBe("n/a");
  });

  it("renders input and output token totals", () => {
    expect(formatTokens({ input: 120, output: 36 })).toBe("120 in / 36 out");
  });
});
