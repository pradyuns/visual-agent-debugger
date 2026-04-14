import type { RedactionPattern } from "./patterns";

export interface RedactionConfig {
  patterns: RedactionPattern[];
  customPatterns?: RedactionPattern[];
  placeholder?: (patternName: string) => string;
}

export function createRedactor(config: RedactionConfig) {
  const allPatterns = [...config.patterns, ...(config.customPatterns ?? [])];
  const placeholder =
    config.placeholder ?? ((name: string) => `[REDACTED:${name}]`);

  function redact<T>(value: T): T {
    return deepRedact(value, allPatterns, placeholder) as T;
  }

  return { redact };
}

function deepRedact(
  value: unknown,
  patterns: RedactionPattern[],
  placeholder: (name: string) => string,
): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const pattern of patterns) {
      const re = new RegExp(pattern.regex.source, pattern.regex.flags);
      result = result.replace(re, placeholder(pattern.name));
    }
    return result;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepRedact(item, patterns, placeholder));
  }

  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = deepRedact(val, patterns, placeholder);
    }
    return out;
  }

  return value;
}
