# Design QA — Composer “+” 扩展菜单

Status: PASS

## Evidence

- Source: `/var/folders/55/s3kqdyn95hvdh736dhw502200000gn/T/codex-clipboard-6564600e-f268-44dc-bf48-fcb934346362.png`
- Local implementation: `http://localhost:11948/`
- Dark-theme implementation capture: `.design-qa-composer-menu.png`
- Full mocked-state capture: `.design-qa-full-menu.png`
- Same-input visual comparison: `.design-qa-comparison.png`

## Verified states

- “+” opens an upward body-portal menu and no longer opens the file chooser directly.
- Local files alone open the hidden multiple-file input; cloud drive is visibly disabled.
- Chat selection supports loading, searching, single confirmation, de-duplication, focus return and removal.
- Site is disabled outside Desktop; the Desktop request/response bridge is covered by unit tests.
- CODER shows Planning and configured Skills; KBASE shows Editing; ordinary agents and Teams hide Mode.
- Planning, Editing and required Skill render as removable active tags.
- Required Skill is single-select and is cleared when the selected agent changes.
- Menu Enter/Arrow navigation reaches enabled items and skips the disabled cloud item.
- Chat/site references render dedicated context cards rather than file-download cards.

## Visual comparison

The implementation retains the source reference’s compact dark elevated surface,
upward anchoring, group label hierarchy, icon-first rows and disabled suffix
treatment while replacing the source plugin list with the requested Add, Mode
and Skills information architecture.
