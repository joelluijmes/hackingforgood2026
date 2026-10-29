# ruff: noqa: E501
"""Seed a demo through the real API.

Run (servers up): cd backend && uv run python ../scripts/demo_seed.py   (or: make demo)
Env: API_URL (default http://localhost:8000), APP_URL (default http://localhost:5173).
"""

import copy
import io
import json
import os
import re
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from datetime import UTC, datetime, timedelta

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from lxml import etree

API = os.environ.get("API_URL", "http://localhost:8000").rstrip("/")
APP = os.environ.get("APP_URL", "http://localhost:5173").rstrip("/")
DRAFT_TITLE = "ICF adult R1 (EN)"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W14 = "http://schemas.microsoft.com/office/word/2010/wordml"
W15 = "http://schemas.microsoft.com/office/word/2012/wordml"

TOKEN = ""


def call(method, path, body=None, raw=False, headers=None, timeout=300):
    h = {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}
    data = None
    if isinstance(body, (dict, list)):
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    elif body is not None:
        data = body
    h.update(headers or {})
    req = urllib.request.Request(API + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            out = r.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read()[:300]!r}") from None
    return out if raw else json.loads(out or "null")


def multipart(fields, filename, content):
    b = uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(
        f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n".encode()
        + content
        + b"\r\n"
    )
    parts.append(f"--{b}--\r\n".encode())
    return b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={b}"}


# ---------------------------------------------------------------- docx review


