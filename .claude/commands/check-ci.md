---
description: Check CI status for current PR and show failure logs
allowed-tools: Bash
argument-hint: [PR number (optional)]
---

Check the CI status for a pull request and display detailed failure logs for any failing checks.

## Steps

1. **Determine PR number:**
   - If an argument is provided, use it as the PR number
   - Otherwise, detect the PR number from the current branch using: `gh pr view --json number -q .number`

2. **Get CI check status:**
   - Run `gh pr checks <pr#>` to get all check statuses
   - Count and display: passing, pending, and failing checks

3. **For each failing check:**
   - Extract the run ID from the check URL
   - Run `gh run view <run-id> --log-failed` to get failure logs
   - Display the last 100 lines of the failure logs for each failed job
   - Highlight the specific error messages and exit codes

4. **Summary:**
   - Provide a concise summary of:
     - Overall status (X/Y checks passed)
     - List of failing checks with their error messages
     - Links to failed job logs for detailed investigation
   - If all checks are passing or pending, just show the summary

## Output Format

Present results in a clear, scannable format:
- Use check marks (✅) for passed checks
- Use warning symbols (⚠️) for pending checks
- Use X marks (❌) for failed checks
- Show failure logs with context
- Include clickable URLs to GitHub Actions runs

## Examples

If argument provided:
```bash
# User runs: /check-ci 83
# Use PR #83
```

If no argument:
```bash
# Detect PR from current branch
PR_NUM=$(gh pr view --json number -q .number)
```

For failed checks:
```bash
# Extract run ID and get logs
gh run view <run-id> --log-failed | tail -100
```
