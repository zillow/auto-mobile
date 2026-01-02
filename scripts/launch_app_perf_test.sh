#!/bin/bash

# launch_app_perf_test.sh - Test and debug UI stability criteria during cold boot app launches
# Usage: ./scripts/launch_app_perf_test.sh [num_launches=10] [device_id] [package_name=com.google.android.deskclock] [--options]
#
# Options:
#   --p50-threshold <ms>         p50 percentile threshold (default: 100)
#   --p90-threshold <ms>         p90 percentile threshold (default: 100)
#   --p95-threshold <ms>         p95 percentile threshold (default: 200)
#   --allow-vsync-delta <count>  Allow missed vsync delta (default: 0)
#   --allow-slowui-delta <count> Allow slow UI thread delta (default: 0)
#   --allow-deadline-delta <count> Allow frame deadline missed delta (default: 0)
#   --stability-duration <ms>    Stability threshold duration (default: 60)
#   --timeout <ms>               Total stability poll timeout (default: 12000)
#
# This script:
# 1. Repeatedly launches an app with coldBoot=true
# 2. Collects detailed UI stability metrics and debugging data
# 3. Analyzes stability criteria compliance
# 4. Generates a comprehensive report

set -euo pipefail

# Configuration - Positional arguments
NUM_LAUNCHES="${1:-10}"
DEVICE_ID="${2:-}"
PACKAGE_NAME="${3:-com.google.android.deskclock}"

# Stability thresholds - can be overridden via named arguments
P50_THRESHOLD=100
P90_THRESHOLD=100
P95_THRESHOLD=200
ALLOW_VSYNC_DELTA=0
ALLOW_SLOWUI_DELTA=0
ALLOW_DEADLINE_DELTA=0
STABILITY_DURATION=60
POLL_TIMEOUT=12000

# Parse named arguments (starting from arg 4)
for ((i=4; i<=$#; i++)); do
    case "${!i}" in
        --p50-threshold)
            ((i++))
            P50_THRESHOLD="${!i}"
            ;;
        --p90-threshold)
            ((i++))
            P90_THRESHOLD="${!i}"
            ;;
        --p95-threshold)
            ((i++))
            P95_THRESHOLD="${!i}"
            ;;
        --allow-vsync-delta)
            ((i++))
            ALLOW_VSYNC_DELTA="${!i}"
            ;;
        --allow-slowui-delta)
            ((i++))
            ALLOW_SLOWUI_DELTA="${!i}"
            ;;
        --allow-deadline-delta)
            ((i++))
            ALLOW_DEADLINE_DELTA="${!i}"
            ;;
        --stability-duration)
            ((i++))
            STABILITY_DURATION="${!i}"
            ;;
        --timeout)
            ((i++))
            POLL_TIMEOUT="${!i}"
            ;;
        *)
            echo "Unknown option: ${!i}"
            exit 1
            ;;
    esac
done

# Derived variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
AWAIT_IDLE_SCRIPT="$SCRIPT_DIR/await_idle.sh"
SCRATCH_DIR="$ROOT_DIR/android/scratch"
REPORT_FILE="$SCRATCH_DIR/launch_app_perf_test_$(date +%Y%m%d_%H%M%S).json"
DEBUG_LOG="$SCRATCH_DIR/launch_app_perf_test_debug_$(date +%Y%m%d_%H%M%S).log"

# Detect if gdate (GNU date) is available for high-precision timing, fallback to python
get_time_ms() {
    if command -v gdate &> /dev/null; then
        gdate +%s%3N
    else
        # Use Python for millisecond precision on macOS (where gdate may not be available)
        python3 -c 'import time; print(int(time.time() * 1000))'
    fi
}

# ADB command setup - only specify device if not "default"
ADB_CMD="adb"
if [[ -n "$DEVICE_ID" && "$DEVICE_ID" != "default" ]]; then
    ADB_CMD="adb -s $DEVICE_ID"
fi

# Create scratch directory if needed
mkdir -p "$SCRATCH_DIR"

# Logging functions
log_info() {
    local msg
    msg="[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $*"
    echo "$msg" | tee -a "$DEBUG_LOG" >&2
}

log_debug() {
    local msg
    msg="[$(date '+%Y-%m-%d %H:%M:%S')] [DEBUG] $*"
    echo "$msg" >> "$DEBUG_LOG" >&2
}

log_error() {
    local msg
    msg="[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*"
    echo "$msg" | tee -a "$DEBUG_LOG" >&2
}

