"""Plain-text extraction (tracked changes accepted)."""

from . import _xml
from ._xml import q
from .render import is_toc_paragraph


def _block_lines(container) -> list[str]:
    lines: list[str] = []
    for child in container:
        if child.tag == q("p"):
            if is_toc_paragraph(child):
                continue
            t = _xml.para_text(child).strip()
            if t:
                lines.append(t)
        elif child.tag == q("tbl"):
            for tr in child.iter(q("tr")):
                cells = []
                for tc in tr.findall(q("tc")):
                    cells.append(" ".join(_block_lines(tc)))
                row = " | ".join(c for c in cells if c)
                if row.strip():
                    lines.append(row)
        elif child.tag == q("sdt"):
            content = child.find(q("sdtContent"))
            if content is not None:
                lines.extend(_block_lines(content))
    return lines


def docx_paragraphs(path: str) -> list[str]:
    root = _xml.read_part(path, "word/document.xml")
    if root is None:
        return []
    body = root.find(q("body"))
    return _block_lines(body) if body is not None else []


def docx_text(path: str) -> str:
    return "\n".join(docx_paragraphs(path))