def _iso(days_ago, hour=10):
    d = datetime.now(UTC) - timedelta(days=days_ago)
    return d.replace(hour=hour, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def _run_like(run_el, text, deleted=False):
    r = OxmlElement("w:r")
    rpr = run_el.find(qn("w:rPr"))
    if rpr is not None:
        r.append(copy.deepcopy(rpr))
    t = OxmlElement("w:delText" if deleted else "w:t")
    t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text
    r.append(t)
    return r


def _tracked(tag, author, date, rid):
    e = OxmlElement(tag)
    e.set(qn("w:id"), str(rid))
    e.set(qn("w:author"), author)
    e.set(qn("w:date"), date)
    return e


def _usable(p):
    return len(p.text.strip()) > 40 and p.runs and not p._p.findall(qn("w:ins"))


def _find(doc, keywords, used, minlen=40):
    cands = [
        (i, p)
        for i, p in enumerate(doc.paragraphs)
        if i not in used and len(p.text.strip()) >= minlen and p.runs
    ]
    for kw in keywords:
        for i, p in cands:
            if kw.lower() in p.text.lower():
                return i, p
    if cands:  # fallback: any non-empty paragraph, spread through the doc
        return cands[min(len(cands) - 1, len(used) * 7 + 3)]
    raise SystemExit("draft has no usable paragraphs")


def build_reviewed(draft_bytes):
    doc = Document(io.BytesIO(draft_bytes))
    used: set[int] = set()
    rid = 9000

    # --- tracked edits (author: sponsor reviewer / ethics committee)
    # 1) inserted sentence
    i, p = _find(doc, ["insurance", "compensation", "risk"], used)
    used.add(i)
    last = p.runs[-1]._r
    ins = _tracked("w:ins", "Sarah Mitchell (Sponsor)", _iso(2), rid)
    ins.append(
        _run_like(
            last,
            " The sponsor has taken out insurance covering any harm resulting from taking part in this study.",
        )
    )
    p._p.append(ins)
    rid += 1
    # 2) deleted sentence (delete the last run of a paragraph that has >= 2 runs)
    i, p = _find(doc, ["voluntary", "free to", "optional", "samples"], used, 80)
    used.add(i)
    run = p.runs[-1]._r
    txt = "".join(t.text or "" for t in run.findall(qn("w:t")))
    if txt.strip():
        d = _tracked("w:del", "Dr. Camille Dubois (CE)", _iso(3, 14), rid)
        run.addprevious(d)
        d.append(_run_like(run, txt, deleted=True))
        run.getparent().remove(run)
        rid += 1
    # 3) changed number: first paragraph with a number inside a single run
    for i, p in enumerate(doc.paragraphs):
        if i in used:
            continue
        for run in p.runs:
            m = re.search(r"\b(\d{1,2})\b", run.text)
            if m and len(run.text) > 20 and not p._p.findall(qn("w:ins")):
                a, n, b = run.text[: m.start()], m.group(1), run.text[m.end() :]
                new = str(int(n) + 5 if int(n) < 20 else int(n) // 2)
                el = run._r
                date = _iso(3, 15)
                parts = [_run_like(el, a)]
                d = _tracked("w:del", "Dr. Camille Dubois (CE)", date, rid)
                d.append(_run_like(el, n, deleted=True))
                ins = _tracked("w:ins", "Dr. Camille Dubois (CE)", date, rid + 1)
                ins.append(_run_like(el, new))
                parts += [d, ins, _run_like(el, b)]
                for x in parts:
                    el.addprevious(x)
                el.getparent().remove(el)
                used.add(i)
                rid += 2
                break
        else:
            continue
        break

    # --- comments: (key, author, initials, keywords, text, days_ago, parent_key)
    pi = ("Dr. Els Janssens", "EJ")
    ec = ("Dr. Camille Dubois", "CD")
    sp = ("Sarah Mitchell", "SM")
    plan = [
        (
            "c1",
            *pi,
            ["contact", "telephone", "phone", "questions"],
            "Hier moeten de lokale contactgegevens van ons ziekenhuis komen: de studieverpleegkundige is bereikbaar op 016 34 12 34, "
            "en de ombudsdienst op 016 34 80 00.",
            6,
            None,
        ),
        (
            "c2",
            *pi,
            ["insurance", "compensation", "liability"],
            "Het polisnummer van de verzekering ontbreekt. Voor Belgie is dat 45.123.987 bij Ethias, graag toevoegen.",
            6,
            None,
        ),
        (
            "c3",
            *sp,
            ["insurance", "compensation", "liability"],
            "Thanks Els. We will add the Belgian policy number in the local addendum, so it can stay out of the master text.",
            4,
            "c2",
        ),
        (
            "c4",
            *ec,
            ["contracept", "pregnan", "childbearing"],
            "La formulation sur la contraception n'est pas assez claire : veuillez preciser quelles methodes sont acceptables "
            "et pendant combien de temps apres la derniere dose elles doivent etre utilisees.",
            3,
            None,
        ),
        (
            "c5",
            *ec,
            ["years", "retain", "kept", "stored", "storage"],
            "La duree de conservation des donnees n'est pas indiquee. Le comite d'ethique demande une periode de 25 ans, "
            "conformement a la legislation belge.",
            3,
            None,
        ),
        (
            "c6",
            *sp,
            ["sponsor"],
            "Please keep the sponsor name exactly as in the protocol (including the legal entity suffix).",
            2,
            None,
        ),
        (
            "c7",
            *sp,
            ["withdraw", "stop", "leave the study"],
            "Suggest aligning the withdrawal wording with the international master ICF to avoid deviations.",
            2,
            None,
        ),
        (
            "c8",
            *pi,
            ["risk", "side effect", "benefit"],
            "Kunnen we de belangrijkste bijwerkingen in eenvoudiger taal uitleggen? Veel patienten lezen dit zonder medische achtergrond.",
            1,
            None,
        ),
    ]
    created: dict[str, tuple] = {}
    ordered = []
    for key, author, ini, kws, text, days, parent in plan:
        if parent:
            i, p = created[parent][0]
        else:
            i, p = _find(doc, kws, used)
            used.add(i)
        runs = p.runs
        doc.add_comment(runs=[runs[0], runs[-1]], text=text, author=author, initials=ini)
        created[key] = ((i, p), parent)
        ordered.append((key, author, days, parent))
    buf = io.BytesIO()
    doc.save(buf)
    return _postprocess(buf.getvalue(), ordered)


def _postprocess(data, ordered):
    """Set comment dates and add commentsExtended.xml so replies are threaded."""
    zin = zipfile.ZipFile(io.BytesIO(data))
    parts = {n: zin.read(n) for n in zin.namelist()}
    croot = etree.fromstring(parts["word/comments.xml"])
    comments = croot.findall(f"{{{W}}}comment")
    pid_by_key = {}
    had_ex = "word/commentsExtended.xml" in parts
    ex = (
        etree.fromstring(parts["word/commentsExtended.xml"])
        if had_ex
        else etree.Element(f"{{{W15}}}commentsEx", nsmap={"w15": W15})
    )
    # the generated draft already carries "ICF Studio" comments; ours are the last ones
    for c, (key, _a, days, parent) in zip(comments[-len(ordered) :], ordered, strict=True):
        c.set(f"{{{W}}}date", _iso(days, 9 + len(key) % 3))
        paras = c.findall(f"{{{W}}}p")
        pid = f"{0x2A000000 + len(pid_by_key) + 1:08X}"
        paras[-1].set(f"{{{W14}}}paraId", pid)
        pid_by_key[key] = pid
        e = etree.SubElement(ex, f"{{{W15}}}commentEx")
        e.set(f"{{{W15}}}paraId", pid)
        if parent:
            e.set(f"{{{W15}}}paraIdParent", pid_by_key[parent])
        e.set(f"{{{W15}}}done", "0")
    root_ns = {k: v for k, v in croot.nsmap.items() if k}
    if "w14" not in root_ns:  # re-serialise with w14 declared on the root
        new = etree.Element(croot.tag, nsmap={**croot.nsmap, "w14": W14})
        new.extend(list(croot))
        croot = new
    parts["word/comments.xml"] = etree.tostring(
        croot, xml_declaration=True, encoding="UTF-8", standalone=True
    )
    parts["word/commentsExtended.xml"] = etree.tostring(
        ex, xml_declaration=True, encoding="UTF-8", standalone=True
    )
    if had_ex:
        return _zip(parts)
    ct = parts["[Content_Types].xml"].decode()
    ct = ct.replace(
        "</Types>",
        '<Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/></Types>',
    )
    parts["[Content_Types].xml"] = ct.encode()
    rels = parts["word/_rels/document.xml.rels"].decode()
    rels = rels.replace(
        "</Relationships>",
        '<Relationship Id="rIdCmtEx" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/></Relationships>',
    )
    parts["word/_rels/document.xml.rels"] = rels.encode()
    return _zip(parts)


def _zip(parts):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for n, b in parts.items():
            z.writestr(n, b)
    return out.getvalue()


# ---------------------------------------------------------------- main


def main():
    global TOKEN
    t0 = time.time()

    def step(msg):
        print(f"[{time.time() - t0:5.1f}s] {msg}", flush=True)

    TOKEN = call("POST", "/api/auth/login", {"email": "demo@bspho.be", "password": "demo1234"})[
        "token"
    ]
    step("logged in")
    r = call("POST", "/api/seed/bucket", {})
    step(f"seed bucket: imported {r['imported']}, skipped {r['skipped']}")

    projects = call("GET", "/api/projects")
    proj = next((p for p in projects if p["name"].startswith("Forum")), None)
    if not proj:
        raise SystemExit("project 'Forum (sample)' not found")
    pid = proj["id"]
    docs = call("GET", f"/api/projects/{pid}/documents")

    draft = next((d for d in docs if d["title"] == DRAFT_TITLE), None)
    if draft is None:
        sponsor = next(
            (
                d
                for d in docs
                if d["role"] == "sponsor"
                and d["icf_type"] == "adult"
                and d["language"] == "en"
                and "r1" in d["title"].lower()
            ),
            None,
        )
        if not sponsor:
            raise SystemExit("R1 adult sponsor document not found")
        templates = [
            t
            for t in call("GET", "/api/documents?kind=template")
            if t["language"] == "en" and t["audience"] == "adult"
        ]
        if not templates:
            raise SystemExit("English adult template not found")
        tpl = next((t for t in templates if "2_2" in t["name"] or "2.2" in t["name"]), None) or max(
            templates, key=lambda t: t["version"] or ""
        )
        step(
            f"generating from template '{tpl['name']}' + sponsor '{sponsor['title']}' (AI, can take a while)"
        )
        res = call(
            "POST",
            f"/api/projects/{pid}/generate",
            {
                "template_id": tpl["id"],
                "icf_type": "adult",
                "language": "en",
                "sponsor_version_ids": [sponsor["versions"][0]["id"]],
                "notes": "Adult consent form for the FORUM2 R1 study, Belgian sites, international sponsor text.",
                "title": DRAFT_TITLE,
            },
        )
        draft = res["doc"]
        step(f"generated draft doc {draft['id']}: {res['report']}")
    else:
        step(f"draft '{DRAFT_TITLE}' already exists (doc {draft['id']}), skipping generation")

    call("PATCH", f"/api/projects/{pid}", {"stage": "pi_review"})
    step("project stage -> pi_review")

    docs = call("GET", f"/api/projects/{pid}/documents")
    draft = next(d for d in docs if d["id"] == draft["id"])
    v1 = min(draft["versions"], key=lambda v: v["number"])
    reviewed = next((v for v in draft["versions"] if v["source"] == "reviewed"), None)
    if reviewed is None:
        data = call("GET", f"/api/versions/{v1['id']}/file", raw=True)
        step(f"downloaded draft v{v1['number']} ({len(data)} bytes)")
        rev = build_reviewed(data)
        body, hdr = multipart(
            {"note": "PI + ethics committee feedback", "source": "reviewed"},
            "ICF adult R1 (EN) - reviewed.docx",
            rev,
        )
        reviewed = call("POST", f"/api/project-documents/{draft['id']}/versions", body, headers=hdr)
        step(
            f"uploaded reviewed version {reviewed['number']} with {reviewed['comments_total']} comments"
        )
    else:
        step(f"reviewed version already exists (v{reviewed['number']})")

    print("\nOpen:")
    print(f"  {APP}/projects/{pid}")
    print(f"  {APP}/versions/{reviewed['id']}")
    print(f"  {APP}/diff?from={v1['id']}&to={reviewed['id']}")
    print(f"Total {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
