from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import db, seed, services
from ..auth import User, current_user

router = APIRouter(prefix="/api", dependencies=[Depends(current_user)], tags=["projects"])

Stage = Literal["intake", "drafting", "pi_review", "translation", "ethics_review", "approved"]


class ProjectIn(BaseModel):
    name: str
    study: str = ""
    description: str = ""


class ProjectPatch(BaseModel):
    name: str | None = None
    study: str | None = None
    description: str | None = None
    stage: Stage | None = None


def _project_row(conn, pid: int):
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
    if not row:
        raise HTTPException(404, "Project not found")
    return row


def _doc_row(conn, did: int):
    row = conn.execute("SELECT * FROM project_docs WHERE id = ?", (did,)).fetchone()
    if not row:
        raise HTTPException(404, "Document not found")
    return row


def _version_row(conn, vid: int):
    row = conn.execute("SELECT * FROM versions WHERE id = ?", (vid,)).fetchone()
    if not row:
        raise HTTPException(404, "Version not found")
    return row


@router.get("/projects")
def list_projects() -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute("SELECT * FROM projects ORDER BY created_at DESC, id DESC").fetchall()
        return [services.project_dict(conn, r) for r in rows]


@router.post("/projects", status_code=201)
def create_project(body: ProjectIn, user: User) -> dict:
    if not body.name.strip():
        raise HTTPException(422, "name is required")
    with db.connect() as conn:
        cur = conn.execute(
            "INSERT INTO projects (name, study, description, stage, created_at, created_by_name)"
            " VALUES (?,?,?,?,?,?)",
            (body.name.strip(), body.study.strip(), body.description.strip(), "intake",
             db.now_iso(), user["name"]),
        )  # fmt: skip
        return services.project_dict(conn, _project_row(conn, cur.lastrowid))


@router.get("/projects/{pid}")
def get_project(pid: int) -> dict:
    with db.connect() as conn:
        return services.project_dict(conn, _project_row(conn, pid))


@router.patch("/projects/{pid}")
def patch_project(pid: int, body: ProjectPatch) -> dict:
    with db.connect() as conn:
        row = _project_row(conn, pid)
        vals = {k: v for k, v in body.model_dump().items() if v is not None}
        if "name" in vals:
            vals["name"] = vals["name"].strip() or row["name"]
        if vals:
            sets = ", ".join(f"{k} = ?" for k in vals)
            conn.execute(f"UPDATE projects SET {sets} WHERE id = ?", (*vals.values(), pid))  # noqa: S608
        return services.project_dict(conn, _project_row(conn, pid))


@router.delete("/projects/{pid}", status_code=204)
def delete_project(pid: int) -> Response:
    with db.connect() as conn:
        _project_row(conn, pid)
        services.delete_version_files(
            conn, "doc_id IN (SELECT id FROM project_docs WHERE project_id = ?)", (pid,)
        )
        conn.execute("DELETE FROM project_docs WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
    return Response(status_code=204)


@router.get("/projects/{pid}/documents")
def list_project_docs(pid: int) -> list[dict]:
    with db.connect() as conn:
        _project_row(conn, pid)
        rows = conn.execute(
            "SELECT * FROM project_docs WHERE project_id = ? ORDER BY id", (pid,)
        ).fetchall()
        return [services.doc_dict(conn, r) for r in rows]


@router.post("/projects/{pid}/documents")
def upload_project_doc(
    pid: int,
    user: User,
    file: Annotated[UploadFile, File()],
    role: Annotated[str, Form()] = "sponsor",
    title: Annotated[str | None, Form()] = None,
    icf_type: Annotated[str | None, Form()] = None,
    language: Annotated[str | None, Form()] = None,
    note: Annotated[str | None, Form()] = None,
) -> dict:
    if role not in ("sponsor", "icf", "other"):
        raise HTTPException(422, "role must be sponsor, icf or other")
    icf_type = (icf_type or "").strip() or None
    if icf_type not in (None, "adult", "parent", "adolescent", "child"):
        raise HTTPException(422, "invalid icf_type")
    language = services.check_lang(language)
    filename, stored, data = services.read_upload(file)
    with db.connect() as conn:
        _project_row(conn, pid)
        services.store(stored, data)
        return services.create_doc_with_version(
            conn,
            pid,
            title=(title or "").strip() or filename.rsplit(".", 1)[0],
            role=role,
            icf_type=icf_type,
            language=language or seed.guess_language(filename),
            filename=filename,
            stored=stored,
            size=len(data),
            note=(note or "").strip(),
            source="upload",
            user_name=user["name"],
        )


@router.delete("/project-documents/{did}", status_code=204)
def delete_project_doc(did: int) -> Response:
    with db.connect() as conn:
        _doc_row(conn, did)
        services.delete_version_files(conn, "doc_id = ?", (did,))
        conn.execute("DELETE FROM project_docs WHERE id = ?", (did,))
    return Response(status_code=204)


@router.post("/project-documents/{did}/versions")
def upload_version(
    did: int,
    user: User,
    file: Annotated[UploadFile, File()],
    note: Annotated[str | None, Form()] = None,
    source: Annotated[str | None, Form()] = None,
) -> dict:
    source = (source or "").strip() or "upload"
    if source not in ("upload", "reviewed"):
        raise HTTPException(422, "source must be upload or reviewed")
    filename, stored, data = services.read_upload(file)
    with db.connect() as conn:
        _doc_row(conn, did)
        services.store(stored, data)
        vid = services.add_version(
            conn, did, filename, stored, len(data), (note or "").strip(), source, user["name"]
        )
        return services.version_dict(conn, _version_row(conn, vid))


@router.get("/versions/{vid}")
def get_version(vid: int) -> dict:
    with db.connect() as conn:
        v = _version_row(conn, vid)
        d = _doc_row(conn, v["doc_id"])
        return {
            "version": services.version_dict(conn, v),
            "doc": services.doc_dict(conn, d, with_versions=False),
            "project": services.project_dict(conn, _project_row(conn, d["project_id"])),
        }


@router.get("/versions/{vid}/file")
def version_file(vid: int) -> FileResponse:
    with db.connect() as conn:
        v = _version_row(conn, vid)
    path = db.STORAGE_DIR / v["stored_name"]
    if not path.exists():
        raise HTTPException(404, "File missing from storage")
    mime = services.DOCX_MIME if v["filename"].lower().endswith(".docx") else None
    return FileResponse(
        path,
        media_type=mime or "application/octet-stream",
        filename=v["filename"],
        content_disposition_type="attachment",
    )


@router.get("/versions/{vid}/html")
def version_html(vid: int) -> dict:
    from ..engine import render

    with db.connect() as conn:
        v = _version_row(conn, vid)
    if db.preview_for(v["filename"]) != "docx":
        raise HTTPException(422, "HTML view is only available for .docx documents")
    path = db.STORAGE_DIR / v["stored_name"]
    if not path.exists():
        raise HTTPException(404, "File missing from storage")
    try:
        return render.render_docx(str(path))
    except Exception as exc:
        raise HTTPException(422, f"Could not read this .docx: {exc}") from exc
