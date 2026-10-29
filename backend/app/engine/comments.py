"""Extract Word comments (+ replies, resolved flag, anchor text) from a docx."""

from lxml import etree

from . import _xml
from ._xml import W14, W15, q

_PARA_ID = f"{{{W14}}}paraId"


def _comment_text(c) -> tuple[str, str | None]:
    paras = []
    last_pid = None
    for p in c.iter(q("p")):
        paras.append(_xml.para_text(p))
        last_pid = p.get(_PARA_ID) or last_pid
    return "\n".join(paras).strip(), last_pid


def _anchors(path: str) -> tuple[list[str], dict[str, str]]:
    """Comment ids in order of range start, and the visible text covered by each range."""
    root = _xml.read_part(path, "word/document.xml")
    order: list[str] = []
    anchors: dict[str, list[str]] = {}
    if root is None:
        return order, {}
    active: list[str] = []
    for el in root.iter():
        tag = el.tag
        if tag == q("commentRangeStart"):
            cid = el.get(q("id"))
            if cid is not None and cid not in active:
                active.append(cid)
                if cid not in anchors:
                    order.append(cid)
                    anchors[cid] = []
        elif tag == q("commentRangeEnd"):
            cid = el.get(q("id"))
            if cid in active:
                active.remove(cid)
        elif tag == q("r") and active:
            if any(True for _ in el.iterancestors(q("del"))):
                continue
            t = _xml.run_text(el)
            if t:
                for cid in active:
                    anchors[cid].append(t)
        elif tag == q("p") and active:
            for cid in active:
                anchors[cid].append(" ")
    return order, {k: " ".join("".join(v).split())[:300] for k, v in anchors.items()}


def extract_comments(path: str) -> list[dict]:
    croot = _xml.read_part(path, "word/comments.xml")
    if croot is None:
        return []
    ext = _xml.read_part(path, "word/commentsExtended.xml")
    ex_by_pid: dict[str, tuple[str | None, bool]] = {}
    if ext is not None:
        for e in ext.iter(f"{{{W15}}}commentEx"):
            pid = e.get(f"{{{W15}}}paraId")
            ex_by_pid[pid] = (
                e.get(f"{{{W15}}}paraIdParent"),
                e.get(f"{{{W15}}}done") in ("1", "true"),
            )
    raw: dict[str, dict] = {}
    pid_to_id: dict[str, str] = {}
    for c in croot.findall(q("comment")):
        cid = c.get(q("id"))
        text, pid = _comment_text(c)
        raw[cid] = {
            "ext_id": cid,
            "author": c.get(q("author")) or "",
            "initials": c.get(q("initials")) or "",
            "date": c.get(q("date")),
            "text": text,
            "_pid": pid,
        }
        if pid:
            pid_to_id[pid] = cid
    order, anchors = _anchors(path)
    ids = [i for i in order if i in raw] + [i for i in raw if i not in order]
    out = []
    for cid in ids:
        d = raw[cid]
        parent_pid, done = ex_by_pid.get(d["_pid"], (None, False))
        out.append(
            {
                "ext_id": d["ext_id"],
                "author": d["author"],
                "initials": d["initials"],
                "date": d["date"],
                "text": d["text"],
                "anchor_text": anchors.get(cid, ""),
                "parent_ext_id": pid_to_id.get(parent_pid) if parent_pid else None,
                "resolved": done,
            }
        )
    return out




def _split_run(run, offset: int):
    """Split a text run at `offset` chars; returns (left, right) runs (left keeps the element)."""
    import copy

    from docx.text.run import Run

    el = run._r
    new = copy.deepcopy(el)
    text = run.text
    run.text = text[:offset]
    el.addnext(new)
    right = Run(new, run._parent)
    right.text = text[offset:]
    return run, right


def add_user_comment(
    src: str, dst: str, *, anchor: str, text: str, author: str, initials: str
) -> tuple[str, str]:
    """Anchor a new Word comment on `anchor` (first match in one paragraph); save to `dst`.

    Returns (ext_id, matched_text). Raises ValueError when the text cannot be located.
    """
    import re

    from docx import Document
    from docx.text.paragraph import Paragraph

    doc = Document(src)
    lines = [ln.strip() for ln in re.split(r"[\n\r]+", anchor) if ln.strip()]
    cands = [" ".join(anchor.split())] + sorted(lines, key=len, reverse=True)
    for p_el in doc.element.body.iter(q("p")):
        p = Paragraph(p_el, doc._body)
        runs = [r for r in p.runs if r.text]
        full = "".join(r.text for r in runs)
        for cand in cands:
            if not cand:
                continue
            pat = r"\s+".join(re.escape(w) for w in cand.split())
            m = re.search(pat, full)
            if not m:
                continue
            start, end = m.span()
            pos, sel = 0, []
            for r in runs:
                n = len(r.text)
                a, b = max(start - pos, 0), min(end - pos, n)
                if a < b:
                    cur = r
                    if a > 0:
                        _, cur = _split_run(cur, a)
                        b -= a
                    if b < len(cur.text):
                        cur, _ = _split_run(cur, b)
                    sel.append(cur)
                pos += n
            if not sel:
                continue
            c = doc.add_comment(sel, text=text, author=author, initials=initials)
            doc.save(dst)
            return str(c.comment_id), m.group(0)
    raise ValueError("selected text not found in the document")


__all__ = ["add_user_comment", "extract_comments", "etree"]
