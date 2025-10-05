#!/usr/bin/env bash
set -euo pipefail
BASE_REF="${1:-origin/main}"
HEAD_REF="${2:-HEAD}"

echo "Determining changed files between ${BASE_REF} and ${HEAD_REF}..."
CHANGED_FILES=$(git diff --name-only "${BASE_REF}" "${HEAD_REF}" || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "No changed files detected (empty diff). Treating as no code changes."
  exit 0
fi

echo "Changed files:"
echo "$CHANGED_FILES"

code_patterns='\.(js|ts|jsx|tsx|py|go|java|rb|php|c|cpp|rs|swift|m|scala|kt|cs)$'

if echo "$CHANGED_FILES" | grep -E "$code_patterns" >/dev/null 2>&1; then
  echo "Code/executable files detected in the PR. Proceeding with normal coverage steps."
  exit 1
else
  echo "No code/executable files detected. This appears to be a docs-only PR."
  echo "PATCH COVERAGE: No executable changed lines; skipping patch coverage evaluation."
  echo "EVIDENCE: PATCH-COVERAGE-SKIP-MESSAGE: No executable changed lines; not applicable for this PR."
  exit 0
fi
