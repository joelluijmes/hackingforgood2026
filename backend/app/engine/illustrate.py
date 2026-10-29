"""Place stock illustrations next to the sections of a child (8-11) / adolescent ICF.

Each library image carries topic tags (radiotherapy, scan, blood, doctor, ...). A section's topics
come from keywords (EN/NL/FR) in its heading (weighted) and first paragraphs; every image is used at
most once, each section gets at most one, and only clear matches are placed. The picture goes into
a new paragraph right under the section heading, with the image name as alt text.
"""

from __future__ import annotations

import re

from docx import Document
from docx.oxml import OxmlElement
from docx.shared import Cm, Pt
from docx.text.paragraph import Paragraph
from lxml import etree

from . import _xml
from ._xml import q
from .render import _WP, _heading_level, is_toc_paragraph

# topic -> keywords (lower case, matched as word prefixes) in English, Dutch and French
TOPICS: dict[str, list[str]] = {
    "radiotherapy": ["radiotherap", "radiation", "irradiat", "tbi", "gray", "bestral", "straling",
                     "radiothérap", "rayons", "x-ray", "röntgen"],
    "scan": ["mri", "scan", "imaging", "pet-", "ct ", "irm", "scanner", "echograf", "ultrasound"],
    "medication": ["side effect", "risks", "discomfort", "bijwerking", "risico", "ongemak",
                   "effets secondaires", "effets indésirables", "risques", "inconfort",
                   "treatment", "behandeling", "traitement",
                   "medicin", "medication", "drug", "pill", "tablet", "capsule", "etoposide",
                   "geneesmiddel", "medicijn", "pil", "médicament", "comprimé"],
    "infusion": ["infusion", "drip", "intravenous", "chemotherap", "catheter", "infuus", "baxter",
                 "perfusion", "chimiothérap"],
    "hospital": ["hospital", "transplant", "stay", "admission", "ward", "ziekenhuis", "opname",
                 "transplantatie", "hôpital", "hospitalis", "greffe", "stem cell", "stamcel"],
    "blood": ["blood", "sample", "test", "biobank", "bloed", "staal", "stalen", "prik", "sang",
              "prélèvement", "échantillon", "analys"],
    "tumour": ["tumour", "tumor", "biopsy", "cell", "cancer", "leukaemia", "leukemia", "disease",
               "illness", "biopsie", "kanker", "ziekte", "leukemie", "cellen", "tumeur", "maladie",
               "leucémie", "cellule"],
    # standard section questions of the national / children's templates count as heading hits
    "doctor": ["what will happen", "what happens during", "wat gebeurt er", "wat zal er gebeuren",
               "que se passera", "que va-t-il se passer",
               "doctor", "examin", "check-up", "visit", "physician", "nurse", "dokter", "arts",
               "onderzoek", "verpleeg", "médecin", "examen", "infirmi", "visite"],
    # the choice itself (not any mention of taking part)
    "decide": ["decide", "choose", "do i have to", "have to take part", "have to participate",
               "do not want", "don't want", "say no", "stop", "permission", "free to",
               "beslis", "kiezen", "moet ik", "verplicht", "wil niet", "stoppen", "toestemming",
               "décid", "choisir", "suis-je obligé", "dois-je", "ne veux pas", "arrêter"],
    "questions": ["question", "contact", "ask", "information", "website", "data", "privacy",
                  "vraag", "vragen", "gegevens", "informatie", "contacte", "données", "demander"],
    "research": ["study", "research", "trial", "why", "approved", "committee", "studie",
                 "waarom", "comité", "étude", "recherche", "pourquoi", "essai"],
}  # fmt: skip
HEADING_WEIGHT = 4
# generic topics ("the study") lose against a specific one in the same section
TOPIC_WEIGHT = {"research": 0.6}
MIN_SCORE = 4  # a heading hit, or several clear mentions in the section text
MAX_IMAGES = 8
BODY_CAP = 3  # body text can support a topic, but the heading decides
OURS = "icf_illustration"  # docPr name / bookmark prefix of pictures placed by this module
ICON_CM = 1.5


def _count(text: str, keywords: list[str]) -> int:
    t = " " + text.lower() + " "
    return sum(len(re.findall(r"(?<![\w])" + re.escape(k), t)) for k in keywords)


def _is_ours(drawing) -> bool:
    pr = next(drawing.iter(f"{{{_WP}}}docPr"), None)
    return pr is not None and (pr.get("name") or "").startswith(OURS)


