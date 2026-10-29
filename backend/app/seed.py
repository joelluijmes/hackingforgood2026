"""Import sample documents from data/bucket.zip, read in memory only."""

import re
import uuid
import zipfile
from pathlib import Path, PurePosixPath

from . import db

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


def _exists(filename: str, kind: str) -> bool:
    with db.connect() as conn:
        return (
            conn.execute(
                "SELECT 1 FROM documents WHERE filename = ? AND kind = ?", (filename, kind)
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


def seed_bucket() -> dict:
    items: list[dict] = []
    skipped = 0
    with zipfile.ZipFile(BUCKET_ZIP) as zf:
        for info, kind, parts in _candidates(zf):
            filename = parts[-1]
            if _exists(filename, kind) or info.file_size > MAX_MEMBER_BYTES:
                skipped += 1
                continue
            data = zf.read(info)
            stored = f"{uuid.uuid4().hex}.docx"
            (db.STORAGE_DIR / stored).write_bytes(data)
            if kind == "template":
                m = re.match(r"(EN|NL|FR)_", filename)
                language = m.group(1).lower() if m else guess_language(filename)
                audience, study = "adult", None
            else:
                language = guess_language(filename)
                audience = guess_audience(filename)
                study = parts[0].removesuffix(" Example")
            name = Path(filename).stem
            db.insert_document(
                kind=kind,
                name=name,
                filename=filename,
                stored_name=stored,
                size=len(data),
                language=language,
                audience=audience,
                version=guess_version(filename),
                study=study,
            )
            items.append({"name": name, "kind": kind})
    return {"imported": len(items), "skipped": skipped, "items": items}