# Check stability criteria (using configurable thresholds)
check_stability_criteria() {
    local p50="$1"
    local p90="$2"
    local p95="$3"
    local missed_vsync_delta="$4"
    local slow_ui_delta="$5"
    local deadline_delta="$6"

    # Convert to integers for comparison
    local p50_int
    p50_int=$(echo "$p50" | cut -d'.' -f1)
    local p90_int
    p90_int=$(echo "$p90" | cut -d'.' -f1)
    local p95_int
    p95_int=$(echo "$p95" | cut -d'.' -f1)

    # Default to 0 if empty
    p50_int=${p50_int:-0}
    p90_int=${p90_int:-0}
    p95_int=${p95_int:-0}
    missed_vsync_delta=${missed_vsync_delta:-0}
    slow_ui_delta=${slow_ui_delta:-0}
    deadline_delta=${deadline_delta:-0}

    # Stability criteria (configurable thresholds)
    local is_stable=0
    if [[ $missed_vsync_delta -le $ALLOW_VSYNC_DELTA && \
          $slow_ui_delta -le $ALLOW_SLOWUI_DELTA && \
          $deadline_delta -le $ALLOW_DEADLINE_DELTA && \
          $p50_int -lt $P50_THRESHOLD && \
          $p90_int -lt $P90_THRESHOLD && \
          $p95_int -lt $P95_THRESHOLD ]]; then
        is_stable=1
    fi

    echo "$is_stable"
}

