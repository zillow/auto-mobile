#!/usr/bin/env bash
#
# all_fast_validate_checks.sh
#
# Run fast validation checks with optional parallel execution and summaries.
#
# Usage:
#   ./scripts/all_fast_validate_checks.sh
#   ./scripts/all_fast_validate_checks.sh --list
#   ./scripts/all_fast_validate_checks.sh --only shellcheck,xml
#   ./scripts/all_fast_validate_checks.sh --skip lychee
#   ./scripts/all_fast_validate_checks.sh --group docs,config
#   ./scripts/all_fast_validate_checks.sh --no-parallel
#   ./scripts/all_fast_validate_checks.sh --max-parallel 4
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CHECK_NAMES=()
CHECK_COMMANDS=()
CHECK_GROUPS=()
CHECK_DESCRIPTIONS=()

add_check() {
  CHECK_NAMES+=("$1")
  CHECK_COMMANDS+=("$2")
  CHECK_GROUPS+=("$3")
  CHECK_DESCRIPTIONS+=("$4")
}

add_check "yaml" "bun \"$PROJECT_ROOT/scripts/validate-yaml.ts\"" "config,yaml" "Validate test plan YAML files"
add_check "xml" "\"$PROJECT_ROOT/scripts/xml/validate_xml.sh\"" "config,xml" "Validate XML files"
add_check "shellcheck" "\"$PROJECT_ROOT/scripts/shellcheck/validate_shell_scripts.sh\"" "lint,shell" "Validate shell scripts with shellcheck"
add_check "mkdocs-nav" "\"$PROJECT_ROOT/scripts/validate_mkdocs_nav.sh\"" "docs" "Validate MkDocs navigation"
add_check "ktfmt" "ONLY_TOUCHED_FILES=true \"$PROJECT_ROOT/scripts/ktfmt/validate_ktfmt.sh\"" "format,kotlin" "Validate Kotlin formatting"
add_check "claude-plugin" "\"$PROJECT_ROOT/scripts/claude/validate_plugin.sh\"" "config" "Validate Claude plugin structure"
add_check "lychee" "\"$PROJECT_ROOT/scripts/lychee/validate_lychee.sh\"" "docs,links" "Validate documentation links"
add_check "dependabot" "\"$PROJECT_ROOT/scripts/validate_dependabot.sh\"" "config,yaml" "Validate Dependabot config"

print_usage() {
  cat <<'EOF'
Usage:
  ./scripts/all_fast_validate_checks.sh [options]

Options:
  --list                List available checks and exit
  --only <names>        Run only the named checks (comma-separated)
  --skip <names>        Skip the named checks (comma-separated)
  --group <groups>      Run checks in the named groups (comma-separated)
  --no-parallel         Run checks serially
  --max-parallel <n>    Limit concurrent checks
  --help                Show this help
EOF
}

print_list() {
  echo "Available checks:"
  local idx
  for idx in "${!CHECK_NAMES[@]}"; do
    printf "  %-14s %s (groups: %s)\n" \
      "${CHECK_NAMES[$idx]}" "${CHECK_DESCRIPTIONS[$idx]}" "${CHECK_GROUPS[$idx]}"
  done
}

split_csv() {
  local value="$1"
  local -a items=()
  if [[ -n "$value" ]]; then
    IFS=',' read -r -a items <<< "$value"
  fi
  echo "${items[@]}"
}

contains_item() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    if [[ "$item" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

groups_intersect() {
  local check_groups="$1"
  shift
  local -a selected_groups=("$@")
  local -a check_group_list=()
  if [[ -n "$check_groups" ]]; then
    IFS=',' read -r -a check_group_list <<< "$check_groups"
  fi
  local group
  for group in "${check_group_list[@]}"; do
    if contains_item "$group" "${selected_groups[@]}"; then
      return 0
    fi
  done
  return 1
}

timestamp_ms() {
  if [[ -x "$PROJECT_ROOT/scripts/utils/get_timestamp.sh" ]]; then
    bash "$PROJECT_ROOT/scripts/utils/get_timestamp.sh"
  else
    echo "$(date +%s)000"
  fi
}

list_requested=0
declare -a only_list=()
declare -a skip_list=()
declare -a group_list=()
parallel_enabled=1
max_parallel=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list)
      list_requested=1
      shift
      ;;
    --only)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --only" >&2
        exit 1
      fi
      read -r -a only_list <<< "$(split_csv "$1")"
      shift
      ;;
    --skip)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --skip" >&2
        exit 1
      fi
      read -r -a skip_list <<< "$(split_csv "$1")"
      shift
      ;;
    --group)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --group" >&2
        exit 1
      fi
      read -r -a group_list <<< "$(split_csv "$1")"
      shift
      ;;
    --no-parallel|--serial)
      parallel_enabled=0
      shift
      ;;
    --max-parallel)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --max-parallel" >&2
        exit 1
      fi
      max_parallel="$1"
      shift
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      print_usage >&2
      exit 1
      ;;
  esac
done

if [[ "$list_requested" -eq 1 ]]; then
  print_list
  exit 0
fi

if [[ -n "${only_list[*]-}" ]]; then
  for requested in "${only_list[@]}"; do
    if ! contains_item "$requested" "${CHECK_NAMES[@]}"; then
      echo "Unknown check in --only: $requested" >&2
      exit 1
    fi
  done
