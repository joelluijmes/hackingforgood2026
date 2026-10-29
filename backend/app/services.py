"""Shared helpers: serialisation of projects/docs/versions/comments, uploads, translation."""

import logging
import mimetypes
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException, Response, UploadFile

from . import convert, db, storage

log = logging.getLogger(__name__)
ALLOWED_EXT = {".docx", ".doc", ".rtf", ".pdf"}
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def convert_legacy(filename: str, data: bytes) -> tuple[str, bytes, str]:
    """Convert .rtf/.doc to .docx. Returns (filename, data, auto_note); raises 422 on failure."""
    if not convert.needs_conversion(filename):
        return filename, data, ""
    try:
        data, new_name = convert.to_docx(data, filename)
    except convert.ConversionError as exc:
        raise HTTPException(422, f"Could not convert {filename} to .docx: {exc}") from exc
    return new_name, data, convert.converted_note(filename)


def read_upload(file: UploadFile) -> tuple[str, str, bytes, str]:
    """Returns (filename, ext, data, auto_note); .rtf/.doc are converted to .docx."""
    filename = Path((file.filename or "upload").replace("\\", "/")).name or "upload"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(
            422, f"Unsupported file type {ext or '(none)'}; use .docx, .doc, .rtf or .pdf"
        )
    filename, data, auto_note = convert_legacy(filename, file.file.read())
    return filename, Path(filename).suffix.lower(), data, auto_note


def mime_for(filename: str) -> str:
    if filename.lower().endswith(".docx"):
        return DOCX_MIME
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"


def download_response(key: str, filename: str) -> Response:
    try:
        data = storage.get(key)
    except FileNotFoundError:
        raise HTTPException(404, "File missing from storage") from None
    try:
        filename.encode("ascii")
        disposition = f'attachment; filename="{filename}"'
    except UnicodeEncodeError:
        disposition = f"attachment; filename*=utf-8''{quote(filename)}"
    return Response(
        data, media_type=mime_for(filename), headers={"Content-Disposition": disposition}
    )


def check_lang(value: str | None, field: str = "language") -> str | None:
    value = (value or "").strip() or None
    if value is not None and value not in ("en", "nl", "fr"):
        raise HTTPException(422, f"{field} must be en, nl or fr")
    return value


# ---------- serialisation ----------


def version_dict(conn, row) -> dict:
    counts = {
        r["status"]: r["n"]
        for r in conn.execute(
            "SELECT status, COUNT(*) n FROM comments WHERE version_id = ? GROUP BY status",
            (row["id"],),
        )
    }
    return {
        "id": row["id"],
        "doc_id": row["doc_id"],
        "number": row["number"],
        "filename": row["filename"],
        "size": row["size"],
        "note": row["note"],
        "source": row["source"],
        "uploaded_by": row["uploaded_by"],
        "uploaded_at": row["uploaded_at"],
        "preview": db.preview_for(row["filename"]),
        "comments_total": sum(counts.values()),
        "comments_open": counts.get("open", 0),
        "comments_approved": counts.get("approved", 0),
        "comments_declined": counts.get("declined", 0),
    }


def doc_dict(conn, row, with_versions: bool = True) -> dict:
    d = {k: row[k] for k in ("id", "project_id", "title", "role", "icf_type", "language")}
    d["created_at"] = row["created_at"]
    d["source_doc_id"] = row["source_doc_id"]
    if with_versions:
        rows = conn.execute(
            "SELECT * FROM versions WHERE doc_id = ? ORDER BY number DESC", (row["id"],)
        ).fetchall()
        d["versions"] = [version_dict(conn, r) for r in rows]
    return d


