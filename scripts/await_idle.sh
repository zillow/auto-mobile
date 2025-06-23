#!/bin/bash

# await_idle.sh - Bash implementation of AwaitIdle functionality
# Usage: ./await_idle.sh [device_id] [function] [args...]

set -euo pipefail

# Global variables
DEVICE_ID=""
ADB_CMD="adb"

# Initialize device ID if provided and is actually a device ID (not a function name)
if [[ $# -gt 0 && "$1" != "-"* && "$1" != "wait_touch" && "$1" != "wait_rotation" && "$1" != "wait_ui_stability" ]]; then
    DEVICE_ID="$1"
    if [[ -n "$DEVICE_ID" ]]; then
        ADB_CMD="adb -s $DEVICE_ID"
    fi
    shift
fi

# Logging function
log_info() {
    echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S'): $*"
}

# Wait for touch events to become idle
wait_for_idle_touch_events() {
    local timeout_ms=${1:-100}
    local hard_limit_ms=8000

    log_info "Waiting for idle touch events (timeout: ${timeout_ms}ms)"

    local start_time
    start_time=$(gdate +%s%3N)
    local last_event_time
    last_event_time=$start_time
    local is_idle=false

    # Start capturing events in background
    local getevent_pid
    $ADB_CMD shell getevent -l > /tmp/getevent_output.txt 2>/dev/null &
    getevent_pid=$!

    # Monitor events
    while [[ "$is_idle" == "false" ]]; do
        local current_time
        current_time=$(gdate +%s%3N)

        # Check hard limit
        if (( current_time - start_time >= hard_limit_ms )); then
            break
        fi

        # Check for touch events in recent output
        if [[ -f /tmp/getevent_output.txt ]]; then
            # Look for touch events in the last few lines
            if tail -20 /tmp/getevent_output.txt 2>/dev/null | grep -E "(ABS_MT_POSITION_X|ABS_MT_POSITION_Y|ABS_MT_TRACKING_ID)" >/dev/null 2>&1; then
                last_event_time=$current_time
            fi
        fi

        # Check if idle period has passed
        if (( current_time - last_event_time >= timeout_ms )); then
            is_idle=true
        fi

        sleep 0.01  # Check every 10ms
    done

    # Kill the event capture process
    kill $getevent_pid 2>/dev/null || true
    wait $getevent_pid 2>/dev/null || true
    rm -f /tmp/getevent_output.txt

    local elapsed
    elapsed=$(($(gdate +%s%3N) - start_time))
    log_info "Touch events idle detected after ${elapsed}ms"
}

# Wait for device rotation to complete
wait_for_rotation() {
    local target_rotation=$1
    local timeout_ms=${2:-500}
    local poll_interval_ms=${3:-17}

    local start_time
    start_time=$(gdate +%s%3N)

    while true; do
        local current_time
        current_time=$(gdate +%s%3N)

        # Check timeout
        if (( current_time - start_time >= timeout_ms )); then
            echo "Error: Timeout waiting for rotation to $target_rotation after ${timeout_ms}ms" >&2
            return 1
        fi

        # Check current rotation
        local rotation_output
        if rotation_output=$($ADB_CMD shell dumpsys window 2>/dev/null | grep -i "mRotation=" || true); then
            local current_rotation
            if current_rotation=$(echo "$rotation_output" | sed -n 's/.*mRotation=\([0-9]\+\).*/\1/p'); then
                if [[ -n "$current_rotation" ]]; then
                    log_info "Current rotation: $current_rotation, target: $target_rotation"

                    if [[ "$current_rotation" == "$target_rotation" ]]; then
                        local elapsed
                        elapsed=$((current_time - start_time))
                        log_info "Rotation to $target_rotation complete, took ${elapsed}ms"
                        return 0
                    fi
                fi
            fi
        fi

        # Wait before next check
        sleep "$(echo "scale=3; $poll_interval_ms / 1000" | bc)"
    done
}

# Wait for UI stability by monitoring frame rendering
wait_for_ui_stability() {
    local package_name=$1
    local stability_threshold_ms=${2:-250}
    local timeout_ms=${3:-12000}
    local poll_interval_ms=${4:-17}

    local start_time
    start_time=$(gdate +%s%3N)
    local last_non_idle_time
    last_non_idle_time=$start_time

    # Track previous values for cumulative metrics
    local prev_missed_vsync=""
    local prev_slow_ui_thread=""
    local prev_frame_deadline_missed=""

    # Reset gfxinfo stats
    log_info "Reset gfxinfo for $package_name"
    $ADB_CMD shell dumpsys gfxinfo "$package_name" reset >/dev/null 2>&1 || true

    # Give a moment for frame data to accumulate
    sleep 0.1

    while true; do
        local current_time
        current_time=$(gdate +%s%3N)

        # Check timeout
        if (( current_time - start_time >= timeout_ms )); then
            log_info "Timeout waiting for UI stability after ${timeout_ms}ms"
            return 0  # Don't fail, just return
        fi

        # Get frame stats
        local gfx_output
        if gfx_output=$($ADB_CMD shell dumpsys gfxinfo "$package_name" 2>/dev/null || true); then
            # Debug: show relevant lines
            log_info "Debug - relevant gfx lines:"
#            echo "$gfx_output" | grep -E "(50th percentile|Number Missed Vsync|Number Slow UI thread)" | head -3

            # Parse specific metrics using awk for simpler extraction
            local percentile_50th
            percentile_50th=$(echo "$gfx_output" | grep "50th percentile:" | awk '{print $3}' | sed 's/ms//')
            local percentile_90th
            percentile_90th=$(echo "$gfx_output" | grep "90th percentile:" | awk '{print $3}' | sed 's/ms//')
            local percentile_95th
            percentile_95th=$(echo "$gfx_output" | grep "95th percentile:" | awk '{print $3}' | sed 's/ms//')
            local percentile_99th
            percentile_99th=$(echo "$gfx_output" | grep "99th percentile:" | awk '{print $3}' | sed 's/ms//')
            local missed_vsync
            missed_vsync=$(echo "$gfx_output" | grep "Number Missed Vsync:" | awk '{print $4}')
            local slow_ui_thread
            slow_ui_thread=$(echo "$gfx_output" | grep "Number Slow UI thread:" | awk '{print $5}')
            local frame_deadline_missed
            frame_deadline_missed=$(echo "$gfx_output" | grep "Number Frame deadline missed:" | head -1 | awk '{print $5}')

            # Debug output
            log_info "Metrics: 50th=${percentile_50th}ms 90th=${percentile_90th}ms 95th=${percentile_95th}ms 99th=${percentile_99th}ms MissedVsync=${missed_vsync} SlowUI=${slow_ui_thread} DeadlineMissed=${frame_deadline_missed}"

            # Check if we have valid data
            if [[ -n "$percentile_50th" && -n "$missed_vsync" && -n "$slow_ui_thread" ]]; then
                # Convert percentiles to numbers for comparison (remove decimal if present)
                local p50_int
                p50_int=$(echo "$percentile_50th" | cut -d'.' -f1)
                local p90_int
                p90_int=$(echo "$percentile_90th" | cut -d'.' -f1)
                local p95_int
                p95_int=$(echo "$percentile_95th" | cut -d'.' -f1)

                # Calculate deltas for cumulative metrics
                local missed_vsync_delta=0
                local slow_ui_thread_delta=0
                local frame_deadline_missed_delta=0

                if [[ -n "$prev_missed_vsync" ]]; then
                    missed_vsync_delta=$((missed_vsync - prev_missed_vsync))
                fi
                if [[ -n "$prev_slow_ui_thread" ]]; then
                    slow_ui_thread_delta=$((slow_ui_thread - prev_slow_ui_thread))
                fi
                if [[ -n "$prev_frame_deadline_missed" && -n "$frame_deadline_missed" ]]; then
                    frame_deadline_missed_delta=$((frame_deadline_missed - prev_frame_deadline_missed))
                fi

                # Update previous values
                prev_missed_vsync=$missed_vsync
                prev_slow_ui_thread=$slow_ui_thread
                prev_frame_deadline_missed=$frame_deadline_missed

                # Log deltas for debugging
                log_info "Deltas: MissedVsync=${missed_vsync_delta} SlowUI=${slow_ui_thread_delta} DeadlineMissed=${frame_deadline_missed_delta}"

                # Check idle criteria:
                # - Zero delta in missed vsyncs
                # - Zero delta in slow UI threads
                # - All percentiles < 100ms (for reasonable frame times)
                if [[ "$missed_vsync_delta" -eq 0 && "$slow_ui_thread_delta" -eq 0 && "$frame_deadline_missed_delta" -eq 0 && "$p50_int" -lt 100 && "$p90_int" -lt 100 && "$p95_int" -lt 200 ]]; then
                    log_info "UI appears stable (criteria met)"
                else
                    log_info "UI not stable yet (criteria not met)"
                    last_non_idle_time=$current_time
                fi
            else
                log_info "No valid frame data yet"
                last_non_idle_time=$current_time
            fi
        else
            log_info "Could not get gfxinfo"
            last_non_idle_time=$current_time
        fi

        # Check if stable for the required duration
        if (( current_time - last_non_idle_time >= stability_threshold_ms )); then
            local elapsed
            elapsed=$((current_time - start_time))
            log_info "UI stable after ${elapsed}ms (stable for ${stability_threshold_ms}ms)"
            return 0
        fi

        # Wait before next check
        sleep "$(echo "scale=3; $poll_interval_ms / 1000" | bc)"
    done
}

# Wait for process idle
wait_for_process_idle() {
    local timeout
    timeout="${1:-30000}"
    local start_time
    start_time=$(gdate +%s%3N)

    while true; do
        local current_time
        current_time=$(gdate +%s%3N)
        local elapsed
        elapsed=$((current_time - start_time))

        if [ "$elapsed" -ge "$timeout" ]; then
            echo "Process idle timeout reached after ${timeout}ms"
            return 1
        fi

        # Check if device is process idle
        local idle_output
        idle_output=$($ADB_CMD shell dumpsys activity | grep -cE "mSleeping=false|mBooted=true|mBooting=false")

        if [ "$idle_output" -eq 3 ]; then
            echo "Device is process idle"
            return 0
        fi

        sleep 0.1
    done
}

# Main function dispatcher
main() {
    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 [device_id] <function> [args...]"
        echo "Functions:"
        echo "  wait_touch [timeout_ms=100]"
        echo "  wait_rotation <target_rotation> [timeout_ms=500] [poll_interval_ms=17]"
        echo "  wait_ui_stability <package_name> [stability_threshold_ms=250] [timeout_ms=5000] [poll_interval_ms=17]"
        exit 1
    fi

    local function_name=$1
    shift

    case "$function_name" in
        "wait_touch")
            wait_for_idle_touch_events "$@"
            ;;
        "wait_rotation")
            if [[ $# -eq 0 ]]; then
                echo "Error: target_rotation is required" >&2
                exit 1
            fi
            wait_for_rotation "$@"
            ;;
        "wait_ui_stability")
            if [[ $# -eq 0 ]]; then
                echo "Error: package_name is required" >&2
                exit 1
            fi
            wait_for_ui_stability "$@"
            ;;
        *)
            echo "Error: Unknown function '$function_name'" >&2
            exit 1
            ;;
    esac
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
