import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "amh-web-"));
process.env.AMH_USER_HOME = root;
process.env.AMH_HOME = join(root, ".agent-memory-hub");

const { Store } = await import("../src/store.ts");
const { startWeb, PAGE } = await import("../src/web.ts");

const store = new Store(process.env.AMH_HOME);
store.add("Prefers concise answers", { scope: "global", source: "cli" });
store.add("Repo uses Postgres 16", { scope: "project:/work/api", source: "codex" });
const doomed = store.add("Temporary fact", { scope: "global", source: "cli" }).entry!;
store.forget(doomed.id.slice(0, 6));

const web = await startWeb({ port: 0, host: "127.0.0.1", store, quiet: true });

interface ApiRow {
  scopeKind: "global" | "project";
  projectPath: string | null;
  scope: string;
  chars: number;
  sources: string[];
}
interface Api {
  store: string;
  dir: string;
  entries: ApiRow[];
  stats: { total: number; active: number; deleted: number };
}
const api = async (): Promise<Api> => (await (await fetch(web.url + "api/memories")).json()) as Api;

test("serves one page with both languages baked in", async () => {
  const res = await fetch(web.url);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  const body = await res.text();
  assert.ok(body.includes("<title>agent-memory-hub"));
  assert.ok(body.includes("Shared memory") && body.includes("共享记忆库"), "en + zh strings");
  assert.ok(PAGE.length > 5000);
});

test("api returns active and deleted rows with a folded store path", async () => {
  const data = await api();
  assert.equal(data.entries.length, 3, "tombstone included");
  assert.equal(data.stats.active, 2);
  assert.equal(data.stats.deleted, 1);
  assert.equal(data.store, "~/.agent-memory-hub/memories.jsonl");
  assert.equal(data.dir, "~/.agent-memory-hub");

  const project = data.entries.find((e) => e.scopeKind === "project");
  assert.equal(project?.projectPath, "/work/api");
  assert.equal(project?.scope, "project:/work/api");
  assert.ok(data.entries.every((e) => typeof e.chars === "number"));
});

test("is read-only: writes are refused, unknown paths 404", async () => {
  for (const method of ["POST", "PUT", "DELETE"]) {
    const res = await fetch(web.url + "api/memories", { method });
    assert.equal(res.status, 405, method);
    assert.match((await res.json()).error, /read-only/);
  }
  const missing = await fetch(web.url + "nope");
  assert.equal(missing.status, 404);
  const health = await fetch(web.url + "api/health");
  assert.deepEqual(await health.json(), { ok: true, store: "~/.agent-memory-hub/memories.jsonl" });
});

test("memory added after start shows up without a restart", async () => {
  store.add("A fact written later", { scope: "global", source: "dsh" });
  const data = await api();
  assert.equal(data.stats.active, 3);
  assert.ok(data.entries.some((e) => e.sources.includes("dsh")));
});

test("native-memory tab: lists agent files and serves one body", async () => {
  const list = (await (await fetch(web.url + "api/sources")).json()) as {
    groups: { id: string; name: string; files: { index: number; path: string; exists: boolean; real?: string }[] }[];
    adapters: { id: string; installed: boolean }[];
  };
  assert.ok(list.adapters.length >= 7, "every adapter is reported");
  const all = list.groups.flatMap((g) => g.files);
  assert.ok(all.length >= 3, "fixed-name native files are listed even when absent");
  assert.ok(
    all.every((f) => typeof f.index === "number" && !("real" in f)),
    "absolute paths stay server-side",
  );

  const readable = all.find((f) => f.exists);
  if (readable) {
    const doc = (await (await fetch(web.url + "api/source?i=" + readable.index)).json()) as {
      text: string;
      real?: string;
    };
    assert.equal(typeof doc.text, "string");
    assert.ok(!("real" in doc));
  }

  assert.equal((await fetch(web.url + "api/source?i=99999")).status, 404, "out-of-range index");
  assert.equal((await fetch(web.url + "api/source?i=-1")).status, 400, "negative index");
});

test.after(async () => {
  await web.close();
  await web.close().catch(() => {});
});
