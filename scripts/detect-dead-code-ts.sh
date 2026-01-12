#!/usr/bin/env bash

# Script to detect dead code in TypeScript files using ts-prune and knip
# Usage: bash scripts/detect-dead-code-ts.sh [--json] [--threshold=<number>] [--output-dir=<dir>]
#
# Options:
#   --json           Output results in JSON format
#   --threshold=N    Exit with error if more than N issues found (default: no limit)
#   --output-dir=DIR Write reports to specified directory
#
# Exit codes:
#   0 - Success (no dead code or below threshold)
#   1 - Error running tools
#   2 - Dead code found above threshold

set -euo pipefail

# Parse command-line arguments
JSON_OUTPUT=false
THRESHOLD=""
OUTPUT_DIR=""

for arg in "$@"; do
  case $arg in
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    --threshold=*)
      THRESHOLD="${arg#*=}"
      shift
      ;;
    --output-dir=*)
      OUTPUT_DIR="${arg#*=}"
      shift
      ;;
    *)
      echo "Unknown option: $arg"
      exit 1
      ;;
  esac
done

# Check for required commands
if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is required but not installed"
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx is required but not installed"
    exit 1
fi

# Temporary files for storing results
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

TS_PRUNE_OUTPUT="$TEMP_DIR/ts-prune.txt"
KNIP_OUTPUT="$TEMP_DIR/knip.json"
ISSUES_JSON="$TEMP_DIR/issues.json"

# Initialize issues array
echo '[]' > "$ISSUES_JSON"

echo "🔍 Running TypeScript dead code detection..."
echo ""

# ============================================================================
# Run ts-prune
# ============================================================================
echo "📦 Running ts-prune..."

# Run ts-prune (it exits with non-zero when issues found, that's okay)
set +e  # Temporarily disable exit on error
npx ts-prune --error > "$TS_PRUNE_OUTPUT" 2>&1
TS_PRUNE_EXIT=$?
set -e  # Re-enable exit on error

if [ $TS_PRUNE_EXIT -eq 0 ] || [ -s "$TS_PRUNE_OUTPUT" ]; then
    # Parse ts-prune output and convert to JSON
    TS_PRUNE_COUNT=0
    while IFS= read -r line; do
        if [[ -z "$line" ]]; then
            continue
        fi

        # Parse: src/file.ts:123 - exportName (used in module)
        if [[ "$line" =~ ^(.+):([0-9]+)[[:space:]]*-[[:space:]]*(.+)$ ]]; then
            file="${BASH_REMATCH[1]}"
            linenum="${BASH_REMATCH[2]}"
            name="${BASH_REMATCH[3]}"

            # Remove optional (used in module) suffix using parameter expansion
            name="${name%% \(*\)}"
            # Trim whitespace from name
            name=$(echo "$name" | xargs)

            # Add to issues JSON
            jq --arg file "$file" \
               --arg location "${file}:${linenum}" \
               --arg type "unused export" \
               --arg name "$name" \
               --arg tool "ts-prune" \
               '. += [{
                 file: $file,
                 location: $location,
                 type: $type,
                 name: $name,
                 tool: $tool
               }]' "$ISSUES_JSON" > "$TEMP_DIR/issues.tmp" && mv "$TEMP_DIR/issues.tmp" "$ISSUES_JSON"

            ((TS_PRUNE_COUNT++)) || true
        fi
    done < "$TS_PRUNE_OUTPUT"

    echo "   Found $TS_PRUNE_COUNT issues"
else
    echo "❌ ts-prune failed"
    exit 1
fi

echo ""

# ============================================================================
# Run knip
# ============================================================================
echo "🔪 Running knip..."

# Run knip with JSON reporter (it exits with non-zero when issues found, that's okay)
set +e  # Temporarily disable exit on error
npx knip --reporter json > "$KNIP_OUTPUT" 2>&1
KNIP_EXIT=$?
set -e  # Re-enable exit on error

