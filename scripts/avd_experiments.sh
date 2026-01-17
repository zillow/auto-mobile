#!/usr/bin/env bash
set -euo pipefail

start_api="${1:-21}"
end_api="${2:-35}"
tag="${3:-google_apis}"
abi="${4:-arm64-v8a}"

sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-${ANDROID_SDK_HOME:-}}}"
if [[ -z "${sdk_root}" ]]; then
  echo "ANDROID_SDK_ROOT/ANDROID_HOME/ANDROID_SDK_HOME not set" >&2
  exit 1
fi

sdkmanager="${sdk_root}/cmdline-tools/latest/bin/sdkmanager"
avdmanager="${sdk_root}/cmdline-tools/latest/bin/avdmanager"
emulator="${sdk_root}/emulator/emulator"
adb="${sdk_root}/platform-tools/adb"

for tool in "$sdkmanager" "$avdmanager" "$emulator" "$adb"; do
  if [[ ! -x "$tool" ]]; then
    echo "Missing tool: $tool" >&2
    exit 1
  fi
done

scratch_dir="scratch/avd-experiments"
mkdir -p "$scratch_dir"

list_log="${scratch_dir}/sdkmanager-list.log"
install_log="${scratch_dir}/sdkmanager-install-${start_api}-${end_api}.log"
create_log="${scratch_dir}/avdmanager-create-${start_api}-${end_api}.log"

echo "Listing system images..." | tee "$list_log"
"$sdkmanager" --list | tee -a "$list_log"

mapfile -t available_packages < <(
  rg -o "system-images;android-[0-9]+;${tag};${abi}" "$list_log" | sort -u
)

declare -a requested_packages=()
for api in $(seq "$start_api" "$end_api"); do
  pkg="system-images;android-${api};${tag};${abi}"
  if printf '%s\n' "${available_packages[@]}" | rg -q "^${pkg}$"; then
    requested_packages+=("$pkg")
  fi
done

if [[ "${#requested_packages[@]}" -eq 0 ]]; then
  echo "No matching system images found for API ${start_api}-${end_api} (${tag}, ${abi})" >&2
  exit 1
fi

echo "Installing system images: ${requested_packages[*]}" | tee "$install_log"
"$sdkmanager" "${requested_packages[@]}" | tee -a "$install_log"

for pkg in "${requested_packages[@]}"; do
  api="$(echo "$pkg" | rg -o "android-[0-9]+" | rg -o "[0-9]+")"
  name="am-api${api}-ga-arm64"
  echo "Creating ${name} (${pkg})" | tee -a "$create_log"
  if "$avdmanager" list avd | rg -q "Name: ${name}"; then
    echo "AVD ${name} already exists, skipping create" | tee -a "$create_log"
    continue
  fi
  echo "no" | "$avdmanager" create avd -n "$name" -k "$pkg" -d "medium_phone" | tee -a "$create_log"
done