# Perform a single app launch with detailed metrics collection
launch_and_collect_metrics() {
    local launch_num="$1"
    local start_time
    start_time=$(get_time_ms)

    log_info "=========================================="
    log_info "Launch #$launch_num - Starting cold boot launch"
    log_info "=========================================="

    # Note: coldBoot=true in the launch parameters already handles terminating the app
    # so we don't need to explicitly force-stop

    # Launch the app using the CLI daemon with coldBoot=true (with fallback to direct)
    log_info "Launching app with CLI daemon: $PACKAGE_NAME"
    local launch_start
    launch_start=$(get_time_ms)

    # Run the launch command and capture output
    local launch_output
    launch_output=$(bun src/index.ts --cli launchApp --appId "$PACKAGE_NAME" --coldBoot true 2>&1 || echo "LAUNCH_FAILED")

    local launch_end
    launch_end=$(get_time_ms)
    local launch_duration=$((launch_end - launch_start))

    log_info "App launch completed in ${launch_duration}ms"
    log_debug "Launch output: $launch_output"

    # Now check if app actually launched and is in foreground
    log_info "Checking if app is in foreground and stable"

    # Poll for UI stability with detailed metrics collection
    local poll_count=0
    local poll_start
    poll_start=$(get_time_ms)
    local last_non_idle_time=$poll_start
    local is_stable=0
    local stability_achieved_at=0

    local prev_missed_vsync=""
    local prev_slow_ui=""
    local prev_deadline=""

    local metrics_log
    metrics_log="$SCRATCH_DIR/metrics_launch_${launch_num}_$(get_time_ms).log"

    # Headers for metrics log
    echo "poll_num,elapsed_ms,p50,p90,p95,p99,missed_vsync,slow_ui,deadline,mv_delta,su_delta,dd_delta,is_stable_criteria,stable_duration_ms" > "$metrics_log"

    while true; do
        local current_time
        current_time=$(get_time_ms)
        local elapsed=$((current_time - poll_start))

        # Check timeout
        if [[ $elapsed -ge $POLL_TIMEOUT ]]; then
            log_info "Timeout reached after ${elapsed}ms (limit: ${POLL_TIMEOUT}ms), ending stability poll"
            break
        fi

        # Get gfxinfo output
        local gfx_output
        gfx_output=$($ADB_CMD shell dumpsys gfxinfo "$PACKAGE_NAME" 2>&1)
        local gfx_exit=$?

        if [[ $gfx_exit -ne 0 ]]; then
            log_debug "Poll $poll_count: gfxinfo failed (exit $gfx_exit): $gfx_output"
            sleep 0.017
            continue
        fi

        if [[ -z "$gfx_output" ]]; then
            log_debug "Poll $poll_count: gfxinfo returned empty output"
            sleep 0.017
            continue
        fi

        # Extract metrics using simpler grep patterns that work on macOS and Linux
        local p50
        p50=$(echo "$gfx_output" | grep "^50th percentile:" | awk '{print $3}' | sed 's/ms//' || echo "")
        local p90
        p90=$(echo "$gfx_output" | grep "^90th percentile:" | awk '{print $3}' | sed 's/ms//' || echo "")
        local p95
        p95=$(echo "$gfx_output" | grep "^95th percentile:" | awk '{print $3}' | sed 's/ms//' || echo "")
        local p99
        p99=$(echo "$gfx_output" | grep "^99th percentile:" | awk '{print $3}' | sed 's/ms//' || echo "")
        local missed_vsync
        missed_vsync=$(echo "$gfx_output" | grep "^Number Missed Vsync:" | awk '{print $4}' || echo "")
        local slow_ui
        slow_ui=$(echo "$gfx_output" | grep "^Number Slow UI thread:" | awk '{print $5}' || echo "")
        local deadline
        deadline=$(echo "$gfx_output" | grep "^Number Frame deadline missed:" | head -1 | awk '{print $5}' || echo "")

        # Skip if we couldn't parse metrics
        if [[ -z "$p50" || -z "$missed_vsync" || -z "$slow_ui" || -z "$deadline" ]]; then
            log_debug "Poll $poll_count: Incomplete gfxinfo data (p50=$p50, mv=$missed_vsync, su=$slow_ui, dd=$deadline)"
            sleep 0.017
            continue
        fi

        # Calculate deltas
        local mv_delta=0
        local su_delta=0
        local dd_delta=0

        if [[ -n "$prev_missed_vsync" && -n "$missed_vsync" ]]; then
            mv_delta=$((missed_vsync - prev_missed_vsync))
        fi
        if [[ -n "$prev_slow_ui" && -n "$slow_ui" ]]; then
            su_delta=$((slow_ui - prev_slow_ui))
        fi
        if [[ -n "$prev_deadline" && -n "$deadline" ]]; then
            dd_delta=$((deadline - prev_deadline))
        fi

        # Update previous values
        prev_missed_vsync="$missed_vsync"
        prev_slow_ui="$slow_ui"
        prev_deadline="$deadline"

        # Check stability criteria
        local criteria_met
        criteria_met=$(check_stability_criteria "$p50" "$p90" "$p95" "$mv_delta" "$su_delta" "$dd_delta")

        # Calculate stable duration
        local stable_duration=$((current_time - last_non_idle_time))

        # Check if stable
        if [[ $criteria_met -eq 1 && $stable_duration -ge $STABILITY_DURATION ]]; then
            is_stable=1
            stability_achieved_at=$elapsed
            log_info "Poll $poll_count: STABLE CRITERIA MET! (elapsed: ${elapsed}ms, stable for: ${stable_duration}ms)"
            break
        elif [[ $criteria_met -ne 1 ]]; then
            # Criteria not met, update last_non_idle_time
            last_non_idle_time=$current_time
            log_debug "Poll $poll_count: Not stable - deltas(mv=$mv_delta,su=$su_delta,dd=$dd_delta) percentiles(p50=$p50,p90=$p90,p95=$p95)"
        else
            log_debug "Poll $poll_count: Criteria met but stable duration only $stable_duration ms (need ${STABILITY_DURATION}ms)"
        fi

        # Log this poll's metrics
        echo "$poll_count,$elapsed,$p50,$p90,$p95,$p99,$missed_vsync,$slow_ui,$deadline,$mv_delta,$su_delta,$dd_delta,$criteria_met,$stable_duration" >> "$metrics_log"

        poll_count=$((poll_count + 1))

        # Poll interval (17ms like TypeScript)
        sleep 0.017
    done

    local total_time
    total_time=$(get_time_ms)
    local total_duration=$((total_time - start_time))

    log_info "Launch #$launch_num Summary:"
    log_info "  Total time: ${total_duration}ms"
    log_info "  App launch: ${launch_duration}ms"
    log_info "  Stability poll time: ${stability_achieved_at}ms"
    log_info "  Poll count: $poll_count"
    log_info "  Stable: $is_stable"
    log_info "  Metrics log: $metrics_log"

    # Output as JSON-compatible format for later processing
    echo "launch_${launch_num}|${total_duration}|${launch_duration}|${stability_achieved_at}|${poll_count}|${is_stable}"
}

