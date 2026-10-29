"""Generate an ICF draft for an eval case with the current generator and score it.

uv run --project backend python scripts/eval_icf/run_case.py forum_r1 --tag baseline [--no-score] [--reuse]
Config is read from env (ICF_FILL_MODEL, ICF_FAST_MODEL, ICF_GEN_MODE, ...), see backend/app/engine/generate.py.
"""

from __future__ import annotations

import argparse
import json
import os
import time

os.environ.setdefault("STORAGE_BACKEND", "local")

from common import CASES, WORK, bucket, sponsor_text  # noqa: E402
from score import score, summary  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("case", choices=list(CASES))
    ap.add_argument("--tag", default="run")
    ap.add_argument("--no-score", action="store_true")
    ap.add_argument("--reuse", action="store_true", help="score existing docx instead of generating")
    a = ap.parse_args()
    case = CASES[a.case]
    out_dir = WORK / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{a.case}__{a.tag}.docx"
    info: dict = {}
    if not a.reuse:
        from app.engine import generate

        steps: list = []
        t0 = time.time()
        rep = generate.generate_icf(
            str(bucket() / case["template"]),
            str(out),
            sponsor_text=sponsor_text(case),
            notes="",
            language=case["language"],
            icf_type="adult",
            progress=lambda s, d, t: steps.append((round(time.time() - t0, 1), s, d, t)),
        )
        info = {"seconds": round(time.time() - t0, 1), "report": rep}
        print("generated in", info["seconds"], "s", rep)
        print("steps:", sorted({s for _, s, _, _ in steps}))
    if a.no_score:
        return
    m = score(a.case, str(out))
    m.update({"tag": a.tag, "gen": info})
    (out_dir / f"{a.case}__{a.tag}.metrics.json").write_text(json.dumps(m, indent=1, ensure_ascii=False))
    print(summary(m))


if __name__ == "__main__":
    main()