def project_dict(conn, row) -> dict:
    d = {k: row[k] for k in ("id", "name", "study", "description", "stage", "created_at")}
    d["created_by_name"] = row["created_by_name"]
    d["doc_count"] = conn.execute(
        "SELECT COUNT(*) FROM project_docs WHERE project_id = ?", (row["id"],)
    ).fetchone()[0]
    d["open_comments"] = conn.execute(
        "SELECT COUNT(*) FROM comments c JOIN versions v ON v.id = c.version_id"
        " JOIN project_docs d ON d.id = v.doc_id"
        " WHERE d.project_id = ? AND c.status = 'open'"
        " AND v.number = (SELECT MAX(number) FROM versions WHERE doc_id = d.id)",
        (row["id"],),
    ).fetchone()[0]
    return d


def delete_version_files(conn, where: str, args: tuple) -> None:
    rows = conn.execute(
        f"SELECT id, stored_name FROM versions WHERE {where}",  # noqa: S608
        args,
    ).fetchall()
    for r in rows:
        conn.execute("DELETE FROM comment_translations WHERE comment_id IN"
                     " (SELECT id FROM comments WHERE version_id = ?)", (r["id"],))  # fmt: skip
        conn.execute("DELETE FROM comments WHERE version_id = ?", (r["id"],))
        conn.execute("DELETE FROM changes WHERE source_version_id = ? OR result_version_id = ?",
                     (r["id"], r["id"]))  # fmt: skip
        conn.execute("DELETE FROM versions WHERE id = ?", (r["id"],))
        storage.delete(r["stored_name"])


# ---------- versions + comments ----------


def add_version(
    conn,
    doc_id: int,
    filename: str,
    data: bytes,
    note: str,
    source: str,
    user_name: str,
    items: list[dict] | None = None,
) -> int:
    """Store ``data`` in object storage as the next version of ``doc_id`` and index it."""
    if items is None:
        items = prepare_comments(filename, data)
    number = conn.execute(
        "SELECT COALESCE(MAX(number), 0) + 1 FROM versions WHERE doc_id = ?", (doc_id,)
    ).fetchone()[0]
    pid = conn.execute("SELECT project_id FROM project_docs WHERE id = ?", (doc_id,)).fetchone()[0]
    key = storage.version_key(pid, doc_id, number, Path(filename).suffix)
    storage.put(key, data, mime_for(filename))
    cur = conn.execute(
        "INSERT INTO versions (doc_id, number, filename, stored_name, size, note, source,"
        " uploaded_by, uploaded_at, checksum_sha256) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (doc_id, number, filename, key, len(data), note, source, user_name, db.now_iso(),
         storage.sha256(data)),
    )  # fmt: skip
    vid = cur.lastrowid
    store_comments(conn, vid, items)
    return vid


def prepare_comments(filename: str, data: bytes) -> list[dict]:
    """Extract + detect languages. Slow (AI): call before opening any write transaction."""
    if not filename.lower().endswith(".docx"):
        return []
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "doc.docx"
        path.write_bytes(data)
        return extract_comments(path)


def extract_comments(path: Path) -> list[dict]:
    from .engine import ai, comments

    try:
        items = comments.extract_comments(str(path))
    except Exception:
        log.exception("comment extraction failed for %s", path)
        return []
    texts = sorted({c["text"] for c in items})
    with ThreadPoolExecutor(8) as pool:
        langs = dict(zip(texts, pool.map(ai.detect_language, texts), strict=True))
    for c in items:
        c["language"] = langs[c["text"]]
    return items


def store_comments(conn, vid: int, items: list[dict]) -> None:
    ids: dict[str, int] = {}
    for c in items:
        status = "approved" if c.get("resolved") else "open"
        cur = conn.execute(
            "INSERT INTO comments (version_id, ext_id, author, initials, date, text, anchor_text,"
            " language, status) VALUES (?,?,?,?,?,?,?,?,?)",
            (vid, c["ext_id"], c["author"], c["initials"], c.get("date"), c["text"],
             c["anchor_text"], c["language"], status),
        )  # fmt: skip
        ids[c["ext_id"]] = cur.lastrowid
    for c in items:
        parent = ids.get(c.get("parent_ext_id") or "")
        if parent:
            conn.execute(
                "UPDATE comments SET parent_id = ? WHERE id = ?", (parent, ids[c["ext_id"]])
            )


