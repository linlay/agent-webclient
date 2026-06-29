@AGENTS.md

专题文档位于 [docs/](docs/)，完整索引见 [AGENTS.md](AGENTS.md#专题文档索引) 与 [README.md](README.md#专题文档)。

<!-- xgraph:start -->
## Project Context

Before work, run `xgraph context "<task>" --budget small` when the CLI is available, then read only the returned paths.

If the task is already tied to files, use `xgraph context --file <path>` or `xgraph affected --file <path>` before broad searching.

Fallback: read `.doc/index.json` and follow its `readOrder` progressively. Start from `.doc/catalog.json` or the catalog paths declared by the index, then inspect related module cards only as needed.

Keep this entry file short; use `.doc/rules/agent.md` for detailed behavior.

Before finishing, run `xgraph status`; when an agent lifecycle hook is installed, let it run `xgraph finish`, otherwise run `xgraph sync`.

<!-- xgraph:end -->
