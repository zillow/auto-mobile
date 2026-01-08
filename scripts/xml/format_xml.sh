#!/usr/bin/env bash

ONLY_TOUCHED_FILES=${ONLY_TOUCHED_FILES:-true}

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

echo "PROJECT_ROOT: $PROJECT_ROOT"

# Cross-platform XML formatting using xmlstarlet or xml command
format_xml() {
  local file="$1"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    xml fo -s 2 "$file" > "$file.formatted" 2>&1
  else
    xmlstarlet fo -s 2 "$file" > "$file.formatted" 2>&1
  fi

  local exit_code=$?
  if [[ $exit_code -eq 0 && -f "$file.formatted" ]]; then
    mv "$file.formatted" "$file"
    return 0
  else
    rm -f "$file.formatted"
    return 1
  fi
}

# Check for required XML tools
echo -e "${YELLOW}Checking for required commands...${NC}"

if [[ "$OSTYPE" == "darwin"* ]]; then
  if ! command_exists xml; then
    echo -e "${RED}xmlstarlet (xml command) is not installed${NC}"
    echo "Try 'brew install xmlstarlet'"
    exit 1
  fi
else
  if ! command_exists xmlstarlet; then
    echo -e "${RED}xmlstarlet is not installed${NC}"
    echo "Consult your OS package manager"
    exit 1
  fi
fi

echo -e "${GREEN}XML tools are available${NC}"

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

echo -e "${YELLOW}Starting XML formatting...${NC}"

# Function to find all XML files
find_all_xml_files() {
    git ls-files --cached --others --exclude-standard -z |
      grep -z '\.xml$' |
      xargs -0 -I {} echo "$PROJECT_ROOT/{}"
}

# Function to get touched/staged files
get_touched_files() {
    {
        # Get staged files
        git diff --cached --name-only --diff-filter=ACMR | while read -r file; do
            if [[ "$file" =~ ^.*\.xml$ ]] && [[ -f "$PROJECT_ROOT/$file" ]]; then
                echo "$PROJECT_ROOT/$file"
            fi
        done

        # Get modified but not staged files
        git diff --name-only --diff-filter=ACMR | while read -r file; do
            if [[ "$file" =~ ^.*\.xml$ ]] && [[ -f "$PROJECT_ROOT/$file" ]]; then
                echo "$PROJECT_ROOT/$file"
            fi
        done
    } | sort | uniq
}

# Determine which files to process
declare -a files_to_process

if [[ "${ONLY_TOUCHED_FILES}" == "true" ]]; then
    echo -e "${YELLOW}Processing only touched/staged files${NC}"

    # Get list of changed files
    touched_files=$(get_touched_files)
    while IFS= read -r file; do
        [[ -n "$file" ]] && files_to_process+=("$file")
    done <<< "$touched_files"

else
    echo -e "${YELLOW}Processing all XML files in the project${NC}"

    # Get all XML files
    all_files=$(find_all_xml_files)
    while IFS= read -r file; do
        [[ -n "$file" ]] && files_to_process+=("$file")
    done <<< "$all_files"
fi

# Check if we have files to process
if [[ ${#files_to_process[@]} -eq 0 ]]; then
    echo -e "${GREEN}No XML files to process${NC}"
    if [[ -f "$PROJECT_ROOT/scripts/utils/get_timestamp.sh" ]]; then
        end_time=$(bash "$PROJECT_ROOT/scripts/utils/get_timestamp.sh")
        total_elapsed=$((end_time - start_time))
    else
        end_time=$(date +%s)000
        total_elapsed=$((end_time - start_time))
    fi
    echo "Total time elapsed: $total_elapsed ms."
    exit 0
fi

echo -e "${YELLOW}Found ${#files_to_process[@]} XML file(s) to process${NC}"

# Export function for xargs
export -f format_xml
export OSTYPE

# Apply XML formatting
echo -e "${YELLOW}Applying XML formatting...${NC}"

declare -a failed_files
processed_count=0

for file in "${files_to_process[@]}"; do
    if [[ -f "$file" ]]; then
        if format_xml "$file"; then
            ((processed_count++))
            echo -e "${GREEN}✓${NC} $file"
        else
            failed_files+=("$file")
            echo -e "${RED}✗${NC} $file"
        fi
    fi
done

echo -e "${GREEN}Processed $processed_count file(s)${NC}"

# Calculate total elapsed time
if [[ -f "$PROJECT_ROOT/scripts/utils/get_timestamp.sh" ]]; then
    end_time=$(bash "$PROJECT_ROOT/scripts/utils/get_timestamp.sh")
else
    end_time=$(date +%s)000
fi
total_elapsed=$((end_time - start_time))

# Check and report errors
if [[ ${#failed_files[@]} -gt 0 ]]; then
    echo -e "${RED}Failed to format ${#failed_files[@]} file(s):${NC}"
    printf '%s\n' "${failed_files[@]}"
    echo -e "${RED}Total time elapsed: $total_elapsed ms.${NC}"
    exit 1
fi

# Stage the formatted files
if [[ ${#files_to_process[@]} -gt 0 ]]; then
    echo -e "${YELLOW}Staging formatted files...${NC}"
    printf '%s\n' "${files_to_process[@]}" | xargs git add
fi

echo -e "${GREEN}XML files have been formatted successfully.${NC}"
echo "Total time elapsed: $total_elapsed ms."
exit 0
