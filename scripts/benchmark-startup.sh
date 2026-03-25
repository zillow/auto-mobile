#!/usr/bin/env bash

# Benchmark script to measure MCP server and daemon startup time.
#
# Usage:
#   bun run benchmark-startup [--cold] [--warm] [--server-only] [--daemon-only] [--verbose]
#     [--output path/to/report.json] [--compare path/to/baseline.json] [--threshold 1.3]
#
# Options:
#   --cold        Run cold-start measurement
#   --warm        Run warm-start measurement (includes a warm-up run)
#   --server-only Skip daemon benchmarking
#   --daemon-only Skip MCP server benchmarking
#   --verbose     Print MCP/daemon stdio as it is read
#   --output      Write JSON report to file
#   --compare     Compare against a baseline JSON file
#   --threshold   Regression multiplier (default 1.3)
#
# Exit codes:
#   0 - All benchmarks passed or no comparisons were requested
#   1 - One or more regressions detected or error occurred

DEFAULT_TIMEOUT_MS=15000
GLOBAL_TIMEOUT_MS=30000
MCP_PROTOCOL_VERSION="2024-11-05"
STDERR_TAIL_LINES=20
verbose="false"
script_start_ms=""
current_operation=""
child_pids=()
# File-backed PID tracking so subshells (from command substitutions) can
# share tracked PIDs with the main shell's cleanup handlers.
_pid_tracking_file=$(mktemp)

# Track child process PIDs for cleanup
track_child_pid() {
  child_pids+=("$1")
  echo "$1" >> "$_pid_tracking_file"
}

untrack_child_pid() {
  local pid="$1"
  child_pids=("${child_pids[@]/$pid}")
  # Also remove from the file-backed tracker so _kill_all_tracked_pids
  # won't signal a reused PID during cleanup.
  if [[ -f "$_pid_tracking_file" ]]; then
    local tmp="${_pid_tracking_file}.tmp"
    grep -vxF "$pid" "$_pid_tracking_file" > "$tmp" 2>/dev/null || true
    mv "$tmp" "$_pid_tracking_file"
  fi
}

# Kill all tracked child processes (from both in-memory array and PID file).
# Also kills direct children of this script to catch command-substitution
# subshells whose PIDs are never explicitly tracked.
# shellcheck disable=SC2317,SC2329  # Function is invoked indirectly via cleanup/timeout handlers
_kill_all_tracked_pids() {
  local signal="${1:-KILL}"
  local seen=""

  # In-memory array (only has PIDs tracked in the main shell)
  for pid in "${child_pids[@]}"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      pkill "-$signal" -P "$pid" 2>/dev/null || true
      kill "-$signal" "$pid" 2>/dev/null || true
      seen="$seen $pid"
    fi
  done

  # PID file (has PIDs tracked in subshells too)
  if [[ -f "$_pid_tracking_file" ]]; then
    while IFS= read -r pid; do
      if [[ -n "$pid" && "$seen" != *" $pid"* ]] && kill -0 "$pid" 2>/dev/null; then
        pkill "-$signal" -P "$pid" 2>/dev/null || true
        kill "-$signal" "$pid" 2>/dev/null || true
      fi
    done < "$_pid_tracking_file"
  fi

  # Kill direct children of this script (catches command-substitution subshells)
  pkill "-$signal" -P $$ 2>/dev/null || true
}

# Global timeout handler - logs diagnostics and exits
# shellcheck disable=SC2317,SC2329  # Function is invoked indirectly via trap
global_timeout_handler() {
  local elapsed_ms=$(( $(get_time_ms) - script_start_ms ))

  echo "" >&2
  echo "========================================" >&2
  echo "GLOBAL TIMEOUT EXCEEDED (${GLOBAL_TIMEOUT_MS}ms)" >&2
  echo "========================================" >&2
  echo "" >&2
  echo "Diagnostic Information:" >&2
  echo "  Elapsed time: ${elapsed_ms}ms" >&2
  echo "  Current operation: ${current_operation:-unknown}" >&2
  echo "" >&2

  # Show process tree
  echo "Process tree:" >&2
  if command -v pstree >/dev/null 2>&1; then
    pstree -p $$ 2>/dev/null | sed 's/^/  /' >&2 || true
  else
    echo "  (pstree not available)" >&2
    echo "  Child PIDs (in-memory): ${child_pids[*]:-none}" >&2
    if [[ -f "$_pid_tracking_file" && -s "$_pid_tracking_file" ]]; then
      echo "  Child PIDs (file): $(tr '\n' ' ' < "$_pid_tracking_file")" >&2
    fi
    local all_pids
    all_pids=$(cat "$_pid_tracking_file" 2>/dev/null; printf '%s\n' "${child_pids[@]}")
    for pid in $(echo "$all_pids" | sort -u); do
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        echo "    PID $pid: running" >&2
      fi
    done
  fi
  echo "" >&2

  # Show any stderr logs collected
  for log_file in /tmp/auto-mobile-*/stderr.log; do
    if [[ -f "$log_file" && -s "$log_file" ]]; then
      echo "Stderr log ($log_file):" >&2
      tail -n 30 "$log_file" 2>/dev/null | sed 's/^/  /' >&2 || true
      echo "" >&2
    fi
  done

  # Environment info
  local env_info
  env_info=$(environment_summary 2>/dev/null || echo "unknown")
  echo "Environment: $env_info" >&2
  echo "" >&2

  # Kill all tracked child processes (including those tracked in subshells)
  echo "Killing child processes..." >&2
  _kill_all_tracked_pids TERM
  sleep 0.5
  _kill_all_tracked_pids KILL

  echo "Benchmark terminated due to global timeout." >&2
  exit 1
}

