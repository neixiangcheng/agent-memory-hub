import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = mkdtempSync(join(tmpdir(), "amh-dsh-"));
const { Store } = await import("../src/store.ts");
const plugin = await import("../plugins/dsh/index.js");

type Registered = { name: string; order: number; interpolate?: boolean; text: (c: unknown) => string };
function mount(): Registered {
  let reg: Registered | undefined;
  plugin.apply({ systemPrompt: { context: (c: Registered) => ((reg = c), () => {}) } } as never);
  assert.ok(reg, "apply must register a context");
  return reg;
}

test("registers one non-interpolated context", () => {
  const reg = mount();
  assert.equal(reg.name, "amh:shared-memory");
  assert.equal(reg.interpolate, false);
  assert.ok(Number.isFinite(reg.order));
  assert.deepEqual(plugin.inject, ["systemPrompt"]);
});

test("missing store -> empty text (contributes nothing)", () => {
  process.env.AMH_HOME = join(root, "nothing-here");
  assert.equal(mount().text({}), "");
});

test("scope selection: global + ancestor project, skips deleted and unrelated projects", () => {
  const dir = join(root, "a");
  process.env.AMH_HOME = dir;
  const s = new Store(dir);
  // Scopes hold resolved absolute paths, so build them with resolve() to stay platform-neutral
  // (the original POSIX literals never matched on Windows, where resolve("/work/app") is D:\work\app).
  const app = resolve(join(root, "work", "app"));
  s.add("Prefers concise answers", { scope: "global", source: "t" });
  s.add("Repo uses Postgres 16 {{not_a_var}}", { scope: "project:" + app, source: "t" });
  s.add("Other repo uses MySQL", { scope: "project:" + resolve(join(root, "work", "other")), source: "t" });
  const gone = s.add("Temporary fact", { scope: "global", source: "t" }).entry!;
  s.forget(gone.id.slice(0, 6));

  const reg = mount();
  const inSub = reg.text({ agent: { session: { header: { cwd: join(app, "packages", "ui") } } } });
  assert.ok(inSub.includes("concise answers") && inSub.includes("Postgres 16 {{not_a_var}}"));
  assert.ok(!inSub.includes("MySQL") && !inSub.includes("Temporary"));

  const elsewhere = reg.text({ agent: { session: { header: { cwd: resolve(join(root, "work", "application")) } } } });
  assert.ok(elsewhere.includes("concise answers"));
  assert.ok(!elsewhere.includes("Postgres"), "a sibling directory must not match project .../work/app");
});

test("budget caps the number of injected lines", () => {
  const dir = join(root, "b");
  process.env.AMH_HOME = dir;
  const s = new Store(dir);
  for (let i = 0; i < 60; i++) s.add(`Unique convention number ${i} about module m${i}x`, { scope: "global", source: "t" });
  const out = mount().text({});
  assert.equal(out.split("\n").filter((l) => l.startsWith("- ")).length, 25);
  assert.match(out, /\+35 more/);
});
