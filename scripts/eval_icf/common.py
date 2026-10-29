"""Shared helpers for the ICF generation eval harness (cases, text extraction, Vertex judge client).

Run scripts with:  uv run --project backend python scripts/eval_icf/run_case.py ...
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from docx import Document  # noqa: E402
from docx.text.paragraph import Paragraph  # noqa: E402

from app.engine import _xml  # noqa: E402
from app.engine._xml import q  # noqa: E402
from app.engine.render import COLOR_CLASSES, _rgb, _style_color, is_toc_paragraph  # noqa: E402
from app.engine.text import docx_text  # noqa: E402

WORK = Path(os.environ.get("EVAL_WORK_DIR", ROOT / "scripts" / "eval_icf" / "work"))
BUCKET_DIR = Path(os.environ.get("EVAL_BUCKET_DIR", WORK / "bucket"))


def bucket() -> Path:
    """Extract data/bucket.zip (untrusted data) into a fresh directory once."""
    if not (BUCKET_DIR / "bucket").exists():
        BUCKET_DIR.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(ROOT / "data" / "bucket.zip") as z:
            z.extractall(BUCKET_DIR)
    return BUCKET_DIR / "bucket"


def tpl(lang: str) -> str:
    n = {
        "en": "EN_Model ICF_Interv trial_Adult_Patients_version2_2_20250718.docx",
        "nl": "NL_Model ICF_Interv trial_Adult_Patients_version3_2_20250718.docx",
        "fr": "FR_Model ICF_Interv trial_Adult_Patients_version2_3_20250925.docx",
    }[lang]
    return f"National Templates/{n}"


FO = "Forum Example"
BI = "Biomede Example"
CASES: dict[str, dict] = {
    # main case: FORUM2 sub-study R1 (8 vs 12 Gy TBI), sponsor adult form + general platform form
    "forum_r1": {
        "language": "en",
        "template": tpl("en"),
        "sponsor": [
            f"{FO}/Sponsor Originals/R1/FORUM2_R1_Adult_Consent_Form_CCN_20_05_2022_EN_International V01_26.05.25.docx",
            f"{FO}/Sponsor Originals/Main Protocol/FORUM2_General_Platform_Consent_Form_Adult_JH_23_05_2025.docx",
        ],
        "approved": f"{FO}/Approved ICFs/R1/L1_SIS and ICF_ENG_R1_adult_v1.0_20260402.docx",
    },
    # hold-out 1: FORUM2 sub-study S1
    "forum_s1": {
        "language": "en",
        "template": tpl("en"),
        "sponsor": [
            f"{FO}/Sponsor Originals/S1/Adult_Consent_Form_CCN_045_06_2025_EN.docx",
            f"{FO}/Sponsor Originals/Main Protocol/FORUM2_General_Platform_Consent_Form_Adult_JH_23_05_2025.docx",
        ],
        "approved": f"{FO}/Approved ICFs/S1/L1_SIS and ICF_ENG_S1_adult_v1.0_20260402.docx",
    },
    # hold-out 2: Biomede 2.0 (French sponsor documents -> English adult ICF)
    "biomede": {
        "language": "en",
        "template": tpl("en"),
        "sponsor": [
            f"{BI}/Sponsor Originals/Treatment/11.2ci_2014-001929-32_NIFC_Traitement_Majeur_v6.0_Clean_20220304_BIOMEDE-2.0.docx",
            f"{BI}/Sponsor Originals/Biopsy/11.1ci_2014-001929-32_NIFC_Biopsie_Majeur_v4.0_Clean_20220304_BIOMEDE-2.0.docx",
        ],
        "approved": f"{BI}/Approved ICFs/L1_SIS and ICF_ENG_Biomede 2.0_+18y_v1.1_clean.docx",
    },
}


def sponsor_text(case: dict) -> str:
    """Same shape as routers.generate._sponsor_text: '=== name ===' + docx text per document."""
    b = bucket()
    parts = []
    for rel in case["sponsor"]:
        p = b / rel
        parts.append(f"=== {p.name} ===\n{docx_text(str(p))}")
    return "\n\n".join(parts)


# -- text extraction with colour / gap markers ------------------------------------------------


def _run_color(r_el, para_color):
    from docx.text.run import Run

    run = Run(r_el, None)
    try:
        return _rgb(run.font) or para_color
    except Exception:
        return para_color


def doc_blocks(path: str, mark: bool = True) -> list[dict]:
    """Paragraphs of a docx: {text, style, level, purple} (tracked changes accepted).

    With mark=True, yellow-highlighted runs (gaps) are wrapped as [[GAP: ..]] and leftover blue
    placeholder runs as [[BLUE: ..]].
    """
    doc = Document(path)
    out = []
    for p_el in doc.element.body.iter(q("p")):
        if is_toc_paragraph(p_el):
            continue
        p = Paragraph(p_el, doc._body)
        style = p.style.name if p.style is not None else ""
        pc = _style_color(p.style) if p.style is not None else None
        segs: list[tuple[str, str]] = []  # (kind, text)
        for r in p_el.iter(q("r")):
            if any(True for _ in r.iterancestors(q("del"))):
                continue
            t = _xml.run_text(r)
            if not t:
                continue
            kind = "k"
            if mark:
                hl = r.find(f"{q('rPr')}/{q('highlight')}")
                if hl is not None and hl.get(q("val")) == "yellow":
                    kind = "gap"
                elif COLOR_CLASSES.get(_run_color(r, pc) or "") == "blue":
                    kind = "blue"
            if COLOR_CLASSES.get(_run_color(r, pc) or "") == "purple":
                kind = "purple" if kind == "k" else kind
            segs.append((kind, t))
        text = "".join(t for _, t in segs).strip()
        if not text:
            continue
        marked = ""
        for kind, t in segs:
            marked += f"[[GAP: {t}]]" if kind == "gap" else f"[[BLUE: {t}]]" if kind == "blue" else t
        nonblank = [(k, t) for k, t in segs if t.strip()]
        out.append(
            {
                "text": text,
                "marked": marked.strip() if mark else text,
                "style": style,
                "purple": bool(nonblank) and all(k == "purple" for k, _ in nonblank),
                "heading": style.lower().startswith(("heading 1", "heading 2", "title")),
                "in_table": p_el.getparent().tag == q("tc"),
            }
        )
    return out


def segments(blocks: list[dict], min_words: int = 80) -> list[dict]:
    """Split blocks into sections at Title/Heading 1/Heading 2; merge tiny sections."""
    segs: list[dict] = []
    cur = {"title": "(start)", "lines": []}
    for b in blocks:
        if b["heading"] and cur["lines"]:
            segs.append(cur)
            cur = {"title": b["text"][:80], "lines": []}
        elif b["heading"]:
            cur["title"] = b["text"][:80]
        cur["lines"].append(b["marked"])
    if cur["lines"]:
        segs.append(cur)
    merged: list[dict] = []
    for s in segs:
        words = sum(len(x.split()) for x in s["lines"])
        if merged and words < min_words:
            merged[-1]["lines"] += s["lines"]
            merged[-1]["title"] += " + " + s["title"]
        else:
            merged.append(s)
    for s in merged:
        s["text"] = "\n".join(s["lines"])
    return merged


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", s.lower())).strip()


# -- judge LLM ---------------------------------------------------------------------------------

JUDGE_MODEL = os.environ.get("EVAL_JUDGE_MODEL", "gemini-3.1-pro-preview")
JUDGE_LOCATION = os.environ.get("EVAL_JUDGE_LOCATION", "global")
_client = None


def _project() -> str:
    p = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if p:
        return p
    return subprocess.run(
        ["gcloud", "config", "get-value", "project"], capture_output=True, text=True
    ).stdout.strip()


def judge_json(prompt: str, system: str, retries: int = 4):
    """Fixed judge call: temperature 0, JSON out. Cached on disk by prompt hash."""
    global _client
    cache = WORK / "judge_cache"
    cache.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256((JUDGE_MODEL + system + prompt).encode()).hexdigest()[:24]
    f = cache / f"{key}.json"
    if f.exists():
        return json.loads(f.read_text())
    from google import genai
    from google.genai import types

    if _client is None:
        _client = genai.Client(
            vertexai=True,
            project=_project(),
            location=JUDGE_LOCATION,
            http_options=types.HttpOptions(timeout=300_000),
        )
    cfg = types.GenerateContentConfig(
        temperature=0,
        system_instruction=system,
        response_mime_type="application/json",
    )
    last = None
    for i in range(retries):
        try:
            r = _client.models.generate_content(model=JUDGE_MODEL, contents=prompt, config=cfg)
            data = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", r.text.strip()))
            f.write_text(json.dumps(data, ensure_ascii=False))
            return data
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 ** (i + 1))
    raise RuntimeError(f"judge failed: {last}")
