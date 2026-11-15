import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir } from "./paths.ts";
import { normalize, tokens, jaccard } from "./text.ts";
import { checkContent } from "./guards.ts";

export interface MemoryEntry {
  id: string;
  content: string;
  /** "global" or "project:<absolute path>" */
  scope: string;
  /** every agent/tool that has reported this fact */
  sources: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
  status: "active" | "deleted";
}

export interface Evaluation {
  status: "added" | "duplicate" | "rejected";
  text: string;
  reason?: string;
  existing?: MemoryEntry;
  entry?: MemoryEntry;
}

const DUP_THRESHOLD = 0.85;
const MAX_LEN = 500;

/**
 * Append-only JSONL: the last record for an id wins. Nothing is ever physically deleted,
 * so history stays auditable (put the data dir under git if you want diffs).
 */
export class Store {
  readonly file: string;

  constructor(dir: string = dataDir()) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "memories.jsonl");
  }

  private load(): MemoryEntry[] {
    if (!existsSync(this.file)) return [];
    const byId = new Map<string, MemoryEntry>();
    for (const line of readFileSync(this.file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as MemoryEntry;
        byId.set(e.id, e);
      } catch {
        // skip a torn/corrupt line instead of failing every agent
      }
    }
    return [...byId.values()];
  }

  private append(e: MemoryEntry): void {
    appendFileSync(this.file, JSON.stringify(e) + "\n");
  }

  active(scopes?: string[]): MemoryEntry[] {
    return this.load().filter((e) => e.status === "active" && (!scopes || scopes.includes(e.scope)));
  }

  /** Every current record, tombstones included: the web viewer shows deletions rather than hiding them. */
  all(): MemoryEntry[] {
    return this.load();
  }

  /** Decide what add() would do, without writing. */
  evaluate(content: string, scope: string): Evaluation {
    const text = content.replace(/\s+/g, " ").trim();
    if (!text) return { status: "rejected", text, reason: "empty" };
    if (text.length > MAX_LEN) return { status: "rejected", text, reason: `longer than ${MAX_LEN} chars; split it` };
    const guard = checkContent(text);
    if (!guard.ok) return { status: "rejected", text, reason: guard.reason };

    const norm = normalize(text);
    const tk = tokens(text);
    for (const e of this.active([scope])) {
      if (normalize(e.content) === norm || jaccard(tk, tokens(e.content)) >= DUP_THRESHOLD) {
        return { status: "duplicate", text, existing: e };
      }
    }
    return { status: "added", text };
  }

  add(content: string, o: { scope: string; source: string; tags?: string[] }): Evaluation {
    const ev = this.evaluate(content, o.scope);
    const now = new Date().toISOString();
    if (ev.status === "added") {
      const entry: MemoryEntry = {
        id: randomUUID(),
        content: ev.text,
        scope: o.scope,
        sources: [o.source],
        tags: o.tags ?? [],
        created_at: now,
        updated_at: now,
        status: "active",
      };
      this.append(entry);
      return { ...ev, entry };
    }
    if (ev.status === "duplicate" && ev.existing && !ev.existing.sources.includes(o.source)) {
      // Same fact reported by another agent: remember who agrees, keep recency untouched.
      this.append({ ...ev.existing, sources: [...ev.existing.sources, o.source] });
    }
    return ev;
  }

  /** Tombstone by unique id prefix (>= 4 chars). */
  forget(prefix: string): MemoryEntry | undefined {
    if (prefix.length < 4) return undefined;
    const hits = this.active().filter((e) => e.id.startsWith(prefix));
    if (hits.length !== 1) return undefined;
    const dead: MemoryEntry = { ...hits[0]!, status: "deleted", updated_at: new Date().toISOString() };
    this.append(dead);
    return dead;
  }

  search(query: string, scopes: string[], limit = 8): MemoryEntry[] {
    const q = tokens(query);
    if (q.size === 0) return [];
    const scored: { e: MemoryEntry; score: number }[] = [];
    for (const e of this.active(scopes)) {
      const d = tokens(e.content);
      let hit = 0;
      for (const t of q) if (d.has(t)) hit++;
      if (hit > 0) scored.push({ e, score: hit / q.size });
    }
    scored.sort((a, b) => b.score - a.score || b.e.updated_at.localeCompare(a.e.updated_at));
    return scored.slice(0, limit).map((s) => s.e);
  }
}
