#!/usr/bin/env bash

# Benchmark script to measure MCP server and daemon startup time.
#
# Usage:
#   bun run benchmark-startup [--cold] [--warm] [--server-only] [--daemon-only]
#     [--output path/to/report.json] [--compare path/to/baseline.json] [--threshold 1.3]
#
# Options:
#   --cold        Run cold-start measurement
#   --warm        Run warm-start measurement (includes a warm-up run)
#   --server-only Skip daemon benchmarking
#   --daemon-only Skip MCP server benchmarking
#   --output      Write JSON report to file
#   --compare     Compare against a baseline JSON file
#   --threshold   Regression multiplier (default 1.3)
#
# Exit codes:
#   0 - All benchmarks passed or no comparisons were requested
#   1 - One or more regressions detected or error occurred

DEFAULT_TIMEOUT_MS=15000
MCP_PROTOCOL_VERSION="2024-11-05"

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

wait_for_startup_report() {
  local fd="$1"
  local timeout_ms="$2"
  local start_ms
  start_ms=$(get_time_ms)

  while true; do
    local line=""
    if IFS= read -r -t 1 line <&"$fd"; then
      if [[ "$line" == STARTUP_BENCHMARK* ]]; then
        echo "${line#STARTUP_BENCHMARK }"
        return 0
      fi
    fi

    local now_ms
    now_ms=$(get_time_ms)
    if (( now_ms - start_ms >= timeout_ms )); then
      return 1
    fi
  done
}

stop_process() {
  local pid="$1"
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return
  fi

  kill -TERM "$pid" >/dev/null 2>&1 || true
  local start_ms
  start_ms=$(get_time_ms)

  while kill -0 "$pid" >/dev/null 2>&1; do
    if (( $(get_time_ms) - start_ms >= 5000 )); then
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
  local line=""
  if IFS= read -r -t "$timeout_sec" line <&"$fd"; then
    echo "$line"
    return 0
  fi
  return 1
}

