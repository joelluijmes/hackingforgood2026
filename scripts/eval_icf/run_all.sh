#!/bin/sh
# Run (generate + score) all cases with the current env config, sequentially per case.
# usage: scripts/eval_icf/run_all.sh <tag> [case ...]   (env: ICF_* config, EVAL_WORK_DIR)
# --reuse as 2nd..: set REUSE=1 to only re-score existing docx files.
tag="$1"; shift
cases="${*:-forum_r1 forum_s1 biomede}"
for c in $cases; do
  uv run --project backend python scripts/eval_icf/run_case.py "$c" --tag "$tag" ${REUSE:+--reuse} 2>&1 | grep -E "^(gen_words|generated)" | cut -c1-700 | sed "s/^/$c: /"
done
