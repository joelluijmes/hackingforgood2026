"""Shared low-level docx XML helpers (zip + lxml)."""

import zipfile

from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W14 = "http://schemas.microsoft.com/office/word/2010/wordml"
W15 = "http://schemas.microsoft.com/office/word/2012/wordml"
NS = {"w": W, "w14": W14, "w15": W15}


def q(tag: str) -> str:
    return f"{{{W}}}{tag}"


def read_part(path: str, name: str) -> etree._Element | None:
    with zipfile.ZipFile(path) as z:
        try:
            data = z.read(name)
        except KeyError:
            return None
    return etree.fromstring(data, etree.XMLParser(resolve_entities=False, no_network=True))


def run_text(r, include_deleted: bool = False) -> str:
    """Text of one w:r. w:delText only when include_deleted."""
    out = []
    for c in r:
        tag = etree.QName(c).localname
        if tag == "t" or (tag == "delText" and include_deleted):
            out.append(c.text or "")
        elif tag == "tab":
            out.append("\t")
        elif tag in ("br", "cr"):
            out.append("\n")
        elif tag == "noBreakHyphen":
            out.append("-")
    return "".join(out)


def para_text(p, include_deleted: bool = False) -> str:
    """Visible text of a w:p (tracked insertions included, deletions excluded by default)."""
    out = []
    for r in p.iter(q("r")):
        if not include_deleted and any(a.tag == q("del") for a in r.iterancestors(q("del"))):
            continue
        out.append(run_text(r, include_deleted))
    return "".join(out)