mcp_call() {
  local fd_in="$1"
  local fd_out="$2"
  local tool="$3"
  local args_json="$4"
  local timeout_sec="$5"
  local request_id
  request_id=$(mcp_next_id)

  local request
  request=$(jq -c -n \
    --argjson id "$request_id" \
    --arg tool "$tool" \
    --argjson args "$args_json" \
    '{jsonrpc:"2.0", id:$id, method:"tools/call", params:{name:$tool, arguments:$args}}')

  mcp_send "$fd_in" "$request"
  mcp_read "$fd_out" "$timeout_sec"
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
    '{id:$id, type:"mcp_request", method:"tools/call", params:{name:"listDevices", arguments:{platform:"android"}}}')

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

  while (( $(get_time_ms) - start_ms < timeout_ms )); do
    if daemon_call "$socket_path"; then
      echo $(( $(get_time_ms) - start_ms ))
      return 0
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
  local response
  local start_ms
  local duration_ms

  if [[ "$device_count" -eq 1 ]]; then
    start_ms=$(get_time_ms)
    response=$(mcp_call "$fd_in" "$fd_out" "listDevices" '{"platform":"android"}' 10) || {
      jq -n --arg reason "listDevices failed" '{skipped:true, reason:$reason, scenarios:[]}'
      return 0
    }
    if jq -e '.error' >/dev/null 2>&1 <<<"$response"; then
      jq -n --arg reason "listDevices returned error" '{skipped:true, reason:$reason, scenarios:[]}'
      return 0
    fi
    duration_ms=$(( $(get_time_ms) - start_ms ))
    scenarios=$(jq --argjson duration "$duration_ms" --argjson count "$device_count" \
      '. + [{name:"singleDevice", durationMs:$duration, deviceCount:$count}]' <<<"$scenarios")
  else
    start_ms=$(get_time_ms)
    response=$(mcp_call "$fd_in" "$fd_out" "listDevices" '{"platform":"android"}' 10) || {
      jq -n --arg reason "listDevices failed" '{skipped:true, reason:$reason, scenarios:[]}'
      return 0
    }
    if jq -e '.error' >/dev/null 2>&1 <<<"$response"; then
      jq -n --arg reason "listDevices returned error" '{skipped:true, reason:$reason, scenarios:[]}'
      return 0
    fi
    duration_ms=$(( $(get_time_ms) - start_ms ))
    scenarios=$(jq --argjson duration "$duration_ms" --argjson count "$device_count" \
      '. + [{name:"multipleDevices", durationMs:$duration, deviceCount:$count}]' <<<"$scenarios")
  fi

  if run_adb kill-server >/dev/null 2>&1; then
    start_ms=$(get_time_ms)
    response=$(mcp_call "$fd_in" "$fd_out" "listDevices" '{"platform":"android"}' 10) || response=""
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
  mkfifo "$stdin_fifo" "$stdout_fifo" "$stderr_fifo"

  local start_ms
  start_ms=$(get_time_ms)

  AUTOMOBILE_STARTUP_BENCHMARK=1 \
  AUTOMOBILE_STARTUP_BENCHMARK_LABEL="mcp-server-$mode" \
  bun run src/index.ts --startup-benchmark \
    <"$stdin_fifo" >"$stdout_fifo" 2>"$stderr_fifo" &
  local server_pid=$!

  exec 3>"$stdin_fifo"
  exec 4<"$stdout_fifo"
  exec 5<"$stderr_fifo"

  mcp_request_id=0
  local init_id
  init_id=$(mcp_next_id)
  local init_request
  init_request=$(jq -c -n \
    --argjson id "$init_id" \
    --arg version "$MCP_PROTOCOL_VERSION" \
    '{jsonrpc:"2.0", id:$id, method:"initialize", params:{protocolVersion:$version, capabilities:{}, clientInfo:{name:"startup-bench", version:"1.0.0"}}}')
  mcp_send 3 "$init_request"

  if ! mcp_read 4 10 >/dev/null; then
    stop_process "$server_pid"
    exec 3>&-
    exec 4<&-
    exec 5<&-
    rm -rf "$fifo_dir"
    echo "Failed to read initialize response" >&2
    return 1
  fi
  local time_to_first_connection_ms
  time_to_first_connection_ms=$(( $(get_time_ms) - start_ms ))

  mcp_send 3 '{"jsonrpc":"2.0","method":"notifications/initialized"}'

  if ! mcp_call 3 4 "listDevices" '{"platform":"android"}' 10 >/dev/null; then
    stop_process "$server_pid"
    exec 3>&-
    exec 4<&-
    exec 5<&-
    rm -rf "$fifo_dir"
    echo "Failed to call listDevices" >&2
    return 1
  fi
  local time_to_first_tool_call_ms
  time_to_first_tool_call_ms=$(( $(get_time_ms) - start_ms ))

  local startup_report
  if ! startup_report=$(wait_for_startup_report 5 "$DEFAULT_TIMEOUT_MS"); then
    stop_process "$server_pid"
    exec 3>&-
    exec 4<&-
    exec 5<&-
    rm -rf "$fifo_dir"
    echo "Timed out waiting for startup report" >&2
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
    --argjson timeToFirstToolCallMs "$time_to_first_tool_call_ms" \
    --argjson phases "$phases" \
    --argjson marks "$marks" \
    --argjson memoryUsage "$memory" \
    '{mode:$mode, timeToReadyMs:$timeToReadyMs, timeToFirstConnectionMs:$timeToFirstConnectionMs, timeToFirstToolCallMs:$timeToFirstToolCallMs, phases:$phases, marks:$marks, memoryUsage:$memoryUsage}')

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

  local stderr_fifo
  stderr_fifo=$(mktemp -u)
  mkfifo "$stderr_fifo"

  local spawn_start
  spawn_start=$(get_time_ms)
  AUTOMOBILE_DAEMON_SOCKET_PATH="$socket_path" \
  AUTOMOBILE_DAEMON_PID_FILE_PATH="$pid_path" \
  AUTOMOBILE_STARTUP_BENCHMARK=1 \
  AUTOMOBILE_STARTUP_BENCHMARK_LABEL="daemon-$mode" \
  bun run src/index.ts --daemon-mode --startup-benchmark --port "$port" \
    >/dev/null 2>"$stderr_fifo" &
  local daemon_pid=$!
  local spawn_ms
  spawn_ms=$(( $(get_time_ms) - spawn_start ))

  exec 5<"$stderr_fifo"

  local startup_report
  if ! startup_report=$(wait_for_startup_report 5 "$DEFAULT_TIMEOUT_MS"); then
    stop_process "$daemon_pid"
    exec 5<&-
    rm -f "$stderr_fifo"
    echo "Timed out waiting for daemon startup report" >&2
    return 1
  fi

  local time_to_ready_ms
  time_to_ready_ms=$(( $(get_time_ms) - spawn_start ))

  local time_to_responsive_ms
  if ! time_to_responsive_ms=$(wait_for_daemon_responsive "$socket_path" "$DEFAULT_TIMEOUT_MS" "$spawn_start"); then
    stop_process "$daemon_pid"
    exec 5<&-
    rm -f "$stderr_fifo" "$socket_path" "$pid_path"
    echo "Timed out waiting for daemon responsiveness" >&2
    return 1
  fi

  local phases
  local marks
  local memory
  phases=$(jq -c '.phases // {}' <<<"$startup_report")
  marks=$(jq -c '.marks // {}' <<<"$startup_report")
  memory=$(jq -c '.memoryUsage // {}' <<<"$startup_report")

  stop_process "$daemon_pid"
  exec 5<&-
  rm -f "$stderr_fifo" "$socket_path" "$pid_path"

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
    if ! run_mcp_server "warm" "false" "$adb_available" "$adb_device_count" "$adb_error" >/dev/null; then
      echo "Warm-up MCP server run failed" >&2
      exit 1
    fi
  fi

  if [[ "$run_cold" == "true" ]]; then
    if ! run_json=$(run_mcp_server "cold" "true" "$adb_available" "$adb_device_count" "$adb_error"); then
      echo "Cold MCP server benchmark failed" >&2
      exit 1
    fi
    server_runs_json=$(jq --argjson run "$run_json" '. + [$run]' <<<"$server_runs_json")
    metrics_add "mcpServer.cold.timeToReadyMs" "$(jq -r '.timeToReadyMs' <<<"$run_json")"
    metrics_add "mcpServer.cold.timeToFirstConnectionMs" "$(jq -r '.timeToFirstConnectionMs' <<<"$run_json")"
    metrics_add "mcpServer.cold.timeToFirstToolCallMs" "$(jq -r '.timeToFirstToolCallMs' <<<"$run_json")"
    metrics_add "mcpServer.cold.memory.heapUsedBytes" "$(jq -r '.memoryUsage.heapUsed // 0' <<<"$run_json")"
  fi

  if [[ "$run_warm" == "true" ]]; then
    if ! run_json=$(run_mcp_server "warm" "false" "$adb_available" "$adb_device_count" "$adb_error"); then
      echo "Warm MCP server benchmark failed" >&2
      exit 1
    fi
    server_runs_json=$(jq --argjson run "$run_json" '. + [$run]' <<<"$server_runs_json")
    metrics_add "mcpServer.warm.timeToReadyMs" "$(jq -r '.timeToReadyMs' <<<"$run_json")"
    metrics_add "mcpServer.warm.timeToFirstConnectionMs" "$(jq -r '.timeToFirstConnectionMs' <<<"$run_json")"
    metrics_add "mcpServer.warm.timeToFirstToolCallMs" "$(jq -r '.timeToFirstToolCallMs' <<<"$run_json")"
    metrics_add "mcpServer.warm.memory.heapUsedBytes" "$(jq -r '.memoryUsage.heapUsed // 0' <<<"$run_json")"
  fi
