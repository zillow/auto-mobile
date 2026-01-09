---
description: Check CI status, analyze failures, reproduce locally, and provide next steps
allowed-tools: Bash, Read, Grep, Glob
argument-hint: [PR number (optional)]
---

Check the CI status for a pull request, analyze failures, check for merge conflicts and PR comments, attempt to reproduce issues locally, and provide an analysis of next steps.

Use the following bash script to check CI status. If an argument is provided, use it as the PR number. Otherwise, auto-detect from the current branch.

```bash
#!/usr/bin/env bash

# Step 1: Determine PR number
if [ -n "$1" ]; then
    PR_NUM="$1"
else
    PR_NUM=$(gh pr view --json number -q .number 2>/dev/null || echo "")
fi

if [ -z "$PR_NUM" ]; then
    echo "❌ Error: No PR found for current branch"
    echo "Usage: /check-ci [PR_NUMBER]"
    exit 1
fi

echo "=== CI Status for PR #${PR_NUM} ==="
echo ""

# Step 2: Get CI check status
CHECKS_OUTPUT=$(gh pr checks ${PR_NUM} 2>&1)

# Count statuses using simple grep
PASSED_COUNT=$(echo "$CHECKS_OUTPUT" | grep -c "pass" || true)
PENDING_COUNT=$(echo "$CHECKS_OUTPUT" | grep -c "pending" || true)
FAILED_COUNT=$(echo "$CHECKS_OUTPUT" | grep -c "fail" || true)

# Calculate total
if [ -z "$PASSED_COUNT" ]; then PASSED_COUNT=0; fi
if [ -z "$PENDING_COUNT" ]; then PENDING_COUNT=0; fi
if [ -z "$FAILED_COUNT" ]; then FAILED_COUNT=0; fi

TOTAL=$((PASSED_COUNT + PENDING_COUNT + FAILED_COUNT))

# Display summary
echo "📊 Summary: ${PASSED_COUNT}/${TOTAL} checks passed"
echo ""
if [ "$PASSED_COUNT" -gt 0 ]; then
    echo "  ✅ Passed: ${PASSED_COUNT}"
fi
if [ "$PENDING_COUNT" -gt 0 ]; then
    echo "  ⚠️  Pending: ${PENDING_COUNT}"
fi
if [ "$FAILED_COUNT" -gt 0 ]; then
    echo "  ❌ Failed: ${FAILED_COUNT}"
fi
echo ""

# Show all checks
echo "$CHECKS_OUTPUT"
echo ""

# Step 3 & 4: Handle different states
if [ "$FAILED_COUNT" -gt 0 ]; then
    echo "=== Failure Details ==="
    echo ""

    # Extract unique run IDs from failed checks
    RUN_IDS=$(echo "$CHECKS_OUTPUT" | grep "fail" | grep -oP 'runs/\K[0-9]+' | sort -u || true)

    if [ -n "$RUN_IDS" ]; then
        for RUN_ID in $RUN_IDS; do
            echo "----------------------------------------"
            echo "📋 Fetching failure logs for run ${RUN_ID}..."
            echo "🔗 https://github.com/kaeawc/auto-mobile/actions/runs/${RUN_ID}"
            echo ""

            # Get failed logs (last 100 lines)
            gh run view ${RUN_ID} --log-failed 2>&1 | tail -100
            echo ""
        done
    fi
elif [ "$PENDING_COUNT" -gt 0 ]; then
    echo "⏳ Waiting for ${PENDING_COUNT} check(s) to complete..."
    echo ""
    echo "Pending checks:"
    echo "$CHECKS_OUTPUT" | grep "pending" || true
else
    echo "✅ All checks passed! PR is ready to merge."
fi
```

## How it works:

1. **PR Detection**: Accepts optional PR number argument, otherwise auto-detects from current branch
2. **Status Counting**: Uses grep to count passed/pending/failed checks
3. **Summary Display**: Shows visual summary with emojis (✅/⚠️/❌)
4. **Failure Handling**: Extracts run IDs from failed checks and fetches last 100 lines of logs
5. **Clear Output**: Provides clickable GitHub Actions URLs for detailed investigation

## Additional Analysis Steps

After running the bash script above, continue with these analysis steps:

### Step 1: Check for Merge Conflicts

