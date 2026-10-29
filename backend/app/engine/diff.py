"""Paragraph-level diff of two docx files with word-level detail for changed paragraphs."""

import re
import unicodedata
from difflib import SequenceMatcher

from . import _xml
from .text import docx_paragraphs


def _norm(s: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", s).split())


def normalize_comment_text(s: str) -> str:
    return _norm(s or "").casefold()


def _tracked_count(path: str) -> int:
    root = _xml.read_part(path, "word/document.xml")
    if root is None:
        return 0
    return sum(1 for _ in root.iter(_xml.q("ins"), _xml.q("del")))


def _word_diff(old: str, new: str) -> list[dict]:
    a = re.findall(r"\S+\s*", old)
    b = re.findall(r"\S+\s*", new)
    sm = SequenceMatcher(None, [x.strip() for x in a], [x.strip() for x in b], autojunk=False)
    words: list[dict] = []

    def add(op: str, text: str):
        if not text:
            return
        if words and words[-1]["op"] == op:
            words[-1]["text"] += text
        else:
            words.append({"op": op, "text": text})

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            add("eq", "".join(b[j1:j2]))
        else:
            if i2 > i1:
                add("del", "".join(a[i1:i2]))
            if j2 > j1:
                add("ins", "".join(b[j1:j2]))
    return words


def _align(olds: list[str], news: list[str], blocks: list[dict], stats: dict):
    """Order-preserving pairing of changed paragraphs by similarity (>= 0.5)."""
    oi = 0
    for n in news:
        best, best_k = 0.5, None
        for k in range(oi, len(olds)):
            ratio = SequenceMatcher(None, _norm(olds[k]), _norm(n), autojunk=False).ratio()
            if ratio >= best:
                best, best_k = ratio, k
        if best_k is None:
            blocks.append({"kind": "insert", "old": None, "new": n, "words": None})
            stats["inserted"] += 1
            continue
        for k in range(oi, best_k):
            blocks.append({"kind": "delete", "old": olds[k], "new": None, "words": None})
            stats["deleted"] += 1
        blocks.append(
            {"kind": "replace", "old": olds[best_k], "new": n, "words": _word_diff(olds[best_k], n)}
        )
        stats["changed"] += 1
        oi = best_k + 1
    for k in range(oi, len(olds)):
        blocks.append({"kind": "delete", "old": olds[k], "new": None, "words": None})
        stats["deleted"] += 1


def diff_docs(old_path: str, new_path: str) -> dict:
    old = docx_paragraphs(old_path)
    new = docx_paragraphs(new_path)
    sm = SequenceMatcher(None, [_norm(x) for x in old], [_norm(x) for x in new], autojunk=False)
    blocks: list[dict] = []
    stats = {"inserted": 0, "deleted": 0, "changed": 0, "unchanged": 0}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                blocks.append(
                    {"kind": "equal", "old": old[i1 + k], "new": new[j1 + k], "words": None}
                )
                stats["unchanged"] += 1
            continue
        _align(old[i1:i2], new[j1:j2], blocks, stats)
    stats["tracked_changes"] = _tracked_count(new_path)
    return {"stats": stats, "blocks": blocks}
