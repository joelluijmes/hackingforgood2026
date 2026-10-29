import sqlite3
from datetime import UTC, datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "icf.db"
STORAGE_DIR = BASE_DIR / "storage"

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

PDF_EXT = ".pdf"
DOCX_EXT = ".docx"


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init() -> None:
    STORAGE_DIR.mkdir(exist_ok=True)
    with connect() as conn:
        conn.execute(SCHEMA)


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
    d = {k: row[k] for k in row.keys() if k != "stored_name"}  # noqa: SIM118
    d["preview"] = preview_for(row["filename"])
    return d


def insert_document(
    *,
    kind: str,
    name: str,
    filename: str,
    stored_name: str,
    size: int,
    language: str | None = None,
    audience: str | None = None,
    version: str | None = None,
    study: str | None = None,
) -> dict:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO documents (kind, name, filename, stored_name, language, audience,"
            " version, study, size, uploaded_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (kind, name, filename, stored_name, language, audience, version, study, size,
             now_iso()),
        )  # fmt: skip
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (cur.lastrowid,)).fetchone()
    return to_document(row)


def get_row(doc_id: int) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
