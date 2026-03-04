#!/usr/bin/env bash
#
# validate_lychee.sh
#
# Validates all links in documentation files using lychee link checker.
# Checks both internal and external links for broken references.
#
# Exit codes:
#   0 - All links are valid
#   1 - lychee not installed or configuration error
#   2 - Broken links found
#
# Usage:
#   ./scripts/lychee/validate_lychee.sh [--verbose]
#
# Options:
#   --verbose    Show detailed output including excluded and unsupported links
#
set -euo pipefail

# Parse arguments
VERBOSE_FLAG=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose|-v)
            VERBOSE_FLAG="-vv"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--verbose]"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LYCHEE_CONFIG="$PROJECT_ROOT/.lycherc.toml"

print_status "Validating documentation links with lychee..."

# Check if lychee is installed
if ! command -v lychee >/dev/null 2>&1; then
    print_error "lychee is not installed"
    echo ""
    echo "To install lychee, run:"
    echo "  ./scripts/lychee/install_lychee.sh"
    echo ""
    echo "Or install manually:"
    echo "  - macOS:   brew install lychee"
    echo "  - Linux:   cargo install lychee"
    echo "  - Other:   See https://github.com/lycheeverse/lychee"
    exit 1
fi

# Show lychee version
LYCHEE_VERSION=$(lychee --version | head -1)
print_status "Using $LYCHEE_VERSION"

# Check if config file exists
if [[ ! -f "$LYCHEE_CONFIG" ]]; then
    print_warning "Lychee config not found at: $LYCHEE_CONFIG"
    print_warning "Running with default configuration..."
fi

# Run lychee on docs directory and root markdown files
print_status "Checking links in docs/ and root *.md files..."
print_status ""

cd "$PROJECT_ROOT"

# Function to suggest similar files for broken file:// links
suggest_similar_files() {
    local broken_path="$1"
    local basename_file
    basename_file=$(basename "$broken_path")

    local found_suggestions=false

    # First, check git history for renamed/moved files
    if git rev-parse --git-dir > /dev/null 2>&1; then
        # Look for files that were moved or renamed
        local git_suggestions
        git_suggestions=$(git log --follow --all --diff-filter=R --find-renames --name-status --pretty="" -- "*${basename_file}" 2>/dev/null | \
            grep -E "^R" | \
            awk '{print $3}' | \
            head -3)

        if [[ -n "$git_suggestions" ]]; then
            echo "      File was moved (from git history):"
            echo "$git_suggestions" | while IFS= read -r match; do
                if [[ -f "$match" ]]; then
                    echo "        - $match"
                    found_suggestions=true
                fi
            done
        fi
    fi

    # Search for files with similar names in current tree (docs/ and root *.md)
    local suggestions
    suggestions=$(find docs/ -type f -name "*${basename_file}*" 2>/dev/null | head -5)
    local root_suggestions
    root_suggestions=$(find . -maxdepth 1 -type f -name "*${basename_file}*" 2>/dev/null | head -3)
    suggestions="${suggestions}${root_suggestions:+$'\n'$root_suggestions}"

    if [[ -n "$suggestions" ]]; then
        if [[ "$found_suggestions" == false ]]; then
            echo "      Possible matches:"
        else
            echo "      Other possible matches:"
        fi
        echo "$suggestions" | while IFS= read -r match; do
            echo "        - $match"
        done
        found_suggestions=true
    fi

    # If still no suggestions, check if file was deleted
    if [[ "$found_suggestions" == false ]] && git rev-parse --git-dir > /dev/null 2>&1; then
        local deleted_info
        deleted_info=$(git log --all --diff-filter=D --summary -- "*${basename_file}" 2>/dev/null | grep "delete mode" | head -1)

        if [[ -n "$deleted_info" ]]; then
            echo "      File was deleted in git history (no current replacement found)"
        fi
    fi
}

# Run lychee and capture output
LYCHEE_OUTPUT=$(mktemp)
LYCHEE_ERRORS=$(mktemp)

# Run lychee with config (if exists) or default settings
if [[ -f "$LYCHEE_CONFIG" ]]; then
    if lychee --config "$LYCHEE_CONFIG" $VERBOSE_FLAG "docs/" ./*.md 2>&1 | tee "$LYCHEE_OUTPUT"; then
        rm -f "$LYCHEE_OUTPUT" "$LYCHEE_ERRORS"
        print_status "✓ All links are valid"
        exit 0
    else
        EXIT_CODE=$?
        if [[ $EXIT_CODE -eq 2 ]]; then
            # Extract broken file:// links and provide suggestions
            grep -E "\[ERROR\].*file://" "$LYCHEE_OUTPUT" | grep "Cannot find file" > "$LYCHEE_ERRORS" || true

            if [[ -s "$LYCHEE_ERRORS" ]]; then
                echo ""
                print_warning "Suggestions for broken file:// links:"
                echo ""
                while IFS= read -r error_line; do
                    # Extract the file path from the error
                    if [[ "$error_line" =~ file://([^[:space:]|]+) ]]; then
                        broken_path="${BASH_REMATCH[1]}"
                        echo "  ✗ $broken_path"
                        suggest_similar_files "$broken_path"
                        echo ""
                    fi
                done < "$LYCHEE_ERRORS"
            fi

            rm -f "$LYCHEE_OUTPUT" "$LYCHEE_ERRORS"
            print_error "✗ Broken links found"
            echo ""
            echo "To fix broken links:"
            echo "  1. Update the links to point to valid URLs"
            echo "  2. Remove dead links from documentation"
            echo "  3. Add exclusions to .lycherc.toml if links are intentionally unreachable"
            exit 2
        else
            rm -f "$LYCHEE_OUTPUT" "$LYCHEE_ERRORS"
            print_error "✗ Lychee failed with exit code $EXIT_CODE"
            exit 1
        fi
    fi
else
    # Run with minimal default options
    if lychee --max-concurrency 10 --timeout 20 $VERBOSE_FLAG "docs/" ./*.md 2>&1 | tee "$LYCHEE_OUTPUT"; then
        rm -f "$LYCHEE_OUTPUT" "$LYCHEE_ERRORS"
        print_status "✓ All links are valid"
        exit 0
    else
        EXIT_CODE=$?
        if [[ $EXIT_CODE -eq 2 ]]; then
            # Extract broken file:// links and provide suggestions
            grep -E "\[ERROR\].*file://" "$LYCHEE_OUTPUT" | grep "Cannot find file" > "$LYCHEE_ERRORS" || true

            if [[ -s "$LYCHEE_ERRORS" ]]; then
                echo ""
                print_warning "Suggestions for broken file:// links:"
                echo ""
                while IFS= read -r error_line; do
                    # Extract the file path from the error
                    if [[ "$error_line" =~ file://([^[:space:]|]+) ]]; then
                        broken_path="${BASH_REMATCH[1]}"
                        echo "  ✗ $broken_path"
                        suggest_similar_files "$broken_path"
                        echo ""
                    fi
                done < "$LYCHEE_ERRORS"
            fi

            rm -f "$LYCHEE_OUTPUT" "$LYCHEE_ERRORS"
            print_error "✗ Broken links found"
            exit 2
        else
            rm -f "$LYCHEE_OUTPUT" "$LYCHEE_ERRORS"
            print_error "✗ Lychee failed with exit code $EXIT_CODE"
            exit 1
        fi
    fi
fi
