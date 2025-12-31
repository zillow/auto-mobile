---
description: Check CI status for current PR and show failure logs
allowed-tools: Bash
argument-hint: [PR number (optional)]
---

Check the CI status for a pull request and display detailed failure logs for any failing checks.

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

## Usage Examples:

- Check current PR: `/check-ci`
- Check specific PR: `/check-ci 83`