def carry_decisions(conn, from_vid: int, to_vid: int) -> None:
    """Copy review decisions + cached translations to the same comments in a derived version."""
    old = {
        (r["author"], r["text"]): r
        for r in conn.execute("SELECT * FROM comments WHERE version_id = ?", (from_vid,))
    }
    for r in conn.execute("SELECT * FROM comments WHERE version_id = ?", (to_vid,)).fetchall():
        o = old.get((r["author"], r["text"]))
        if not o:
            continue
        conn.execute(
            "UPDATE comments SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?"
            " WHERE id = ?",
            (o["status"], o["decided_by"], o["decided_at"], o["decision_note"], r["id"]),
        )
        conn.execute(
            "INSERT OR IGNORE INTO comment_translations (comment_id, lang, text)"
            " SELECT ?, lang, text FROM comment_translations WHERE comment_id = ?",
            (r["id"], o["id"]),
        )


COMMENT_KEYS = (
    *("id", "version_id", "ext_id", "author", "initials", "date", "text", "anchor_text"),
    *("language", "parent_id", "status", "decided_by", "decided_at", "decision_note"),
)


def comment_dict(row) -> dict:
    d = {k: row[k] for k in COMMENT_KEYS}
    d["translated_text"] = None
    d["translated_to"] = None
    return d


def order_threads(items: list[dict]) -> list[dict]:
    ids = {c["id"] for c in items}
    children: dict[int, list[dict]] = {}
    for c in items:
        if c["parent_id"] in ids:
            children.setdefault(c["parent_id"], []).append(c)
    out: list[dict] = []
    for c in items:
        if c["parent_id"] not in ids:
            out.append(c)
            out.extend(children.get(c["id"], []))
    return out


def translate_comments(conn, items: list[dict], lang: str) -> list[dict]:
    """Fill translated_text/translated_to in place (cached in comment_translations)."""
    from .engine import ai

    todo = [c for c in items if c["language"] and c["language"] != lang]
    if not todo:
        return items
    missing = []
    for c in todo:
        row = conn.execute(
            "SELECT text FROM comment_translations WHERE comment_id = ? AND lang = ?",
            (c["id"], lang),
        ).fetchone()
        if row:
            c["translated_text"], c["translated_to"] = row["text"], lang
        else:
            missing.append(c)
    if missing:
        results = ai.translate([c["text"] for c in missing], lang)
        for c, t in zip(missing, results, strict=False):
            if t is None:
                continue
            conn.execute(
                "INSERT OR REPLACE INTO comment_translations (comment_id, lang, text)"
                " VALUES (?,?,?)",
                (c["id"], lang, t),
            )
            c["translated_text"], c["translated_to"] = t, lang
    return items


def comments_for_version(conn, vid: int, lang: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM comments WHERE version_id = ? ORDER BY id", (vid,)
    ).fetchall()
    items = order_threads([comment_dict(r) for r in rows])
    return translate_comments(conn, items, lang)


def create_doc_with_version(
    conn,
    pid: int,
    *,
    title: str,
    role: str,
    icf_type: str | None,
    language: str | None,
    filename: str,
    data: bytes,
    note: str,
    source: str,
    user_name: str,
    source_doc_id: int | None = None,
) -> dict:
    items = prepare_comments(filename, data)
    cur = conn.execute(
        "INSERT INTO project_docs (project_id, title, role, icf_type, language, created_at,"
        " source_doc_id) VALUES (?,?,?,?,?,?,?)",
        (pid, title, role, icf_type, language, db.now_iso(), source_doc_id),
    )
    add_version(conn, cur.lastrowid, filename, data, note, source, user_name, items)
    return doc_dict(
        conn, conn.execute("SELECT * FROM project_docs WHERE id = ?", (cur.lastrowid,)).fetchone()
    )
