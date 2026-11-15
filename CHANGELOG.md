# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-15

First version that is meant to be installed by someone who is not the author.

### Added

- **Read-only viewer**: `amh web [--port 7788] [--host 127.0.0.1]`. One page, no build step, no
  dependencies: search (space-separated terms, CJK bigrams), filters for scope / source / status,
  tombstones shown as dashed cards, click-to-copy ids, 5s auto-refresh, and a header that reports live
  counts plus the character total so you can eyeball the injection budget.
- **`amh import --mode bullets|prose|both`**: prose extraction for memory files that are written as
  sentences rather than lists (Codex's `memory_summary.md`). Headings, bullets, quotes, tables and
  fences are skipped; one paragraph becomes one fact.
- **`amh import --sqlite DB --sql "..." [--column NAME]`**: reads SQLite-backed memory stores through
  the built-in `node:sqlite`, splitting each row's cell into paragraphs so a long note becomes several
  facts instead of one rejected blob.
- Adapter `import` entries accept `mode`, `sql` and `column`.
- `amh detect` for six agents plus the dsh bundle, each with the checks that were actually run.

### Fixed

- **Windows: registering an MCP server failed** with `spawnSync claude ENOENT`, and the `cmd /c`
  workaround corrupted the arguments (`command` became `"D:\Program`, `args` became
  `Files\nodejs\node.exe"`). The CLI now reads the npm `.cmd` shim and starts what it starts — the
  `.exe` (Claude Code) or `node` plus the `.js` entry (Codex) — so no shell quoting is involved.
- **Windows: project scope never matched** in the dsh plugin; a POSIX-only test hid it. `selectEntries`
  now normalises trailing separators, so a drive root or a trailing slash behaves.
- Markdown links in memory indexes (`- [Title](file.md) — note`) are reduced to their title on import.
- `defaultServerPath()` and the dsh tools' CLI lookup resolve to `dist/` when running from a built
  package and to `src/` in a checkout.
- SQLite imports report a readable error instead of a stack trace on Node builds without `node:sqlite`.

### Known limits

- `memory_write` is not gated by any approval in a headless harness session: an agent that is talked
  into writing a fact can write it. Enable the write tools only in attended sessions.
- Qoder and WorkBuddy expose no CLI and no MCP JSON file, so their adapters are `manual`.
- Importing Codex's `rollout_summary` is deliberately not done: it is task narrative, and 25 entries /
  3000 characters of injection budget is easy to waste.

## [0.2.0] - 2026-11-15

### Added

- DeepSeek Harness bundle (`plugins/dsh`) that injects global plus matching project memories as a
  `PromptContext` with `interpolate: false`, so memory text containing `{{...}}` cannot break a render.
- Optional `memory_write` / `memory_search` tools for dsh, shelling out to the CLI so filtering, dedupe
  and scoping stay in one place.

## [0.1.0] - 2026-11-14

### Added

- Append-only JSONL store with tombstones, exact + Jaccard dedupe (CJK bigrams included), and
  pre-write screening for secrets and instruction-override text.
- Shared stdio MCP server: `memory_search`, `memory_list`, `memory_write`, `memory_forget`.
- Declarative adapters for Claude Code, Codex, Qoder, Grok Build, Cursor and WorkBuddy, plus managed
  blocks in agent instruction files (markers preserved, corrupt markers refused).
- `detect`, `add`, `list`, `search`, `forget`, `import`, `sync`, `mcp-install`, `serve`.
