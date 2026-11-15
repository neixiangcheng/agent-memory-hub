import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir } from "./paths.ts";

export interface Target {
  scope: "global" | "project";
  path: string;
  /** leave the file alone if it already contains this text (e.g. CLAUDE.md that imports @AGENTS.md) */
  skip_if_contains?: string;
}

export interface ImportSource {
  scope: "global" | "project";
  path: string;
  /** how to cut a text file: bullet lists (default), prose paragraphs, or both */
  mode?: "bullets" | "prose" | "both";
  /** set for SQLite stores: this query runs against `path` as a database and each row supplies one fact */
  sql?: string;
  /** column to read from `sql` (default: the first non-empty text column of each row) */
  column?: string;
}

export type McpSpec =
  | { mode: "command"; argv: string[]; note?: string }
  | { mode: "json"; file: string; key: string; note?: string }
  | { mode: "manual"; note: string };

export interface AdapterDescriptor {
  id: string;
  name: string;
  kind?: "file" | "plugin";
  /** any of these paths existing means the agent is installed; empty = cannot auto-detect */
  detect: string[];
  targets: Target[];
  import?: ImportSource[];
  mcp: McpSpec;
  /** things the author could not confirm; shown by `amh detect` */
  verify?: string[];
}

function readDir(dir: string): AdapterDescriptor[] {
  if (!existsSync(dir)) return [];
  const out: AdapterDescriptor[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    out.push(JSON.parse(readFileSync(join(dir, f), "utf8")) as AdapterDescriptor);
  }
  return out;
}

/** Built-in descriptors, overridden/extended by ~/.agent-memory-hub/adapters/*.json (same id wins). */
export function loadAdapters(): AdapterDescriptor[] {
  const builtin = readDir(fileURLToPath(new URL("../adapters", import.meta.url)));
  const user = readDir(join(dataDir(), "adapters"));
  const byId = new Map<string, AdapterDescriptor>();
  for (const a of [...builtin, ...user]) byId.set(a.id, a);
  return [...byId.values()];
}