if [ $KNIP_EXIT -eq 0 ] || [ -s "$KNIP_OUTPUT" ]; then
    KNIP_COUNT=0

    # Parse unused files
    if jq -e '.files' "$KNIP_OUTPUT" > /dev/null 2>&1; then
        while IFS= read -r file; do
            if [[ -n "$file" ]]; then
                basename=$(basename "$file")
                jq --arg file "$file" \
                   --arg location "$file" \
                   --arg type "unused file" \
                   --arg name "$basename" \
                   --arg tool "knip" \
                   '. += [{
                     file: $file,
                     location: $location,
                     type: $type,
                     name: $name,
                     tool: $tool
                   }]' "$ISSUES_JSON" > "$TEMP_DIR/issues.tmp" && mv "$TEMP_DIR/issues.tmp" "$ISSUES_JSON"
                ((KNIP_COUNT++)) || true
            fi
        done < <(jq -r '.files[]?' "$KNIP_OUTPUT")
    fi

    # Parse unused exports
    if jq -e '.exports' "$KNIP_OUTPUT" > /dev/null 2>&1; then
        while IFS='|' read -r file export; do
            if [[ -n "$file" && -n "$export" ]]; then
                jq --arg file "$file" \
                   --arg location "$file" \
                   --arg type "unused export" \
                   --arg name "$export" \
                   --arg tool "knip" \
                   '. += [{
                     file: $file,
                     location: $location,
                     type: $type,
                     name: $name,
                     tool: $tool
                   }]' "$ISSUES_JSON" > "$TEMP_DIR/issues.tmp" && mv "$TEMP_DIR/issues.tmp" "$ISSUES_JSON"
                ((KNIP_COUNT++)) || true
            fi
        done < <(jq -r '.exports | to_entries[] | "\(.key)|\(.value[])"' "$KNIP_OUTPUT" 2>/dev/null || true)
    fi

    # Parse unused dependencies
    if jq -e '.dependencies' "$KNIP_OUTPUT" > /dev/null 2>&1; then
        while IFS= read -r dep; do
            if [[ -n "$dep" ]]; then
                jq --arg file "package.json" \
                   --arg location "package.json" \
                   --arg type "unused dependency" \
                   --arg name "$dep" \
                   --arg tool "knip" \
                   '. += [{
                     file: $file,
                     location: $location,
                     type: $type,
                     name: $name,
                     tool: $tool
                   }]' "$ISSUES_JSON" > "$TEMP_DIR/issues.tmp" && mv "$TEMP_DIR/issues.tmp" "$ISSUES_JSON"
                ((KNIP_COUNT++)) || true
            fi
        done < <(jq -r '.dependencies[]?' "$KNIP_OUTPUT")
    fi

    # Parse unused devDependencies
    if jq -e '.devDependencies' "$KNIP_OUTPUT" > /dev/null 2>&1; then
        while IFS= read -r dep; do
            if [[ -n "$dep" ]]; then
                jq --arg file "package.json" \
                   --arg location "package.json" \
                   --arg type "unused devDependency" \
                   --arg name "$dep" \
                   --arg tool "knip" \
                   '. += [{
                     file: $file,
                     location: $location,
                     type: $type,
                     name: $name,
                     tool: $tool
                   }]' "$ISSUES_JSON" > "$TEMP_DIR/issues.tmp" && mv "$TEMP_DIR/issues.tmp" "$ISSUES_JSON"
                ((KNIP_COUNT++)) || true
            fi
        done < <(jq -r '.devDependencies[]?' "$KNIP_OUTPUT")
    fi

    echo "   Found $KNIP_COUNT issues"
else
    echo "❌ knip failed"
    exit 1
fi

echo ""

# ============================================================================
# Generate report
# ============================================================================
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
TOTAL_ISSUES=$(jq 'length' "$ISSUES_JSON")

# Count by tool
TS_PRUNE_TOTAL=$(jq '[.[] | select(.tool == "ts-prune")] | length' "$ISSUES_JSON")
KNIP_TOTAL=$(jq '[.[] | select(.tool == "knip")] | length' "$ISSUES_JSON")

# Count by type
UNUSED_EXPORTS=$(jq '[.[] | select(.type == "unused export")] | length' "$ISSUES_JSON")
UNUSED_FILES=$(jq '[.[] | select(.type == "unused file")] | length' "$ISSUES_JSON")
UNUSED_DEPS=$(jq '[.[] | select(.type == "unused dependency" or .type == "unused devDependency")] | length' "$ISSUES_JSON")
OTHER=$((TOTAL_ISSUES - UNUSED_EXPORTS - UNUSED_FILES - UNUSED_DEPS))

# Build full report JSON
REPORT_JSON=$(jq -n \
  --arg timestamp "$TIMESTAMP" \
  --argjson totalIssues "$TOTAL_ISSUES" \
  --argjson tsPrune "$TS_PRUNE_TOTAL" \
  --argjson knip "$KNIP_TOTAL" \
  --argjson unusedExports "$UNUSED_EXPORTS" \
  --argjson unusedFiles "$UNUSED_FILES" \
  --argjson unusedDependencies "$UNUSED_DEPS" \
  --argjson other "$OTHER" \
  --slurpfile issues "$ISSUES_JSON" \
  '{
    timestamp: $timestamp,
    totalIssues: $totalIssues,
    byTool: {
      tsPrune: $tsPrune,
      knip: $knip
    },
    byType: (
      $issues[0] | group_by(.type) | map({key: .[0].type, value: length}) | from_entries
    ),
    issues: $issues[0],
    summary: {
      unusedExports: $unusedExports,
      unusedFiles: $unusedFiles,
      unusedDependencies: $unusedDependencies,
      other: $other
    }
  }')

# ============================================================================
# Output report
# ============================================================================
if [ "$JSON_OUTPUT" = true ]; then
    echo "$REPORT_JSON" | jq .