for pkg in "${requested_packages[@]}"; do
  api="$(echo "$pkg" | rg -o "android-[0-9]+" | rg -o "[0-9]+")"
  name="am-api${api}-ga-arm64"
  outdir="${scratch_dir}/api${api}"
  mkdir -p "$outdir"

  echo "Starting emulator for ${name}" | tee "$outdir/run.log"
  "$emulator" -avd "$name" -no-window -no-audio -gpu swiftshader_indirect -no-snapshot-save -no-boot-anim -wipe-data >"$outdir/emulator.log" 2>&1 &
  emu_pid=$!

  "$adb" wait-for-device
  device_id="$("$adb" devices | awk '$1 ~ /^emulator-/ && $2=="device" {print $1; exit}')"
  echo "Device: ${device_id:-<none>}" | tee -a "$outdir/run.log"

  boot=""
  for i in $(seq 1 60); do
    if [[ -n "${device_id}" ]]; then
      boot="$("$adb" -s "$device_id" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    fi
    if [[ "$boot" == "1" ]]; then
      echo "Boot completed after ${i} checks" | tee -a "$outdir/run.log"
      break
    fi
    sleep 5
  done
  if [[ "$boot" != "1" ]]; then
    echo "Boot did not complete in time" | tee -a "$outdir/run.log"
  fi

  if [[ -n "${device_id}" ]]; then
    "$adb" -s "$device_id" shell dumpsys window windows > "$outdir/dumpsys-window-windows.txt" 2> "$outdir/dumpsys-window-windows.err"
    "$adb" -s "$device_id" shell dumpsys activity activities > "$outdir/dumpsys-activity-activities.txt" 2> "$outdir/dumpsys-activity-activities.err"
    "$adb" -s "$device_id" shell dumpsys activity > "$outdir/dumpsys-activity.txt" 2> "$outdir/dumpsys-activity.err"
    "$adb" -s "$device_id" shell getprop ro.build.version.sdk > "$outdir/ro.build.version.sdk.txt" 2>/dev/null
    "$adb" -s "$device_id" shell getprop ro.build.version.release > "$outdir/ro.build.version.release.txt" 2>/dev/null
    "$adb" -s "$device_id" emu kill
  else
    echo "No emulator device found; skipping dumpsys" | tee -a "$outdir/run.log"
  fi

  sleep 5
  if kill -0 "$emu_pid" 2>/dev/null; then
    kill -9 "$emu_pid" || true
  fi
  echo "Completed ${name}" | tee -a "$outdir/run.log"
done

report="${scratch_dir}/report.md"
{
  echo "# AVD experiments: dumpsys parsing"
  echo ""
  echo "SDK root: ${sdk_root}"
  echo "Emulator: ${emulator}"
  echo "Cmdline tools: ${sdk_root}/cmdline-tools/latest"
  echo ""
  echo "Notes:"
  echo "- sdkmanager/avdmanager may warn about XML version mismatch and unexpected <abis> elements."
  echo "- Tag: ${tag}"
  echo "- ABI: ${abi}"
  echo "- API range: ${start_api}-${end_api}"
  echo ""
  for api in $(seq "$start_api" "$end_api"); do
    outdir="${scratch_dir}/api${api}"
    echo "## API ${api}"
    if [[ -f "$outdir/ro.build.version.sdk.txt" ]]; then
      sdk="$(tr -d '\r' < "$outdir/ro.build.version.sdk.txt")"
      rel="$(tr -d '\r' < "$outdir/ro.build.version.release.txt")"
      echo "- ro.build.version.sdk: ${sdk}"
      echo "- ro.build.version.release: ${rel}"
    else
      echo "- ro.build.version.sdk: (not available)"
      echo "- ro.build.version.release: (not available)"
    fi
    if [[ -f "$outdir/run.log" ]]; then
      echo "- run log:"
      echo ""
      printf '%s\n' '```'
      cat "$outdir/run.log"
      printf '%s\n' '```'
    else
      echo "- run log: (not available)"
    fi
    echo "- dumpsys window windows key lines:"
    echo ""
    printf '%s\n' '```'
    if [[ -f "$outdir/dumpsys-window-windows.txt" ]]; then
      rg -n "imeControlTarget|imeInputTarget|imeLayeringTarget|mActivityRecord=|ty=BASE_APPLICATION|mViewVisibility=|isOnScreen=true|isVisible=true|mCurrentFocus|mFocusedApp" "$outdir/dumpsys-window-windows.txt" | head -n 120
    else
      echo "(missing)"
    fi
    printf '%s\n' '```'
    echo "- dumpsys activity activities key lines:"
    echo ""
    printf '%s\n' '```'
    if [[ -f "$outdir/dumpsys-activity-activities.txt" ]]; then
      rg -n "mResumedActivity|mFocusedActivity|topResumedActivity" "$outdir/dumpsys-activity-activities.txt" | head -n 80
    else
      echo "(missing)"
    fi
    printf '%s\n' '```'
    echo ""
  done
} > "$report"

echo "Report written to ${report}"
