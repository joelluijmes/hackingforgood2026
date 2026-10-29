"""Import sample documents from data/bucket.zip, read in memory only."""

import re
import uuid
import zipfile
from pathlib import Path, PurePosixPath

from . import db, services

BUCKET_ZIP = db.BASE_DIR.parent / "data" / "bucket.zip"
MAX_MEMBER_BYTES = 100 * 1024 * 1024


def _norm(name: str) -> str:
    return name.replace("_", " ").lower()


def guess_language(filename: str) -> str:
    m = re.search(r"(?<![A-Za-z])(ENG|EN|FR|NL)(?![A-Za-z])", Path(filename).stem)
    if not m:
        return "fr" if re.search(r"\d\s*ans|Majeur|Traitement", Path(filename).stem) else "en"
    return {"ENG": "en", "EN": "en", "FR": "fr", "NL": "nl"}[m.group(1)]


def guess_audience(filename: str) -> str | None:
    n = _norm(Path(filename).stem)
    if "parent" in n:
        return "parent"
    if re.search(r"1[2-3] ?[- ] ?1[67]|adolescent|mature minor", n):
        return "adolescent"
    if re.search(r"\b[68] ?[- ] ?1[12](?!\d)|minor information|children", n):
        return "child"
    if re.search(r"adult|majeur|\+18|18\+", n):
        return "adult"
    return None


def guess_version(filename: str) -> str | None:
    stem = Path(filename).stem
    m = re.search(r"(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)", stem)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.search(r"(?<![A-Za-z])v(?:ersion)?[ _]?(\d+(?:[._]\d+)*)", stem, re.IGNORECASE)
    if m:
        return "v" + m.group(1).replace("_", ".")
    return None


def _template_exists(filename: str) -> bool:
    with db.connect() as conn:
        return (
            conn.execute(
                "SELECT 1 FROM documents WHERE filename = ? AND kind = 'template'", (filename,)
            ).fetchone()
            is not None
        )


def _candidates(zf: zipfile.ZipFile):
    for info in zf.infolist():
        if info.is_dir() or not info.filename.lower().endswith(".docx"):
            continue
        parts = [p for p in PurePosixPath(info.filename).parts if p not in ("", ".", "..")]
        if not parts or "__MACOSX" in parts or parts[-1].startswith("~$"):
            continue
        if parts[0] == "bucket" and len(parts) > 1:
            parts = parts[1:]
        if "National Templates" in parts[:-1]:
            yield info, "template", parts
        elif "Sponsor Originals" in parts[:-1]:
            yield info, "sponsor", parts


def _project_doc_exists(conn, pid: int, filename: str) -> bool:
    return (
        conn.execute(
            "SELECT 1 FROM versions v JOIN project_docs d ON d.id = v.doc_id"
            " WHERE d.project_id = ? AND v.filename = ?",
            (pid, filename),
        ).fetchone()
        is not None
    )


def _seed_sponsor(data: bytes, parts: list[str], user_name: str) -> bool:
    study = parts[0].removesuffix(" Example")
    name = f"{study} (sample)"
    filename = parts[-1]
    with db.connect() as conn:
        row = conn.execute("SELECT id FROM projects WHERE name = ?", (name,)).fetchone()
        if row:
            pid = row["id"]
        else:
            cur = conn.execute(
                "INSERT INTO projects (name, study, description, stage, created_at,"
                " created_by_name) VALUES (?,?,?,?,?,?)",
                (name, study, "Imported from the sample bucket", "intake", db.now_iso(), user_name),
            )
            pid = cur.lastrowid
        if _project_doc_exists(conn, pid, filename):
            return False
        stored = f"{uuid.uuid4().hex}.docx"
        (db.STORAGE_DIR / stored).write_bytes(data)
        services.create_doc_with_version(
            conn,
            pid,
            title=Path(filename).stem,
            role="sponsor",
            icf_type=guess_audience(filename),
            language=guess_language(filename),
            filename=filename,
            stored=stored,
            size=len(data),
            note="",
            source="upload",
            user_name=user_name,
        )
    return True


def seed_bucket(user_name: str = "") -> dict:
    items: list[dict] = []
    skipped = 0
    with zipfile.ZipFile(BUCKET_ZIP) as zf:
        for info, kind, parts in _candidates(zf):
            filename = parts[-1]
            if info.file_size > MAX_MEMBER_BYTES or (
                kind == "template" and _template_exists(filename)
            ):
                skipped += 1
                continue
            data = zf.read(info)
            name = Path(filename).stem
            if kind == "sponsor":
                if _seed_sponsor(data, parts, user_name):
                    items.append({"name": name, "kind": "project_doc"})
                else:
                    skipped += 1
                continue
            stored = f"{uuid.uuid4().hex}.docx"
            (db.STORAGE_DIR / stored).write_bytes(data)
            m = re.match(r"(EN|NL|FR)_", filename)
            db.insert_document(
                kind="template",
                name=name,
                filename=filename,
                stored_name=stored,
                size=len(data),
                language=m.group(1).lower() if m else guess_language(filename),
                audience="adult",
                version=guess_version(filename),
                study=None,
            )
            items.append({"name": name, "kind": "template"})
    return {"imported": len(items), "skipped": skipped, "items": items}
