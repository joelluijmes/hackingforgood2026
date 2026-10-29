"""Import sample documents from data/bucket.zip, read in memory only."""

import re
import zipfile
from pathlib import Path, PurePosixPath

from . import convert, db, services, storage

BUCKET_ZIP = db.BASE_DIR.parent / "data" / "bucket.zip"
MAX_MEMBER_BYTES = 100 * 1024 * 1024


def _norm(name: str) -> str:
    return name.replace("_", " ").lower()


def guess_language(filename: str) -> str:
    m = re.search(r"(?<![A-Za-z])(ENG|EN|FR|NL)(?![A-Za-z])", Path(filename).stem)
    if not m:
        return (
            "fr" if re.search(r"\d\s*ans|Majeur|Traitement|Biopsie", Path(filename).stem) else "en"
        )
    return {"ENG": "en", "EN": "en", "FR": "fr", "NL": "nl"}[m.group(1)]


def guess_audience(filename: str) -> str | None:
    n = _norm(Path(filename).stem)
    if "parent" in n:
        return "parent"
    if re.search(r"\d{2} years ao", n):
        return "adult"
    if re.search(r"1[2-3] ?(?:[- ]| to ) ?1[67]|adolescent|mature minor", n):
        return "adolescent"
    if re.search(r"\b[68] ?[- ] ?1[12](?!\d)|\b6 ?ans|minor information|children", n):
        return "child"
    if re.search(r"adult|majeur|\+18|18\+", n):
        return "adult"
    return None


def guess_version(filename: str) -> str | None:
    stem = Path(filename).stem
    m = re.search(r"version(\d+)(?:_(\d{1,2}))?_(20\d{2})(\d{2})(\d{2})", stem, re.IGNORECASE)
    if m:
        return f"{m.group(1)}.{m.group(2) or 0}"
    m = re.search(r"(?<![A-Za-z])v(?:ersion)?[ _]?(\d+(?:[._]\d+)*)", stem, re.IGNORECASE)
    if m:
        return "v" + m.group(1).replace("_", ".")
    return None


def guess_released(filename: str) -> str | None:
    m = re.search(r"(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)", Path(filename).stem)
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


TEMPLATE_NAME = "Belgian model ICF - adult patients, interventional trial"
LEGACY_OR_DOCX = (".docx", ".doc", ".rtf")

# (top-level folder, sub-folder or None) -> (project name, study, sponsor)
FORUM = "FORUM2"
SPONSOR_FORUM = "Ospedale Pediatrico Bambino Gesu"
PROJECTS: dict[tuple[str, str | None], tuple[str, str, str]] = {
    ("Forum Example", "Main Protocol"): ("FORUM2 - Main protocol", FORUM, SPONSOR_FORUM),
    ("Forum Example", "R1"): ("FORUM2 - R1 (8 vs 12 Gy)", FORUM, SPONSOR_FORUM),
    ("Forum Example", "R2"): ("FORUM2 - R2", FORUM, SPONSOR_FORUM),
    ("Forum Example", "S1"): ("FORUM2 - S1", FORUM, SPONSOR_FORUM),
    ("Forum Example", "P1"): ("FORUM2 - P1", FORUM, SPONSOR_FORUM),
    ("Biomede Example", None): ("BIOMEDE 2.0", "BIOMEDE 2.0", "Gustave Roussy"),
    ("HEM-iSmart Example", None): (
        "HEM-iSMART - sub-study D",
        "HEM-iSMART",
        "Princess Maxima Center",
    ),
    ("Non Medical ICF w Intervention", None): ("MyKids", "MyKids", "Princess Maxima Center"),
}

AUDIENCE_TITLE = {
    "adult": "Adult consent form",
    "parent": "Parent / legal guardian consent form",
    "adolescent": "Adolescent consent form",
    "child": "Child information sheet",
}
AUDIENCE_LABEL = {
    "adult": "adult",
    "parent": "parent/guardian",
    "adolescent": "adolescent",
    "child": "child",
}


def _project_key(parts: list[str]) -> tuple[str, str | None] | None:
    """Map the zip path (parts without 'bucket') of a sponsor original to a PROJECTS key."""
    if "Sponsor Originals" not in parts[:-1]:
        return None
    top = parts[0]
    if top == "Additional Materials":
        top = parts[1]
    idx = parts.index("Sponsor Originals")
    sub = parts[idx + 1] if idx + 1 < len(parts) - 1 else None
    key = (top, sub if top == "Forum Example" else None)
    return key if key in PROJECTS else None


def _doc_title(parts: list[str], filename: str, audience: str | None) -> str:
    stem = Path(filename).stem
    if not audience:
        return re.sub(r"\s+", " ", re.sub(r"[_]+", " ", stem)).strip()
    title = AUDIENCE_TITLE[audience]
    n = stem.replace("_", " ")
    ages = None
    if audience in ("adolescent", "child"):
        m = re.search(r"(?<!\d)(\d{1,2}) ?(?:-|to|\s) ?(\d{1,2}) ?(?:y|yr|ans|years)", n)
        if m:
            ages = f"{m.group(1)}-{m.group(2)}"
        elif audience == "child" and re.search(r"(?<!\d)6 ?ans", n):
            ages = "6"
    if ages:
        title += f" ({ages})"
    elif audience == "adult" and re.search(r"\d{2} years ao", n):
        title = f"Consent form ({re.search(r'(\d{2}) years ao', n).group(1)}+)"
    if "Biomede Example" in parts[:1]:
        for folder in ("Biopsy", "Treatment"):
            if folder in parts[:-1]:
                title = f"{folder} - {title}"
    return title


