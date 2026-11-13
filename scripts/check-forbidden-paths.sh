#!/bin/sh
set -eu
mode=${1:---staged}
case "$mode" in
  --staged)
    if [ "${ALLOW_AI_FILES:-}" = 1 ]; then exit 0; fi
    set -- diff --cached --name-only --diff-filter=ACMR -z
    ;;
  --tracked) set -- ls-files -z ;;
  *) printf '%s\n' 'Usage: check-forbidden-paths.sh [--staged|--tracked]' >&2; exit 2 ;;
esac
if git "$@" | xargs -0 sh -c '
  bad=0
  for path do
    name=${path##*/}
    forbidden=0
    case "/$path/" in
      */.scratch/*|*/*-kit/*|*/*-evidence/*|*/screenshots/*|*/playwright-report*/*|*/test-results/*|*/ds-bundle/*|*/dist/*|*/.claude/worktrees/*) forbidden=1 ;;
    esac
    case "$path" in docs/evidence/*|docs/*/evidence/*) forbidden=1 ;; esac
    case "$name" in
      *handoff*.md|HANDOFF*.md|*-report.txt|branch-comparisons.txt|*cleanup*report*.txt|*.patch|*.diff|capture*.cjs|capture*.mjs|capture*.spec.ts) forbidden=1 ;;
    esac
    case "$path" in
      docs/*.png)
        case "$path" in docs/design/references/*.png|docs/images/mergen-scope-workspace.png) ;; *) forbidden=1 ;; esac
        ;;
    esac
    if [ "$forbidden" -eq 1 ]; then printf "  %s\n" "$path" >&2; bad=1; fi
  done
  exit "$bad"
' sh; then
  exit 0
else
  printf '%s\n' 'Forbidden AI/tool leftovers detected. Move them to .scratch/ or unstage them: git restore --staged <file>' >&2
  printf '%s\n' 'For an explicit staged-commit exception, set ALLOW_AI_FILES=1.' >&2
  exit 1
fi
