import { BUILTIN_PATTERNS, getPatternsByNames } from "../redaction/patterns";
import { createRedactor } from "../redaction/redactor";

describe("RedactionPatterns", () => {
  it("matches email addresses", () => {
    const pattern = BUILTIN_PATTERNS.find((p) => p.name === "email")!;
    expect("contact user@example.com please").toMatch(pattern.regex);
  });

  it("matches phone numbers", () => {
    const pattern = BUILTIN_PATTERNS.find((p) => p.name === "phone")!;
    expect("call 555-123-4567 now").toMatch(pattern.regex);
  });

  it("matches API keys", () => {
    const pattern = BUILTIN_PATTERNS.find((p) => p.name === "api-key")!;
    expect("use sk-abc12345678901234567890").toMatch(pattern.regex);
  });

  it("matches SSNs", () => {
    const pattern = BUILTIN_PATTERNS.find((p) => p.name === "ssn")!;
    expect("ssn is 123-45-6789").toMatch(pattern.regex);
  });

  it("matches credit card numbers", () => {
    const pattern = BUILTIN_PATTERNS.find((p) => p.name === "credit-card")!;
    expect("card 4111 1111 1111 1111").toMatch(pattern.regex);
  });

  it("matches IPv4 addresses", () => {
    const pattern = BUILTIN_PATTERNS.find((p) => p.name === "ipv4")!;
    expect("server at 192.168.1.1").toMatch(pattern.regex);
  });

  it("getPatternsByNames returns matching patterns", () => {
    expect(getPatternsByNames(["email", "phone"])).toHaveLength(2);
  });

  it("getPatternsByNames with 'all' returns all patterns", () => {
    expect(getPatternsByNames(["all"])).toHaveLength(BUILTIN_PATTERNS.length);
  });
});

describe("createRedactor", () => {
  const redactor = createRedactor({
    patterns: getPatternsByNames(["all"]),
  });

  it("redacts strings containing PII", () => {
    const result = redactor.redact("email user@example.com and call 555-123-4567");
    expect(result).toBe("email [REDACTED:email] and call [REDACTED:phone]");
  });

  it("deep walks nested objects", () => {
    const input = {
      name: "test",
      nested: {
        email: "contact user@example.com",
        deep: { ssn: "my ssn is 123-45-6789" },
      },
    };
    const result = redactor.redact(input);
    expect(result.nested.email).toBe("contact [REDACTED:email]");
    expect(result.nested.deep.ssn).toBe("my ssn is [REDACTED:ssn]");
  });

  it("deep walks arrays", () => {
    const input = ["user@test.com", { ip: "10.0.0.1" }];
    const result = redactor.redact(input);
    expect(result[0]).toBe("[REDACTED:email]");
    expect((result[1] as { ip: string }).ip).toBe("[REDACTED:ipv4]");
  });

  it("passes through non-string primitives", () => {
    expect(redactor.redact(42)).toBe(42);
    expect(redactor.redact(true)).toBe(true);
    expect(redactor.redact(null)).toBe(null);
    expect(redactor.redact(undefined)).toBe(undefined);
  });

  it("handles multiple patterns in a single string", () => {
    const result = redactor.redact("email: a@b.com, ssn: 123-45-6789, ip: 1.2.3.4");
    expect(result).toContain("[REDACTED:email]");
    expect(result).toContain("[REDACTED:ssn]");
    expect(result).toContain("[REDACTED:ipv4]");
    expect(result).not.toContain("a@b.com");
  });

  it("works with custom placeholder", () => {
    const custom = createRedactor({
      patterns: getPatternsByNames(["email"]),
      placeholder: () => "***",
    });
    expect(custom.redact("hi user@test.com")).toBe("hi ***");
  });

  it("handles repeated calls without regex state issues", () => {
    const r1 = redactor.redact("a@b.com");
    const r2 = redactor.redact("c@d.com");
    expect(r1).toBe("[REDACTED:email]");
    expect(r2).toBe("[REDACTED:email]");
  });
});
