#!/usr/bin/env bash
#
# apply_lychee.sh
#
# automobile: links in documentation by applying suggestions
# from lychee link checker. Uses sed to replace broken links with corrected paths.
#
# This script focuses on fixing relative path issues by calculating the correct
# relative path from each source file to the target file.
#
# Exit codes:
#   0 - All fixes applied successfully or no fixes needed
#   1 - Error running lychee or applying fixes
#
# Usage:
#   ./scripts/lychee/apply_lychee.sh [--dry-run]
#
# Options:
#   --dry-run    Show what would be fixed without making changes
#
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--dry-run]"
            exit 1
            ;;
    esac
done

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_fix() {
    echo -e "${BLUE}[FIX]${NC} $1"
}

# Function to calculate relative path from source to target
relpath() {
    python3 -c "import os.path; print(os.path.relpath('$1', '${2:-.}'))" 2>/dev/null
}

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ "$DRY_RUN" == true ]]; then
    print_status "Running in DRY RUN mode - no files will be modified"
else
    print_status "Applying lychee link fixes..."
fi
print_status ""

cd "$PROJECT_ROOT"

# Check if lychee is installed
if ! command -v lychee >/dev/null 2>&1; then
    print_error "lychee is not installed"
    exit 1
fi

# Run validation script to get suggestions
VALIDATION_OUTPUT=$(mktemp)
./scripts/lychee/validate_lychee.sh > "$VALIDATION_OUTPUT" 2>&1 || true

# Parse validation output to extract broken links and suggestions
FIXES_APPLIED=0
CURRENT_BROKEN_PATH=""
CURRENT_SOURCE_FILE=""
IN_GIT_HISTORY_SECTION=false

while IFS= read -r line; do
    # Detect source file from error messages like: [docs/install/ai-agents/cursor.md]:
    if [[ "$line" =~ ^\[docs/([^\]]+)\]: ]]; then
        CURRENT_SOURCE_FILE="docs/${BASH_REMATCH[1]}"
    fi

    # Detect broken path from suggestions like: ✗ /Users/.../docs/install/img/cursor-mcp-server-success.png
    if [[ "$line" =~ ✗\ (.+/docs/.+) ]]; then
        CURRENT_BROKEN_PATH="${BASH_REMATCH[1]}"
        # Strip the PROJECT_ROOT prefix
        CURRENT_BROKEN_PATH="${CURRENT_BROKEN_PATH#"$PROJECT_ROOT"/}"
        IN_GIT_HISTORY_SECTION=false
    fi

    # Check if we're entering git history section (prioritize these suggestions)
    if [[ "$line" =~ File\ was\ moved\ \(from\ git\ history\): ]]; then
        IN_GIT_HISTORY_SECTION=true
        continue
    fi

    # Check if we're leaving git history section
    if [[ "$IN_GIT_HISTORY_SECTION" == true ]] && [[ "$line" =~ Possible\ matches: || "$line" =~ Other\ possible\ matches: ]]; then
        IN_GIT_HISTORY_SECTION=false
    fi

    # Detect suggestion like: - docs/img/cursor-mcp-server-success.png
    if [[ "$line" =~ ^[[:space:]]*-[[:space:]]+(docs/.+) ]]; then
        SUGGESTION="${BASH_REMATCH[1]}"

        if [[ -n "$CURRENT_BROKEN_PATH" && -n "$CURRENT_SOURCE_FILE" && -f "$SUGGESTION" ]]; then
            # Calculate the correct relative path
            SOURCE_DIR=$(dirname "$CURRENT_SOURCE_FILE")
            NEW_RELATIVE_PATH=$(relpath "$SUGGESTION" "$SOURCE_DIR")

            # Find the basename to search for in the source file
            BASENAME=$(basename "$CURRENT_BROKEN_PATH")

            # Find the line containing this basename in the source file
            if grep -q "$BASENAME" "$CURRENT_SOURCE_FILE" 2>/dev/null; then
                # Extract the old relative path from the source file
                OLD_RELATIVE_PATH=$(grep -o "[^(\"']*${BASENAME}[^)\"']*" "$CURRENT_SOURCE_FILE" | head -1)

                if [[ -n "$OLD_RELATIVE_PATH" && "$OLD_RELATIVE_PATH" != "$NEW_RELATIVE_PATH" ]]; then
                    # Indicate if this is from git history
                    if [[ "$IN_GIT_HISTORY_SECTION" == true ]]; then
                        print_fix "$CURRENT_SOURCE_FILE (git history)"
                    else
                        print_fix "$CURRENT_SOURCE_FILE"
                    fi
                    echo "  Old: $OLD_RELATIVE_PATH"
                    echo "  New: $NEW_RELATIVE_PATH"
                    echo ""

                    if [[ "$DRY_RUN" == false ]]; then
                        # Use sed to replace the old path with the new one
                        # Escape special characters for sed
                        OLD_ESCAPED=$(printf '%s\n' "$OLD_RELATIVE_PATH" | sed 's:[][\/.^$*]:\\&:g')
                        NEW_ESCAPED=$(printf '%s\n' "$NEW_RELATIVE_PATH" | sed 's:[\/&]:\\&:g')

                        sed -i.bak "s|$OLD_ESCAPED|$NEW_ESCAPED|g" "$CURRENT_SOURCE_FILE"
                        rm -f "$CURRENT_SOURCE_FILE.bak"
                        FIXES_APPLIED=$((FIXES_APPLIED + 1))
                    fi

                    # If we found a git history match, skip other suggestions for this broken path
                    if [[ "$IN_GIT_HISTORY_SECTION" == true ]]; then
                        CURRENT_BROKEN_PATH=""
                    fi
                fi
            fi
        fi
    fi
done < "$VALIDATION_OUTPUT"

rm -f "$VALIDATION_OUTPUT"

# Summary
echo ""
if [[ "$DRY_RUN" == true ]]; then
    print_status "Dry run complete - no changes were made"
else
    if [[ $FIXES_APPLIED -eq 0 ]]; then
        print_status "No fixes were applied (either no broken links or couldn't find matching paths)"
    else
        print_status "Applied $FIXES_APPLIED fix(es)"
        echo ""
        print_status "Run './scripts/lychee/validate_lychee.sh' to verify the fixes"
    fi
fi

exit 0
