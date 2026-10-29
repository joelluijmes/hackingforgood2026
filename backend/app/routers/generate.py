import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db, storage
from ..auth import User, current_user
from ..services import create_doc_with_version
from .projects import _project_row

router = APIRouter(prefix="/api", dependencies=[Depends(current_user)], tags=["generate"])


class GenerateIn(BaseModel):
    template_id: int
    icf_type: Literal["adult", "parent", "adolescent", "child"] = "adult"
    language: Literal["en", "nl", "fr"] = "en"
    sponsor_version_ids: list[int] = Field(default_factory=list)
    notes: str = ""
    title: str | None = None


@router.post("/projects/{pid}/generate")
def generate(pid: int, body: GenerateIn, user: User) -> dict:
    from ..engine import generate as engine_generate
    from ..engine import text as engine_text

    with db.connect() as conn:
        _project_row(conn, pid)
        tpl = conn.execute(
            "SELECT * FROM documents WHERE id = ? AND kind = 'template'", (body.template_id,)
        ).fetchone()
        if not tpl or not tpl["filename"].lower().endswith(".docx"):
            raise HTTPException(404, "Template not found (or not a .docx)")
        parts = []
        for vid in body.sponsor_version_ids:
            v = conn.execute("SELECT * FROM versions WHERE id = ?", (vid,)).fetchone()
            if not v or not v["filename"].lower().endswith(".docx"):
                continue
            try:
                with storage.local_path(v["stored_name"]) as vpath:
                    txt = engine_text.docx_text(str(vpath))
            except Exception:
                continue
            parts.append(f"=== {v['filename']} ===\n{txt}")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "draft.docx"
            try:
                with storage.local_path(tpl["stored_name"]) as tpl_path:
                    report = engine_generate.generate_icf(
                        str(tpl_path),
                        str(out),
                        sponsor_text="\n\n".join(parts),
                        notes=body.notes,
                        language=body.language,
                        icf_type=body.icf_type,
                    )
                data = out.read_bytes()
            except FileNotFoundError:
                raise HTTPException(404, "Template file missing from storage") from None
            except Exception as exc:
                raise HTTPException(500, f"Generation failed: {exc}") from exc
        title = (body.title or "").strip() or f"ICF {body.icf_type} ({body.language.upper()})"
        doc = create_doc_with_version(
            conn,
            pid,
            title=title,
            role="icf",
            icf_type=body.icf_type,
            language=body.language,
            filename=f"{title}.docx".replace("/", "-"),
            data=data,
            note="Generated from template",
            source="generated",
            user_name=user["name"],
        )
        return {"doc": doc, "report": report}