```bash
# Check if branch is behind main
gh pr view ${PR_NUM} --json mergeable,mergeStateStatus -q '.mergeable, .mergeStateStatus'

# If behind, check details
git fetch origin main
git log HEAD..origin/main --oneline

# Check for merge conflicts
git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main
```

**If conflicts exist**:
- List conflicting files
- Show conflict markers
- Recommend resolution strategy (rebase vs merge)
- Provide commands to resolve

### Step 2: Check PR Comments and Feedback

```bash
# Get all PR comments
gh pr view ${PR_NUM} --json comments -q '.comments[].body'

# Get review comments (inline code comments)
gh api repos/:owner/:repo/pulls/${PR_NUM}/comments --jq '.[] | {file: .path, line: .line, comment: .body}'
```

**Analyze comments**:
- Identify unresolved feedback
- Categorize by type (bug report, suggestion, question, approval)
- Highlight actionable items
- Note if any reviewers requested changes

### Step 3: Reproduce Failures Locally

For each failed CI check, provide commands to reproduce:

**Lint failures**:
```bash
bun run lint
```

**Build failures**:
```bash
bun run build
```

**Test failures**:
```bash
# Run all tests
bun test

# Run specific test file mentioned in logs
bun test <test-file-path>

# Run with coverage
bun test --coverage
```

**TypeScript errors**:
```bash
# Check types
bun run typecheck
# or
tsc --noEmit
```

**Docker build failures**:
```bash
# Rebuild locally
docker build -t auto-mobile .

# Check specific stage
docker build --target <stage> -t auto-mobile .
```

**Android/Gradle failures**:
```bash
cd android
./gradlew clean build

# Run specific task mentioned in logs
./gradlew <task-name>
```

**Attempt to run the commands** that match the failure type and report results.

### Step 4: Analyze Failures

For each failure found:

1. **Identify root cause**:
   - Parse error messages from CI logs
   - Search codebase for related code using Grep
   - Read relevant files to understand context

2. **Categorize the issue**:
   - Syntax error (typo, missing import)
   - Type error (TypeScript)
   - Test failure (assertion failed)
   - Flaky test (timing issue)
   - Integration issue (dependency problem)
   - Configuration issue (CI-specific)

3. **Determine reproducibility**:
   - Can reproduce locally → Direct fix possible
   - Cannot reproduce locally → CI environment issue
   - Intermittent → Flaky test or race condition

### Step 5: Provide Next Steps Analysis

Generate a summary report:

```markdown
## CI Status Report for PR #[number]

### Current State
- **Status**: [All passing / X failing / X pending]
- **Merge conflicts**: [Yes/No]
- **Unresolved comments**: [count]

### Failures Analysis

#### Failure 1: [Check name]
- **Type**: [lint/build/test/etc]
- **Root cause**: [description]
- **Reproducible locally**: [Yes/No]
- **Files affected**: [list]
- **Recommended fix**: [specific action]

#### Failure 2: [Check name]
...

### PR Comments Summary
- **Total comments**: [count]
- **Actionable feedback**: [list key items]
- **Requested changes**: [list]

### Merge Conflicts
- **Status**: [clean / conflicts in X files]
- **Affected files**: [list]
- **Resolution strategy**: [rebase / merge / manual]

### Recommended Next Steps

1. [Priority 1 action with commands]
2. [Priority 2 action with commands]
3. [Priority 3 action with commands]

### Commands to Execute

```bash
# Fix merge conflicts (if any)
git fetch origin main
git rebase origin/main
# [resolve conflicts]

# Apply feedback from PR comments
# [specific changes based on comments]

# Fix failing checks
[specific commands based on failures]

# Validate locally
bun run lint
bun run build
bun test

# Push fixes
git push --force-with-lease
```
```

### Step 6: Execute Fixes (Optional)

If user confirms, execute the recommended fixes:
- Resolve merge conflicts
- Apply PR feedback
- Fix failing checks
- Run local validation
- Commit and push changes

## Usage Examples:

**Simple check**:
```
/check-ci
```
Output: Shows CI status, then analyzes failures, checks conflicts, reviews comments, and provides next steps

**Check specific PR**:
```
/check-ci 83
```

**Typical workflow** (from prompt analysis):
```
/check-ci                    # Analyze current state
[Review analysis]
[Make fixes based on recommendations]
/validate                    # Run local validation
/push                        # Push fixes
/check-ci                    # Verify fixes resolved issues
```
