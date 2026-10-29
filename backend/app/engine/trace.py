"""Source traceability: where each part of an ICF version comes from, with evidence.

Every claim is backed by something checkable instead of guessed from headings:
- template text: the paragraph matches a paragraph of the national template (purple = mandatory);
  near-matches are "changed template text" and show the official wording next to it;
- AI-filled text: runs inside the generator's `icf_fill_N` bookmarks; each fill is matched to the
  sponsor passage that supports it, and every number in it must occur in the sponsor documents;
- gaps: unfilled (blue / yellow-highlighted) placeholders and "Missing: ..." generator comments;
- other text: neither template nor AI fill (written by a reviewer, or an uploaded ICF).
Sources the generator recorded on the version (`versions.sources_json`) are facts; anything inferred
from the project is returned with `recorded: false` so the UI can say so.

`cite()` answers "where does this selected text come from?" with file, section and quote.
"""

from __future__ import annotations

import json
import re
import threading
import time
from collections import Counter
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from functools import lru_cache

from docx import Document
from docx.text.paragraph import Paragraph

from .. import storage
from . import _xml
from ._xml import q
from .edit import norm
from .render import COLOR_CLASSES, _heading_level, _rgb, _style_color, is_toc_paragraph

TEMPLATE_SAME = 0.97  # >= : template text unchanged
TEMPLATE_NEAR = 0.75  # >= : changed template text
SUPPORTED = 0.6  # share of a fill's content words found in one sponsor passage
PARTIAL = 0.3
_STOP = set(
    # en
    "that this with from your will have what which when about they their there been were would "
    "could should these those other than then also into only more most such some each very "
    # nl
    "deze voor niet zijn wordt worden door maar heeft hebben onze naar over meer zoals tijdens "
    "kunnen zullen word bent hun haar hoe wat welke wanneer omdat "
    # fr
    "pour dans avec vous votre sont cette sera peut être avez avoir mais plus elle nous leur "
    "leurs aussi comme entre lors dont tout tous toutes".split()
)
_NUM = re.compile(r"(?<![\d.,])\d+(?:[.,]\d+)?(?!\d)")  # also "8Gy", "150participants"


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[^\W\d_]{4,}", text.lower()) if w not in _STOP}


