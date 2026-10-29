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


__all__ = ["extract_comments", "etree"]
