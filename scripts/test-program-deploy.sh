#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

bundle_root="$tmp_dir/agent-webclient"
config_dir="$tmp_dir/config"
backup_dir="$tmp_dir/config-backups/v0.3.26-to-v0.3.27/agent-webclient"
mkdir -p "$bundle_root" "$config_dir"
cp "$REPO_ROOT/scripts/release-assets/program/unix/deploy.sh" "$bundle_root/deploy.sh"
cp "$REPO_ROOT/.env.example" "$bundle_root/.env.example"
chmod +x "$bundle_root/deploy.sh"

printf 'PORT=19080\nBASE_URL=http://old.example.test\nOLD_FIELD=remove-me\n' >"$config_dir/.env"
"$bundle_root/deploy.sh" \
  --output-dir "$config_dir" \
  --desktop-config-reset \
  --desktop-config-backup-dir "$backup_dir" \
  --desktop-version-from v0.3.26 \
  --desktop-version-to v0.3.27

grep -Fqx 'OLD_FIELD=remove-me' "$backup_dir/.env"
! grep -Fq 'old.example.test' "$config_dir/.env"
! grep -Fq 'OLD_FIELD=' "$config_dir/.env"

printf 'FAILED_ONLY=diagnostic\n' >>"$config_dir/.env"
"$bundle_root/deploy.sh" \
  --output-dir "$config_dir" \
  --desktop-config-reset \
  --desktop-config-backup-dir "$backup_dir" \
  --desktop-version-from v0.3.26 \
  --desktop-version-to v0.3.27

grep -Fqx 'OLD_FIELD=remove-me' "$backup_dir/.env"
grep -Fqx 'FAILED_ONLY=diagnostic' "${backup_dir}.failed/.env"
! grep -Fq 'FAILED_ONLY=' "$config_dir/.env"

echo "[program-deploy-test] passed"
