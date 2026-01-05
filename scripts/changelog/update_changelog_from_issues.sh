#!/usr/bin/env bash
set -euo pipefail

CHANGELOG_FILE="${CHANGELOG_FILE:-CHANGELOG.md}"
CURRENT_TAG="${CURRENT_TAG:-}"
SINCE_TAG="${SINCE_TAG:-}"
GH_REPO="${GITHUB_REPOSITORY:-}"

if [ -z "$GH_REPO" ]; then
  echo "GITHUB_REPOSITORY is required." >&2
  exit 1
fi

if [ -z "$CURRENT_TAG" ]; then
  echo "CURRENT_TAG is required." >&2
  exit 1
fi

git fetch --tags --force >/dev/null 2>&1 || true

if [ -z "$SINCE_TAG" ]; then
  if git tag --list "$CURRENT_TAG" | grep -q .; then
    SINCE_TAG=$(git tag --sort=-creatordate | awk -v current="$CURRENT_TAG" '$0 != current {print; exit}')
  else
    SINCE_TAG=$(git tag --sort=-creatordate | head -n1)
  fi
fi

if [ -n "$SINCE_TAG" ]; then
  SINCE_DATE=$(git show -s --format=%cI "$SINCE_TAG")
else
  ROOT_COMMIT=$(git rev-list --max-parents=0 HEAD)
  SINCE_DATE=$(git show -s --format=%cI "$ROOT_COMMIT")
fi

DATE=$(date -u +%Y-%m-%d)
QUERY="repo:${GH_REPO} is:issue is:closed closed:>${SINCE_DATE}"

ISSUES_FILE=$(mktemp)
trap 'rm -f "$ISSUES_FILE"' EXIT

gh api \
  -H "Accept: application/vnd.github+json" \
  -X GET search/issues \
  -f q="$QUERY" \
  -f sort="closed" \
  -f order="asc" \
  --paginate \
  --jq '.items[] | @json' > "$ISSUES_FILE"

python - "$ISSUES_FILE" "$CHANGELOG_FILE" "$CURRENT_TAG" "$DATE" <<'PY'
import json
import re
import sys
from pathlib import Path

issues_path = Path(sys.argv[1])
changelog_path = Path(sys.argv[2])
current_tag = sys.argv[3]
date = sys.argv[4]

content = ""
if changelog_path.exists():
    content = changelog_path.read_text(encoding="utf-8")

if f"## [{current_tag}]" in content:
    print(f"Changelog already contains {current_tag}, skipping.")
    sys.exit(0)

issues = []
for line in issues_path.read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    issues.append(json.loads(line))

def classify(labels):
    lowered = [label.lower() for label in labels]
    is_bug = any("bug" in label or "fix" in label for label in lowered)
    is_feature = any("feature" in label or "enhancement" in label for label in lowered)
    if is_bug:
        return "bugs"
    if is_feature:
        return "features"
    return "other"

def filter_labels(labels, category):
    filtered = []
    for label in labels:
        lowered = label.lower()
        if category == "bugs" and ("bug" in lowered or "fix" in lowered):
            continue
        if category == "features" and ("feature" in lowered or "enhancement" in lowered):
            continue
        filtered.append(label)
    return filtered

sections = {"features": [], "bugs": [], "other": []}

for issue in issues:
    labels = [label.get("name", "") for label in issue.get("labels", [])]
    category = classify(labels)
    extra_labels = filter_labels(labels, category)
    label_suffix = f" ({', '.join(extra_labels)})" if extra_labels else ""
    number = issue.get("number")
    title = issue.get("title", "").strip()
    url = issue.get("html_url")
    item = f"- {title} ([#{number}]({url})){label_suffix}"
    sections[category].append(item)

lines = [f"## [{current_tag}] - {date}"]

if sections["features"]:
    lines.append("### Features")
    lines.extend(sections["features"])

if sections["bugs"]:
    lines.append("### Bug Fixes")
    lines.extend(sections["bugs"])

if sections["other"]:
    lines.append("### Other")
    lines.extend(sections["other"])

if not any(sections.values()):
    lines.append("### Other")
    lines.append("- No changes.")

section = "\n".join(lines) + "\n"

if not content:
    new_content = f"# Changelog\n\n{section}"
else:
    content_lines = content.splitlines()
    if content_lines and content_lines[0].strip() == "# Changelog":
        remainder = "\n".join(content_lines[1:]).lstrip("\n")
        new_content = f"# Changelog\n\n{section}\n{remainder}".rstrip() + "\n"
    else:
        new_content = f"# Changelog\n\n{section}\n{content.strip()}\n"

changelog_path.write_text(new_content, encoding="utf-8")
PY
