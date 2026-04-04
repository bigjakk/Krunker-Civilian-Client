#!/usr/bin/env bash
#
# Generate Markdown release notes from conventional commits.
# Usage: ./scripts/generate-release-notes.sh <tag> [prev-ref]
#   e.g. ./scripts/generate-release-notes.sh v0.7.0
#   e.g. ./scripts/generate-release-notes.sh v0.7.0 abc123f
#
# If prev-ref is not provided, tries git describe to find previous tag.
# If no previous ref is found, includes all commits up to HEAD.
# Uses HEAD as the endpoint (tag may not exist in git yet).

set -eo pipefail

TAG="${1:?Usage: generate-release-notes.sh <tag> [prev-ref]}"
PREV_REF="${2:-}"

# If no prev-ref provided, try to find one from git tags
if [ -z "$PREV_REF" ]; then
  PREV_REF=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || true)
fi

if [ -n "$PREV_REF" ]; then
  RANGE="${PREV_REF}..HEAD"
  COMPARE_TEXT="**Full changelog**: \`${PREV_REF}...${TAG}\`"
else
  RANGE="HEAD"
  COMPARE_TEXT="**Initial release**"
fi

# Collect commits into temp files by category
TMPDIR_NOTES=$(mktemp -d)
trap 'rm -rf "$TMPDIR_NOTES"' EXIT

for prefix in feat fix refactor perf docs test chore other; do
  : > "${TMPDIR_NOTES}/${prefix}"
done

while IFS= read -r line; do
  [ -z "$line" ] && continue
  MATCHED=false
  for prefix in feat fix refactor perf docs test chore; do
    if [[ "$line" =~ ^${prefix}(\(.*\))?:\ (.+)$ ]]; then
      SCOPE="${BASH_REMATCH[1]}"
      MSG="${BASH_REMATCH[2]}"
      if [ -n "$SCOPE" ]; then
        echo "- **${SCOPE}**: ${MSG}" >> "${TMPDIR_NOTES}/${prefix}"
      else
        echo "- ${MSG}" >> "${TMPDIR_NOTES}/${prefix}"
      fi
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
    feat)     echo "Features" ;;
    fix)      echo "Bug Fixes" ;;
    refactor) echo "Refactoring" ;;
    perf)     echo "Performance" ;;
    docs)     echo "Documentation" ;;
    test)     echo "Tests" ;;
    chore)    echo "Chores" ;;
  esac
}

# Build output
echo "# KCC ${TAG}"
echo ""

for prefix in feat fix refactor perf docs test chore; do
  if [ -s "${TMPDIR_NOTES}/${prefix}" ]; then
    echo "## $(section_title "$prefix")"
    echo ""
    cat "${TMPDIR_NOTES}/${prefix}"
    echo ""
  fi
done

if [ -s "${TMPDIR_NOTES}/other" ]; then
  echo "## Other Changes"
  echo ""
  cat "${TMPDIR_NOTES}/other"
  echo ""
fi

echo "---"
echo ""
echo "${COMPARE_TEXT}"
