#!/usr/bin/env bash

INSTALL_KTFMT_WHEN_MISSING=${INSTALL_KTFMT_WHEN_MISSING:-false}
ONLY_TOUCHED_FILES=${ONLY_TOUCHED_FILES:-true}
ONLY_CHANGED_SINCE_SHA=${ONLY_CHANGED_SINCE_SHA:-""}

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

# Check if ktfmt is installed
if ! command_exists ktfmt; then
    echo -e "${RED}ktfmt is not installed${NC}"
    if [[ "${INSTALL_KTFMT_WHEN_MISSING}" == "true" ]]; then
        echo -e "${YELLOW}Installing ktfmt...${NC}"
        if [[ -f "$PROJECT_ROOT/scripts/ktfmt/install_ktfmt.sh" ]]; then
            if ! bash "$PROJECT_ROOT/scripts/ktfmt/install_ktfmt.sh"; then
                echo -e "${RED}Failed to install ktfmt${NC}"
                exit 1
            fi
        else
            echo -e "${RED}ktfmt installation script not found${NC}"
            exit 1
        fi
    else
        echo -e "${RED}ktfmt is required. Set INSTALL_KTFMT_WHEN_MISSING=true to auto-install or install manually${NC}"
        exit 1
    fi
fi

# Verify ktfmt is available
if ! command_exists ktfmt; then
    echo -e "${RED}ktfmt is still not available after installation attempt${NC}"
    exit 1
fi

echo -e "${GREEN}ktfmt is available${NC}"

# Check for other required commands
for cmd in find xargs git; do
    if ! command_exists "$cmd"; then
        echo -e "${RED}Required command '$cmd' is not available${NC}"
        exit 1
    fi
done

# Start the timer
if [[ -f "$PROJECT_ROOT/scripts/utils/get_timestamp.sh" ]]; then
    start_time=$(bash "$PROJECT_ROOT/scripts/utils/get_timestamp.sh")
else
    start_time=$(date +%s)000  # Fallback to seconds * 1000
fi

echo -e "${YELLOW}Starting ktfmt validation...${NC}"

# Function to find all Kotlin files
find_all_kotlin_files() {
    find "$PROJECT_ROOT" -type f '(' -name "*.kt" -o -name "*.kts" ')' \
        -not -path "*/build/*" \
        -not -path "*/.*" \
        -not -path "*/node_modules/*" \
        -not -path "*/target/*" \
        -not -path "*/out/*" \
        -not -path "*/dist/*" \
        -not -path "*/.gradle/*" \
        | sort | uniq
}

# Function to get changed files since SHA
get_changed_files_since_sha() {
    local sha="$1"

    # Verify SHA exists
    if ! git rev-parse --verify "$sha" >/dev/null 2>&1; then
        echo -e "${RED}SHA '$sha' does not exist in the repository${NC}"
        exit 1
    fi

    # Get list of changed files since SHA
    git diff --name-only "$sha"...HEAD | while read -r file; do
        if [[ "$file" =~ ^.*\.(kt|kts)$ ]] && [[ -f "$PROJECT_ROOT/$file" ]]; then
            echo "$PROJECT_ROOT/$file"
        fi
    done | sort | uniq
}

# Function to get touched/staged files
get_touched_files() {
    {
        # Get staged files
        git diff --cached --name-only --diff-filter=ACMR | while read -r file; do
            if [[ "$file" =~ ^.*\.(kt|kts)$ ]] && [[ -f "$PROJECT_ROOT/$file" ]]; then
                echo "$PROJECT_ROOT/$file"
            fi
        done

        # Get modified but not staged files
        git diff --name-only --diff-filter=ACMR | while read -r file; do
            if [[ "$file" =~ ^.*\.(kt|kts)$ ]] && [[ -f "$PROJECT_ROOT/$file" ]]; then
                echo "$PROJECT_ROOT/$file"
            fi
        done
    } | sort | uniq
}

# Determine which files to process
declare -a files_to_process
errors=""