else
  device_discovery_json=$(jq -n '{skipped:true, reason:"server benchmark skipped", scenarios:[]}')
fi

if [[ "$run_daemon" == "true" ]]; then
  if [[ "$run_warm" == "true" ]]; then
    if ! run_daemon "warm" >/dev/null; then
      echo "Warm-up daemon run failed" >&2
      exit 1
    fi
  fi

  if [[ "$run_cold" == "true" ]]; then
    if ! run_json=$(run_daemon "cold"); then
      echo "Cold daemon benchmark failed" >&2
      exit 1
    fi
    daemon_runs_json=$(jq --argjson run "$run_json" '. + [$run]' <<<"$daemon_runs_json")
    metrics_add "daemon.cold.spawnMs" "$(jq -r '.spawnMs' <<<"$run_json")"
    metrics_add "daemon.cold.timeToReadyMs" "$(jq -r '.timeToReadyMs' <<<"$run_json")"
    metrics_add "daemon.cold.timeToResponsiveMs" "$(jq -r '.timeToResponsiveMs' <<<"$run_json")"
    metrics_add "daemon.cold.memory.heapUsedBytes" "$(jq -r '.memoryUsage.heapUsed // 0' <<<"$run_json")"
  fi

  if [[ "$run_warm" == "true" ]]; then
    if ! run_json=$(run_daemon "warm"); then
      echo "Warm daemon benchmark failed" >&2
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

if [[ "$passed" != "true" ]]; then
  echo "Startup benchmark regressions detected:" >&2
  jq -r '.[]' <<<"$violations_json" | sed 's/^/  - /' >&2
  exit 1
fi

exit 0
