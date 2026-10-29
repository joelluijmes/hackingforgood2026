import mimetypes
import uuid
from pathlib import Path
from typing import Annotated, get_args

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from . import db, seed
from .models import (
    Audience,
    CreationJob,
    Document,
    HtmlResult,
    Kind,
    Language,
    SeedResult,
    TranslationJob,
    UpdateJob,
)
from .render import render_docx

app = FastAPI(title="ICF Studio API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@app.on_event("startup")
def _startup() -> None:
    db.init()


def _check(value: str | None, allowed: tuple, field: str) -> str | None:
    value = (value or "").strip() or None
    if value is not None and value not in allowed:
        raise HTTPException(422, f"{field} must be one of {', '.join(allowed)}")
    return value


def _row_or_404(doc_id: int):
    row = db.get_row(doc_id)
    if row is None:
        raise HTTPException(404, "Document not found")
    return row


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/documents", response_model=list[Document])
def list_documents(kind: Kind | None = None) -> list[dict]:
    sql, args = "SELECT * FROM documents", []
    if kind:
        sql += " WHERE kind = ?"
        args.append(kind)
    sql += " ORDER BY uploaded_at DESC, id DESC"
    with db.connect() as conn:
        return [db.to_document(r) for r in conn.execute(sql, args).fetchall()]


@app.post("/api/documents", response_model=Document, status_code=201)
def upload_document(
    file: Annotated[UploadFile, File()],
    kind: Annotated[str, Form()],
    name: Annotated[str | None, Form()] = None,
    language: Annotated[str | None, Form()] = None,
    audience: Annotated[str | None, Form()] = None,
    version: Annotated[str | None, Form()] = None,
    study: Annotated[str | None, Form()] = None,
) -> dict:
    kind = _check(kind, get_args(Kind), "kind") or ""
    if not kind:
        raise HTTPException(422, "kind is required")
    language = _check(language, get_args(Language), "language")
    audience = _check(audience, get_args(Audience), "audience")
    filename = Path((file.filename or "upload").replace("\\", "/")).name or "upload"
    stored = f"{uuid.uuid4().hex}{Path(filename).suffix.lower()}"
    data = file.file.read()
    (db.STORAGE_DIR / stored).write_bytes(data)
    return db.insert_document(
        kind=kind,
        name=(name or "").strip() or Path(filename).stem,
        filename=filename,
        stored_name=stored,
        size=len(data),
        language=language,
        audience=audience,
        version=(version or "").strip() or None,
        study=(study or "").strip() or None,
    )


@app.get("/api/documents/{doc_id}", response_model=Document)
def get_document(doc_id: int) -> dict:
    return db.to_document(_row_or_404(doc_id))


@app.delete("/api/documents/{doc_id}", status_code=204)
def delete_document(doc_id: int) -> Response:
    row = _row_or_404(doc_id)
    with db.connect() as conn:
        conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    (db.STORAGE_DIR / row["stored_name"]).unlink(missing_ok=True)
    return Response(status_code=204)


@app.get("/api/documents/{doc_id}/file")
def download_document(doc_id: int) -> FileResponse:
    row = _row_or_404(doc_id)
    path = db.STORAGE_DIR / row["stored_name"]
    if not path.exists():
        raise HTTPException(404, "File missing from storage")
    mime = mimetypes.guess_type(row["filename"])[0]
    if row["filename"].lower().endswith(".docx"):
        mime = DOCX_MIME
    return FileResponse(
        path,
        media_type=mime or "application/octet-stream",
        filename=row["filename"],
        content_disposition_type="attachment",
    )


@app.get("/api/documents/{doc_id}/html", response_model=HtmlResult)
def document_html(doc_id: int) -> dict:
    row = _row_or_404(doc_id)
    if db.preview_for(row["filename"]) != "docx":
        raise HTTPException(422, "HTML view is only available for .docx documents")
    path = db.STORAGE_DIR / row["stored_name"]
    if not path.exists():
        raise HTTPException(404, "File missing from storage")
    try:
        return render_docx(path.read_bytes())
    except Exception as exc:
        raise HTTPException(422, f"Could not read this .docx: {exc}") from exc


@app.post("/api/seed/bucket", response_model=SeedResult)
def seed_bucket() -> dict:
    if not seed.BUCKET_ZIP.exists():
        raise HTTPException(404, "data/bucket.zip not found")
    return seed.seed_bucket()


def _not_implemented(mode: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content={"status": "not_implemented", "mode": mode, "message": message},
    )


@app.post("/api/jobs/creation", status_code=501)
def job_creation(body: CreationJob) -> JSONResponse:
    return _not_implemented(
        "creation", "ICF creation from sponsor documents is coming soon. Your request was valid."
    )


@app.post("/api/jobs/translation", status_code=501)
def job_translation(body: TranslationJob) -> JSONResponse:
    return _not_implemented(
        "translation", "NL/FR translation of ICFs is coming soon. Your request was valid."
    )


@app.post("/api/jobs/update", status_code=501)
def job_update(body: UpdateJob) -> JSONResponse:
    return _not_implemented(
        "update", "Updating ICFs to a new template version is coming soon. Your request was valid."
    )