# Start global timeout monitor in background
start_global_timeout_monitor() {
  script_start_ms=$(get_time_ms)

  # Redirect stdout/stderr to /dev/null so the subshell and its sleep child
  # do not inherit the parent's FDs (which on CI are the runner's pipes).
  # Orphaned children holding runner FDs prevent the CI step from finishing.
  (
    sleep_seconds=$(( GLOBAL_TIMEOUT_MS / 1000 ))
    sleep "$sleep_seconds"
    # Signal parent to run timeout handler
    kill -USR1 $$ 2>/dev/null || true
  ) >/dev/null 2>&1 &
  global_timeout_pid=$!
  disown "$global_timeout_pid" 2>/dev/null || true
}

# Stop global timeout monitor
stop_global_timeout_monitor() {
  # Ignore USR1 first to prevent a race: killing the sleep child causes the
  # subshell's wait to return, which fires kill -USR1 before we can kill the
  # subshell itself.
  trap '' USR1
  if [[ -n "${global_timeout_pid:-}" ]]; then
    kill "$global_timeout_pid" 2>/dev/null || true
    pkill -P "$global_timeout_pid" 2>/dev/null || true
    wait "$global_timeout_pid" 2>/dev/null || true
    global_timeout_pid=""
  fi
}

# Set operation for diagnostic purposes
set_current_operation() {
  current_operation="$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

get_time_ms() {
  if command -v gdate >/dev/null 2>&1; then
    gdate +%s%3N
    return
  fi

  local ts
  ts=$(date +%s%3N 2>/dev/null)
  if [[ "$ts" == *N* ]]; then
    if command -v python3 >/dev/null 2>&1; then
      python3 -c 'import time; print(int(time.time() * 1000))'
    else
      echo "python3 is required for timing on this platform" >&2
      exit 1
    fi
  else
    echo "$ts"
  fi
}

environment_summary() {
  local bun_version="unknown"
  if command -v bun >/dev/null 2>&1; then
    bun_version=$(bun --version 2>/dev/null || echo "unknown")
  fi
  local os_info="unknown"
  if command -v uname >/dev/null 2>&1; then
    os_info=$(uname -a 2>/dev/null || echo "unknown")
  fi
  printf 'bun %s; %s' "$bun_version" "$os_info"
}

describe_process() {
  local pid="$1"
  if [[ -z "$pid" ]]; then
    echo "unknown"
    return
  fi
  if kill -0 "$pid" >/dev/null 2>&1; then
    echo "running (PID $pid)"
  else
    echo "not running (PID $pid)"
  fi
}

log_line() {
  local log_path="$1"
  local line="$2"
  local prefix="$3"
  if [[ -n "$log_path" ]]; then
    printf '%s\n' "$line" >> "$log_path"
  fi
  if [[ "$verbose" == "true" ]]; then
    printf '%s%s\n' "$prefix" "$line" >&2
  fi
}

drain_fd() {
  local fd="$1"
  local log_path="$2"
  local prefix="$3"
  local last_line_var="$4"
  local line=""
  local last_line=""

  while IFS= read -r -t 0 line <&"$fd"; do
    log_line "$log_path" "$line" "$prefix"
    last_line="$line"
  done

  if [[ -n "$last_line" && -n "$last_line_var" ]]; then
    printf -v "$last_line_var" '%s' "$last_line"
  fi
}

build_error_message() {
  local summary="$1"
  local wait_target="$2"
  local elapsed_ms="$3"
  local pid="$4"
  local last_stdout="$5"
  local last_stderr="$6"
  local stderr_log="$7"
  local extra_info="$8"

  local message="ERROR: $summary"

  if [[ -n "$elapsed_ms" ]]; then
    if [[ -n "$wait_target" ]]; then
      message+=$'\n  Waited: '"${elapsed_ms}ms for ${wait_target}"
    else
      message+=$'\n  Waited: '"${elapsed_ms}ms"
    fi
  elif [[ -n "$wait_target" ]]; then
    message+=$'\n  Waiting for: '"$wait_target"
  fi

  if [[ -n "$pid" ]]; then
    message+=$'\n  Process state: '"$(describe_process "$pid")"
  fi

  if [[ -n "$last_stdout" ]]; then
    message+=$'\n  Last stdout message: '"$last_stdout"
  fi

  if [[ -n "$last_stderr" ]]; then
    message+=$'\n  Last stderr message: '"$last_stderr"
  fi

  if [[ -n "$extra_info" ]]; then
    message+=$'\n  '"$extra_info"
  fi

  if [[ -n "$stderr_log" && -s "$stderr_log" ]]; then
    message+=$'\n\n  Recent stderr output:'
    message+=$'\n'
    message+="$(tail -n "$STDERR_TAIL_LINES" "$stderr_log" | sed 's/^/  /')"
  fi

  local env_info
  env_info=$(environment_summary)
  if [[ -n "$env_info" ]]; then
    message+=$'\n\n  Environment: '"$env_info"
  fi

  printf '%s\n' "$message"
}

wait_for_startup_report() {
  local fd="$1"
  local timeout_ms="$2"
  local stderr_log="$3"
  local report_var="$4"
  local last_line_var="$5"
  local prefix="$6"
  local start_ms
  start_ms=$(get_time_ms)
  local last_non_report=""
  local partial=""

  while true; do
    local line=""
    if IFS= read -r -t 1 line <&"$fd"; then
      # Prepend any partial data accumulated from previous timeout reads
      line="${partial}${line}"
      partial=""
      log_line "$stderr_log" "$line" "$prefix"
      if [[ "$line" == STARTUP_BENCHMARK* ]]; then
        local report="${line#STARTUP_BENCHMARK }"
        if [[ -n "$report_var" ]]; then
          printf -v "$report_var" '%s' "$report"
        else
          printf '%s\n' "$report"
        fi
        if [[ -n "$last_line_var" ]]; then
          printf -v "$last_line_var" '%s' "$last_non_report"
        fi
        return 0
      elif [[ "$line" == *STARTUP_BENCHMARK* ]]; then
        # Line contains the prefix but not at the start — a prior partial read
        # consumed leading bytes. Extract the report from the embedded prefix.
        local report="${line#*STARTUP_BENCHMARK }"
        if [[ -n "$report_var" ]]; then
          printf -v "$report_var" '%s' "$report"
        else
          printf '%s\n' "$report"
        fi
        if [[ -n "$last_line_var" ]]; then
          printf -v "$last_line_var" '%s' "$last_non_report"
        fi
        return 0
      fi
      last_non_report="$line"
    else
      # read -t timed out or hit EOF; if line has partial data, accumulate it
      if [[ -n "$line" ]]; then
        partial="${partial}${line}"
      fi
    fi

    local now_ms
    now_ms=$(get_time_ms)
    if (( now_ms - start_ms >= timeout_ms )); then
      if [[ -n "$last_line_var" ]]; then
        if [[ -n "$partial" ]]; then
          printf -v "$last_line_var" '%s' "$partial"
        else
          printf -v "$last_line_var" '%s' "$last_non_report"
        fi
      fi
      return 1
    fi
  done
}

stop_process() {
  local pid="$1"
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return
  fi

  # Kill child processes first so they don't become orphans holding FDs open
  pkill -TERM -P "$pid" 2>/dev/null || true
  kill -TERM "$pid" >/dev/null 2>&1 || true
  local start_ms
  start_ms=$(get_time_ms)

  while kill -0 "$pid" >/dev/null 2>&1; do
    if (( $(get_time_ms) - start_ms >= 5000 )); then
      pkill -KILL -P "$pid" 2>/dev/null || true
      kill -KILL "$pid" >/dev/null 2>&1 || true
      break
    fi
    sleep 0.1
  done

  wait "$pid" >/dev/null 2>&1 || true
}

mcp_request_id=0

mcp_next_id() {
  mcp_request_id=$((mcp_request_id + 1))
  echo "$mcp_request_id"
}

mcp_send() {
  local fd="$1"
  local payload="$2"
  printf '%s\n' "$payload" >&"$fd"
}

mcp_read() {
  local fd="$1"
  local timeout_sec="$2"
  local out_var="$3"
  local line=""
  if IFS= read -r -t "$timeout_sec" line <&"$fd"; then
    if [[ "$verbose" == "true" ]]; then
      printf 'mcp-stdout> %s\n' "$line" >&2
    fi
    if [[ -n "$out_var" ]]; then
      printf -v "$out_var" '%s' "$line"
    else
      printf '%s\n' "$line"
    fi
    return 0
  fi
  return 1
}

mcp_read_resource() {
  local fd_in="$1"
  local fd_out="$2"
  local uri="$3"
  local timeout_sec="$4"
  local out_var="$5"
  local request_id
  request_id=$(mcp_next_id)

  local request
  request=$(jq -c -n \
    --argjson id "$request_id" \
    --arg uri "$uri" \
    '{jsonrpc:"2.0", id:$id, method:"resources/read", params:{uri:$uri}}')

  mcp_send "$fd_in" "$request"
  local response=""
  if ! mcp_read "$fd_out" "$timeout_sec" response; then
    return 1
  fi
  if [[ -n "$out_var" ]]; then
    printf -v "$out_var" '%s' "$response"
  else
    printf '%s\n' "$response"
  fi
}

find_available_port() {
  local port
  for port in $(seq 3000 3010); do
    if command -v lsof >/dev/null 2>&1; then
      if ! lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "$port"
        return 0
      fi
    else
      if ! nc -z -w 1 localhost "$port" >/dev/null 2>&1; then
        echo "$port"
        return 0
      fi
    fi
  done
  return 1
}

run_adb() {
  if command -v timeout >/dev/null 2>&1; then
    timeout 5 adb "$@"
  else
    adb "$@"
  fi
}

get_adb_status() {
  if ! command -v adb >/dev/null 2>&1; then
    echo "false|0|adb not found"
    return
  fi

  local output
  if ! output=$(run_adb devices -l 2>/dev/null); then
    echo "false|0|adb devices failed"
    return
  fi

  local device_count
  device_count=$(echo "$output" | tail -n +2 | awk '$2 == "device" {count++} END {print count+0}')
  echo "true|$device_count|"
}

daemon_call() {
  local socket_path="$1"
  local request_id
  request_id="req-$(get_time_ms)-$$"
  local request
  request=$(jq -c -n \
    --arg id "$request_id" \
    '{id:$id, type:"mcp_request", method:"resources/read", params:{uri:"automobile:devices/booted"}}')

  local response
  if [[ "$daemon_socket_client" == "python" ]]; then
    response=$(python3 - "$socket_path" "$request" <<'PY'
import select
import socket
import sys
import time

socket_path = sys.argv[1]
request = sys.argv[2]

sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.settimeout(2.0)

try:
    sock.connect(socket_path)
    sock.sendall((request + "\n").encode())
    buffer = b""
    start = time.time()
    timeout = 2.0
    while time.time() - start < timeout:
        remaining = max(0.0, timeout - (time.time() - start))
        readable, _, _ = select.select([sock], [], [], remaining)
        if not readable:
            break
        chunk = sock.recv(4096)
        if not chunk:
            break
        buffer += chunk
        if b"\n" in buffer:
            line = buffer.split(b"\n", 1)[0]
            sys.stdout.write(line.decode())
            sys.exit(0)
    sys.exit(1)
except Exception:
    sys.exit(1)
finally:
    try:
        sock.close()
    except Exception:
        pass
PY
    ) || response=""
  else
    response=$(printf '%s\n' "$request" | nc -U "$socket_path" -w 2 2>/dev/null | head -n 1 || true)
  fi
  if [[ -z "$response" ]]; then
    return 1
  fi
  if jq -e '.success == true' >/dev/null 2>&1 <<<"$response"; then
    return 0
  fi
  return 1
}

wait_for_daemon_responsive() {
  local socket_path="$1"
  local timeout_ms="$2"
  local start_ms="$3"
  local out_var="$4"
  local stderr_fd="$5"
  local stderr_log="$6"
  local last_line_var="$7"
  local prefix="$8"

  while (( $(get_time_ms) - start_ms < timeout_ms )); do
    if daemon_call "$socket_path"; then
      local elapsed_ms=$(( $(get_time_ms) - start_ms ))
      if [[ -n "$out_var" ]]; then
        printf -v "$out_var" '%s' "$elapsed_ms"
      else
        echo "$elapsed_ms"
      fi
      return 0
    fi
    if [[ -n "$stderr_fd" ]]; then
      drain_fd "$stderr_fd" "$stderr_log" "$prefix" "$last_line_var"
    fi
    sleep 0.1
  done

  return 1
}

metrics_json="{}"
skips_json="[]"
violations_json="[]"
comparisons_json="null"
server_runs_json="[]"
daemon_runs_json="[]"
device_discovery_json="null"
daemon_socket_client=""

metrics_add() {
  local key="$1"
  local value="$2"
  metrics_json=$(jq --arg k "$key" --argjson v "$value" '. + {($k): $v}' <<<"$metrics_json")
}

skips_add() {
  local message="$1"
  skips_json=$(jq --arg msg "$message" '. + [$msg]' <<<"$skips_json")
}

measure_device_discovery() {
  local fd_in="$1"
  local fd_out="$2"
  local adb_available="$3"
  local device_count="$4"

  if [[ "$adb_available" != "true" ]]; then
    local reason="$5"
    jq -n --arg reason "${reason:-adb unavailable}" '{skipped:true, reason:$reason, scenarios:[]}'
    return 0
  fi

  if [[ "$device_count" -eq 0 ]]; then
    jq -n --arg reason "No devices connected" '{skipped:true, reason:$reason, scenarios:[]}'
    return 0
  fi

  local scenarios="[]"
  local response=""
  local start_ms
  local duration_ms

  if [[ "$device_count" -eq 1 ]]; then
    start_ms=$(get_time_ms)
    if ! mcp_read_resource "$fd_in" "$fd_out" "automobile:devices/booted" 10 response; then
      jq -n --arg reason "booted devices resource read failed" '{skipped:true, reason:$reason, scenarios:[]}'
      return 0
    fi
    if jq -e '.error' >/dev/null 2>&1 <<<"$response"; then
      jq -n --arg reason "booted devices resource returned error" '{skipped:true, reason:$reason, scenarios:[]}'
      return 0
    fi
    duration_ms=$(( $(get_time_ms) - start_ms ))
    scenarios=$(jq --argjson duration "$duration_ms" --argjson count "$device_count" \
      '. + [{name:"singleDevice", durationMs:$duration, deviceCount:$count}]' <<<"$scenarios")
  else
    start_ms=$(get_time_ms)
    if ! mcp_read_resource "$fd_in" "$fd_out" "automobile:devices/booted" 10 response; then
      jq -n --arg reason "booted devices resource read failed" '{skipped:true, reason:$reason, scenarios:[]}'
      return 0
    fi
    if jq -e '.error' >/dev/null 2>&1 <<<"$response"; then
      jq -n --arg reason "booted devices resource returned error" '{skipped:true, reason:$reason, scenarios:[]}'
      return 0
    fi
    duration_ms=$(( $(get_time_ms) - start_ms ))
    scenarios=$(jq --argjson duration "$duration_ms" --argjson count "$device_count" \
      '. + [{name:"multipleDevices", durationMs:$duration, deviceCount:$count}]' <<<"$scenarios")
  fi

  if run_adb kill-server >/dev/null 2>&1; then
    start_ms=$(get_time_ms)
    response=""
    mcp_read_resource "$fd_in" "$fd_out" "automobile:devices/booted" 10 response || response=""
    if [[ -n "$response" ]] && ! jq -e '.error' >/dev/null 2>&1 <<<"$response"; then
      duration_ms=$(( $(get_time_ms) - start_ms ))
      scenarios=$(jq --argjson duration "$duration_ms" --argjson count "$device_count" \
        '. + [{name:"adbColdStart", durationMs:$duration, deviceCount:$count, note:"adb kill-server before measurement"}]' \
        <<<"$scenarios")
    fi
  fi

  jq -n --argjson scenarios "$scenarios" '{skipped:false, scenarios:$scenarios}'
}

run_mcp_server() {
  local mode="$1"
  local include_device_discovery="$2"
  local adb_available="$3"
  local adb_device_count="$4"
  local adb_error="$5"

  local fifo_dir
  fifo_dir=$(mktemp -d)
  local stdin_fifo="$fifo_dir/stdin"
  local stdout_fifo="$fifo_dir/stdout"
  local stderr_fifo="$fifo_dir/stderr"
  local stderr_log="$fifo_dir/stderr.log"
  mkfifo "$stdin_fifo" "$stdout_fifo" "$stderr_fifo"
  : > "$stderr_log"

  local start_ms
  start_ms=$(get_time_ms)

  AUTOMOBILE_STARTUP_BENCHMARK=1 \
  AUTOMOBILE_STARTUP_BENCHMARK_LABEL="mcp-server-$mode" \
  bun run dist/src/index.js --startup-benchmark --no-daemon \
    <"$stdin_fifo" >"$stdout_fifo" 2>"$stderr_fifo" &
  local server_pid=$!
  track_child_pid "$server_pid"

  exec 3>"$stdin_fifo"
  exec 4<"$stdout_fifo"
  exec 5<"$stderr_fifo"
  local last_stdout_message=""
  local last_stderr_message=""

  mcp_request_id=0
  local init_id
  init_id=$(mcp_next_id)
  local init_request
  init_request=$(jq -c -n \
    --argjson id "$init_id" \
    --arg version "$MCP_PROTOCOL_VERSION" \
    '{jsonrpc:"2.0", id:$id, method:"initialize", params:{protocolVersion:$version, capabilities:{}, clientInfo:{name:"startup-bench", version:"1.0.0"}}}')
  mcp_send 3 "$init_request"

  local init_response=""
  if ! mcp_read 4 10 init_response; then
    drain_fd 5 "$stderr_log" "mcp-stderr> " last_stderr_message
    local elapsed_ms=$(( $(get_time_ms) - start_ms ))
    local error_message
    error_message=$(build_error_message \
      "Failed to read initialize response" \
      "initialize response on stdout (fd 4)" \
      "$elapsed_ms" \
      "$server_pid" \
      "$last_stdout_message" \
      "$last_stderr_message" \
      "$stderr_log" \
      "Mode: $mode")
    untrack_child_pid "$server_pid"
    stop_process "$server_pid"
    exec 3>&-
    exec 4<&-
    exec 5<&-
    rm -rf "$fifo_dir"
    printf '%s\n' "$error_message"
    return 1
  fi
  last_stdout_message="$init_response"
  local time_to_first_connection_ms
  time_to_first_connection_ms=$(( $(get_time_ms) - start_ms ))

  mcp_send 3 '{"jsonrpc":"2.0","method":"notifications/initialized"}'

  local booted_response=""
  local time_to_first_tool_call_ms=""
  if mcp_read_resource 3 4 "automobile:devices/booted" 10 booted_response; then
    last_stdout_message="$booted_response"
    # Check for JSON-RPC error (e.g. daemon not running with --no-daemon)
    if jq -e '.error' >/dev/null 2>&1 <<<"$booted_response"; then
      echo "resources/read returned JSON-RPC error (skipping timeToFirstToolCallMs)" >&2
    else
      time_to_first_tool_call_ms=$(( $(get_time_ms) - start_ms ))
    fi
  else
    echo "resources/read failed (skipping timeToFirstToolCallMs)" >&2
  fi

  local startup_report
  if ! wait_for_startup_report 5 "$DEFAULT_TIMEOUT_MS" "$stderr_log" startup_report last_stderr_message "mcp-stderr> "; then
    drain_fd 5 "$stderr_log" "mcp-stderr> " last_stderr_message
    local elapsed_ms=$(( $(get_time_ms) - start_ms ))
    local error_message
    error_message=$(build_error_message \
      "Timed out waiting for startup report" \
      "startup report on stderr (fd 5)" \
      "$elapsed_ms" \
      "$server_pid" \
      "$last_stdout_message" \
      "$last_stderr_message" \
      "$stderr_log" \
      "Mode: $mode")
    untrack_child_pid "$server_pid"
    stop_process "$server_pid"
    exec 3>&-
    exec 4<&-
    exec 5<&-
    rm -rf "$fifo_dir"
    printf '%s\n' "$error_message"
    return 1
  fi

  local phases
  local marks
  local memory
  phases=$(jq -c '.phases // {}' <<<"$startup_report")
  marks=$(jq -c '.marks // {}' <<<"$startup_report")
  memory=$(jq -c '.memoryUsage // {}' <<<"$startup_report")

  if [[ "$include_device_discovery" == "true" ]]; then
    device_discovery_json=$(measure_device_discovery 3 4 "$adb_available" "$adb_device_count" "$adb_error")
    if jq -e '.skipped == true' >/dev/null 2>&1 <<<"$device_discovery_json"; then
      local reason
      reason=$(jq -r '.reason // "unknown"' <<<"$device_discovery_json")
      skips_add "deviceDiscovery: $reason"
    else
      local scenario_count
      scenario_count=$(jq -r '.scenarios | length' <<<"$device_discovery_json")
      if [[ "$scenario_count" -gt 0 ]]; then
        local index
        for index in $(seq 0 $((scenario_count - 1))); do
          local name
          local duration
          name=$(jq -r ".scenarios[$index].name" <<<"$device_discovery_json")
          duration=$(jq -r ".scenarios[$index].durationMs" <<<"$device_discovery_json")
          metrics_add "mcpServer.deviceDiscovery.${name}.durationMs" "$duration"
        done
      fi
    fi
  fi

  untrack_child_pid "$server_pid"
  stop_process "$server_pid"
  exec 3>&-
  exec 4<&-
  exec 5<&-
  rm -rf "$fifo_dir"

  local run_json
  run_json=$(jq -c -n \
    --arg mode "$mode" \
    --argjson timeToReadyMs "$time_to_first_connection_ms" \
    --argjson timeToFirstConnectionMs "$time_to_first_connection_ms" \
    --argjson phases "$phases" \
    --argjson marks "$marks" \
    --argjson memoryUsage "$memory" \
    '{mode:$mode, timeToReadyMs:$timeToReadyMs, timeToFirstConnectionMs:$timeToFirstConnectionMs, phases:$phases, marks:$marks, memoryUsage:$memoryUsage}')
  if [[ -n "$time_to_first_tool_call_ms" ]]; then
    run_json=$(jq -c --argjson v "$time_to_first_tool_call_ms" '.timeToFirstToolCallMs = $v' <<<"$run_json")
  fi

  echo "$run_json"
}

run_daemon() {
  local mode="$1"
  local port
  if ! port=$(find_available_port); then
    echo "No available daemon port in range 3000-3010" >&2
    return 1
  fi

  local token
  token="$(get_time_ms)-$$"
  local socket_path="/tmp/auto-mobile-daemon-bench-${token}.sock"
  local pid_path="/tmp/auto-mobile-daemon-bench-${token}.pid"

  local run_dir
  run_dir=$(mktemp -d)
  local stderr_fifo="$run_dir/stderr"
  local stderr_log="$run_dir/stderr.log"
  mkfifo "$stderr_fifo"
  : > "$stderr_log"

  local spawn_start
  spawn_start=$(get_time_ms)
  AUTOMOBILE_DAEMON_SOCKET_PATH="$socket_path" \
  AUTOMOBILE_DAEMON_PID_FILE_PATH="$pid_path" \
  AUTOMOBILE_STARTUP_BENCHMARK=1 \
  AUTOMOBILE_STARTUP_BENCHMARK_LABEL="daemon-$mode" \
  bun run dist/src/index.js --daemon-mode --startup-benchmark --port "$port" \
    >/dev/null 2>"$stderr_fifo" &
  local daemon_pid=$!
  track_child_pid "$daemon_pid"
  local spawn_ms
  spawn_ms=$(( $(get_time_ms) - spawn_start ))

  exec 5<"$stderr_fifo"
  local last_stderr_message=""

  local startup_report
  if ! wait_for_startup_report 5 "$DEFAULT_TIMEOUT_MS" "$stderr_log" startup_report last_stderr_message "daemon-stderr> "; then
    drain_fd 5 "$stderr_log" "daemon-stderr> " last_stderr_message
    local elapsed_ms=$(( $(get_time_ms) - spawn_start ))
    local error_message
    error_message=$(build_error_message \
      "Timed out waiting for daemon startup report" \
      "startup report on stderr (fd 5)" \
      "$elapsed_ms" \
      "$daemon_pid" \
      "" \
      "$last_stderr_message" \
      "$stderr_log" \
      "Mode: $mode; Port: $port; Socket: $socket_path")
    untrack_child_pid "$daemon_pid"
    stop_process "$daemon_pid"
    exec 5<&-
    rm -rf "$run_dir"
    printf '%s\n' "$error_message"
    return 1
  fi

  local time_to_ready_ms
  time_to_ready_ms=$(( $(get_time_ms) - spawn_start ))

  local time_to_responsive_ms
  if ! wait_for_daemon_responsive \
    "$socket_path" \
    "$DEFAULT_TIMEOUT_MS" \
    "$spawn_start" \
    time_to_responsive_ms \
    5 \
    "$stderr_log" \
    last_stderr_message \
    "daemon-stderr> "; then
    drain_fd 5 "$stderr_log" "daemon-stderr> " last_stderr_message
    local elapsed_ms=$(( $(get_time_ms) - spawn_start ))
    local error_message
    error_message=$(build_error_message \
      "Timed out waiting for daemon responsiveness" \
      "daemon responsiveness on socket ${socket_path}" \
      "$elapsed_ms" \
      "$daemon_pid" \
      "" \
      "$last_stderr_message" \
      "$stderr_log" \
      "Mode: $mode; Port: $port; Socket: $socket_path")
    untrack_child_pid "$daemon_pid"
    stop_process "$daemon_pid"
    exec 5<&-
    rm -rf "$run_dir" "$socket_path" "$pid_path"
    printf '%s\n' "$error_message"
    return 1
  fi

  local phases
  local marks
  local memory
  phases=$(jq -c '.phases // {}' <<<"$startup_report")
  marks=$(jq -c '.marks // {}' <<<"$startup_report")
  memory=$(jq -c '.memoryUsage // {}' <<<"$startup_report")

  untrack_child_pid "$daemon_pid"
  stop_process "$daemon_pid"
  exec 5<&-
  rm -rf "$run_dir" "$socket_path" "$pid_path"

  local run_json
  run_json=$(jq -c -n \
    --arg mode "$mode" \
    --argjson spawnMs "$spawn_ms" \
    --argjson timeToReadyMs "$time_to_ready_ms" \
    --argjson timeToResponsiveMs "$time_to_responsive_ms" \
    --argjson phases "$phases" \
    --argjson marks "$marks" \
    --argjson memoryUsage "$memory" \
    --argjson port "$port" \
    --arg socketPath "$socket_path" \
    '{mode:$mode, spawnMs:$spawnMs, timeToReadyMs:$timeToReadyMs, timeToResponsiveMs:$timeToResponsiveMs, phases:$phases, marks:$marks, memoryUsage:$memoryUsage, port:$port, socketPath:$socketPath}')

  echo "$run_json"
}

output_path=""
baseline_path=""
threshold_multiplier="1.3"
threshold_provided="false"
run_cold="false"
run_warm="false"
run_server="true"
run_daemon="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      output_path="$2"
      shift 2
      ;;
    --compare)
      baseline_path="$2"
      shift 2
      ;;
    --threshold)
      threshold_multiplier="$2"
      threshold_provided="true"
      shift 2
      ;;
    --cold)
      run_cold="true"
      shift
      ;;
    --warm)
      run_warm="true"
      shift
      ;;
    --server-only)
      run_daemon="false"
      shift
      ;;
    --daemon-only)
      run_server="false"
      shift
      ;;
    --verbose)
      verbose="true"
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$run_cold" != "true" && "$run_warm" != "true" ]]; then
  run_cold="true"
  run_warm="true"