# Main execution
main() {
    log_info "=========================================="
    log_info "Launch App Performance Test - UI Stability Debug"
    log_info "=========================================="
    log_info "Configuration:"
    log_info "  Number of launches: $NUM_LAUNCHES"
    log_info "  Device ID: ${DEVICE_ID:-default}"
    log_info "  Package: $PACKAGE_NAME"
    log_info "  Report file: $REPORT_FILE"
    log_info "  Debug log: $DEBUG_LOG"
    log_info ""
    log_info "Stability Thresholds:"
    log_info "  p50 < ${P50_THRESHOLD}ms, p90 < ${P90_THRESHOLD}ms, p95 < ${P95_THRESHOLD}ms"
    log_info "  Missed Vsync delta <= ${ALLOW_VSYNC_DELTA}, Slow UI delta <= ${ALLOW_SLOWUI_DELTA}, Deadline delta <= ${ALLOW_DEADLINE_DELTA}"
    log_info "  Stability duration: ${STABILITY_DURATION}ms, Timeout: ${POLL_TIMEOUT}ms"
    log_info ""

    # Verify await_idle.sh exists
    if [[ ! -f "$AWAIT_IDLE_SCRIPT" ]]; then
        log_error "await_idle.sh not found at $AWAIT_IDLE_SCRIPT"
        exit 1
    fi

    # Source the await_idle functions (optional - we implement inline for now)
    # source "$AWAIT_IDLE_SCRIPT"

    # Initialize results
    local results_json="{"
    results_json="$results_json\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    results_json="$results_json\"device_id\":\"${DEVICE_ID:-default}\","
    results_json="$results_json\"package\":\"$PACKAGE_NAME\","
    results_json="$results_json\"num_launches\":$NUM_LAUNCHES,"
    results_json="$results_json\"launches\":["

    local all_durations=()
    local all_stable_counts=0
    local all_poll_counts=()

    # Run launches
    for ((i=1; i<=NUM_LAUNCHES; i++)); do
        local result
        result=$(launch_and_collect_metrics $i)

        # Parse result
        local total_time
        total_time=$(echo "$result" | cut -d'|' -f2)
        local launch_time
        launch_time=$(echo "$result" | cut -d'|' -f3)
        local stability_time
        stability_time=$(echo "$result" | cut -d'|' -f4)
        local poll_count
        poll_count=$(echo "$result" | cut -d'|' -f5)
        local is_stable
        is_stable=$(echo "$result" | cut -d'|' -f6)

        all_durations+=("$total_time")
        all_poll_counts+=("$poll_count")
        [[ $is_stable -eq 1 ]] && all_stable_counts=$((all_stable_counts + 1))

        # Add to JSON
        if [[ $i -gt 1 ]]; then
            results_json="$results_json,"
        fi

        results_json="$results_json{"
        results_json="$results_json\"launch_num\":$i,"
        results_json="$results_json\"total_time_ms\":$total_time,"
        results_json="$results_json\"app_launch_ms\":$launch_time,"
        results_json="$results_json\"stability_poll_ms\":$stability_time,"
        results_json="$results_json\"poll_count\":$poll_count,"
        results_json="$results_json\"is_stable\":$is_stable"
        results_json="$results_json}"

        # Small delay between launches
        sleep 1
    done

    # Calculate statistics
    local min_time=${all_durations[0]}
    local max_time=${all_durations[0]}
    local sum_time=0

    for duration in "${all_durations[@]}"; do
        [[ $duration -lt $min_time ]] && min_time=$duration
        [[ $duration -gt $max_time ]] && max_time=$duration
        sum_time=$((sum_time + duration))
    done

    local avg_time=$((sum_time / NUM_LAUNCHES))

    # Close JSON
    results_json="$results_json],"
    results_json="$results_json\"statistics\":{"
    results_json="$results_json\"min_ms\":$min_time,"
    results_json="$results_json\"max_ms\":$max_time,"
    results_json="$results_json\"avg_ms\":$avg_time,"
    results_json="$results_json\"total_ms\":$sum_time,"
    results_json="$results_json\"stable_count\":$all_stable_counts,"
    results_json="$results_json\"stability_percent\":$((all_stable_counts * 100 / NUM_LAUNCHES))"
    results_json="$results_json}"
    results_json="$results_json}"

    # Save report
    echo "$results_json" | jq '.' > "$REPORT_FILE" 2>/dev/null || echo "$results_json" > "$REPORT_FILE"

    # Print summary
    echo ""
    log_info "=========================================="
    log_info "Test Complete - Summary"
    log_info "=========================================="
    log_info "Total launches: $NUM_LAUNCHES"
    log_info "Launches achieving stability: $all_stable_counts / $NUM_LAUNCHES"
    log_info ""
    log_info "Duration Statistics:"
    log_info "  Min: ${min_time}ms"
    log_info "  Max: ${max_time}ms"
    log_info "  Avg: ${avg_time}ms"
    log_info "  Total: ${sum_time}ms"
    log_info ""
    log_info "Files generated:"
    log_info "  Report: $REPORT_FILE"
    log_info "  Debug log: $DEBUG_LOG"
    log_info "  Individual metrics: $SCRATCH_DIR/metrics_launch_*_*.log"
    log_info ""
}

# Run main
main "$@"