def _credits(library: list[dict]) -> set[str]:
    return {img.get("credit") or "" for img in library} - {""}


def remove_ours(doc, credits: set[str] = frozenset()) -> int:
    """Remove pictures and credit lines placed earlier by this module; returns how many pictures.

    Credit lines are marked with a bookmark; older ones are recognised by their exact text.
    """
    body = doc.element.body
    n = 0
    for drawing in list(body.iter(q("drawing"))):
        if not _is_ours(drawing):
            continue
        run = next(drawing.iterancestors(q("r")), None)
        if run is None:
            continue
        p_el = run.getparent()
        p_el.remove(run)
        n += 1
        if (
            p_el.tag == q("p")
            and not _xml.para_text(p_el).strip()
            and not any(True for _ in p_el.iter(q("drawing"), q("pict")))
        ):
            p_el.getparent().remove(p_el)
    for p_el in list(body.iter(q("p"))):
        if credits and _xml.para_text(p_el).strip() in credits and p_el.getparent() is not None:
            p_el.getparent().remove(p_el)
    for bm in list(body.iter(q("bookmarkStart"))):
        if bm.get(q("name")) == f"{OURS}_credit":
            p_el = next(bm.iterancestors(q("p")), None)
            if p_el is not None and p_el.getparent() is not None:
                p_el.getparent().remove(p_el)
    return n


def _float_left(inline) -> None:
    """Turn an inline picture into a floating one at the left margin with text wrapping on the
    right, like the icons next to the questions in the approved children's forms."""
    anchor = OxmlElement("wp:anchor")
    for k, v in {"distT": "0", "distB": "0", "distL": "0", "distR": "144000", "simplePos": "0",
                 "relativeHeight": "251659264", "behindDoc": "0", "locked": "0",
                 "layoutInCell": "1", "allowOverlap": "1"}.items():  # fmt: skip
        anchor.set(k, v)
    simple = OxmlElement("wp:simplePos")
    simple.set("x", "0")
    simple.set("y", "0")
    anchor.append(simple)
    for tag, rel in (("wp:positionH", "column"), ("wp:positionV", "paragraph")):
        pos = OxmlElement(tag)
        pos.set("relativeFrom", rel)
        off = OxmlElement("wp:posOffset")
        off.text = "0"
        pos.append(off)
        anchor.append(pos)
    children = {etree.QName(c).localname: c for c in inline}
    anchor.append(children["extent"])
    effect = children.get("effectExtent")
    if effect is None:
        effect = OxmlElement("wp:effectExtent")
        for side in ("l", "t", "r", "b"):
            effect.set(side, "0")
    anchor.append(effect)
    wrap = OxmlElement("wp:wrapSquare")
    wrap.set("wrapText", "right")
    anchor.append(wrap)
    for name in ("docPr", "cNvGraphicFramePr", "graphic"):
        if name in children:
            anchor.append(children[name])
    inline.getparent().replace(inline, anchor)


def _sections(doc) -> list[dict]:
    """Main sections. With real headings: heading styles level 1-2 (sub-questions are ignored);
    otherwise (short child forms without heading styles) short question lines."""
    paras = []
    for p_el in doc.element.body.iter(q("p")):
        if is_toc_paragraph(p_el):
            continue
        has_picture = any(not _is_ours(d) for d in p_el.iter(q("drawing"))) or any(
            True for _ in p_el.iter(q("pict"))
        )
        text = _xml.para_text(p_el).strip()
        try:
            style = Paragraph(p_el, doc._body).style.name or ""
        except Exception:
            style = ""
        in_table = any(True for _ in p_el.iterancestors(q("tbl")))
        level = _heading_level(style)
        paras.append((p_el, text, level, in_table, has_picture))
    styled = [x for x in paras if x[2] is not None and x[2] <= 2 and x[1] and not x[3]]
    use_styles = len(styled) >= 4

    out: list[dict] = []
    for p_el, text, level, in_table, has_picture in paras:
        if use_styles:
            is_head = level is not None and level <= 2 and bool(text) and not in_table
        else:
            is_head = (
                bool(text)
                and not in_table
                and (level is not None or (len(text) <= 110 and text.endswith("?")))
            )
        if is_head:
            out.append({"el": p_el, "heading": text, "body": "", "has_image": has_picture})
        elif out:
            if has_picture:  # the section already has a picture: leave it alone
                out[-1]["has_image"] = True
            if text and len(out[-1]["body"]) < 1500:
                out[-1]["body"] += " " + text
    return out


