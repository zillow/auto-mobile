#!/bin/bash

# Since AutoMobile completely replaces mobile UI tests, here is a handy cleanup script to run once you've finished migrating.

set -euo pipefail

# Default to dry run mode

DRY_RUN=true

echo "🧹 Cleaning up androidTest sources and dependencies..."

# Function to find build.gradle files

find_build_files() {
if command -v rg &> /dev/null; then
echo "Using ripgrep to find build files..."
rg -l --type gradle "build\.gradle" . 2>/dev/null || true
rg -l --glob "*.gradle.kts" "build\.gradle\.kts" . 2>/dev/null || true
else
echo "Using find to locate build files..."
echo "💡 Tip: Install ripgrep (rg) for faster file discovery: https://github.com/BurntSushi/ripgrep"
find . -name "build.gradle" -o -name "build.gradle.kts" 2>/dev/null | grep -v ".gradle/cache" || true
fi
}

# Function to find module directories

find_module_dirs() {
find_build_files | while read -r build_file; do
dirname "$build_file"
done | sort -u
}

# Function to remove androidTest directories

remove_android_test_dirs() {
echo "🗂️ ${DRY_RUN:+[DRY RUN] }Removing androidTest source directories..."
find_module_dirs | while read -r module_dir; do
android_test_dirs=$(find "$module_dir" -path "*/src/androidTest" -type d 2>/dev/null || true)
if [[ -n "$android_test_dirs" ]]; then
if [[ "$DRY_RUN" == "true" ]]; then
echo "  Would remove androidTest from: $module_dir"
echo "${android_test_dirs// /$'\n '}"
else
echo "$android_test_dirs" | xargs -r rm -rf
echo "  Removed androidTest from: $module_dir"
fi
fi
done
}

# Function to clean build.gradle files

clean_build_files() {
echo "📝 ${DRY_RUN:+[DRY RUN] }Removing androidTestImplementation dependencies..."
find_build_files | while read -r build_file; do
if [[ -f "$build_file" ]]; then

# Check what would be changed

temp_file=$(mktemp)
cp "$build_file" "$temp_file"

            # Remove androidTestImplementation lines (including multiline dependencies)
            sed -i.tmp '
                /^[[:space:]]*androidTestImplementation/d
                /^[[:space:]]*androidTestApi/d
                /^[[:space:]]*androidTestCompileOnly/d
                /^[[:space:]]*androidTestRuntimeOnly/d
            ' "$temp_file"

            # Clean up any empty dependency blocks that might be left
            sed -i.tmp '/^[[:space:]]*dependencies[[:space:]]*{[[:space:]]*$/N;/^[[:space:]]*dependencies[[:space:]]*{[[:space:]]*\n[[:space:]]*}[[:space:]]*$/d' "$temp_file"

            rm -f "$temp_file.tmp"

            if ! cmp -s "$build_file" "$temp_file"; then
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  Would update: $build_file"
                    echo "    Lines to be removed:"
                    grep -n "androidTest.*Implementation\|androidTest.*Api\|androidTest.*CompileOnly\|androidTest.*RuntimeOnly" "$build_file" | sed 's/^/      /' || true
                else
                    cp "$temp_file" "$build_file"
                    echo "  Updated: $build_file"
                fi
            fi

            rm -f "$temp_file"
        fi
    done
}

# Main execution

main() {
if [[ ! -f "settings.gradle" ]] && [[ ! -f "settings.gradle.kts" ]]; then
echo "❌ Error: Not in an Android Gradle project root (no settings.gradle found)"
exit 1
fi

    echo "📍 Working in: $(pwd)"

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "🔍 DRY RUN MODE: No files will be modified"
        echo "   Use --execute to actually perform the cleanup"
        echo ""
    fi

    remove_android_test_dirs
    clean_build_files

    if [[ "$DRY_RUN" == "true" ]]; then
        echo ""
        echo "✅ Dry run complete!"
        echo "💡 Run with --execute to actually perform these changes"
    else
        echo "✅ Cleanup complete!"
        echo "🔍 You may want to review changes before committing"
    fi
}

# Parse command line arguments

while [[ $# -gt 0 ]]; do
case $1 in
--execute)
DRY_RUN=false
shift
;;
--dry-run)
DRY_RUN=true
shift
;;
--help|-h)
cat << EOF
Android Test Cleanup Script

This script removes androidTest directories and dependencies from an Android Gradle project.

Usage: $0 [OPTIONS]

Options:
--execute Actually perform the cleanup (default is dry run)
--dry-run Show what would be done without making changes (default)
--help, -h Show this help message

What it does:
- Removes all src/androidTest directories
- Removes androidTestImplementation/Api/CompileOnly/RuntimeOnly dependencies from build files
- Must be run from Android Gradle project root (contains settings.gradle)
- Optional: ripgrep for faster file discovery

Examples:
$0 # Dry run (shows what would be changed)
$0 --execute # Actually perform the cleanup
$0 --dry-run # Explicit dry run mode

EOF
exit 0
;;
*)
echo "Unknown option: $1"
echo "Use --help for usage information"
exit 1
;;
esac
done

main "$@"
