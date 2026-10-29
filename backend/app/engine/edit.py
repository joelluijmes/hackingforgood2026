"""Paragraph-level editing of a docx as Word tracked changes, plus the mandatory-text guard.

Paragraph index = position of the w:p in `body.iter(w:p)` (tables included), so the same
index addresses the same paragraph when listing and when applying edits to that file.
"""

import copy
import re
import unicodedata
from datetime import UTC, datetime
from difflib import SequenceMatcher
from functools import lru_cache

from docx import Document
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph
from lxml import etree

from . import _xml
from ._xml import q
from .render import COLOR_CLASSES, _heading_level, _rgb, _slug, _style_color

AUTHOR = "ICF Studio"
# runs carrying these are kept as-is when a paragraph is rewritten (comment anchors, notes, fields)
_SPECIAL = {
    "commentReference", "footnoteReference", "endnoteReference", "drawing", "pict", "object",
    "fldChar", "instrText", "sym",
}  # fmt: skip
_TEXT = {"t", "tab", "br", "cr", "noBreakHyphen"}
_XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


def norm(s: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", s or "").split())


# -- inline formatting markers ---------------------------------------------------------------
# Paragraph text exchanged with the AI and the UI carries direct bold/italic as Markdown-style
# markers (**bold**, *italic*, ***both***; a literal asterisk is \*), so formatting edits are
# expressed in text and turned back into real run properties when applied.

Fmt = tuple[bool, bool]  # (bold, italic)
PLAIN: Fmt = (False, False)


def _fmt(rpr) -> Fmt:
    if rpr is None:
        return PLAIN
    return (rpr._get_bool_val("b") is True, rpr._get_bool_val("i") is True)


def _toggle(a: Fmt, b: Fmt) -> str:
    """Marker switching formatting a -> b ("**" flips bold, "*" flips italic)."""
    return "**" * (a[0] != b[0]) + "*" * (a[1] != b[1])


def to_marked(chars: list[tuple[str, Fmt]]) -> str:
    out: list[str] = []
    cur = PLAIN
    for ch, f in chars:
        if f != cur:
            out.append(_toggle(cur, f))
            cur = f
        out.append("\\*" if ch == "*" else ch)
    out.append(_toggle(cur, PLAIN))
    return "".join(out)


def parse_marked(s: str) -> list[tuple[str, Fmt]]:
    """Inverse of to_marked: characters with their (bold, italic) state."""
    out: list[tuple[str, Fmt]] = []
    bold = italic = False
    i = 0
    while i < len(s):
        if s.startswith("\\*", i):
            out.append(("*", (bold, italic)))
            i += 2
            continue
        if s[i] == "*":
            n = len(s[i:]) - len(s[i:].lstrip("*"))
            if n == 3:
                bold, italic = not bold, not italic
            elif n == 2:
                bold = not bold
            elif n == 1:
                italic = not italic
            else:  # a run of 4+ asterisks is text, not markup
                out.extend(("*", (bold, italic)) for _ in range(n))
            i += n
            continue
        out.append((s[i], (bold, italic)))
        i += 1
    return out


def plain(s: str) -> str:
    return "".join(ch for ch, _ in parse_marked(s))


def _in_del(r) -> bool:
    return any(True for _ in r.iterancestors(q("del")))


def _is_text_run(r) -> bool:
    kids = {etree.QName(c).localname for c in r}
    return bool(kids & _TEXT) and not (kids & _SPECIAL)


def _text_runs(p_el) -> list:
    return [r for r in p_el.iter(q("r")) if not _in_del(r) and _is_text_run(r)]


def para_marked(p_el) -> str:
    """Visible paragraph text with bold/italic markers."""
    chars: list[tuple[str, Fmt]] = []
    for r in _text_runs(p_el):
        f = _fmt(r.find(q("rPr")))
        chars.extend((ch, f) for ch in _xml.run_text(r))
    return to_marked(chars)


def _style_name(p: Paragraph) -> str:
    try:
        return p.style.name if p.style is not None else ""
    except Exception:
        return ""


def list_paragraphs(path: str) -> list[dict]:
    """Non-empty paragraphs: {idx, text (with bold/italic markers), section, heading}."""
    doc = Document(path)
    out: list[dict] = []
    section = ""
    used_anchors: set[str] = set()
    for i, p_el in enumerate(doc.element.body.iter(q("p"))):
        text = para_marked(p_el).strip()
        if not plain(text).strip():
            continue
        style_name = _style_name(Paragraph(p_el, doc._body))
        name = style_name.lower()
        heading = name.startswith(("heading", "titre", "kop"))
        anchor = None
        if heading:
            section = plain(text)[:120]
            if _heading_level(style_name) is not None:
                base = _slug(plain(text))
                anchor, n = base, 2
                while anchor in used_anchors:
                    anchor, n = f"{base}-{n}", n + 1
                used_anchors.add(anchor)
        out.append(
            {
                "idx": i,
                "text": text,
                "section": section,
                "heading": heading,
                "anchor": anchor,
            }
        )
    return out


# -- tracked-change rewrite ------------------------------------------------------------------


def _words(chars: list) -> list[str]:
    """Word/space tokens of a char list (by plain text)."""
    return re.findall(r"\s+|[^\s]+", "".join(c[0] for c in chars))


def _offsets(words: list[str]) -> list[int]:
    out = [0]
    for w in words:
        out.append(out[-1] + len(w))
    return out


def _run(rpr, text: str, deleted: bool = False):
    r = etree.Element(q("r"))
    if rpr is not None:
        r.append(copy.deepcopy(rpr))
    tag = "delText" if deleted else "t"
    for part in re.split(r"(\t|\n)", text):
        if part == "\t":
            etree.SubElement(r, q("tab"))
        elif part == "\n":
            etree.SubElement(r, q("br"))
        elif part:
            t = etree.SubElement(r, q(tag))
            t.text = part
            t.set(_XML_SPACE, "preserve")
    return r


def _clean_rpr(rpr):
    """Copy of rpr (or a new empty rPr) without any earlier tracked formatting change."""
    new = copy.deepcopy(rpr) if rpr is not None else OxmlElement("w:rPr")
    for old in new.findall(q("rPrChange")):
        new.remove(old)
    return new


def _with_fmt(rpr, f: Fmt):
    """Copy of rpr with direct bold/italic set to f."""
    new = _clean_rpr(rpr)
    new._remove_b()
    new._remove_i()
    if f[0]:
        new.get_or_add_b()
    if f[1]:
        new.get_or_add_i()
    return new


def _plan(old: list, new: list, default) -> list[tuple[str, object, Fmt, str]]:
    """Per character: (kind, source rPr, target fmt, char); kind in eq|fmt|del|ins."""
    plan: list[tuple[str, object, Fmt, str]] = []
    a, b = _words(old), _words(new)
    oa, ob = _offsets(a), _offsets(b)
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            pairs = zip(old[oa[i1] : oa[i2]], new[ob[j1] : ob[j2]], strict=True)
            for (ch, rpr), (_, f) in pairs:
                plan.append(("eq" if _fmt(rpr) == f else "fmt", rpr, f, ch))
            continue
        for ch, rpr in old[oa[i1] : oa[i2]]:
            plan.append(("del", rpr, _fmt(rpr), ch))
        k = oa[i1]
        base = old[k - 1][1] if k > 0 else default
        for ch, f in new[ob[j1] : ob[j2]]:
            plan.append(("ins", base, f, ch))
    return plan


def _rewrite(p_el, new_marked: str, author: str, date: str, ids) -> None:
    runs = _text_runs(p_el)
    # every visible character with its source run properties, so untouched text keeps its look
    old: list[tuple[str, object]] = []
    for r in runs:
        rpr = r.find(q("rPr"))
        old.extend((ch, rpr) for ch in _xml.run_text(r))
    default = next((rp for _, rp in old if rp is not None), None)
    plan = _plan(old, parse_marked(new_marked), default)
    # anchor = the direct child of p that holds the first text run (keeps comment ranges around it)
    anchor = None
    if runs:
        anchor = runs[0]
        while anchor.getparent() is not p_el:
            anchor = anchor.getparent()

    def tracked(kind: str):
        el = etree.Element(q(kind))
        el.set(q("id"), str(next(ids)))
        el.set(q("author"), author)
        el.set(q("date"), date)
        return el

    new_nodes: list = []
    i = 0
    while i < len(plan):
        kind, rpr, f, _ = plan[i]
        j = i
        while j < len(plan) and plan[j][0] == kind and plan[j][1] is rpr and plan[j][2] == f:
            j += 1
        text = "".join(c[3] for c in plan[i:j])
        if kind == "eq":
            new_nodes.append(_run(rpr, text))
        elif kind == "fmt":
            # formatting-only change: Word tracks it as w:rPrChange holding the old properties
            target = _with_fmt(rpr, f)
            change = tracked("rPrChange")
            change.append(_clean_rpr(rpr))
            target.append(change)
            new_nodes.append(_run(target, text))
        else:
            target = rpr if kind == "del" or _fmt(rpr) == f else _with_fmt(rpr, f)
            node = _run(target, text, deleted=kind == "del")
            last = new_nodes[-1] if new_nodes else None
            if last is not None and last.tag == q(kind):  # one w:ins / w:del per change
                last.append(node)
            else:
                wrap = tracked(kind)
                wrap.append(node)
                new_nodes.append(wrap)
        i = j
    if anchor is not None:
        pos = list(p_el).index(anchor)
    else:
        ppr = p_el.find(q("pPr"))
        pos = 1 if ppr is not None else 0
    for n, node in enumerate(new_nodes):
        p_el.insert(pos + n, node)
    for r in runs:
        r.getparent().remove(r)


def apply_edits(src: str, out: str, edits: list[dict], author: str = AUTHOR) -> dict:
    """edits: [{idx, old, new}] in marked text. Writes tracked changes.

    Returns {applied, skipped: [{idx, why}]}.
    """
    doc = Document(src)
    paras = list(doc.element.body.iter(q("p")))
    used = [int(x) for x in doc.element.xpath("//@w:id") if str(x).lstrip("-").isdigit()]
    counter = iter(range(max(used, default=0) + 1, 10**9))
    date = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    applied, skipped = 0, []
    for e in edits:
        idx = int(e["idx"])
        if not 0 <= idx < len(paras):
            skipped.append({"idx": idx, "why": "paragraph not found"})
            continue
        p_el = paras[idx]
        current = para_marked(p_el)
        if e.get("old") is not None and norm(current) != norm(e["old"]):
            skipped.append({"idx": idx, "why": "paragraph changed since the proposal"})
            continue
        if norm(current) == norm(e["new"]):
            continue
        _rewrite(p_el, e["new"].strip(), author, date, counter)
        applied += 1
    doc.save(out)
    return {"applied": applied, "skipped": skipped}


# -- mandatory-text guard --------------------------------------------------------------------


@lru_cache(maxsize=8)
def template_mandatory(path: str) -> tuple[str, ...]:
    """Paragraphs of a national template that are mostly purple (= mandatory wording)."""
    doc = Document(path)
    out: list[str] = []
    for p_el in doc.element.body.iter(q("p")):
        p = Paragraph(p_el, doc._body)
        try:
            pcolor = _style_color(p.style) if p.style is not None else None
        except Exception:
            pcolor = None
        purple = total = 0
        for r in p.runs:
            n = len(r.text.strip())
            if not n:
                continue
            try:
                color = _rgb(r.font) or _style_color(r.style) or pcolor
            except Exception:
                color = pcolor
            total += n
            if COLOR_CLASSES.get(color or "") == "purple":
                purple += n
        text = norm(p.text)
        if total and purple / total >= 0.6 and len(text) >= 40:
            out.append(text)
    return tuple(out)


def mandatory_match(text: str, mandatory: tuple[str, ...]) -> dict | None:
    """Best template match for a paragraph if it looks like mandatory wording (ratio >= 0.75)."""
    t = norm(text)
    if len(t) < 40:
        return None
    best, best_s = 0.0, None
    for m in mandatory:
        if abs(len(m) - len(t)) > max(len(m), len(t)) * 0.6:
            continue
        sm = SequenceMatcher(None, t, m, autojunk=False)
        if sm.real_quick_ratio() < best or sm.quick_ratio() < max(best, 0.75):
            continue
        r = sm.ratio()
        if r > best:
            best, best_s = r, m
    if best_s is None or best < 0.75:
        return None
    return {"score": round(best, 2), "template_text": best_s[:400]}
