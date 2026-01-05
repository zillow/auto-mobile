---
name: gh-pr-workflow
description: Use this skill when creating or updating GitHub pull requests so PR bodies preserve newlines and formatting, especially when using gh pr create or gh pr edit.
---

# PR Creation Without Newline Mangling

Preserve PR body formatting by supplying a file to `gh`.

- Write the PR body to a file (prefer `scratch/pr-body.md` when created in-session).
- Create the PR with `gh pr create --title "..." --body-file scratch/pr-body.md`.
- Update an existing PR with `gh pr edit --body-file scratch/pr-body.md`.
- Avoid `--body "..."` with inline newlines; it often collapses or escapes formatting.

Example:

```bash
cat <<'EOF_BODY' > scratch/pr-body.md
## Summary
- ...

## Testing
- ...
EOF_BODY

gh pr create --title "Your title" --body-file scratch/pr-body.md
```
