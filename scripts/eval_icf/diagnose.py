"""List purple paragraphs of the template that are not kept in a generated docx + leftover brackets.

uv run --project backend python scripts/eval_icf/diagnose.py <case> <generated.docx>
"""

import re
import sys

from common import CASES, bucket, doc_blocks, norm
from score import _bestratio

case = CASES[sys.argv[1]]
gen = doc_blocks(sys.argv[2])
tpl = doc_blocks(str(bucket() / case["template"]), mark=False)
gn = [norm(x["text"]) for x in gen]
print("--- purple paragraphs not kept (ratio < 0.9)")
for x in tpl:
    if x["purple"] and len(x["text"].split()) >= 6:
        r = _bestratio(norm(x["text"]), gn)
        if r < 0.9:
            print(f"{r:.2f} {x['text'][:140]}")
print("--- generated paragraphs with leftover [brackets]")
for x in gen:
    t = re.sub(r"⟦(?:GAP|BLUE):[^⟧]*⟧", "", x["marked"])
    if re.search(r"\[[^\]\n]{4,}\]", t):
        print(x["text"][:160])
