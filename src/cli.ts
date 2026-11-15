import { existsSync } from "node:fs";
import { Store } from "./store.ts";
import { loadAdapters } from "./adapters.ts";
import { projectScope, expand } from "./paths.ts";
import {
  applyMcp,
  defaultServerPath,
  importFile,
  importSqlite,
  isInstalled,
  planMcp,
  syncAll,
  type ImportMode,
  type ImportRow,
} from "./engine.ts";

const BOOLEAN_FLAGS = new Set(["apply", "force", "create", "global", "open"]);

function parse(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      pos.push(...argv.slice(i + 1)); // everything after is literal text, even if it starts with "-"
      break;
    }
    if (!a.startsWith("--")) {
      pos.push(a);
      continue;
    }
    const k = a.slice(2);
    if (BOOLEAN_FLAGS.has(k) || argv[i + 1] === undefined || argv[i + 1]!.startsWith("--")) flags[k] = true;
    else flags[k] = argv[++i]!;
  }
  return { cmd: pos[0], pos: pos.slice(1), flags };
}

const HELP = `amh - shared memory across local AI agents

  amh detect                         which agents are installed + items to verify
  amh add [--global] [--project DIR] [--tag a,b] [--source NAME] [--] "<fact>"
  amh list | search [--project DIR] [--] <query> | forget <id>
  amh import --adapter ID|--file PATH [--mode bullets|prose|both] [--source NAME] [--global] [--project DIR] [--apply]
  amh import --sqlite DB --sql "select raw from t" [--column NAME] [--source NAME] [--global] [--apply]
  amh sync [--adapter a,b] [--project DIR] [--apply] [--force] [--create]
  amh mcp-install [--adapter a,b] [--apply]
  amh serve                          run the MCP server on stdio
  amh web [--port 7788] [--host 127.0.0.1] [--open]   read-only browser view of the store
  amh desktop [--port N]              same view in its own app window (Edge/Chrome --app mode)

Everything that writes is a dry run unless --apply is given.`;

const { cmd, pos, flags } = parse(process.argv.slice(2));
const str = (k: string) => (typeof flags[k] === "string" ? (flags[k] as string) : undefined);
const projectDir = () => expand(str("project") ?? ".");
const scopeFromFlags = () => (flags["global"] ? "global" : projectScope(projectDir()));
const pickAdapters = () => {
  const all = loadAdapters();
  const ids = str("adapter")?.split(",");
  if (!ids) return all;
  const missing = ids.filter((i) => !all.some((a) => a.id === i));
  if (missing.length) throw new Error(`unknown adapter(s): ${missing.join(", ")}`);
  return all.filter((a) => ids.includes(a.id));
};

