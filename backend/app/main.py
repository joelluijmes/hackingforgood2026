import os
import shutil
import threading

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from . import auth, convert, db, seed, storage, tasks
from .routers import (
    editing,
    generate,
    interpreter,
    library,
    participant,
    projects,
    review,
)

app = FastAPI(title="ICF Studio API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    db.init()
    auth.seed_demo_user()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/admin/status", dependencies=[Depends(auth.current_staff)])
def admin_status() -> dict:
    from .engine import ai

    with db.connect() as conn:
        counts = {
            "projects": conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0],
            "project_docs": conn.execute("SELECT COUNT(*) FROM project_docs").fetchone()[0],
            "templates": conn.execute(
                "SELECT COUNT(*) FROM documents WHERE kind = 'template'"
            ).fetchone()[0],
            "users": conn.execute("SELECT COUNT(*) FROM users").fetchone()[0],
        }
    backend = os.environ.get("STORAGE_BACKEND", "local").strip().lower()
    return {
        "ai": ai.ai_status(),
        "storage": {
            "backend": backend,
            "bucket": (os.environ.get("GCS_BUCKET", "").strip() or None)
            if backend == "gcs"
            else None,
        },
        "converters": {
            "pandoc": convert.pandoc_available(),
            "libreoffice": convert.soffice_path() is not None,
        },
        "counts": counts,
    }


_reset_lock = threading.Lock()
_KEEP_TABLES = {"users", "sessions"}


@app.post("/api/admin/reset")
def admin_reset(
    request: Request, user: auth.User, import_samples: bool = False, generated_only: bool = False
) -> dict:
    """Wipe all app data (keeps demo user, the caller and their session); never touches GCS."""
    if not _reset_lock.acquire(blocking=False):
        raise HTTPException(409, "A reset is already running")
    try:
        if tasks.running_count():
            raise HTTPException(409, "Generate/translate tasks are still running; wait and retry")
        if import_samples and not seed.BUCKET_ZIP.exists():
            raise HTTPException(404, "data/bucket.zip not found")
        if generated_only:
            return _clear_generated()
        header = request.headers.get("authorization", "")
        token = header[7:].strip()
        with db.connect() as conn:
            tables = [
                r["name"]
                for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
                if r["name"] not in _KEEP_TABLES
            ]
            for t in tables:
                conn.execute(f'DELETE FROM "{t}"')  # noqa: S608
                conn.execute("DELETE FROM sqlite_sequence WHERE name = ?", (t,))
            conn.execute("DELETE FROM sessions WHERE token != ?", (token,))
            conn.execute(
                "DELETE FROM users WHERE email != 'demo@bspho.be' AND id != ?", (user["id"],)
            )
        tasks.clear()
        files_removed = 0
        if os.environ.get("STORAGE_BACKEND", "local").strip().lower() == "local":
            root = storage.LOCAL_ROOT
            if root.exists():
                for child in root.iterdir():
                    files_removed += 1
                    if child.is_dir():
                        shutil.rmtree(child)
                    else:
                        child.unlink()
        db.init()
        with db.connect() as conn:
            if not conn.execute("SELECT 1 FROM users WHERE email = 'demo@bspho.be'").fetchone():
                auth.create_user("demo@bspho.be", "Demo Researcher", "demo1234", "en")
        out: dict = {"reset": True, "local_files_removed": files_removed, "seed": None}
        if import_samples:
            out["seed"] = seed.seed_bucket(user["name"])
        return out
    finally:
        _reset_lock.release()


_GENERATED = ("generated", "edited", "propagated")


def _clear_generated() -> dict:
    """Remove app-generated versions (and docs left empty); keep projects, sponsor docs, uploads."""
    with db.connect() as conn:
        gen = conn.execute(
            "SELECT id, doc_id, stored_name FROM versions"  # noqa: S608
            f" WHERE source IN ({','.join('?' * len(_GENERATED))})",
            _GENERATED,
        ).fetchall()
        ids = [r["id"] for r in gen]
        marks = ",".join("?" * len(ids))
        if ids:
            conn.execute(
                f"DELETE FROM comment_translations WHERE comment_id IN "  # noqa: S608
                f"(SELECT id FROM comments WHERE version_id IN ({marks}))",
                ids,
            )
            conn.execute(f"DELETE FROM comments WHERE version_id IN ({marks})", ids)  # noqa: S608
            conn.execute(f"DELETE FROM versions WHERE id IN ({marks})", ids)  # noqa: S608
            conn.execute(f"DELETE FROM changes WHERE result_version_id IN ({marks})", ids)  # noqa: S608
        # docs without any version left, and approvals pointing at deleted versions
        conn.execute(
            "DELETE FROM project_docs WHERE id NOT IN (SELECT DISTINCT doc_id FROM versions)"
            " AND role = 'icf'"
        )
        conn.execute(
            "UPDATE project_docs SET approved_version_id = NULL, approved_by = NULL,"
            " approved_at = NULL WHERE approved_version_id IS NOT NULL"
            " AND approved_version_id NOT IN (SELECT id FROM versions)"
        )
        conn.execute(
            "DELETE FROM participant_publications WHERE version_id NOT IN (SELECT id FROM versions)"
        )
        # stages past drafting that lost all their ICF docs fall back
        conn.execute(
            "UPDATE projects SET stage = CASE WHEN EXISTS (SELECT 1 FROM project_docs d"
            " WHERE d.project_id = projects.id AND d.role = 'sponsor') THEN 'drafting'"
            " ELSE 'intake' END WHERE stage IN ('pi_review', 'ethics_review', 'approved')"
            " AND NOT EXISTS (SELECT 1 FROM project_docs d WHERE d.project_id = projects.id"
            " AND d.role = 'icf')"
        )
    tasks.clear()
    removed = 0
    if os.environ.get("STORAGE_BACKEND", "local").strip().lower() == "local":
        for r in gen:
            try:
                storage.delete(r["stored_name"])
                removed += 1
            except Exception:  # noqa: BLE001, S110
                pass
    return {
        "reset": True,
        "local_files_removed": removed,
        "seed": None,
        "versions_removed": len(ids),
    }


for r in (
    auth.router,
    library.router,
    projects.router,
    review.router,
    generate.router,
    editing.router,
    interpreter.router,
    participant.router,
):
    app.include_router(r)
