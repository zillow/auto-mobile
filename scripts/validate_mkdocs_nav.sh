#!/usr/bin/env bash
#
# validate_mkdocs_nav.sh
#
# Validates that all documentation files in docs/ are properly linked in mkdocs.yml
# and that all files referenced in mkdocs.yml actually exist.
#
# This script accounts for files that are copied during deployment by
# scripts/github/deploy_pages.py (CHANGELOG.md and .github/CONTRIBUTING.md).
#
# Exit codes:
#   0 - All documentation files are properly linked
#   1 - Found orphaned files (exist but not linked) or missing files (linked but don't exist)
#
# Usage:
#   ./scripts/validate_mkdocs_nav.sh
#
# This script can be run in CI to ensure published documentation stays in sync.
#
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MKDOCS_YML="$PROJECT_ROOT/mkdocs.yml"
DOCS_DIR="$PROJECT_ROOT/docs"

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required files exist
if [[ ! -f "$MKDOCS_YML" ]]; then
    print_error "mkdocs.yml not found at: $MKDOCS_YML"
    exit 1
fi

if [[ ! -d "$DOCS_DIR" ]]; then
    print_error "docs directory not found at: $DOCS_DIR"
    exit 1
fi

print_status "Validating MkDocs navigation configuration..."
print_status "Project root: $PROJECT_ROOT"
print_status ""

# Extract all .md file references from mkdocs.yml
# This regex matches patterns like: 'file.md' or "file.md" after colons in the nav section
extract_nav_files() {
    # Find the nav section and extract all .md references
    # We look for lines with .md after a colon, handling both single and double quotes
    awk '/^nav:$/,0' "$MKDOCS_YML" | \
        grep -oE "['\"]?[a-zA-Z0-9/_-]+\.md['\"]?" | \
        tr -d "'" | \
        tr -d '"' | \
        sort | \
        uniq
}

# List all .md files in docs/ directory relative to docs/
list_actual_files() {
    find "$DOCS_DIR" -type f -name "*.md" -not -path "*/\.*" | \
        sed "s|^$DOCS_DIR/||" | \
        sort
}

# Files that are copied by copy_required_files() in deploy_pages.py
# These exist in mkdocs.yml but are copied from other locations at build time
get_copied_files() {
    cat <<EOF
changelog.md
contributing/index.md
EOF
}

# Files that should be excluded from validation (internal/AI docs not meant for publishing)
get_excluded_files() {
    cat <<EOF
ai/validation.md
ai/vision-fallback-design.md
ai/vision-model-research.md
origin.md
contributing/overview.md
design-docs/mcp/system-design.md
design-docs/mcp/vision-fallback.md
design-docs/plat/android/docker.md
using/perf-analysis.md
EOF
}

# Extract referenced files from mkdocs.yml
print_status "Extracting file references from mkdocs.yml..."
REFERENCED_FILES=$(mktemp)
extract_nav_files > "$REFERENCED_FILES"
REFERENCED_COUNT=$(wc -l < "$REFERENCED_FILES" | tr -d ' ')
print_status "Found $REFERENCED_COUNT files referenced in mkdocs.yml"

# List actual files in docs/
print_status "Listing actual files in docs/ directory..."
ACTUAL_FILES=$(mktemp)
list_actual_files > "$ACTUAL_FILES"
ACTUAL_COUNT=$(wc -l < "$ACTUAL_FILES" | tr -d ' ')
print_status "Found $ACTUAL_COUNT markdown files in docs/"

# Get copied and excluded files
COPIED_FILES=$(mktemp)
get_copied_files > "$COPIED_FILES"

EXCLUDED_FILES=$(mktemp)
get_excluded_files > "$EXCLUDED_FILES"

# Check for missing files (referenced in mkdocs.yml but don't exist in docs/)
# Exclude files that are copied at build time
print_status ""
print_status "Checking for missing files..."
MISSING_FILES=$(mktemp)
while IFS= read -r file; do
    # Skip if this file is copied at build time
    if grep -Fxq "$file" "$COPIED_FILES"; then
        continue
    fi

    # Check if file exists
    if [[ ! -f "$DOCS_DIR/$file" ]]; then
        echo "$file" >> "$MISSING_FILES"
    fi
done < "$REFERENCED_FILES"

# Check for orphaned files (exist in docs/ but not referenced in mkdocs.yml)
# Exclude copied and excluded files
print_status "Checking for orphaned files..."
ORPHANED_FILES=$(mktemp)
while IFS= read -r file; do
    # Skip if this file is in the excluded list
    if grep -Fxq "$file" "$EXCLUDED_FILES"; then
        continue
    fi

    # Skip if this file is copied (these shouldn't be in git)
    if grep -Fxq "$file" "$COPIED_FILES"; then
        continue
    fi

    # Check if file is referenced in mkdocs.yml
    if ! grep -Fxq "$file" "$REFERENCED_FILES"; then
        echo "$file" >> "$ORPHANED_FILES"
    fi
