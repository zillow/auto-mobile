#!/usr/bin/env bash
set -euo pipefail

report_path="${1:-scratch/bun-test-report.xml}"
max_ms="${BUN_TEST_MAX_MS:-100}"

mkdir -p "$(dirname "$report_path")"

bun test --reporter junit --reporter-outfile "$report_path"

awk -v limit_ms="$max_ms" '
function attr(rec, key,    pattern, start, len) {
  pattern = key "=\"[^\"]*\""
  if (match(rec, pattern)) {
    start = RSTART + length(key) + 2
    len = RLENGTH - length(key) - 2
    return substr(rec, start, len)
  }
  return ""
}
BEGIN {
  fail = 0
  count = 0
}
{
  if ($0 ~ /<testcase/) {
    count += 1
    name = attr($0, "name")
    class = attr($0, "classname")
    time_str = attr($0, "time")
    if (time_str == "") {
      next
    }
    time_ms = time_str * 1000.0
    if (time_ms > limit_ms) {
      if (class != "" && name != "") {
        label = class "." name
      } else if (name != "") {
        label = name
      } else {
        label = "(unknown)"
      }
      printf "Test exceeded %dms: %s (%.2fms)\n", limit_ms, label, time_ms > "/dev/stderr"
      fail = 1
    }
  }
}
END {
  if (count == 0) {
    print "No testcases found in junit report." > "/dev/stderr"
    exit 1
  }
  exit fail
}
' "$report_path"
