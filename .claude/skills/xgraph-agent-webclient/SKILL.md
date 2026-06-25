---
name: xgraph-agent-webclient
description: "Use when working in the agent-webclient repository that uses XGraph project context. Start with xgraph context or xgraph affected before reading broadly, and run xgraph status before finishing."
---

# XGraph Project Context

Start each task from the repository root with:

```bash
xgraph context "<task>" --budget small
```

If the task is already tied to files or a diff, prefer:

```bash
xgraph context --file <path>
xgraph affected --file <path>
xgraph context --changed
```

Read only the returned paths first. Fall back to `.doc/index.json` only when the context CLI or generated context index is unavailable.

Before finishing, run:

```bash
xgraph status
```

If an agent lifecycle hook is installed, let it run `xgraph finish`; otherwise run `xgraph sync`.

Do not copy module maps or project facts into this skill. Use XGraph commands as the source of truth for current context.
