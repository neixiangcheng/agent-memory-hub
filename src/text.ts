export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[。.!！?？,，;；:：]+$/u, "")
    .trim();
}

/** Word tokens for Latin text, char unigrams+bigrams for CJK. Cheap stand-in for embeddings. */
export function tokens(s: string): Set<string> {
  const out = new Set<string>();
  const lower = s.toLowerCase();
  for (const w of lower.match(/[a-z0-9_]+/g) ?? []) if (w.length > 1) out.add(w);
  for (const run of lower.match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (run.length === 1) out.add(run);
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
