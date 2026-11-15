// Pre-write checks. Heuristics only: they catch the common cases, not a determined attacker.

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{6,}/i,
];

// Memory text is injected into every agent's context, so instruction-like content is data poisoning.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any )?(previous|prior|above) (instructions|rules)/i,
  /disregard .{0,40}(instructions|system prompt)/i,
  /忽略(之前|以上|上述|先前).{0,6}(指令|规则|提示)/,
];

export type GuardResult = { ok: true } | { ok: false; reason: string };

export function checkContent(content: string): GuardResult {
  if (SECRET_PATTERNS.some((r) => r.test(content))) {
    return { ok: false, reason: "looks like a secret (key/token/password)" };
  }
  if (INJECTION_PATTERNS.some((r) => r.test(content))) {
    return { ok: false, reason: "looks like an instruction-override attempt" };
  }
  return { ok: true };
}
