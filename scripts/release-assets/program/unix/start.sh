#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

. "$SCRIPT_DIR/scripts/program-common.sh"

main() {
  local mode="${1:-}"
  if [[ -n "$mode" && "$mode" != "--daemon" ]]; then
    program_die "unsupported argument: $mode"
  fi

  cd "$SCRIPT_DIR"
  program_validate_bundle
  program_load_env
  program_prepare_runtime_dirs

  if [[ "$mode" == "--daemon" ]]; then
    program_start_backend_daemon
    return
  fi

  program_exec_backend
}

main "$@"
