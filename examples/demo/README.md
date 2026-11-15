# Demo store

`memories.jsonl` here is **fake data** used for screenshots and for trying the viewer without exposing
a real store. Point the CLI at it:

```bash
AMH_HOME=$PWD/examples/demo amh web          # bash / zsh
$env:AMH_HOME="$PWD\examples\demo"; amh web  # PowerShell
```

Then open http://127.0.0.1:7788/. Nothing in this folder is read unless you set `AMH_HOME`.

The rows deliberately include: two project scopes, several sources (`claude-code`, `codex`, `cursor`,
`cli`), a Chinese entry (to show CJK search), and one tombstone (to show how deletions look).
