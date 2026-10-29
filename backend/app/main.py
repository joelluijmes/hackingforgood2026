import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import auth, convert, db
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


for r in (
    auth.router,
    library.router,
    projects.router,
    review.router,
    generate.router,
    editing.router,
):
    app.include_router(r)
