"""Illustration library for child/adolescent ICFs (stock icons + uploads) and placing them."""

import uuid
import zipfile
from contextlib import ExitStack
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

from .. import db, services, storage
from ..auth import User, current_staff

router = APIRouter(prefix="/api", dependencies=[Depends(current_staff)], tags=["illustrations"])

ICON_DOCX = "Additional Materials/Icons ICFs.docx"
FLATICON = "Icons: Flaticon.com"
# built-in pool from the bucket's "Icons ICFs.docx" (image1/3/4 duplicate image2, image17 is WMF)
BUILTIN: list[tuple[str, str, list[str]]] = [
    ("image2.png", "Radiotherapy", ["radiotherapy"]),
    ("image5.png", "Radiotherapy (outline)", ["radiotherapy"]),
    ("image6.png", "Medicines", ["medication"]),
    ("image7.png", "Scanner (MRI/CT)", ["scan"]),
    ("image8.png", "Drip / infusion", ["infusion", "medication"]),
    ("image9.png", "Child on a drip", ["hospital", "infusion"]),
    ("image10.png", "Tumour cells", ["tumour"]),
    ("image11.png", "Computer and information", ["questions"]),
    ("image12.png", "Checklist", ["research"]),
    ("image13.jpeg", "Hospital stay with nurse", ["hospital", "medication"]),
    ("image14.png", "Doctor's check-up", ["doctor"]),
    ("image15.png", "Talking it over and deciding", ["decide"]),
    ("image16.png", "Blood test", ["blood"]),
]
SCHEMA = """
CREATE TABLE IF NOT EXISTS illustrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    credit TEXT NOT NULL DEFAULT '',
    builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
)
"""
IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


def _row_dict(r) -> dict:
    return {
        "id": r["id"],
        "name": r["name"],
        "tags": [t for t in r["tags"].split(",") if t],
        "credit": r["credit"],
        "builtin": bool(r["builtin"]),
    }


def ensure_library(conn) -> None:
    """Create the table and import the built-in icon pool from data/bucket.zip once."""
    from ..seed import BUCKET_ZIP

    conn.execute(SCHEMA)
    if conn.execute("SELECT 1 FROM illustrations WHERE builtin = 1 LIMIT 1").fetchone():
        return
    if not BUCKET_ZIP.exists():
        return
    with zipfile.ZipFile(BUCKET_ZIP) as zf:
        member = next((n for n in zf.namelist() if n.endswith(ICON_DOCX)), None)
        if not member:
            return
        import io

        with zipfile.ZipFile(io.BytesIO(zf.read(member))) as icons:
            for media, name, tags in BUILTIN:
                try:
                    data = icons.read(f"word/media/{media}")
                except KeyError:
                    continue
                ext = Path(media).suffix.lower()
                key = f"illustrations/{uuid.uuid4().hex}{ext}"
                storage.put(key, data, IMAGE_TYPES[ext])
                credit = FLATICON if ext == ".png" else ""
                conn.execute(
                    "INSERT INTO illustrations (name, tags, filename, stored_name, credit, builtin,"
                    " created_at) VALUES (?,?,?,?,?,1,?)",
                    (name, ",".join(tags), media, key, credit, db.now_iso()),
                )


def library(conn) -> list[dict]:
    ensure_library(conn)
    rows = conn.execute("SELECT * FROM illustrations ORDER BY builtin DESC, id").fetchall()
    return [_row_dict(r) | {"stored_name": r["stored_name"]} for r in rows]


def illustrate_bytes(conn, data: bytes, max_images: int = 8) -> tuple[bytes, dict]:
    """Add library illustrations to a .docx given as bytes; returns (new bytes, report)."""
    import tempfile

    from ..engine import illustrate

    items = library(conn)
    with tempfile.TemporaryDirectory() as tmp, ExitStack() as stack:
        lib = []
        for it in items:
            try:
                path = stack.enter_context(storage.local_path(it["stored_name"]))
            except FileNotFoundError:
                continue
            lib.append({**it, "path": str(path)})
        src, out = Path(tmp) / "in.docx", Path(tmp) / "out.docx"
        src.write_bytes(data)
        report = illustrate.illustrate_docx(str(src), str(out), lib, max_images)
        return out.read_bytes(), report


# ---------- routes ----------


@router.get("/illustrations")
def list_illustrations() -> list[dict]:
    with db.connect() as conn:
        return [{k: v for k, v in it.items() if k != "stored_name"} for it in library(conn)]


