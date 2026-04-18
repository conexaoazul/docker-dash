#!/bin/sh
# Auto-generate APP_SECRET and ENCRYPTION_KEY on first boot if missing.
# IMPORTANT: respects existing environment variables (set via Docker Compose
# env_file, -e flags, or Kubernetes secrets) — only writes to ENV_FILE when the
# variable is unset OR the value is the well-known placeholder.
set -e

ENV_FILE="${ENV_FILE:-/data/.env}"
[ -f "$ENV_FILE" ] || touch "$ENV_FILE"

is_placeholder() {
  case "$1" in
    ''|'generate-a-random-string-here'|'change-me'|'CHANGE_ME'|'change-me-to-a-random-32-char-hex') return 0 ;;
    *) return 1 ;;
  esac
}

ensure_secret() {
  key="$1"
  # Read CURRENT runtime value (env wins over file — env_file in compose loads here)
  eval "current=\${$key:-}"
  if ! is_placeholder "$current"; then
    return 0  # Already set to a real value — never touch it
  fi
  # Not set → generate and persist into ENV_FILE
  new_val=$(openssl rand -hex 32)
  sed -i.bak "/^${key}=/d" "$ENV_FILE" 2>/dev/null || true
  echo "${key}=${new_val}" >> "$ENV_FILE"
  export "${key}=${new_val}"
  echo "[entrypoint] Generated ${key} (was unset/placeholder)"
}

ensure_secret APP_SECRET
ensure_secret ENCRYPTION_KEY

exec "$@"
