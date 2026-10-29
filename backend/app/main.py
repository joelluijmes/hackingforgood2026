import os
import shutil
import threading

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from . import auth, convert, db, seed, storage, tasks
from .routers import editing, generate, library, projects, review

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


@app.get("/api/admin/status", dependencies=[Depends(auth.current_user)])
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
def admin_reset(request: Request, user: auth.User, import_samples: bool = False) -> dict:
    """Wipe all app data (keeps demo user, the caller and their session); never touches GCS."""
    if not _reset_lock.acquire(blocking=False):
        raise HTTPException(409, "A reset is already running")
    try:
        if tasks.running_count():
            raise HTTPException(409, "Generate/translate tasks are still running; wait and retry")
        if import_samples and not seed.BUCKET_ZIP.exists():
            raise HTTPException(404, "data/bucket.zip not found")
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


for r in (
    auth.router,
    library.router,
    projects.router,
    review.router,
    generate.router,
    editing.router,
):
    app.include_router(r)