switch (cmd) {
  case "detect": {
    for (const a of loadAdapters()) {
      console.log(`${isInstalled(a) ? "[x]" : "[ ]"} ${a.id.padEnd(12)} ${a.name}${a.kind === "plugin" ? "  (plugin)" : ""}`);
      for (const v of a.verify ?? []) console.log(`      verify: ${v}`);
    }
    break;
  }
  case "add": {
    const text = pos[0];
    if (!text) throw new Error('usage: amh add "<fact>"');
    const tags = str("tag")?.split(",");
    const r = new Store().add(text, { scope: scopeFromFlags(), source: str("source") ?? "cli", tags });
    console.log(r.status === "rejected" ? `rejected: ${r.reason}` : r.status === "duplicate" ? "already remembered" : `saved ${r.entry!.id.slice(0, 8)}`);
    break;
  }
  case "list": {
    const store = new Store();
    for (const e of store.active(["global", projectScope(projectDir())]).sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
      console.log(`${e.id.slice(0, 8)}  ${e.scope === "global" ? "global " : "project"}  ${e.content}  <${e.sources.join(",")}>`);
    }
    break;
  }
  case "search": {
    const hits = new Store().search(pos.join(" "), ["global", projectScope(projectDir())]);
    for (const e of hits) console.log(`${e.id.slice(0, 8)}  ${e.content}`);
    if (!hits.length) console.log("no matches");
    break;
  }
  case "forget": {
    const dead = new Store().forget(pos[0] ?? "");
    console.log(dead ? `forgot: ${dead.content}` : "no unique active memory with that id");
    break;
  }
  case "import": {
    const store = new Store();
    const apply = flags["apply"] === true;
    const mode = (str("mode") as ImportMode | undefined) ?? "bullets";
    const show = (rows: ImportRow[]) => {
      for (const r of rows) console.log(`  ${r.status.padEnd(9)} ${r.text.slice(0, 90)}${r.reason ? `  (${r.reason})` : ""}`);
    };
    const sqliteJob = async (path: string, sql: string | undefined, column: string | undefined, source: string, scope: string) => {
      console.log(`# ${path}${sql ? `  [sql]` : ""}`);
      show(
        await importSqlite(store, path, {
          sql: sql ?? "select * from memories",
          column,
          source,
          scope,
          apply,
        }),
      );
    };
    const jobs: { path: string; source: string; scope: string; mode?: ImportMode; sql?: string; column?: string }[] = [];
    if (str("sqlite")) {
      jobs.push({
        path: expand(str("sqlite")!),
        source: str("source") ?? "import",
        scope: scopeFromFlags(),
        sql: str("sql"),
        column: str("column"),
      });
    } else if (str("file")) {
      jobs.push({ path: expand(str("file")!), source: str("source") ?? "import", scope: scopeFromFlags(), mode });
    } else if (str("adapter")) {
      for (const a of pickAdapters()) {
        for (const s of a.import ?? []) {
          jobs.push({
            path: expand(s.path, projectDir()),
            source: a.id,
            scope: s.scope === "global" ? "global" : projectScope(projectDir()),
            mode: s.mode ?? mode,
            sql: s.sql,
            column: s.column,
          });
        }
      }
    } else throw new Error("give --adapter ID, --file PATH or --sqlite PATH");
    for (const j of jobs) {
      if (!existsSync(j.path)) {
        console.log(`skip ${j.path}: not found`);
        continue;
      }
      if (j.sql) {
        await sqliteJob(j.path, j.sql, j.column, j.source, j.scope);
        continue;
      }
      console.log(`# ${j.path}`);
      show(importFile(store, j.path, { source: j.source, scope: j.scope, apply, mode: j.mode }));
    }
    if (!apply) console.log("\n(dry run; add --apply to write)");
    break;
  }
  case "sync": {
    const apply = flags["apply"] === true;
    const acts = syncAll(pickAdapters(), new Store(), {
      projectDir: str("project") ? expand(str("project")!) : undefined,
      apply,
      force: flags["force"] === true,
      create: flags["create"] === true,
    });
    for (const a of acts) {
      const verb = a.action === "write" ? (apply ? "WROTE " : "WOULD WRITE") : "skip  ";
      console.log(`${verb} ${a.adapter.padEnd(12)} ${a.path}${a.reason ? `  (${a.reason})` : `  [${a.entries} entries]`}`);
    }
    if (!apply) console.log("\n(dry run; add --apply to write)");
    break;
  }
  case "mcp-install": {
    const apply = flags["apply"] === true;
    for (const a of pickAdapters()) {
      const plan = planMcp(a, defaultServerPath());
      const shown = plan.kind === "command" ? plan.argv.join(" ") : plan.kind === "json" ? `merge into ${plan.file}` : plan.note;
      console.log(`${a.id.padEnd(12)} ${shown}`);
      if (apply) console.log(`             -> ${applyMcp(plan)}`);
    }
    if (!apply) console.log("\n(dry run; add --apply to run these)");
    break;
  }
  case "serve":
    await import("./mcp-server.ts");
    break;
  case "web": {
    const { startWeb } = await import("./web.ts");
    await startWeb({
      port: str("port") ? Number(str("port")) : undefined,
      host: str("host"),
      open: flags["open"] === true,
    });
    break;
  }
  case "desktop": {
    const { runDesktop } = await import("./desktop.ts");
    await runDesktop({ port: str("port") ? Number(str("port")) : undefined });
    break;
  }
  default:
    console.log(HELP);
}