done < "$ACTUAL_FILES"

# Report results
HAS_ERRORS=0

if [[ -s "$MISSING_FILES" ]]; then
    print_error "Files referenced in mkdocs.yml but missing from docs/:"
    while IFS= read -r file; do
        echo "  - $file"
    done < "$MISSING_FILES"
    echo ""
    HAS_ERRORS=1
fi

if [[ -s "$ORPHANED_FILES" ]]; then
    print_warning "Files in docs/ but not referenced in mkdocs.yml:"
    while IFS= read -r file; do
        echo "  - $file"
    done < "$ORPHANED_FILES"
    echo ""
    HAS_ERRORS=1
fi

# Check for duplicate entries in mkdocs.yml
print_status "Checking for duplicate entries in mkdocs.yml..."
DUPLICATES=$(mktemp)
extract_nav_files | sort | uniq -d > "$DUPLICATES"
if [[ -s "$DUPLICATES" ]]; then
    print_warning "Duplicate entries found in mkdocs.yml:"
    while IFS= read -r file; do
        echo "  - $file"
    done < "$DUPLICATES"
    echo ""
    HAS_ERRORS=1
fi

# Check for files containing TODO markers
print_status "Checking for TODO markers in documentation..."
TODO_FILES=$(mktemp)
while IFS= read -r file; do
    # Skip excluded files
    if grep -Fxq "$file" "$EXCLUDED_FILES"; then
        continue
    fi

    # Check if file contains TODO (case insensitive, but exclude lychee.toml exclude patterns)
    if [[ -f "$DOCS_DIR/$file" ]] && grep -i "TODO" "$DOCS_DIR/$file" >/dev/null 2>&1; then
        echo "$file" >> "$TODO_FILES"
    fi
done < "$ACTUAL_FILES"

if [[ -s "$TODO_FILES" ]]; then
    print_warning "Files containing TODO markers:"
    while IFS= read -r file; do
        # Show the TODO lines
        echo "  - $file"
        grep -in "TODO" "$DOCS_DIR/$file" | head -3 | sed 's/^/      /'
    done < "$TODO_FILES"
    echo ""
    HAS_ERRORS=1
fi

# Check for empty or whitespace-only files
print_status "Checking for empty or whitespace-only files..."
EMPTY_FILES=$(mktemp)
while IFS= read -r file; do
    # Skip excluded files
    if grep -Fxq "$file" "$EXCLUDED_FILES"; then
        continue
    fi

    # Check if file exists and is empty or contains only whitespace
    if [[ -f "$DOCS_DIR/$file" ]]; then
        # Remove all whitespace and check if anything remains
        if [[ -z $(tr -d '[:space:]' < "$DOCS_DIR/$file") ]]; then
            echo "$file" >> "$EMPTY_FILES"
        fi
    fi
done < "$ACTUAL_FILES"

if [[ -s "$EMPTY_FILES" ]]; then
    print_warning "Empty or whitespace-only files found:"
    while IFS= read -r file; do
        echo "  - $file"
    done < "$EMPTY_FILES"
    echo ""
    HAS_ERRORS=1
fi

# Clean up temp files
rm -f "$REFERENCED_FILES" "$ACTUAL_FILES" "$COPIED_FILES" "$EXCLUDED_FILES" \
      "$MISSING_FILES" "$ORPHANED_FILES" "$DUPLICATES" "$TODO_FILES" "$EMPTY_FILES"

# Final status
if [[ $HAS_ERRORS -eq 0 ]]; then
    print_status "✓ All documentation files are properly linked in mkdocs.yml"
    exit 0
else
    print_error "✗ Documentation validation failed"
    echo ""
    echo "To fix orphaned files:"
    echo "  1. Add them to mkdocs.yml navigation"
    echo "  2. Move them to the excluded list if they're internal docs"
    echo "  3. Delete them if they're no longer needed"
    echo ""
    echo "To fix missing files:"
    echo "  1. Create the missing files"
    echo "  2. Remove the references from mkdocs.yml if no longer needed"
    echo ""
    echo "To fix TODO markers:"
    echo "  1. Complete the TODO items and remove the markers"
    echo "  2. Move files with TODOs to the excluded list if they're internal docs"
    echo ""
    echo "To fix empty files:"
    echo "  1. Add content to the files"
    echo "  2. Delete the files if they're no longer needed"
    exit 1
fi
