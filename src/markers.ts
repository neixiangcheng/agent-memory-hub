export const MARKER = "agent-memory-hub";

const startTag = (m: string) => `<!-- ${m}:start -->`;
const endTag = (m: string) => `<!-- ${m}:end -->`;
const wrap = (m: string, body: string) => `${startTag(m)}\n${body.trim()}\n${endTag(m)}`;

function locate(text: string, m: string): { start: number; end: number } | null {
  const start = text.indexOf(startTag(m));
  const end = text.indexOf(endTag(m));
  if (start === -1 && end === -1) return null;
  if (start === -1 || end === -1 || end < start) {
    // Refuse to guess: a half-deleted block must not make us eat user content.
    throw new Error(`Corrupt managed-block markers for "${m}"; fix or remove them by hand`);
  }
  return { start, end: end + endTag(m).length };
}

export function upsertBlock(text: string, m: string, body: string): string {
  const loc = locate(text, m);
  if (!loc) {
    const sep = text.length === 0 ? "" : text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
    return text + sep + wrap(m, body) + "\n";
  }
  return text.slice(0, loc.start) + wrap(m, body) + text.slice(loc.end);
}

/** Everything outside the managed block (what the user or the agent wrote itself). */
export function outsideBlock(text: string, m: string): string {
  const loc = locate(text, m);
  return loc ? text.slice(0, loc.start) + text.slice(loc.end) : text;
}