def _is_tc_duplicate(path_parts: list[str], siblings: set[str]) -> bool:
    stem = Path(path_parts[-1]).stem
    if not stem.endswith(" TC"):
        return False
    folder = "/".join(path_parts[:-1])
    return f"{folder}/{stem.removesuffix(' TC')} Clean" in siblings


def _template_exists(filename: str) -> bool:
    with db.connect() as conn:
        return (
            conn.execute(
                "SELECT 1 FROM documents WHERE filename = ? AND kind = 'template'", (filename,)
            ).fetchone()
            is not None
        )


def _candidates(zf: zipfile.ZipFile):
    found = []
    for info in zf.infolist():
        if info.is_dir() or not info.filename.lower().endswith(LEGACY_OR_DOCX):
            continue
        parts = [p for p in PurePosixPath(info.filename).parts if p not in ("", ".", "..")]
        if not parts or "__MACOSX" in parts or parts[-1].startswith(("~$", ".")):
            continue
        if parts[0] == "bucket" and len(parts) > 1:
            parts = parts[1:]
        if "National Templates" in parts[:-1] and parts[-1].lower().endswith(".docx"):
            found.append((info, "template", parts))
        elif _project_key(parts):
            found.append((info, "sponsor", parts))
    stems = {"/".join(p[:-1]) + "/" + Path(p[-1]).stem for _, _, p in found}
    for info, kind, parts in found:
        if kind == "sponsor" and _is_tc_duplicate(parts, stems):
            continue
        yield info, kind, parts


def _project_doc_exists(conn, pid: int, filenames: set[str]) -> bool:
    return any(
        conn.execute(
            "SELECT 1 FROM versions v JOIN project_docs d ON d.id = v.doc_id"
            " WHERE d.project_id = ? AND v.filename = ?",
            (pid, fn),
        ).fetchone()
        is not None
        for fn in filenames
    )


def _describe(sponsor: str, audiences: set[str]) -> str:
    order = [a for a in AUDIENCE_LABEL if a in audiences]
    names = [AUDIENCE_LABEL[a] for a in order]
    if not names:
        return f"Sponsor originals from {sponsor}."
    joined = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]
    return f"Sponsor: {sponsor}. Consent package with {joined} documents."


def _ensure_project(conn, key, audiences: set[str], user_name: str) -> int:
    name, study, sponsor = PROJECTS[key]
    row = conn.execute("SELECT id FROM projects WHERE name = ?", (name,)).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO projects (name, study, description, stage, created_at, created_by_name)"
        " VALUES (?,?,?,?,?,?)",
        (name, study, _describe(sponsor, audiences), "intake", db.now_iso(), user_name),
    )
    return cur.lastrowid


def _seed_sponsor(
    conn, pid: int, data: bytes, parts: list[str], user_name: str, stats: dict
) -> bool | None:
    """True imported, False already present, None failed."""
    filename = parts[-1]
    target = f"{Path(filename).stem}.docx" if convert.needs_conversion(filename) else filename
    if _project_doc_exists(conn, pid, {filename, target}):
        return False
    note = ""
    if target != filename:
        try:
            data, target = convert.to_docx(data, filename)
        except convert.ConversionError as exc:
            stats["failed"].append({"name": Path(filename).stem, "reason": str(exc)})
            return None
        note = convert.converted_note(filename)
        stats["converted"] += 1
    audience = guess_audience(filename)
    services.create_doc_with_version(
        conn,
        pid,
        title=_doc_title(parts, filename, audience),
        role="sponsor",
        icf_type=audience,
        language=guess_language(filename),
        filename=target,
        data=data,
        note=note,
        source="upload",
        user_name=user_name,
    )
    return True


def seed_bucket(user_name: str = "") -> dict:
    items: list[dict] = []
    stats: dict = {"skipped": 0, "converted": 0, "failed": []}
    with zipfile.ZipFile(BUCKET_ZIP) as zf:
        cands = list(_candidates(zf))
        audiences: dict[tuple, set[str]] = {}
        for _, kind, parts in cands:
            if kind == "sponsor":
                a = guess_audience(parts[-1])
                audiences.setdefault(_project_key(parts), set()).update([a] if a else [])
        for info, kind, parts in cands:
            filename = parts[-1]
            if info.file_size > MAX_MEMBER_BYTES or (
                kind == "template" and _template_exists(filename)
            ):
                stats["skipped"] += 1
                continue
            data = zf.read(info)
            if kind == "sponsor":
                key = _project_key(parts)
                with db.connect() as conn:
                    pid = _ensure_project(conn, key, audiences.get(key, set()), user_name)
                    ok = _seed_sponsor(conn, pid, data, parts, user_name, stats)
                if ok:
                    items.append({"name": Path(filename).stem, "kind": "project_doc"})
                elif ok is False:
                    stats["skipped"] += 1
                continue
            stored = storage.template_key(".docx")
            storage.put(stored, data, services.DOCX_MIME)
            m = re.match(r"(EN|NL|FR)_", filename)
            db.insert_document(
                kind="template",
                name=TEMPLATE_NAME,
                filename=filename,
                stored_name=stored,
                size=len(data),
                checksum=storage.sha256(data),
                language=m.group(1).lower() if m else guess_language(filename),
                audience="adult",
                version=guess_version(filename),
                released=guess_released(filename),
                study=None,
            )
            items.append({"name": TEMPLATE_NAME, "kind": "template"})
    return {"imported": len(items), **stats, "items": items}