else
    # Pretty print report
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║       TypeScript Dead Code Detection Report              ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    echo "📅 Timestamp: $TIMESTAMP"
    echo "📊 Total Issues: $TOTAL_ISSUES"
    echo ""
    echo "┌─────────────────────────────────────────────────────────┐"
    echo "│ Summary by Category                                     │"
    echo "├─────────────────────────────────────────────────────────┤"
    printf "│ Unused Exports:       %4d │\n" "$UNUSED_EXPORTS"
    printf "│ Unused Files:         %4d │\n" "$UNUSED_FILES"
    printf "│ Unused Dependencies:  %4d │\n" "$UNUSED_DEPS"
    printf "│ Other:                %4d │\n" "$OTHER"
    echo "└─────────────────────────────────────────────────────────┘"
    echo ""
    echo "┌─────────────────────────────────────────────────────────┐"
    echo "│ Summary by Tool                                         │"
    echo "├─────────────────────────────────────────────────────────┤"
    printf "│ ts-prune:             %4d │\n" "$TS_PRUNE_TOTAL"
    printf "│ knip:                 %4d │\n" "$KNIP_TOTAL"
    echo "└─────────────────────────────────────────────────────────┘"
    echo ""

    if [ "$TOTAL_ISSUES" -gt 0 ]; then
        echo "┌─────────────────────────────────────────────────────────┐"
        echo "│ Issues Found                                            │"
        echo "└─────────────────────────────────────────────────────────┘"
        echo ""

        # Group and display by type
        for type in "unused export" "unused file" "unused dependency" "unused devDependency"; do
            count=$(jq -r "[.[] | select(.type == \"$type\")] | length" "$ISSUES_JSON")
            if [ "$count" -gt 0 ]; then
                type_upper=$(echo "$type" | tr '[:lower:]' '[:upper:]')
                echo ""
                echo "📍 $type_upper ($count):"
                echo "────────────────────────────────────────────────────────────"

                # Show first 20 issues without triggering pipefail on SIGPIPE
                jq -r --arg type "$type" 'map(select(.type == $type)) | .[:20][] | "  \(.location) - \(.name)"' "$ISSUES_JSON"

                if [ "$count" -gt 20 ]; then
                    echo "  ... and $((count - 20)) more"
                fi
            fi
        done
    fi

    echo ""
    echo ""
fi

# ============================================================================
# Save reports if output directory specified
# ============================================================================
if [ -n "$OUTPUT_DIR" ]; then
    mkdir -p "$OUTPUT_DIR"

    # Save JSON report
    JSON_PATH="$OUTPUT_DIR/dead-code-report.json"
    echo "$REPORT_JSON" | jq . > "$JSON_PATH"
    echo "📄 JSON report saved to: $JSON_PATH"

    # Generate and save Markdown report
    MD_PATH="$OUTPUT_DIR/dead-code-report.md"
    {
        echo "# TypeScript Dead Code Detection Report"
        echo ""
        echo "**Timestamp:** $TIMESTAMP"
        echo ""
        echo "**Total Issues:** $TOTAL_ISSUES"
        echo ""
        echo "## Summary by Category"
        echo ""
        echo "| Category | Count |"
        echo "|----------|-------|"
        echo "| Unused Exports | $UNUSED_EXPORTS |"
        echo "| Unused Files | $UNUSED_FILES |"
        echo "| Unused Dependencies | $UNUSED_DEPS |"
        echo "| Other | $OTHER |"
        echo ""
        echo "## Summary by Tool"
        echo ""
        echo "| Tool | Count |"
        echo "|------|-------|"
        echo "| ts-prune | $TS_PRUNE_TOTAL |"
        echo "| knip | $KNIP_TOTAL |"
        echo ""

        if [ "$TOTAL_ISSUES" -gt 0 ]; then
            echo "## Issues Found"
            echo ""

            for type in "unused export" "unused file" "unused dependency" "unused devDependency"; do
                count=$(jq -r "[.[] | select(.type == \"$type\")] | length" "$ISSUES_JSON")
                if [ "$count" -gt 0 ]; then
                    # Capitalize first letter
                    type_cap="$(tr '[:lower:]' '[:upper:]' <<< "${type:0:1}")${type:1}"
                    echo "### $type_cap ($count)"
                    echo ""
                    jq -r ".[] | select(.type == \"$type\") | \"- \`\(.location)\` - \(.name)\"" "$ISSUES_JSON"
                    echo ""
                fi
            done
        fi
    } > "$MD_PATH"
    echo "📄 Markdown report saved to: $MD_PATH"
fi

# ============================================================================
# Check threshold and exit
# ============================================================================
if [ -n "$THRESHOLD" ] && [ "$TOTAL_ISSUES" -gt "$THRESHOLD" ]; then
    echo ""
    echo "❌ Dead code threshold exceeded: $TOTAL_ISSUES > $THRESHOLD"
    exit 2
fi

if [ "$TOTAL_ISSUES" -eq 0 ]; then
    echo "✅ No dead code detected!"
    exit 0
elif [ -n "$THRESHOLD" ] && [ "$TOTAL_ISSUES" -le "$THRESHOLD" ]; then
    echo "✅ Found $TOTAL_ISSUES dead code issue(s), but within threshold of $THRESHOLD"
    exit 0
else
    echo "⚠️  Found $TOTAL_ISSUES dead code issue(s)"
    exit 2
fi
