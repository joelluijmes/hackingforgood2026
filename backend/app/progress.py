"""Pure stage-gate logic: which requirements must hold to leave each project stage."""

STAGES = ["intake", "drafting", "pi_review", "ethics_review", "approved"]
TYPES = ["adult", "parent", "adolescent", "child"]
LANGS = ["en", "nl", "fr"]


def _latest(doc: dict) -> dict | None:
    return max(doc["versions"], key=lambda v: v["number"], default=None)


def _open_comments(docs: list[dict]) -> int:
    # an approved-as-is document has nothing left to decide
    return sum((_latest(d) or {}).get("comments_open", 0) for d in docs if not d.get("approved"))


def _req(key: str, met: bool, blocking: bool = True, detail: str | None = None) -> dict:
    return {"key": key, "met": met, "blocking": blocking, "detail": detail}


def _reviewed(d: dict) -> bool:
    """A reviewed (commented) version exists, or the doc was approved as is."""
    return bool(d.get("approved")) or any(v["source"] == "reviewed" for v in d["versions"])


def _icf_type(d: dict) -> str:
    return d.get("icf_type") or "adult"


def _requirements(stage: str, docs: list[dict]) -> list[dict]:
    sponsor = [d for d in docs if d["role"] == "sponsor"]
    icfs = [d for d in docs if d["role"] == "icf"]
    en = [d for d in icfs if d["language"] == "en"]
    translated = [d for d in icfs if d["language"] in ("nl", "fr")]
    if stage == "intake":
        return [_req("has_sponsor_docs", bool(sponsor))]
    if stage == "drafting":
        en_types = {_icf_type(d) for d in en}
        missing = [t for t in TYPES if t in {_icf_type(d) for d in sponsor} and t not in en_types]
        return [
            _req("has_en_draft", bool(en)),
            _req("draft_types_missing", not missing, False, ",".join(missing) or None),
        ]
    if stage == "pi_review":
        pending = [d for d in en if not _reviewed(d)]
        n = _open_comments(en)
        missing = []
        for d in en:
            for lang in ("nl", "fr"):
                if not _cell(icfs, _icf_type(d), lang, d["id"]):
                    missing.append(f"{_icf_type(d)}:{lang}")
        return [
            _req("has_reviewed_version", bool(en) and not pending),
            _req("comments_decided", n == 0 and bool(en), True, str(n)),
            _req(
                "translations_complete", bool(en) and not missing, True, ",".join(missing) or None
            ),
        ]
    if stage == "ethics_review":
        reviewed = any(_reviewed(d) for d in translated)
        n = _open_comments(translated)
        return [_req("ethics_reviewed", reviewed and n == 0, True, str(n))]
    return []


def _cell(icfs: list[dict], icf_type: str, lang: str, en_doc_id: int | None = None) -> dict | None:
    cands = [d for d in icfs if d["language"] == lang and _icf_type(d) == icf_type]
    if en_doc_id is not None:
        linked = [d for d in icfs if d["language"] == lang and d.get("source_doc_id") == en_doc_id]
        cands = linked or cands
    return max(cands, key=lambda d: d["id"], default=None)


def _matrix(docs: list[dict]) -> list[dict]:
    icfs = [d for d in docs if d["role"] == "icf"]
    types = {_icf_type(d) for d in icfs} | {
        d["icf_type"] for d in docs if d["role"] == "sponsor" and d["icf_type"]
    }
    rows = []
    for t in [x for x in TYPES if x in types] or ["adult"]:
        langs = {}
        for lang in LANGS:
            d = _cell(icfs, t, lang)
            v = _latest(d) if d else None
            langs[lang] = (
                {
                    "doc_id": d["id"],
                    "version_id": v["id"],
                    "version_number": v["number"],
                    "source": v["source"],
                    "comments_open": v.get("comments_open", 0),
                    "approved": bool(d.get("approved")),
                }
                if d and v
                else None
            )
        rows.append({"icf_type": t, "languages": langs})
    return rows


def compute(stage: str, docs: list[dict]) -> dict:
    """``docs``: dicts with id, role, icf_type, language, source_doc_id, versions[{id, number,
    source, comments_open}]."""
    cur = STAGES.index(stage)
    stages = []
    for i, key in enumerate(STAGES):
        reqs = _requirements(key, docs)
        stages.append(
            {
                "key": key,
                "state": "done" if i < cur else "current" if i == cur else "todo",
                "can_leave": all(r["met"] for r in reqs if r["blocking"]),
                "requirements": reqs,
            }
        )
    return {
        "stage": stage,
        "next_stage": STAGES[cur + 1] if cur + 1 < len(STAGES) else None,
        "stages": stages,
        "matrix": _matrix(docs),
    }


def missing_to_leave(stage: str, docs: list[dict]) -> list[str]:
    return [r["key"] for r in _requirements(stage, docs) if r["blocking"] and not r["met"]]
