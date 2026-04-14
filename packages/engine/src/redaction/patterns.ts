export interface RedactionPattern {
  name: string;
  label: string;
  regex: RegExp;
}

export const BUILTIN_PATTERNS: RedactionPattern[] = [
  {
    name: "email",
    label: "Email Address",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  {
    name: "phone",
    label: "Phone Number",
    regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  },
  {
    name: "api-key",
    label: "API Key",
    regex: /\b(?:sk|pk|key|token|secret)[-_][a-zA-Z0-9]{20,}\b/gi,
  },
  {
    name: "ssn",
    label: "SSN",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    name: "credit-card",
    label: "Credit Card",
    regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  },
  {
    name: "ipv4",
    label: "IPv4 Address",
    regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  },
];

export function getPatternsByNames(names: string[]): RedactionPattern[] {
  if (names.includes("all")) return BUILTIN_PATTERNS;
  return BUILTIN_PATTERNS.filter((p) => names.includes(p.name));
}