fi

if [[ -n "${skip_list[*]-}" ]]; then
  for requested in "${skip_list[@]}"; do
    if ! contains_item "$requested" "${CHECK_NAMES[@]}"; then
      echo "Unknown check in --skip: $requested" >&2
      exit 1
    fi
  done
fi

selected_indices=()
for idx in "${!CHECK_NAMES[@]}"; do
  name="${CHECK_NAMES[$idx]}"
  groups="${CHECK_GROUPS[$idx]}"
  include=1

  if [[ -n "${only_list[*]-}" ]]; then
    include=0
    if contains_item "$name" "${only_list[@]}"; then
      include=1
    fi
  elif [[ -n "${group_list[*]-}" ]]; then
    include=0
    if groups_intersect "$groups" "${group_list[@]}"; then
      include=1
    fi
  fi

  if [[ "$include" -eq 1 ]] && [[ -n "${skip_list[*]-}" ]]; then
    if contains_item "$name" "${skip_list[@]}"; then
      include=0
    fi
  fi

  if [[ "$include" -eq 1 ]]; then
    selected_indices+=("$idx")
  fi
done

if [[ "${#selected_indices[@]}" -eq 0 ]]; then
  echo "No checks selected." >&2
  exit 1
fi

if [[ -z "$max_parallel" ]]; then
  if command -v nproc >/dev/null 2>&1; then
    max_parallel="$(nproc)"
  else
    max_parallel="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
  fi
fi

if ! [[ "$max_parallel" =~ ^[0-9]+$ ]]; then
  echo "--max-parallel must be a positive integer." >&2
  exit 1
fi

if [[ "$max_parallel" -lt 1 ]]; then
  echo "--max-parallel must be greater than 0." >&2
  exit 1
fi

if [[ "$parallel_enabled" -eq 0 ]]; then
  max_parallel=1
fi

mkdir -p "$PROJECT_ROOT/scratch"
run_id="$(date +%Y%m%dT%H%M%S)"
run_dir="$PROJECT_ROOT/scratch/fast-validate-$run_id"
mkdir -p "$run_dir"

echo "Running ${#selected_indices[@]} fast validation check(s)"
echo "Logs: $run_dir"
echo ""

pids=()
pid_names=()

start_check() {
  local idx="$1"
  local name="${CHECK_NAMES[$idx]}"
  local cmd="${CHECK_COMMANDS[$idx]}"
  local log_file="$run_dir/${name}.log"
  local status_file="$run_dir/${name}.status"
  local start_file="$run_dir/${name}.start"
  local end_file="$run_dir/${name}.end"

  timestamp_ms > "$start_file"

  (
    set +e
    {
      echo "[INFO] $name"
      echo "[INFO] Command: $cmd"
      echo ""
      eval "$cmd"
    } >"$log_file" 2>&1
    echo "$?" > "$status_file"
    timestamp_ms > "$end_file"
  ) &

  pids+=("$!")
  pid_names+=("$name")
}

prune_finished_jobs() {
  local new_pids=()
  local new_names=()
  local i
  for i in "${!pids[@]}"; do
    local pid="${pids[$i]}"
    if kill -0 "$pid" 2>/dev/null; then
      new_pids+=("$pid")
      new_names+=("${pid_names[$i]}")
    else
      wait "$pid" || true
    fi
  done
  pids=("${new_pids[@]}")
  pid_names=("${new_names[@]}")
}

wait_for_slot() {
  local max="$1"
  while [[ "${#pids[@]}" -ge "$max" ]]; do
    prune_finished_jobs
    if [[ "${#pids[@]}" -ge "$max" ]]; then
      sleep 0.1
    fi
  done
}

for idx in "${selected_indices[@]}"; do
  wait_for_slot "$max_parallel"
  start_check "$idx"
done

for pid in "${pids[@]}"; do
  wait "$pid" || true
done

echo ""
echo "Fast validation summary"
echo "======================="

passed=0
failed=0

for idx in "${selected_indices[@]}"; do
  name="${CHECK_NAMES[$idx]}"
  status_file="$run_dir/${name}.status"
  start_file="$run_dir/${name}.start"
  end_file="$run_dir/${name}.end"
  log_file="$run_dir/${name}.log"
  status=1
  if [[ -f "$status_file" ]]; then
    status="$(cat "$status_file")"
  fi
  duration_ms="unknown"
  if [[ -f "$start_file" && -f "$end_file" ]]; then
    start_time="$(cat "$start_file")"
    end_time="$(cat "$end_file")"
    duration_ms="$((end_time - start_time))"
  fi

  if [[ "$status" -eq 0 ]]; then
    printf "OK   %-14s %sms\n" "$name" "$duration_ms"
    passed=$((passed + 1))
  else
    printf "FAIL %-14s %sms (log: %s)\n" "$name" "$duration_ms" "$log_file"
    failed=$((failed + 1))
  fi
done

echo ""
echo "Passed: $passed"
echo "Failed: $failed"

if [[ "$failed" -ne 0 ]]; then
  echo ""
  echo "Some checks failed. See logs in: $run_dir"
  exit 1
fi
