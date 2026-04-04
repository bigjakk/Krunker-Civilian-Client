#!/usr/bin/env bash
#
# Generate Markdown release notes from conventional commits.
# Usage: ./scripts/generate-release-notes.sh <tag> [prev-ref]
#
# Skips version bumps, CI-only changes, and other noise.
# If prev-ref is not provided, tries git describe to find previous tag.
# If no previous ref is found, includes all commits up to HEAD.

set -eo pipefail

TAG="${1:?Usage: generate-release-notes.sh <tag> [prev-ref]}"
PREV_REF="${2:-}"

# If no prev-ref provided, try to find one from git tags
if [ -z "$PREV_REF" ]; then
  PREV_REF=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || true)
fi

if [ -n "$PREV_REF" ]; then
  RANGE="${PREV_REF}..HEAD"
else
  RANGE="HEAD"
fi

# Collect commits into temp files by category
TMPDIR_NOTES=$(mktemp -d)
trap 'rm -rf "$TMPDIR_NOTES"' EXIT

for prefix in feat fix refactor perf other; do
  : > "${TMPDIR_NOTES}/${prefix}"
done

while IFS= read -r line; do
  [ -z "$line" ] && continue

  # Skip version bump commits (e.g. "v0.6.1", "v0.6.2 — description")
  [[ "$line" =~ ^v[0-9] ]] && continue

  # Skip chore/docs/test/ci commits — not user-facing
  [[ "$line" =~ ^(chore|docs|test|ci)(\(.*\))?:  ]] && continue

  MATCHED=false
  for prefix in feat fix refactor perf; do
    if [[ "$line" =~ ^${prefix}(\(.*\))?:\ (.+)$ ]]; then
      MSG="${BASH_REMATCH[2]}"
      echo "- ${MSG}" >> "${TMPDIR_NOTES}/${prefix}"
      MATCHED=true
      break
    fi
  done
  if [ "$MATCHED" = false ]; then
    echo "- ${line}" >> "${TMPDIR_NOTES}/other"
  fi
done < <(git log --format="%s" "$RANGE" 2>/dev/null)

# Section display names
section_title() {
  case "$1" in
    feat)     echo "## New" ;;
    fix)      echo "## Fixes" ;;
    refactor) echo "## Improvements" ;;
    perf)     echo "## Performance" ;;
  esac
}

# Build output — only user-facing sections
HAS_CONTENT=false

for prefix in feat fix refactor perf; do
  if [ -s "${TMPDIR_NOTES}/${prefix}" ]; then
    section_title "$prefix"
    echo ""
    cat "${TMPDIR_NOTES}/${prefix}"
    echo ""
    HAS_CONTENT=true
  fi
done

if [ -s "${TMPDIR_NOTES}/other" ]; then
  echo "## Other"
  echo ""
  cat "${TMPDIR_NOTES}/other"
  echo ""
  HAS_CONTENT=true
fi

if [ "$HAS_CONTENT" = false ]; then
  echo "Bug fixes and improvements."
fi
