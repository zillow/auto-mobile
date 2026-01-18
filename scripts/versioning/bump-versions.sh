#!/usr/bin/env bash

set -euo pipefail

new_version=""
dry_run=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --new-version)
      new_version="${2:-}"
      shift 2
      ;;
    --dry-run)
      dry_run=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$new_version" ]]; then
  echo "Missing --new-version <semver> argument." >&2
  exit 1
fi

snapshot_version="${new_version}-SNAPSHOT"

update_json_version() {
  local path="$1"
  local version="$2"
  local dry="$3"
  if [[ "$dry" == true ]]; then
    return 0
  fi
  python3 - "$path" "$version" <<'PY'
import json
import sys

path = sys.argv[1]
version = sys.argv[2]

with open(path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

data["version"] = version

with open(path, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")
PY
}

replace_optional_single_match() {
  local path="$1"
  local pattern="$2"
  local replacement="$3"
  local dry="$4"
  python3 - "$path" "$pattern" "$replacement" "$dry" <<'PY'
import re
import sys

path = sys.argv[1]
pattern = sys.argv[2]
replacement = sys.argv[3]
dry = sys.argv[4].lower() == "true"

with open(path, "r", encoding="utf-8") as handle:
    data = handle.read()

matches = list(re.finditer(pattern, data, flags=re.MULTILINE))
if len(matches) > 1:
    raise SystemExit(
        f"Expected at most one match for {pattern!r} in {path}, found {len(matches)}"
    )

if len(matches) == 0:
    sys.exit(0)

updated = re.sub(pattern, replacement, data, flags=re.MULTILINE)

if not dry:
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(updated)
PY
}

update_json_version "package.json" "$new_version" "$dry_run"
update_json_version ".claude-plugin/plugin.json" "$new_version" "$dry_run"

# Update marketplace.json plugin version (nested in plugins[0].version)
update_marketplace_plugin_version() {
  local path="$1"
  local version="$2"
  local dry="$3"
  if [[ "$dry" == true ]]; then
    return 0
  fi
  python3 - "$path" "$version" <<'PY'
import json
import sys

path = sys.argv[1]
version = sys.argv[2]

with open(path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

if "plugins" in data and len(data["plugins"]) > 0:
    data["plugins"][0]["version"] = version

with open(path, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")
PY
}
update_marketplace_plugin_version ".claude-plugin/marketplace.json" "$new_version" "$dry_run"

if ! command -v rg >/dev/null 2>&1; then
  echo "ripgrep (rg) is required for fast Gradle scanning." >&2
  exit 1
fi

while IFS= read -r -d '' gradle_file; do
  replace_optional_single_match \
    "$gradle_file" \
    '^version\s*=\s*"[^"]*"' \
    "version = \"${snapshot_version}\"" \
    "$dry_run"

  replace_optional_single_match \
    "$gradle_file" \
    'versionName\s*=\s*"[^"]*"' \
    "versionName = \"${snapshot_version}\"" \
    "$dry_run"
done < <(rg -l --null -g 'build.gradle.kts' -e 'versionName\s*=' -e '^version\s*=' android)

if [[ "$dry_run" == true ]]; then
  echo "Dry run complete. package.json -> ${new_version}"
  echo "Gradle version -> ${snapshot_version}"
fi
