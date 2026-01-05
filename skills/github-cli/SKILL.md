---
name: github-cli
description: Use this skill when interacting with GitHub for this repo (PRs, issues, checks, releases, or repository metadata). Prefer the GitHub CLI (gh) for all GitHub actions instead of web/API calls.
---

# GitHub CLI Usage

Use `gh` for all GitHub interactions.

- Prefer `gh pr view`, `gh pr list`, `gh pr create`, and `gh pr edit` for pull requests.
- Prefer `gh issue list` and `gh issue view` for issues.
- Prefer `gh pr checks` and `gh run view` for CI status and logs.
- Avoid manual API calls unless `gh` cannot perform the task.