if [[ -n "$ONLY_CHANGED_SINCE_SHA" ]]; then
    echo -e "${YELLOW}Processing files changed since SHA: $ONLY_CHANGED_SINCE_SHA${NC}"

    # Get list of changed files since SHA
    mapfile -t changed_files < <(get_changed_files_since_sha "$ONLY_CHANGED_SINCE_SHA")
    files_to_process=("${changed_files[@]}")

elif [[ "${ONLY_TOUCHED_FILES}" == "true" ]]; then
    echo -e "${YELLOW}Processing only touched/staged files${NC}"

    # Get list of touched files
    mapfile -t touched_files < <(get_touched_files)
    files_to_process=("${touched_files[@]}")

else
    echo -e "${YELLOW}Processing all Kotlin files in the project${NC}"

    # Get all Kotlin files
    mapfile -t all_files < <(find_all_kotlin_files)
    files_to_process=("${all_files[@]}")
fi

# Check if we have files to process
if [[ ${#files_to_process[@]} -eq 0 ]]; then
    echo -e "${GREEN}No Kotlin files to process${NC}"
    if [[ -f "$PROJECT_ROOT/scripts/utils/get_timestamp.sh" ]]; then
        end_time=$(bash "$PROJECT_ROOT/scripts/utils/get_timestamp.sh")
    else
        end_time=$(date +%s)000
    fi
    total_elapsed=$((end_time - start_time))
    echo "Total time elapsed: $total_elapsed ms."
    exit 0
fi

echo -e "${YELLOW}Found ${#files_to_process[@]} Kotlin file(s) to process${NC}"

# Create temporary file for storing file list
temp_file=$(mktemp)
trap 'rm -f "$temp_file"' EXIT

# Write files to temporary file for xargs processing
printf '%s\n' "${files_to_process[@]}" > "$temp_file"

# Run ktfmt with xargs and capture output
echo -e "${YELLOW}Running ktfmt...${NC}"

# Run ktfmt in check mode to see if files need formatting
if [[ -s "$temp_file" ]]; then
    # Use --dry-run or similar flag to check formatting without modifying files
    # ktfmt doesn't have a --check flag, so we'll run it and capture any output
    if ktfmt --dry-run < "$temp_file" 2>&1 | grep -q 'Formatted'; then
        ktfmt_output=$(ktfmt --dry-run < "$temp_file" 2>&1)
    else
        # If ktfmt doesn't support --dry-run, use a different approach
        # Create a temporary directory to test formatting
        temp_dir=$(mktemp -d)
        trap 'rm -rf "$temp_dir"' EXIT

        while IFS= read -r file; do
            if [[ -f "$file" ]]; then
                # Copy file to temp directory
                temp_file_path="$temp_dir/$(basename "$file")"
                cp "$file" "$temp_file_path"

                # Format the temp file
                ktfmt "$temp_file_path" >/dev/null 2>&1

                # Compare original and formatted versions
                if ! diff -q "$file" "$temp_file_path" >/dev/null 2>&1; then
                    errors="${errors}${file}: File needs formatting\n"
                fi
            fi
        done < "$temp_file"
    fi

    # If ktfmt supports --dry-run and produced output, it means files need formatting
    if [[ -n "$ktfmt_output" ]]; then
        errors="$ktfmt_output"
    fi
else
    echo -e "${GREEN}No files to process${NC}"
fi

# Calculate total elapsed time
if [[ -f "$PROJECT_ROOT/scripts/utils/get_timestamp.sh" ]]; then
    end_time=$(bash "$PROJECT_ROOT/scripts/utils/get_timestamp.sh")
else
    end_time=$(date +%s)000
fi
total_elapsed=$((end_time - start_time))

# Check and report errors
if [[ -n "$errors" ]]; then
    echo -e "${RED}Formatting issues found in the following files:${NC}"
    echo -e "$errors"
    echo -e "${YELLOW}To fix these issues, run:${NC}"
    echo "cat <<EOF | xargs ktfmt"
    printf '%s\n' "${files_to_process[@]}"
    echo "EOF"
    echo -e "${RED}Total time elapsed: $total_elapsed ms.${NC}"
    exit 1
fi

echo -e "${GREEN}All Kotlin source files are properly formatted.${NC}"
echo "Total time elapsed: $total_elapsed ms."
exit 0