def plan(sections: list[dict], library: list[dict], max_images: int = MAX_IMAGES) -> list[tuple]:
    """Greedy best matches: [(section index, image, score)].

    One picture per section, each picture and each main topic once, never in two neighbouring
    sections; earlier sections win ties (that is where a child form explains the study).
    """
    scored = []
    n = max(1, len(sections))
    for si, s in enumerate(sections):
        if s.get("has_image"):
            continue
        topic_score = {
            topic: TOPIC_WEIGHT.get(topic, 1.0)
            * (HEADING_WEIGHT * _count(s["heading"], kws) + min(BODY_CAP, _count(s["body"], kws)))
            for topic, kws in TOPICS.items()
        }
        for img in library:
            tags = img["tags"] or [""]
            # the picture's main topic counts fully, secondary topics half
            score = max(
                topic_score.get(tag, 0) * (1.0 if k == 0 else 0.5) for k, tag in enumerate(tags)
            )
            if score >= MIN_SCORE:
                scored.append((score + 1.0 - si / n, si, img))  # small bonus for earlier sections
    scored.sort(key=lambda x: (-x[0], x[1]))
    used_sections: set[int] = set()
    used_images: set[int] = set()
    used_topics: set[str] = set()
    spread = len(sections) > 12  # short child forms may have a picture at every question
    chosen = []
    for score, si, img in scored:
        main = img["tags"][0] if img["tags"] else ""
        if (
            si in used_sections
            or img["id"] in used_images
            or main in used_topics  # e.g. not two radiotherapy pictures
            or (spread and {si - 1, si + 1} & used_sections)  # long forms: spread them out
        ):
            continue
        chosen.append((si, img, round(score, 1)))
        used_sections.add(si)
        used_images.add(img["id"])
        used_topics.add(main)
        if len(chosen) >= max_images:
            break
    return sorted(chosen, key=lambda x: x[0])


def illustrate_docx(src: str, out: str, library: list[dict], max_images: int = MAX_IMAGES) -> dict:
    """library: [{id, name, tags, path, credit}]. Returns {placed: [{section, id, name}], ...}.

    Pictures placed by an earlier run are replaced. Each picture becomes a small icon at the start
    of its section heading (as in the approved children's forms); a credit line (e.g. the Flaticon
    attribution its licence requires) is added at the end for the pictures used.
    """
    doc = Document(src)
    credits = _credits(library)
    removed = remove_ours(doc, credits | {"; ".join(sorted(credits))})
    sections = _sections(doc)
    chosen = plan(sections, library, max_images)
    placed = []
    for si, img, score in chosen:
        head = Paragraph(sections[si]["el"], doc._body)
        run = head.add_run()
        shape = run.add_picture(img["path"], height=Cm(ICON_CM))
        doc_pr = shape._inline.docPr
        doc_pr.set("descr", f"Illustration: {img['name']}")
        doc_pr.set("name", f"{OURS}_{img['id']}")
        _float_left(shape._inline)
        # move the icon run to the front of the heading (after its properties)
        r_el = run._r
        ppr = head._p.find(q("pPr"))
        head._p.remove(r_el)
        head._p.insert(1 if ppr is not None else 0, r_el)
        placed.append(
            {"section": sections[si]["heading"][:120], "id": img["id"], "name": img["name"],
             "score": score}
        )  # fmt: skip
    credits = sorted({img.get("credit") or "" for _, img, _ in chosen} - {""})
    if credits:
        p = doc.add_paragraph()
        r = p.add_run("; ".join(credits))
        r.italic = True
        r.font.size = Pt(8)
        bm = OxmlElement("w:bookmarkStart")
        bm.set(q("id"), "990001")
        bm.set(q("name"), f"{OURS}_credit")
        end = OxmlElement("w:bookmarkEnd")
        end.set(q("id"), "990001")
        r._r.addprevious(bm)
        r._r.addnext(end)
    doc.save(out)
    return {
        "placed": placed,
        "replaced": removed,
        "sections": len(sections),
        "without_image": [s["heading"][:120] for i, s in enumerate(sections)
                          if i not in {c[0] for c in chosen}][:40],
    }  # fmt: skip