fi

if [[ "$threshold_provided" == "true" ]]; then
  if ! jq -e --arg value "$threshold_multiplier" '($value | tonumber) >= 0' >/dev/null 2>&1; then
    echo "Invalid --threshold value: $threshold_multiplier" >&2
    exit 1
  fi
fi

require_command bun
require_command jq

# Cleanup handler to kill all tracked children on exit
# shellcheck disable=SC2317,SC2329  # Function is invoked indirectly via trap
cleanup_on_exit() {
  # Stop the timeout monitor first to prevent a USR1 race when pkill kills
  # the timeout subshell inside _kill_all_tracked_pids.
  stop_global_timeout_monitor
  _kill_all_tracked_pids KILL
  rm -f "$_pid_tracking_file"
}

# Setup global timeout handler
trap 'global_timeout_handler' USR1
trap 'cleanup_on_exit' EXIT
start_global_timeout_monitor

if [[ "$run_daemon" == "true" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    daemon_socket_client="python"
  else
    require_command nc
    if ! nc -h 2>&1 | grep -q -- '-U'; then
      echo "netcat does not support Unix sockets (-U)" >&2
      exit 1
    fi
    daemon_socket_client="nc"
  fi
fi

adb_available="false"
adb_device_count="0"
adb_error=""
if [[ "$run_server" == "true" ]]; then
  device_discovery_json=$(jq -n '{skipped:true, reason:"not run", scenarios:[]}')
  IFS="|" read -r adb_available adb_device_count adb_error < <(get_adb_status)
fi

if [[ "$run_server" == "true" ]]; then
  if [[ "$run_warm" == "true" ]]; then
    set_current_operation "MCP server warm-up run"
    if ! run_error=$(run_mcp_server "warm" "false" "$adb_available" "$adb_device_count" "$adb_error"); then
      printf '%s\n' "$run_error" >&2
      echo "Warm-up MCP server run failed (see details above)" >&2
      stop_global_timeout_monitor
      exit 1
    fi
  fi

  if [[ "$run_cold" == "true" ]]; then
    set_current_operation "MCP server cold benchmark"
    if ! run_json=$(run_mcp_server "cold" "true" "$adb_available" "$adb_device_count" "$adb_error"); then
      printf '%s\n' "$run_json" >&2
      echo "Cold MCP server benchmark failed (see details above)" >&2
      stop_global_timeout_monitor
      exit 1
    fi
    server_runs_json=$(jq --argjson run "$run_json" '. + [$run]' <<<"$server_runs_json")
    metrics_add "mcpServer.cold.timeToReadyMs" "$(jq -r '.timeToReadyMs' <<<"$run_json")"
    metrics_add "mcpServer.cold.timeToFirstConnectionMs" "$(jq -r '.timeToFirstConnectionMs' <<<"$run_json")"
    cold_tool_call_ms=$(jq -r '.timeToFirstToolCallMs // empty' <<<"$run_json")
    if [[ -n "$cold_tool_call_ms" ]]; then
      metrics_add "mcpServer.cold.timeToFirstToolCallMs" "$cold_tool_call_ms"
    fi
    metrics_add "mcpServer.cold.memory.heapUsedBytes" "$(jq -r '.memoryUsage.heapUsed // 0' <<<"$run_json")"
  fi

  if [[ "$run_warm" == "true" ]]; then
    set_current_operation "MCP server warm benchmark"
    if ! run_json=$(run_mcp_server "warm" "false" "$adb_available" "$adb_device_count" "$adb_error"); then
      printf '%s\n' "$run_json" >&2
      echo "Warm MCP server benchmark failed (see details above)" >&2
      stop_global_timeout_monitor
      exit 1
    fi
    server_runs_json=$(jq --argjson run "$run_json" '. + [$run]' <<<"$server_runs_json")
    metrics_add "mcpServer.warm.timeToReadyMs" "$(jq -r '.timeToReadyMs' <<<"$run_json")"
    metrics_add "mcpServer.warm.timeToFirstConnectionMs" "$(jq -r '.timeToFirstConnectionMs' <<<"$run_json")"
    warm_tool_call_ms=$(jq -r '.timeToFirstToolCallMs // empty' <<<"$run_json")
    if [[ -n "$warm_tool_call_ms" ]]; then
      metrics_add "mcpServer.warm.timeToFirstToolCallMs" "$warm_tool_call_ms"
    fi
    metrics_add "mcpServer.warm.memory.heapUsedBytes" "$(jq -r '.memoryUsage.heapUsed // 0' <<<"$run_json")"
  fi
else
  device_discovery_json=$(jq -n '{skipped:true, reason:"server benchmark skipped", scenarios:[]}')
fi

if [[ "$run_daemon" == "true" ]]; then
  if [[ "$run_warm" == "true" ]]; then
    set_current_operation "Daemon warm-up run"
    if ! run_error=$(run_daemon "warm"); then
      printf '%s\n' "$run_error" >&2
      echo "Warm-up daemon run failed (see details above)" >&2
      stop_global_timeout_monitor
      exit 1
    fi
  fi

  if [[ "$run_cold" == "true" ]]; then
    set_current_operation "Daemon cold benchmark"
    if ! run_json=$(run_daemon "cold"); then
      printf '%s\n' "$run_json" >&2
      echo "Cold daemon benchmark failed (see details above)" >&2
      stop_global_timeout_monitor
      exit 1
    fi
    daemon_runs_json=$(jq --argjson run "$run_json" '. + [$run]' <<<"$daemon_runs_json")
    metrics_add "daemon.cold.spawnMs" "$(jq -r '.spawnMs' <<<"$run_json")"
    metrics_add "daemon.cold.timeToReadyMs" "$(jq -r '.timeToReadyMs' <<<"$run_json")"
    metrics_add "daemon.cold.timeToResponsiveMs" "$(jq -r '.timeToResponsiveMs' <<<"$run_json")"
    metrics_add "daemon.cold.memory.heapUsedBytes" "$(jq -r '.memoryUsage.heapUsed // 0' <<<"$run_json")"
  fi

  if [[ "$run_warm" == "true" ]]; then
    set_current_operation "Daemon warm benchmark"
    if ! run_json=$(run_daemon "warm"); then
      printf '%s\n' "$run_json" >&2
      echo "Warm daemon benchmark failed (see details above)" >&2
      stop_global_timeout_monitor
      exit 1
    fi
    daemon_runs_json=$(jq --argjson run "$run_json" '. + [$run]' <<<"$daemon_runs_json")
    metrics_add "daemon.warm.spawnMs" "$(jq -r '.spawnMs' <<<"$run_json")"
    metrics_add "daemon.warm.timeToReadyMs" "$(jq -r '.timeToReadyMs' <<<"$run_json")"
    metrics_add "daemon.warm.timeToResponsiveMs" "$(jq -r '.timeToResponsiveMs' <<<"$run_json")"
    metrics_add "daemon.warm.memory.heapUsedBytes" "$(jq -r '.memoryUsage.heapUsed // 0' <<<"$run_json")"
  fi
fi

results_json="{}"
if [[ "$run_server" == "true" ]]; then
  results_json=$(jq --argjson runs "$server_runs_json" --argjson discovery "$device_discovery_json" \
    '. + {mcpServer:{runs:$runs, deviceDiscovery:$discovery}}' <<<"$results_json")
fi
if [[ "$run_daemon" == "true" ]]; then
  results_json=$(jq --argjson runs "$daemon_runs_json" '. + {daemon:{runs:$runs}}' <<<"$results_json")
fi

passed="true"
threshold_effective="$threshold_multiplier"

if [[ -n "$baseline_path" ]]; then
  if [[ ! -f "$baseline_path" ]]; then
    echo "Baseline not found: $baseline_path" >&2
    exit 1
  fi

  if [[ "$threshold_provided" != "true" ]]; then
    threshold_effective=$(jq -r '.thresholdMultiplier // empty' "$baseline_path")
    if [[ -z "$threshold_effective" || "$threshold_effective" == "null" ]]; then
      threshold_effective="$threshold_multiplier"
    fi
  fi

  baseline_metrics=$(jq -c '.metrics' "$baseline_path")
  skipped_metrics="[]"
  regressions="[]"

  while IFS= read -r key; do
    baseline_value=$(jq -r --arg k "$key" '.[$k]' <<<"$baseline_metrics")
    actual_value=$(jq -r --arg k "$key" '.[$k] // empty' <<<"$metrics_json")

    if [[ -z "$actual_value" || "$actual_value" == "null" ]]; then
      skipped_metrics=$(jq --arg k "$key" '. + [$k]' <<<"$skipped_metrics")
      continue
    fi

    if ! jq -e --argjson v "$baseline_value" '$v > 0' >/dev/null 2>&1; then
      skipped_metrics=$(jq --arg k "$key" '. + [$k]' <<<"$skipped_metrics")
      continue
    fi

    threshold_value=$(jq -n --argjson base "$baseline_value" --argjson mult "$threshold_effective" '$base * $mult')
    regression_value=$(jq -n --argjson actual "$actual_value" --argjson base "$baseline_value" \
      '(($actual - $base) / $base) * 100')
    metric_passed=$(jq -n --argjson actual "$actual_value" --argjson threshold "$threshold_value" '$actual <= $threshold')

    regressions=$(jq --arg metric "$key" \
      --argjson baseline "$baseline_value" \
      --argjson actual "$actual_value" \
      --argjson regression "$regression_value" \
      --argjson threshold "$threshold_value" \
      --argjson passed "$metric_passed" \
      '. + [{metric:$metric, baseline:$baseline, actual:$actual, regression:$regression, threshold:$threshold, passed:$passed}]' \
      <<<"$regressions")

    if [[ "$metric_passed" != "true" ]]; then
      passed="false"
      violation=$(printf "%s: %.2f exceeds baseline %.2f (%.1f%% regression, threshold %.2f)" \
        "$key" "$actual_value" "$baseline_value" "$regression_value" "$threshold_value")
      violations_json=$(jq --arg msg "$violation" '. + [$msg]' <<<"$violations_json")
    fi
  done < <(jq -r 'keys[]' <<<"$baseline_metrics")

  comparisons_json=$(jq -n \
    --arg baselinePath "$baseline_path" \
    --argjson regressions "$regressions" \
    --argjson skippedMetrics "$skipped_metrics" \
    '{baselinePath:$baselinePath, regressions:$regressions, skippedMetrics:$skippedMetrics}')
fi

timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

report_json=$(jq -n \
  --arg timestamp "$timestamp" \
  --argjson passed "$passed" \
  --argjson thresholdMultiplier "$threshold_effective" \
  --argjson results "$results_json" \
  --argjson metrics "$metrics_json" \
  --argjson comparisons "$comparisons_json" \
  --argjson violations "$violations_json" \
  --argjson skips "$skips_json" \
  '{timestamp:$timestamp, passed:$passed, thresholdMultiplier:$thresholdMultiplier, results:$results, metrics:$metrics, violations:$violations, skips:$skips} + (if $comparisons == null then {} else {comparisons:$comparisons} end)')

if [[ -n "$output_path" ]]; then
  mkdir -p "$(dirname "$output_path")"
  echo "$report_json" > "$output_path"
  echo "Benchmark report written to: $output_path"
fi

set_current_operation "Benchmark complete"
stop_global_timeout_monitor

if [[ "$passed" != "true" ]]; then
  echo "Startup benchmark regressions detected:" >&2
  jq -r '.[]' <<<"$violations_json" | sed 's/^/  - /' >&2
  exit 1
fi

exit 0
