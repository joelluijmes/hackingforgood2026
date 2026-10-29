from pathlib import Path
from typing import Annotated, get_args

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

from .. import db, seed, services, storage
from ..auth import User, current_user
from ..models import (
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

router = APIRouter(prefix="/api", dependencies=[Depends(current_user)], tags=["library"])


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


@router.get("/documents", response_model=list[Document])
def list_documents(kind: Kind | None = None) -> list[dict]:
    sql, args = "SELECT * FROM documents", []
    if kind:
        sql += " WHERE kind = ?"
        args.append(kind)
    sql += " ORDER BY uploaded_at DESC, id DESC"
    with db.connect() as conn:
        return [db.to_document(r) for r in conn.execute(sql, args).fetchall()]


@router.post("/documents", response_model=Document, status_code=201)
def upload_document(
    file: Annotated[UploadFile, File()],
    kind: Annotated[str, Form()],
    name: Annotated[str | None, Form()] = None,
    language: Annotated[str | None, Form()] = None,
    audience: Annotated[str | None, Form()] = None,
    version: Annotated[str | None, Form()] = None,
    released: Annotated[str | None, Form()] = None,
    study: Annotated[str | None, Form()] = None,
) -> dict:
    kind = _check(kind, get_args(Kind), "kind") or ""
    if not kind:
        raise HTTPException(422, "kind is required")
    language = _check(language, get_args(Language), "language")
    audience = _check(audience, get_args(Audience), "audience")
    filename = Path((file.filename or "upload").replace("\\", "/")).name or "upload"
    if Path(filename).suffix.lower() not in (".docx", ".doc", ".rtf", ".pdf"):
        raise HTTPException(422, "Unsupported file type; use .docx, .doc, .rtf or .pdf")
    filename, data, _ = services.convert_legacy(filename, file.file.read())
    stored = storage.template_key(Path(filename).suffix)
    storage.put(stored, data, services.mime_for(filename))
    return db.insert_document(
        kind=kind,
        name=(name or "").strip() or Path(filename).stem,
        filename=filename,
        stored_name=stored,
        size=len(data),
        checksum=storage.sha256(data),
        language=language,
        audience=audience,
        version=(version or "").strip() or None,
        released=(released or "").strip() or None,
        study=(study or "").strip() or None,
    )


@router.get("/documents/{doc_id}", response_model=Document)
def get_document(doc_id: int) -> dict:
    return db.to_document(_row_or_404(doc_id))


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: int) -> Response:
    row = _row_or_404(doc_id)
    with db.connect() as conn:
        conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    storage.delete(row["stored_name"])
    return Response(status_code=204)


@router.get("/documents/{doc_id}/file")
def download_document(doc_id: int) -> Response:
    row = _row_or_404(doc_id)
    return services.download_response(row["stored_name"], row["filename"])


@router.get("/documents/{doc_id}/html", response_model=HtmlResult)
def document_html(doc_id: int) -> dict:
    from ..engine import render

    row = _row_or_404(doc_id)
    if db.preview_for(row["filename"]) != "docx":
        raise HTTPException(422, "HTML view is only available for .docx documents")
    try:
        with storage.local_path(row["stored_name"]) as path:
            return render.render_docx(str(path))
    except FileNotFoundError:
        raise HTTPException(404, "File missing from storage") from None
    except Exception as exc:
        raise HTTPException(422, f"Could not read this .docx: {exc}") from exc


@router.post("/seed/bucket", response_model=SeedResult)
def seed_bucket(user: User) -> dict:
    if not seed.BUCKET_ZIP.exists():
        raise HTTPException(404, "data/bucket.zip not found")
    return seed.seed_bucket(user["name"])


@router.get("/ai/status")
def ai_status() -> dict:
    from ..engine import ai

    return ai.ai_status()


def _not_implemented(mode: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content={"status": "not_implemented", "mode": mode, "message": message},
    )


@router.post("/jobs/creation", status_code=501)
def job_creation(body: CreationJob) -> JSONResponse:
    return _not_implemented(
        "creation", "ICF creation from sponsor documents is coming soon. Your request was valid."
    )


@router.post("/jobs/translation", status_code=501)
def job_translation(body: TranslationJob) -> JSONResponse:
    return _not_implemented(
        "translation", "NL/FR translation of ICFs is coming soon. Your request was valid."
    )


@router.post("/jobs/update", status_code=501)
def job_update(body: UpdateJob) -> JSONResponse:
    return _not_implemented(
        "update", "Updating ICFs to a new template version is coming soon. Your request was valid."
    )
