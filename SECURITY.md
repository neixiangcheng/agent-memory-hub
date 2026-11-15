# Security

## What this project does with your data

The store is **plaintext JSONL** in your home directory (`~/.agent-memory-hub/memories.jsonl` by
default). No encryption, no network, no telemetry. Anything that reads that file — the CLI, the MCP
server, the dsh bundle, the viewer — sees your real memory text, so treat the directory like any other
sensitive local file.

The viewer (`amh web`) has no write path at all: three GET endpoints, everything else 405. It binds
`127.0.0.1` unless you ask otherwise; `--host 0.0.0.0` exposes your memory text to the network.

## The pre-write filter is a heuristic

Before a fact is stored it is screened for obvious credentials (`sk-…`, GitHub/AWS/Slack tokens, PEM
private keys, JWTs, `password: …`) and for instruction-override phrasing. This catches common accidents,
not a determined attempt. A paraphrase of "ignore your instructions" will pass.

## The real risk: memory is model input

Anything written to the store ends up in the context of every agent that reads it. That makes
`memory_write` a prompt-injection surface: a web page, a file, or a tool result that talks an agent into
saving a sentence becomes a **persistent** instruction-like string.

Mitigations that exist:

- The managed block and the viewer both label the content as background data, not instructions.
- The dsh write tools are opt-in and shell out to the CLI, so filtering lives in one place.
- `memory_search` returns facts with their source labels, so a fact of unknown origin is visible as such.

Mitigations that do **not** exist yet:

- No approval gate on `memory_write` in a headless session (see the README's security section).
- No signature or provenance check on stored facts.

Keep the write tools for attended sessions.

## Reporting

Open an issue at
https://github.com/neixiangcheng/agent-memory-hub/issues/new?template=bug_report.yml — for anything that
looks exploitable, say so in the title (`security:`) and keep the details minimal in the first message;
we can move to a private channel from there.

Please do not attach your memory file, a real token, or a screenshot containing either.
