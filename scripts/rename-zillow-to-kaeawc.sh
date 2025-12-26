#!/bin/bash

# Script to rename all Zillow references to kaeawc/jasonpearson
# This script performs various find-and-replace operations across the codebase

set -e  # Exit on error

# Color output for better visibility
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Renaming Zillow → kaeawc/jasonpearson${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Get the project root (one level up from scripts)
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

cd "$PROJECT_ROOT"

echo -e "${YELLOW}Working directory: ${PROJECT_ROOT}${NC}"
echo ""

# Function to perform case-sensitive replacement in files
replace_in_files() {
  local search="$1"
  local replace="$2"
  local description="$3"

  echo -e "${BLUE}Replacing: ${description}${NC}"
  echo -e "  From: ${RED}${search}${NC}"
  echo -e "  To:   ${GREEN}${replace}${NC}"

  # Find all text files (exclude binary files, node_modules, build dirs, etc.)
  find . -type f \
    ! -path "*/node_modules/*" \
    ! -path "*/.git/*" \
    ! -path "*/dist/*" \
    ! -path "*/build/*" \
    ! -path "*/.nyc_output/*" \
    ! -path "*/coverage/*" \
    ! -path "*/.idea/*" \
    ! -path "*/.vscode/*" \
    ! -path "*.png" \
    ! -path "*.jpg" \
    ! -path "*.jpeg" \
    ! -path "*.gif" \
    ! -path "*.ico" \
    ! -path "*.pdf" \
    ! -path "*.zip" \
    ! -path "*.tar" \
    ! -path "*.gz" \
    ! -path "*.jar" \
    ! -path "*.apk" \
    ! -path "*.dex" \
    ! -path "*.class" \
    ! -path "*.so" \
    ! -path "*.dylib" \
    ! -path "*.a" \
    -exec grep -l "$search" {} \; 2>/dev/null | while read -r file; do
    echo -e "    ${YELLOW}→${NC} $file"
    # Use perl for reliable in-place editing across platforms
    perl -pi -e "s/${search}/${replace}/g" "$file"
  done

  echo ""
}

# Function to perform case-insensitive replacement in files
replace_in_files_case_insensitive() {
  local search="$1"
  local replace="$2"
  local description="$3"

  echo -e "${BLUE}Replacing (case-insensitive): ${description}${NC}"
  echo -e "  From: ${RED}${search}${NC}"
  echo -e "  To:   ${GREEN}${replace}${NC}"

  # Find all text files (exclude binary files, node_modules, build dirs, etc.)
  find . -type f \
    ! -path "*/node_modules/*" \
    ! -path "*/.git/*" \
    ! -path "*/dist/*" \
    ! -path "*/build/*" \
    ! -path "*/.nyc_output/*" \
    ! -path "*/coverage/*" \
    ! -path "*/.idea/*" \
    ! -path "*/.vscode/*" \
    ! -path "*.png" \
    ! -path "*.jpg" \
    ! -path "*.jpeg" \
    ! -path "*.gif" \
    ! -path "*.ico" \
    ! -path "*.pdf" \
    ! -path "*.zip" \
    ! -path "*.tar" \
    ! -path "*.gz" \
    ! -path "*.jar" \
    ! -path "*.apk" \
    ! -path "*.dex" \
    ! -path "*.class" \
    ! -path "*.so" \
    ! -path "*.dylib" \
    ! -path "*.a" \
    -exec grep -il "$search" {} \; 2>/dev/null | while read -r file; do
    echo -e "    ${YELLOW}→${NC} $file"
    # Use perl for reliable in-place editing with case-insensitive flag
    perl -pi -e "s/${search}/${replace}/gi" "$file"
  done

  echo ""
}

# Perform replacements
echo -e "${GREEN}Starting replacements...${NC}"
echo ""

# 1. Replace Java/Android package names
replace_in_files "com\\.zillow\\.automobile" "dev.jasonpearson.automobile" "Java/Android package: dev.jasonpearson.automobile → dev.jasonpearson.automobile"

# 2. Replace broadcast action
replace_in_files "com\\.zillow\\.automobile\\.EXTRACT_HIERARCHY" "dev.jasonpearson.automobile.EXTRACT_HIERARCHY" "Broadcast action: EXTRACT_HIERARCHY"

# 3. Replace general dev.jasonpearson references
replace_in_files "com\\.zillow" "dev.jasonpearson" "Java/Android package: dev.jasonpearson → dev.jasonpearson"

# 4. Replace GitHub repository references
replace_in_files "zillow/auto-mobile" "kaeawc/auto-mobile" "GitHub repo: zillow/auto-mobile → kaeawc/auto-mobile"

# 5. Replace npm/GitHub scope
replace_in_files "@zillow" "@kaeawc" "NPM/GitHub scope: @zillow → @kaeawc"

# 6. Replace email domain
replace_in_files "oss@zillowgroup\\.com" "jason.d.pearson@gmail.com" "Email: oss@zillowgroup.com → jason.d.pearson@gmail.com"

# 7. Replace Zillow Group references
replace_in_files "Zillow Group's" "the project's" "Zillow Group's → the project's"
replace_in_files "zillowgroup\\.com/security/disclosure" "github.com/kaeawc/auto-mobile/security" "Security disclosure URL"

# 8. Replace Android app/package identifiers (test data)
# Handle specific Android package names like dev.jasonpearson.android.zillowmap
replace_in_files "com\\.zillow\\.android\\.zillowmap" "dev.jasonpearson.android.app" "Android package: dev.jasonpearson.android.zillowmap → dev.jasonpearson.android.app"
replace_in_files "com\\.zillow\\.android\\.appshell" "dev.jasonpearson.android.appshell" "Android package: dev.jasonpearson.android.appshell → dev.jasonpearson.android.appshell"
replace_in_files "com\\.zillow\\.android\\.ui\\.base" "dev.jasonpearson.android.ui.base" "Android package: dev.jasonpearson.android.ui.base → dev.jasonpearson.android.ui.base"
replace_in_files "com\\.zillow\\.android" "dev.jasonpearson.android" "Android package: dev.jasonpearson.android → dev.jasonpearson.android"

# 9. Replace class names
replace_in_files "ZillowToolbar" "CustomToolbar" "Class name: ZillowToolbar → CustomToolbar"

# 10. Replace resource IDs
replace_in_files "zillow_toolbar" "custom_toolbar" "Resource ID: zillow_toolbar → custom_toolbar"

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  Replacement complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Review the changes: ${BLUE}git diff${NC}"
echo -e "  2. Build the project: ${BLUE}npm run build${NC}"
echo -e "  3. Run tests: ${BLUE}npm test${NC}"
echo -e "  4. If everything looks good, commit: ${BLUE}git add -A && git commit -m \"Rename zillow references to kaeawc/jasonpearson\"${NC}"
echo ""
