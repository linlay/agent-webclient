#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

. "$SCRIPT_DIR/scripts/program-common.sh"

cd "$SCRIPT_DIR"
program_validate_bundle
program_prepare_runtime_dirs

echo "[program-deploy] bundle validated"
echo "[program-deploy] backend entry: $BACKEND_ENTRY"
echo "[program-deploy] runtime directories prepared under $RUN_DIR"
