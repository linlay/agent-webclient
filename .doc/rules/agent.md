# Agent Reading Protocol

Read `.doc/index.json` first and follow `readOrder` progressively.

Before editing, read the compact catalog or catalog refs declared by the index, then read only the affected module cards.

Read affected module files resolved from `moduleMap` before editing or summarizing module behavior.

When an agent lifecycle hook is installed, let it run `xgraph finish`; otherwise run `xgraph sync` before finishing.

`xgraph finish` is a safe lifecycle-hook wrapper around `xgraph sync`.

`xgraph sync` refreshes deterministic context. In governed profile it also records changed files and writes active-agent task files.

Prefer finer modules around real workflows when a coarse module hides unrelated concepts.

When behavior crosses modules, inspect flow and rule catalog refs declared by the index before changing code.
