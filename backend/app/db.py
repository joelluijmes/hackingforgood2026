import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("ICF_DB_PATH") or BASE_DIR / "icf.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    language TEXT,
    audience TEXT,
    version TEXT,
    study TEXT,
    size INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL
)
"""

SCHEMA_V2 = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    pw_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    study TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'intake',
    created_at TEXT NOT NULL,
    created_by_name TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS project_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    role TEXT NOT NULL,
    icf_type TEXT,
    language TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER NOT NULL,
    number INTEGER NOT NULL,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'upload',
    uploaded_by TEXT NOT NULL DEFAULT '',
    uploaded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER NOT NULL,
    ext_id TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    initials TEXT NOT NULL DEFAULT '',
    date TEXT,
    text TEXT NOT NULL DEFAULT '',
    anchor_text TEXT NOT NULL DEFAULT '',
    language TEXT,
    parent_id INTEGER,
    status TEXT NOT NULL DEFAULT 'open',
    decided_by TEXT,
    decided_at TEXT,
    decision_note TEXT
);
CREATE TABLE IF NOT EXISTS comment_translations (
    comment_id INTEGER NOT NULL,
    lang TEXT NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (comment_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_versions_doc ON versions(doc_id);
CREATE INDEX IF NOT EXISTS idx_comments_version ON comments(version_id);
"""

PDF_EXT = ".pdf"
DOCX_EXT = ".docx"


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.execute(SCHEMA)
        conn.executescript(SCHEMA_V2)
        dcols = {r["name"] for r in conn.execute("PRAGMA table_info(documents)")}
        if "released" not in dcols:
            conn.execute("ALTER TABLE documents ADD COLUMN released TEXT")
        for table in ("documents", "versions"):  # additive migration
            cols = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
            if "checksum_sha256" not in cols:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN checksum_sha256 TEXT")  # noqa: S608


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def preview_for(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == DOCX_EXT:
        return "docx"
    if ext == PDF_EXT:
        return "pdf"
    return "none"


def to_document(row: sqlite3.Row) -> dict:
    d = {k: row[k] for k in row.keys() if k not in ("stored_name", "checksum_sha256")}  # noqa: SIM118
    d["preview"] = preview_for(row["filename"])
    return d


def insert_document(
    *,
    kind: str,
    name: str,
    filename: str,
    stored_name: str,
    size: int,
    checksum: str | None = None,
    language: str | None = None,
    audience: str | None = None,
    version: str | None = None,
    released: str | None = None,
    study: str | None = None,
) -> dict:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO documents (kind, name, filename, stored_name, language, audience,"
            " version, released, study, size, uploaded_at, checksum_sha256)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (kind, name, filename, stored_name, language, audience, version, released, study,
             size, now_iso(), checksum),
        )  # fmt: skip
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (cur.lastrowid,)).fetchone()
    return to_document(row)


def get_row(doc_id: int) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