def _numbers(text: str) -> set[str]:
    return {m.replace(",", ".") for m in _NUM.findall(text)}


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?;:])\s+(?=[A-Z0-9«“\"(])", text)
    return [p.strip() for p in parts if p.strip()]


def _cover(needle: str, hay: str) -> float:
    """Share of `needle` (normalised) found in `hay` as matching blocks."""
    a, b = norm(needle).lower(), norm(hay).lower()
    if not a:
        return 0.0
    sm = SequenceMatcher(None, a, b, autojunk=False)
    return sum(m.size for m in sm.get_matching_blocks()) / len(a)


# -- indexes (cached per file path; stored files never change) --------------------------------


@dataclass
class _Passage:
    text: str
    section: str
    words: set[str]
    norm: str = ""
    purple: bool = False


@dataclass
class _Index:
    passages: list[_Passage]
    inv: dict[str, list[int]] = field(default_factory=dict)
    exact: dict[str, int] = field(default_factory=dict)
    numbers: set[str] = field(default_factory=set)

    def build(self) -> _Index:
        for i, p in enumerate(self.passages):
            for w in p.words:
                self.inv.setdefault(w, []).append(i)
            if p.norm:
                self.exact.setdefault(p.norm, i)
            self.numbers |= _numbers(p.text)
        return self

    def candidates(self, words: set[str], k: int = 8) -> list[int]:
        hits: Counter[int] = Counter()
        for w in words:
            ids = self.inv.get(w, ())
            if len(ids) > 60:  # too common to discriminate
                continue
            for i in ids:
                hits[i] += 1
        return [i for i, _ in hits.most_common(k)]


def _run_color(run, para_color):
    try:
        return _rgb(run.font) or _style_color(run.style) or para_color
    except Exception:
        return para_color


@lru_cache(maxsize=8)
def _template_index(path: str) -> _Index:
    """Non-guidance paragraphs of a national template; purple-majority ones are mandatory."""
    doc = Document(path)
    out: list[_Passage] = []
    section = ""
    for p_el in doc.element.body.iter(q("p")):
        p = Paragraph(p_el, doc._body)
        try:
            pcolor = _style_color(p.style) if p.style is not None else None
            style = p.style.name if p.style is not None else ""
        except Exception:
            pcolor, style = None, ""
        text, purple, total = [], 0, 0
        for r in p.runs:
            c = COLOR_CLASSES.get(_run_color(r, pcolor) or "")
            if c == "red":
                continue
            text.append(r.text)
            n = len(r.text.strip())
            total += n
            purple += n if c == "purple" else 0
        t = "".join(text).strip()
        if not t:
            continue
        if _heading_level(style) is not None:
            section = t[:120]
        if len(t) < 12:
            continue
        out.append(
            _Passage(t, section, _words(t), norm(t).lower(), bool(total) and purple / total >= 0.6)
        )
    return _Index(out).build()


@lru_cache(maxsize=32)
def _sponsor_index(path: str) -> _Index:
    """Sponsor document paragraphs (and table rows) with the heading they sit under."""
    doc = Document(path)
    out: list[_Passage] = []
    section = ""
    body = doc.element.body
    for el in body.iterchildren():
        if el.tag == q("p"):
            p = Paragraph(el, doc._body)
            t = p.text.strip()
            if not t:
                continue
            try:
                style = p.style.name if p.style is not None else ""
            except Exception:
                style = ""
            is_heading = _heading_level(style) is not None or (
                len(t) < 90 and (t.endswith("?") or (t.isupper() and len(t) > 4))
            )
            if is_heading:
                section = t[:120]
                continue
            out.append(_Passage(t, section, _words(t)))
        elif el.tag == q("tbl"):
            for tr in el.iter(q("tr")):
                cells = []
                for tc in tr.iter(q("tc")):
                    ct = " ".join(_xml.para_text(p) for p in tc.iter(q("p"))).strip()
                    if ct and ct not in cells:
                        cells.append(ct)
                t = " | ".join(cells)
                if t:
                    out.append(_Passage(t, section, _words(t)))
    return _Index(out).build()


# -- the ICF itself --------------------------------------------------------------------------


def _icf_paragraphs(path: str) -> list[dict]:
    """Non-empty paragraphs: {idx, text, section, heading, fills, placeholders}."""
    doc = Document(path)
    out: list[dict] = []
    section = ""
    for idx, p_el in enumerate(doc.element.body.iter(q("p"))):
        text = _xml.para_text(p_el).strip()
        if not text or is_toc_paragraph(p_el):
            continue
        p = Paragraph(p_el, doc._body)
        try:
            style = p.style.name if p.style is not None else ""
            pcolor = _style_color(p.style) if p.style is not None else None
        except Exception:
            style, pcolor = "", None
        heading = _heading_level(style) is not None
        if heading:
            section = text[:120]
        fills: list[str] = []
        holes: list[str] = []
        open_fill: set[str] = set()
        cur: list[str] = []
        blue: list[str] = []
        for el in p_el.iter():
            tag = el.tag
            if tag == q("bookmarkStart") and (el.get(q("name")) or "").startswith("icf_fill"):
                open_fill.add(el.get(q("id")))
            elif tag == q("bookmarkEnd") and el.get(q("id")) in open_fill:
                open_fill.discard(el.get(q("id")))
                if not open_fill and "".join(cur).strip():
                    fills.append("".join(cur).strip())
                    cur = []
            elif tag == q("r"):
                if any(True for _ in el.iterancestors(q("del"))):
                    continue
                rt = _xml.run_text(el)
                if open_fill:
                    cur.append(rt)
                rpr = el.find(q("rPr"))
                color = rpr.find(q("color")) if rpr is not None else None
                hl = rpr.find(q("highlight")) if rpr is not None else None
                is_blue = (
                    color is not None and (color.get(q("val")) or "").upper() == "0000FF"
                ) or (color is None and pcolor == "0000FF")
                if (is_blue or (hl is not None and hl.get(q("val")) == "yellow")) and rt.strip():
                    blue.append(rt)
                elif blue:
                    holes.append("".join(blue).strip())
                    blue = []
        if blue:
            holes.append("".join(blue).strip())
        out.append(
            {
                "idx": idx,
                "text": text,
                "section": section,
                "heading": heading,
                "fills": fills,
                "placeholders": [h for h in holes if len(re.sub(r"\W", "", h)) >= 3],
            }
        )
    return out


# -- sources ---------------------------------------------------------------------------------


def _src(kind: str, **kw) -> dict:
    return {"kind": kind, "recorded": True, **{k: v for k, v in kw.items() if v is not None}}


def recorded_sources(row) -> list[dict]:
    """Sources stored on a version at creation time (cheap; used in version listings)."""
    raw = row["sources_json"] if "sources_json" in row.keys() else None  # noqa: SIM118
    if not raw:
        return []
    try:
        items = json.loads(raw)
    except ValueError:
        return []
    return [{"recorded": True, **s} for s in items if isinstance(s, dict)]


def _template_row(conn, language: str | None):
    return conn.execute(
        "SELECT * FROM documents WHERE kind = 'template' AND language = ?"
        " AND filename LIKE '%.docx'"
        " ORDER BY COALESCE(released, '') DESC, COALESCE(version, '') DESC, id DESC LIMIT 1",
        (language or "en",),
    ).fetchone()


def template_source(row) -> dict:
    return _src(
        "template",
        template_id=row["id"],
        doc_id=row["id"],
        name=row["name"] or row["filename"],
        filename=row["filename"],
        version=row["version"],
        language=row["language"],
    )


def version_source(conn, vid: int, relation: str) -> dict | None:
    r = conn.execute(
        "SELECT v.id, v.number, v.filename, d.id AS doc_id, d.title, d.language FROM versions v"
        " JOIN project_docs d ON d.id = v.doc_id WHERE v.id = ?",
        (vid,),
    ).fetchone()
    if not r:
        return None
    return _src(
        "icf",
        doc_id=r["doc_id"],
        version_id=r["id"],
        version_number=r["number"],
        name=r["title"],
        filename=r["filename"],
        language=r["language"],
        relation=relation,
    )


def _inherited(conn, vid: int, hops: int = 12) -> tuple[int | None, list[dict]]:
    """Sponsor/template sources recorded on `vid` or the closest version it derives from."""
    seen: set[int] = set()
    while vid and vid not in seen and hops:
        seen.add(vid)
        hops -= 1
        row = conn.execute("SELECT * FROM versions WHERE id = ?", (vid,)).fetchone()
        if not row:
            break
        rec = [s for s in recorded_sources(row) if s["kind"] in ("sponsor", "template")]
        if rec:
            return row["number"], rec
        chg = conn.execute(
            "SELECT source_version_id FROM changes WHERE result_version_id = ? LIMIT 1", (vid,)
        ).fetchone()
        if chg:
            vid = chg["source_version_id"]
            continue
        prev = conn.execute(
            "SELECT id FROM versions WHERE doc_id = ? AND number < ? ORDER BY number DESC LIMIT 1",
            (row["doc_id"], row["number"]),
        ).fetchone()
        vid = prev["id"] if prev else None
    return None, []


def resolve_version_sources(conn, v_row, d_row=None) -> list[dict]:
    """Recorded sources of a version, completed with inferred ones (marked recorded=false).

    Edited/propagated/re-uploaded versions inherit the sponsor documents and template recorded on
    the version they derive from.
    """
    if d_row is None:
        d_row = conn.execute(
            "SELECT * FROM project_docs WHERE id = ?", (v_row["doc_id"],)
        ).fetchone()
    sources = recorded_sources(v_row)
    if not d_row or d_row["role"] != "icf":
        return sources
    have = {s["kind"] for s in sources}

    # derived versions: record the version they were made from, inherit its sponsors/template
    if v_row["number"] > 1 and "icf" not in have:
        chg = conn.execute(
            "SELECT source_version_id FROM changes WHERE result_version_id = ? LIMIT 1",
            (v_row["id"],),
        ).fetchone()
        prev = conn.execute(
            "SELECT id FROM versions WHERE doc_id = ? AND number < ? ORDER BY number DESC LIMIT 1",
            (d_row["id"], v_row["number"]),
        ).fetchone()
        base_id = chg["source_version_id"] if chg else (prev["id"] if prev else None)
        if base_id:
            s = version_source(conn, base_id, "previous version")
            if s:
                sources.append(s)
    src_doc = d_row["source_doc_id"] if "source_doc_id" in d_row.keys() else None  # noqa: SIM118
    if src_doc and not any(s["kind"] == "icf" for s in sources):  # translated from this ICF
        r = conn.execute(
            "SELECT id FROM versions WHERE doc_id = ? ORDER BY number DESC LIMIT 1", (src_doc,)
        ).fetchone()
        s = version_source(conn, r["id"], "translated from") if r else None
        if s:
            sources.append({**s, "recorded": False})
    kinds = {s["kind"] for s in sources}
    base = next((s for s in sources if s["kind"] == "icf" and s.get("version_id")), None)
    if base and not {"sponsor", "template"} <= kinds:
        number, inherited = _inherited(conn, base["version_id"])
        sources += [
            {**s, "relation": f"recorded on v{number}"} for s in inherited if s["kind"] not in kinds
        ]
        kinds = {s["kind"] for s in sources}
    if "sponsor" not in kinds:  # not recorded: sponsor docs of this project are only candidates
        rows = conn.execute(
            "SELECT d.id AS doc_id, d.title, d.icf_type, d.language, v.id AS version_id,"
            " v.number, v.filename FROM project_docs d JOIN versions v ON v.doc_id = d.id"
            " WHERE d.project_id = ? AND d.role = 'sponsor'"
            " AND v.number = (SELECT MAX(number) FROM versions WHERE doc_id = d.id) ORDER BY d.id",
            (d_row["project_id"],),
        ).fetchall()
        same = [r for r in rows if r["icf_type"] == d_row["icf_type"]]
        for r in same or rows:
            sources.append(
                {
                    **_src(
                        "sponsor",
                        doc_id=r["doc_id"],
                        version_id=r["version_id"],
                        version_number=r["number"],
                        name=r["title"],
                        filename=r["filename"],
                        language=r["language"],
                    ),
                    "recorded": False,
                }
            )
    if "template" not in kinds:
        tpl = _template_row(conn, d_row["language"])
        if tpl:
            sources.append({**template_source(tpl), "recorded": False})
    return sources


# -- analysis --------------------------------------------------------------------------------

_cache: dict[tuple, dict] = {}
_lock = threading.Lock()


def _version_path_ctx(conn, vid: int):
    v = conn.execute("SELECT stored_name, filename FROM versions WHERE id = ?", (vid,)).fetchone()
    if not v or not (v["filename"] or "").lower().endswith(".docx"):
        return None
    return storage.local_path(v["stored_name"])


def _load(
    conn, sources: list[dict], language: str | None
) -> tuple[_Index | None, list[tuple[dict, _Index]]]:
    tpl_idx = None
    tpl = next((s for s in sources if s["kind"] == "template"), None)
    if tpl:
        row = conn.execute(
            "SELECT stored_name FROM documents WHERE id = ?", (tpl["template_id"],)
        ).fetchone()
        if row:
            try:
                with storage.local_path(row["stored_name"]) as p:
                    tpl_idx = _template_index(str(p))
            except (FileNotFoundError, ValueError):
                tpl_idx = None
    sponsors: list[tuple[dict, _Index]] = []
    for s in sources:
        if s["kind"] != "sponsor" or not s.get("version_id"):
            continue
        ctx = _version_path_ctx(conn, s["version_id"])
        if ctx is None:
            continue
        try:
            with ctx as p:
                sponsors.append((s, _sponsor_index(str(p))))
        except (FileNotFoundError, ValueError):
            continue
    return tpl_idx, sponsors


def _template_match(idx: _Index, text: str) -> tuple[float, _Passage | None]:
    n = norm(text).lower()
    hit = idx.exact.get(n)
    if hit is not None:
        return 1.0, idx.passages[hit]
    best, best_p = 0.0, None
    for i in idx.candidates(_words(text), 6):
        p = idx.passages[i]
        sm = SequenceMatcher(None, n, p.norm, autojunk=False)
        if sm.real_quick_ratio() <= best or sm.quick_ratio() <= best:
            continue
        r = sm.ratio()
        if r > best:
            best, best_p = r, p
    return best, best_p


def _sponsor_evidence(
    sponsors: list[tuple[dict, _Index]], text: str, language: str | None, context: str = ""
) -> dict:
    """Best supporting sponsor passage for `text` + its numbers missing from the sponsor documents.

    Short fills ("150", a drug name) are located with the words of the sentence around them
    (`context`), and a passage only counts as support if it also contains the fill's numbers.
    """
    if not sponsors:
        return {"level": "no_sponsor", "score": 0.0, "missing_numbers": []}
    nums = _numbers(text)
    all_nums = set().union(*(ix.numbers for _, ix in sponsors))
    missing = sorted(n for n in nums if n not in all_nums)
    words = _words(text)
    if len(words) < 3 and context:
        words = words | _words(context)
    best: tuple[float, dict, _Passage] | None = None
    for src, ix in sponsors:
        ids = ix.candidates(words, 12)
        if nums:  # passages that state the same figures are candidates too
            ids += [i for i, p in enumerate(ix.passages) if nums <= _numbers(p.text)][:20]
        for i in dict.fromkeys(ids):
            p = ix.passages[i]
            score = len(words & p.words) / max(1, len(words))
            if nums and nums <= _numbers(p.text) and score > 0:
                score = min(1.0, score + 0.2)  # states the same figures: strong evidence
            elif nums and not nums & _numbers(p.text):
                score *= 0.5  # the figure itself is not in this passage
            if best is None or score > best[0]:
                best = (score, src, p)
    same_lang = all((s.get("language") or language) == language for s, _ in sponsors)
    if best is None or best[0] < PARTIAL:
        level = "none" if same_lang else "cross_language"
        out = {
            "level": level,
            "score": round(best[0], 2) if best else 0.0,
            "missing_numbers": missing,
        }
        if best and best[0] >= 0.15:  # weak hint is still worth showing
            out["passage"] = _quote(best[1], best[2], words)
        return out
    return {
        "level": "supported" if best[0] >= SUPPORTED else "partial",
        "score": round(best[0], 2),
        "missing_numbers": missing,
        "passage": _quote(best[1], best[2], words),
    }


def _quote(src: dict, p: _Passage, words: set[str]) -> dict:
    sents = _sentences(p.text) or [p.text]
    best = max(sents, key=lambda s: len(words & _words(s)))
    return {
        "source": {
            k: src.get(k)
            for k in (
                "kind",
                "name",
                "filename",
                "doc_id",
                "version_id",
                "version_number",
                "language",
                "recorded",
            )
        },
        "section": p.section,
        "sentence": best[:500],
        "context": p.text[:900],
    }


def _generator_marks(conn, vid: int) -> tuple[list[str], list[str]]:
    """Text the generator marked with Word comments: (filled from sponsor, missing information).

    Older drafts mark fills with a "Filled from sponsor documents" comment instead of a bookmark.
    """
    fills, missing = [], []
    for r in conn.execute(
        "SELECT text, anchor_text FROM comments WHERE version_id = ? AND author = 'ICF Studio'",
        (vid,),
    ):
        text, anchor = (r["text"] or "").lower(), (r["anchor_text"] or "").strip()
        if not anchor:
            continue
        if text.startswith("filled from sponsor"):
            fills.append(anchor)
        elif text.startswith(("missing:", "information missing")):
            missing.append(anchor)
    return fills, missing


def build_version_trace(conn, vid: int) -> dict:
    t0 = time.time()
    v_row = conn.execute("SELECT * FROM versions WHERE id = ?", (vid,)).fetchone()
    if not v_row:
        raise ValueError("Version not found")
    d_row = conn.execute("SELECT * FROM project_docs WHERE id = ?", (v_row["doc_id"],)).fetchone()
    sources = resolve_version_sources(conn, v_row, d_row)
    key = (vid, json.dumps(sources, sort_keys=True))
    with _lock:
        if key in _cache:
            return _cache[key]
    lang = d_row["language"]
    tpl_idx, sponsors = _load(conn, sources, lang)
    ctx = _version_path_ctx(conn, vid)
    paras: list[dict] = []
    if ctx is not None:
        with ctx as p:
            paras = _icf_paragraphs(str(p))
    fill_anchors, missing_anchors = _generator_marks(conn, vid)

    out_paras: list[dict] = []
    stats = Counter()
    attention: list[dict] = []
    body = [p for p in paras if not p["heading"]]
    tpl_hits = 0
    for p in body:
        item: dict = {"idx": p["idx"], "section": p["section"], "text": p["text"][:600]}
        score, tp = _template_match(tpl_idx, p["text"]) if tpl_idx else (0.0, None)
        if tp and score >= TEMPLATE_NEAR:
            tpl_hits += 1
            item["template"] = {
                "score": round(score, 2),
                "mandatory": tp.purple,
                "section": tp.section,
            }
        gaps = list(p["placeholders"]) + [a for a in missing_anchors if a in p["text"]]
        fills = list(dict.fromkeys(p["fills"] + [a for a in fill_anchors if a in p["text"]]))
        if fills:
            kind = "ai_fill"
            ev = _sponsor_evidence(sponsors, " ".join(fills), lang, p["text"])
            item["fills"] = fills
            item["evidence"] = ev
            stats[f"ai_{ev['level']}"] += 1
            if ev["level"] in ("none", "no_sponsor") or ev["missing_numbers"]:
                attention.append({"type": "ai_unsupported", "idx": p["idx"]})
        elif gaps:
            kind = "gap"
            item["gaps"] = list(dict.fromkeys(g[:160] for g in gaps))[:5]
            attention.append({"type": "gap", "idx": p["idx"]})
        elif tp and score >= TEMPLATE_SAME:
            kind = "template"
        elif tp and score >= TEMPLATE_NEAR:
            kind = "template_changed"
            item["template"]["text"] = tp.text[:900]
            if tp.purple:
                attention.append({"type": "mandatory_changed", "idx": p["idx"]})
        else:
            kind = "other"
            if sponsors:
                ev = _sponsor_evidence(sponsors, p["text"], lang)
                if ev["level"] in ("supported", "partial"):
                    item["evidence"] = ev
        item["kind"] = kind
        stats[kind] += 1
        out_paras.append(item)

    applicable = bool(tpl_idx) and tpl_hits >= max(3, 0.15 * len(body))
    if not applicable:  # e.g. child/adolescent forms that do not follow the adult template
        for it in out_paras:
            if it["kind"] in ("template", "template_changed"):
                stats[it["kind"]] -= 1
                stats["other"] += 1
                it["kind"] = "other"
        attention = [a for a in attention if a["type"] != "mandatory_changed"]

    sections: list[dict] = []
    for it in out_paras:
        if not sections or sections[-1]["title"] != it["section"]:
            sections.append(
                {
                    "title": it["section"] or "(start of document)",
                    "first_idx": it["idx"],
                    "counts": Counter(),
                }
            )
        sections[-1]["counts"][it["kind"]] += 1
    for s in sections:
        s["counts"] = dict(s["counts"])

    tpl_src = next((s for s in sources if s["kind"] == "template"), None)
    result = {
        "version_id": vid,
        "version_number": v_row["number"],
        "doc_title": d_row["title"],
        "language": lang,
        "icf_type": d_row["icf_type"],
        "sources": sources,
        "template": {
            "name": (tpl_src or {}).get("name"),
            "version": (tpl_src or {}).get("version"),
            "applicable": applicable,
        },
        "stats": {k: v for k, v in stats.items() if v},
        "attention": attention,
        "paragraphs": out_paras,
        "sections": sections,
        "elapsed_ms": int((time.time() - t0) * 1000),
    }
    with _lock:
        if len(_cache) > 64:
            _cache.clear()
        _cache[key] = result
    return result


def cite(conn, vid: int, selection: str) -> dict:
    """Where does a selected piece of this version come from? File, section and quote per source."""
    sel = " ".join((selection or "").split())[:2000]
    v_row = conn.execute("SELECT * FROM versions WHERE id = ?", (vid,)).fetchone()
    if not v_row or not sel:
        raise ValueError("Nothing selected")
    d_row = conn.execute("SELECT * FROM project_docs WHERE id = ?", (v_row["doc_id"],)).fetchone()
    sources = resolve_version_sources(conn, v_row, d_row)
    lang = d_row["language"]
    tpl_idx, sponsors = _load(conn, sources, lang)
    out: dict = {"selection": sel[:500], "sources": sources}

    # was it written by the AI generator? (selection inside an icf_fill bookmark)
    ctx = _version_path_ctx(conn, vid)
    fills, _ = _generator_marks(conn, vid)
    if ctx is not None:
        with ctx as p:
            fills += [f for para in _icf_paragraphs(str(p)) for f in para["fills"]]
    n_sel = norm(sel).lower()
    out["ai_fill"] = any(n_sel in norm(f).lower() or norm(f).lower() in n_sel for f in fills if f)

    if tpl_idx:
        best, best_p = 0.0, None
        for i in tpl_idx.candidates(_words(sel), 10):
            c = _cover(sel, tpl_idx.passages[i].text)
            if c > best:
                best, best_p = c, tpl_idx.passages[i]
        if best_p is not None and best >= 0.6:
            tpl_src = next(s for s in sources if s["kind"] == "template")
            out["template"] = {
                "source": tpl_src,
                "section": best_p.section,
                "mandatory": best_p.purple,
                "score": round(best, 2),
                "text": best_p.text[:900],
            }

    # verbatim template wording does not come from the sponsor: a word match there is noise
    tpl = out.get("template")
    if out["ai_fill"] or not tpl or tpl["score"] < 0.9:
        out["sponsor"] = _sponsor_evidence(sponsors, sel, lang)

    # previous / source version: unchanged since then, or new in this version?
    base = next((s for s in sources if s["kind"] == "icf" and s.get("version_id")), None)
    if base:
        bctx = _version_path_ctx(conn, base["version_id"])
        if bctx is not None:
            with bctx as p:
                best, best_t = 0.0, ""
                words = _words(sel)
                for para in _icf_paragraphs(str(p)):
                    if words and not (words & _words(para["text"])):
                        continue
                    c = _cover(sel, para["text"])
                    if c > best:
                        best, best_t = c, para["text"]
            out["previous"] = {
                "source": base,
                "found": best >= 0.9,
                "score": round(best, 2),
                "section": "",
                "text": best_t[:900] if best >= 0.6 else "",
            }
    return out
