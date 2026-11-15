# Contributing

Small project, short rules.

## Setup

```bash
git clone https://github.com/neixiangcheng/agent-memory-hub.git
cd agent-memory-hub
npm install
npm test          # 18 tests, no network needed
npm run typecheck
npm run build     # tsc → dist/, which bin/amh.mjs loads
```

`npm run amh -- <args>` runs the CLI from sources; `node bin/amh.mjs <args>` runs the built one. Both
should behave the same — if they do not, that is a bug worth reporting.

## What is most useful

- **A new adapter.** One JSON file in `adapters/`. Copy an existing one and fill in: where the agent keeps
  its instruction file, how to register an MCP server (or `manual`), where its own memory lives, and a
  `verify` list with whatever you could not confirm. Run `amh detect` and check the wording reads like
  something you would trust.
- **A correction to an adapter.** These paths change with every agent release. If `amh detect` complains
  about a path that no longer exists, the adapter is wrong, not your machine.
- **An import source.** `--mode prose` and `--sqlite` exist because real memory files are not always bullet
  lists. A new source is normally a few lines in the adapter plus one test.

## Ground rules

- Every writing command stays a dry run unless `--apply` is passed. Do not add a path that writes without
  saying so first.
- New behaviour comes with a test in `test/`. The suite must stay offline.
- Do not weaken the pre-write checks (secrets, instruction-override phrasing) to make a test pass.
- Keep `adapters/*.json` free of machine-specific paths and user names.

## Style

`src/` is plain TypeScript run through Node's type stripping, with `.ts` import specifiers
(`rewriteRelativeImportExtensions` rewrites them when building). Comments explain *why*, not *what*.
No formatter is configured; match the file you are editing.