@router.get("/illustrations/{iid}/file")
def illustration_file(iid: int) -> Response:
    with db.connect() as conn:
        ensure_library(conn)
        r = conn.execute("SELECT * FROM illustrations WHERE id = ?", (iid,)).fetchone()
    if not r:
        raise HTTPException(404, "Illustration not found")
    try:
        data = storage.get(r["stored_name"])
    except FileNotFoundError:
        raise HTTPException(404, "File missing from storage") from None
    media = IMAGE_TYPES.get(Path(r["filename"]).suffix.lower(), "application/octet-stream")
    return Response(data, media_type=media, headers={"Cache-Control": "max-age=86400"})


@router.post("/illustrations", status_code=201)
def upload_illustration(
    file: Annotated[UploadFile, File()],
    name: Annotated[str, Form()],
    tags: Annotated[str, Form()] = "",
    credit: Annotated[str, Form()] = "",
) -> dict:
    from ..engine.illustrate import TOPICS

    filename = Path((file.filename or "image").replace("\\", "/")).name
    ext = Path(filename).suffix.lower()
    if ext not in IMAGE_TYPES:
        raise HTTPException(422, "Use a .png or .jpg image")
    data = file.file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(422, "Image too large (max 5 MB)")
    clean = [t.strip().lower() for t in tags.split(",") if t.strip().lower() in TOPICS]
    if not clean:
        raise HTTPException(422, f"Pick at least one topic: {', '.join(TOPICS)}")
    key = f"illustrations/{uuid.uuid4().hex}{ext}"
    storage.put(key, data, IMAGE_TYPES[ext])
    with db.connect() as conn:
        ensure_library(conn)
        cur = conn.execute(
            "INSERT INTO illustrations (name, tags, filename, stored_name, credit, builtin,"
            " created_at) VALUES (?,?,?,?,?,0,?)",
            (name.strip() or filename, ",".join(clean), filename, key, credit.strip(),
             db.now_iso()),
        )  # fmt: skip
        r = conn.execute("SELECT * FROM illustrations WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row_dict(r)


@router.delete("/illustrations/{iid}", status_code=204)
def delete_illustration(iid: int) -> Response:
    with db.connect() as conn:
        ensure_library(conn)
        r = conn.execute("SELECT * FROM illustrations WHERE id = ?", (iid,)).fetchone()
        if not r:
            raise HTTPException(404, "Illustration not found")
        if r["builtin"]:
            raise HTTPException(422, "Built-in icons cannot be deleted")
        conn.execute("DELETE FROM illustrations WHERE id = ?", (iid,))
    storage.delete(r["stored_name"])
    return Response(status_code=204)


@router.get("/illustrations/topics")
def topics() -> list[str]:
    from ..engine.illustrate import TOPICS

    return list(TOPICS)


class IllustrateIn(BaseModel):
    max_images: int = 8


@router.post("/versions/{vid}/illustrate")
def illustrate_version(vid: int, body: IllustrateIn, user: User) -> dict:
    """Add illustrations to an existing child/adolescent ICF version -> new version."""
    from ..engine import trace

    with db.connect() as conn:
        v = conn.execute("SELECT * FROM versions WHERE id = ?", (vid,)).fetchone()
        if not v:
            raise HTTPException(404, "Version not found")
        d = conn.execute("SELECT * FROM project_docs WHERE id = ?", (v["doc_id"],)).fetchone()
        if d["role"] != "icf" or not v["filename"].lower().endswith(".docx"):
            raise HTTPException(422, "Illustrations can only be added to an ICF .docx")
        try:
            data = storage.get(v["stored_name"])
        except FileNotFoundError:
            raise HTTPException(404, "File missing from storage") from None
        new, report = illustrate_bytes(conn, data, max(1, min(body.max_images, 12)))
        if not report["placed"] and not report["replaced"]:
            return {"version": None, "report": report}
        base = trace.version_source(conn, vid, "illustrated from")
        n = len(report["placed"])
        items = services.prepare_comments(v["filename"], new)
        new_vid = services.add_version(
            conn, d["id"], v["filename"], new, (
                f"Illustrations placed again ({n})"
                if report["replaced"]
                else f"Added {n} illustration(s)"
            ), "edited",
            user["name"], items, sources=[base] if base else None,
        )  # fmt: skip
        services.carry_decisions(conn, vid, new_vid)
        row = conn.execute("SELECT * FROM versions WHERE id = ?", (new_vid,)).fetchone()
        return {"version": services.version_dict(conn, row), "report": report}
