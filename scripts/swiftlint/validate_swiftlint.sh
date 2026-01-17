#!/usr/bin/env bash

INSTALL_SWIFTLINT_WHEN_MISSING=${INSTALL_SWIFTLINT_WHEN_MISSING:-false}
ONLY_TOUCHED_FILES=${ONLY_TOUCHED_FILES:-false}
STRICT_MODE=${STRICT_MODE:-false}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

PROJECT_ROOT="$(pwd)"

# Check for required commands and install missing commands if allowed
echo -e "${YELLOW}Checking for required commands...${NC}"

# Check if swiftlint is installed
if ! command_exists swiftlint; then
    echo -e "${RED}swiftlint is not installed${NC}"
    if [[ "${INSTALL_SWIFTLINT_WHEN_MISSING}" == "true" ]]; then
        echo -e "${YELLOW}Installing swiftlint...${NC}"
        if [[ -f "$PROJECT_ROOT/scripts/swiftlint/install_swiftlint.sh" ]]; then
            if ! bash "$PROJECT_ROOT/scripts/swiftlint/install_swiftlint.sh"; then
                echo -e "${RED}Failed to install swiftlint${NC}"
                exit 1
            fi
        else
            echo -e "${RED}swiftlint installation script not found${NC}"
            exit 1
        fi
    else
        echo -e "${RED}swiftlint is required. Set INSTALL_SWIFTLINT_WHEN_MISSING=true to auto-install or install manually${NC}"
        exit 1
    fi
fi

# Verify swiftlint is available
if ! command_exists swiftlint; then
    echo -e "${RED}swiftlint is still not available after installation attempt${NC}"
    exit 1
fi

echo -e "${GREEN}swiftlint is available ($(swiftlint version))${NC}"

# Check for other required commands
for cmd in find git; do
    if ! command_exists "$cmd"; then
        echo -e "${RED}Required command '$cmd' is not available${NC}"
        exit 1
    fi
done

# Start the timer
start_time=$(date +%s)

echo -e "${YELLOW}Starting SwiftLint validation...${NC}"

# Function to find all Swift files in ios directory
find_all_swift_files() {
    find "$PROJECT_ROOT/ios" -type f -name "*.swift" \
        -not -path "*/build/*" \
        -not -path "*/.build/*" \
        -not -path "*/DerivedData/*" \
        -not -path "*/Pods/*" \
        -not -path "*/Carthage/*" \
        -not -path "*/.swiftpm/*" \
        -not -path "*/xcuserdata/*" \
        2>/dev/null | sort | uniq
}

# Function to get touched/staged files
get_touched_files() {
    {
        # Get staged files
        git diff --cached --name-only --diff-filter=ACMR | while read -r file; do
            if [[ "$file" =~ ^ios/.*\.swift$ ]] && [[ -f "$PROJECT_ROOT/$file" ]]; then
                echo "$PROJECT_ROOT/$file"
            fi
        done

        # Get modified but not staged files
        git diff --name-only --diff-filter=ACMR | while read -r file; do
            if [[ "$file" =~ ^ios/.*\.swift$ ]] && [[ -f "$PROJECT_ROOT/$file" ]]; then
                echo "$PROJECT_ROOT/$file"
            fi
        done
    } | sort | uniq
}

# Determine which files to process
declare -a files_to_process

if [[ "${ONLY_TOUCHED_FILES}" == "true" ]]; then
    echo -e "${YELLOW}Processing only touched/staged files${NC}"
    while IFS= read -r file; do
        [[ -n "$file" ]] && files_to_process+=("$file")
    done < <(get_touched_files)

else
    echo -e "${YELLOW}Processing all Swift files in ios/ directory${NC}"
    while IFS= read -r file; do
        [[ -n "$file" ]] && files_to_process+=("$file")
    done < <(find_all_swift_files)
fi

# Check if we have files to process
if [[ ${#files_to_process[@]} -eq 0 ]]; then
    echo -e "${GREEN}No Swift files to process${NC}"
    end_time=$(date +%s)
    total_elapsed=$((end_time - start_time))
    echo "Total time elapsed: ${total_elapsed}s"
    exit 0
fi

echo -e "${YELLOW}Found ${#files_to_process[@]} Swift file(s) to lint${NC}"

# Build swiftlint command
swiftlint_cmd="swiftlint lint"

if [[ "${STRICT_MODE}" == "true" ]]; then
    swiftlint_cmd="$swiftlint_cmd --strict"
fi

# Check if config file exists
if [[ -f "$PROJECT_ROOT/.swiftlint.yml" ]]; then
    swiftlint_cmd="$swiftlint_cmd --config $PROJECT_ROOT/.swiftlint.yml"
fi

# Run swiftlint
echo -e "${YELLOW}Running swiftlint...${NC}"

# Create temporary file for storing file list
temp_file=$(mktemp)
trap 'rm -f "$temp_file"' EXIT

# Write files to temporary file
printf '%s\n' "${files_to_process[@]}" > "$temp_file"

# Run swiftlint on each file and collect output
lint_output=""
warning_count=0
error_count=0

while IFS= read -r file; do
    if [[ -f "$file" ]]; then
        file_output=$($swiftlint_cmd "$file" 2>&1)

        if [[ -n "$file_output" ]]; then
            lint_output="${lint_output}${file_output}\n"

            # Count warnings and errors
            file_warnings=$(echo "$file_output" | grep -c "warning:" || true)
            file_errors=$(echo "$file_output" | grep -c "error:" || true)
            ((warning_count += file_warnings))
            ((error_count += file_errors))
        fi

    fi
done < "$temp_file"

# Calculate total elapsed time
end_time=$(date +%s)
total_elapsed=$((end_time - start_time))

# Report results
echo ""
echo -e "${YELLOW}SwiftLint Results:${NC}"
echo -e "  Warnings: $warning_count"
echo -e "  Errors: $error_count"
echo ""

if [[ -n "$lint_output" ]]; then
    echo -e "${YELLOW}Details:${NC}"
    echo -e "$lint_output"
fi

# Check and report errors
if [[ $error_count -gt 0 ]]; then
    echo -e "${RED}SwiftLint found $error_count error(s).${NC}"
    echo -e "${YELLOW}To auto-fix some issues, run:${NC}"
    echo "  ./scripts/swiftlint/apply_swiftlint.sh"
    echo ""
    echo -e "${RED}Total time elapsed: ${total_elapsed}s${NC}"
    exit 1
fi

if [[ "${STRICT_MODE}" == "true" ]] && [[ $warning_count -gt 0 ]]; then
    echo -e "${RED}SwiftLint found $warning_count warning(s) in strict mode.${NC}"
    echo -e "${RED}Total time elapsed: ${total_elapsed}s${NC}"
    exit 1
fi

echo -e "${GREEN}SwiftLint validation passed.${NC}"
echo "Total time elapsed: ${total_elapsed}s"
exit 0
