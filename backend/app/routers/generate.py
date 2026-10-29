import re
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db, services, storage, tasks
from ..auth import User, current_staff
from .projects import _doc_row, _project_row

router = APIRouter(prefix="/api", dependencies=[Depends(current_staff)], tags=["generate"])

LANG_NAMES = {"en": "English", "nl": "Dutch", "fr": "French"}


class GenerateIn(BaseModel):
    template_id: int | None = None
    icf_type: Literal["adult", "parent", "adolescent", "child"] = "adult"
    language: Literal["en", "nl", "fr"] = "en"
    sponsor_version_ids: list[int] = Field(default_factory=list)
    notes: str = ""
    title: str | None = None


class TranslateIn(BaseModel):
    target_languages: list[Literal["nl", "fr"]]
    version_id: int | None = None
    force: bool = False


class UpdateIn(BaseModel):
    version_id: int | None = None


def _en_reviewed(conn, doc_id: int) -> bool:
    """EN ICF counts as PI-reviewed (single place; extend with doc-level approved flag)."""
    if (
        conn.execute(
            "SELECT 1 FROM versions WHERE doc_id = ? AND source = 'reviewed' LIMIT 1", (doc_id,)
        ).fetchone()
        is not None
    ):
        return True
    # approved "as is" and the approved version is still the latest
    return (
        conn.execute(
            "SELECT 1 FROM project_docs WHERE id = ? AND approved_version_id IS NOT NULL"
            " AND approved_version_id = (SELECT MAX(id) FROM versions WHERE doc_id = ?)",
            (doc_id, doc_id),
        ).fetchone()
        is not None
    )


def _latest_template(conn, language: str):
    return conn.execute(
        "SELECT * FROM documents WHERE kind = 'template' AND language = ? AND audience = 'adult'"
        " AND lower(filename) LIKE '%.docx' ORDER BY COALESCE(released, '') DESC,"
        " COALESCE(version, '') DESC, id DESC LIMIT 1",
        (language,),
    ).fetchone()


def _fill_template(
    tpl, *, sponsor_text, notes, language, icf_type, progress, thinking_budget=1024
) -> tuple[bytes, dict]:
    from ..engine import generate as engine_generate

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "draft.docx"
        try:
            with storage.local_path(tpl["stored_name"]) as tpl_path:
                report = engine_generate.generate_icf(
                    str(tpl_path),
                    str(out),
                    sponsor_text=sponsor_text,
                    notes=notes,
                    language=language,
                    icf_type=icf_type,
                    progress=progress,
                    thinking_budget=thinking_budget,
                )
            return out.read_bytes(), report
        except FileNotFoundError:
            raise RuntimeError("Template file missing from storage") from None


_text_cache: dict[int, str] = {}  # version id -> extracted text (versions are immutable)


def _version_text(v) -> str:
    from ..engine import text as engine_text

    if v["id"] in _text_cache:
        return _text_cache[v["id"]]
    try:
        with storage.local_path(v["stored_name"]) as vpath:
            txt = engine_text.docx_text(str(vpath))
    except Exception:  # noqa: BLE001
        return ""
    _text_cache[v["id"]] = f"=== {v['filename']} ===\n{txt}"
    return _text_cache[v["id"]]


def _sponsor_text(conn, version_ids: list[int]) -> str:
    """Sponsor docs are downloaded from storage in parallel and cached per version."""
    from concurrent.futures import ThreadPoolExecutor

    rows = [
        r
        for vid in version_ids
        if (r := conn.execute("SELECT * FROM versions WHERE id = ?", (vid,)).fetchone())
        and r["filename"].lower().endswith(".docx")
    ]
    with ThreadPoolExecutor(max_workers=8) as pool:
        parts = list(pool.map(_version_text, rows))
    return "\n\n".join(p for p in parts if p)


@router.post("/projects/{pid}/generate", status_code=202)
def generate(pid: int, body: GenerateIn, user: User) -> dict:
    if body.language != "en":
        raise HTTPException(422, "creation_english_only")
    with db.connect() as conn:
        _project_row(conn, pid)
        if body.template_id is None:
            tpl = _latest_template(conn, body.language)
            if not tpl:
                raise HTTPException(422, "no_template_for_language")
        else:
            tpl = conn.execute(
                "SELECT * FROM documents WHERE id = ? AND kind = 'template'", (body.template_id,)
            ).fetchone()
            if not tpl or not tpl["filename"].lower().endswith(".docx"):
                raise HTTPException(404, "Template not found (or not a .docx)")
            if tpl["language"] != body.language:
                raise HTTPException(422, "template_language_mismatch")
    user_name = user["name"]

    def work(report) -> dict:
        with db.connect() as conn:
            sponsor = _sponsor_text(conn, body.sponsor_version_ids)
            data, rep = _fill_template(
                tpl,
                sponsor_text=sponsor,
                notes=body.notes,
                language=body.language,
                icf_type=body.icf_type,
                progress=report,
            )
            title = (body.title or "").strip() or f"ICF {body.icf_type} ({body.language.upper()})"
            doc = services.create_doc_with_version(
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
                user_name=user_name,
            )
        report("saving", 1, 1)
        return {"docs": [doc], "reports": [rep]}

    return {"task_id": tasks.start_task("generate", work, body.language)}


def _translated_title(title: str, lang: str) -> str:
    suffix = f"({lang.upper()})"
    if re.search(r"\((EN|NL|FR)\)\s*$", title, re.I):
        return re.sub(r"\((EN|NL|FR)\)\s*$", suffix, title, flags=re.I)
    return f"{title} {suffix}"


@router.post("/project-documents/{doc_id}/translate", status_code=202)
def translate(doc_id: int, body: TranslateIn, user: User) -> dict:
    langs = list(dict.fromkeys(body.target_languages))
    if not langs:
        raise HTTPException(422, "target_languages is empty")
    with db.connect() as conn:
        src = _doc_row(conn, doc_id)
        if (src["language"] or "en") == "en" and not body.force and not _en_reviewed(conn, doc_id):
            raise HTTPException(422, "translate_requires_review")
        if body.version_id is not None:
            ver = conn.execute(
                "SELECT * FROM versions WHERE id = ? AND doc_id = ?", (body.version_id, doc_id)
            ).fetchone()
            if not ver:
                raise HTTPException(404, "Version not found")
        else:
            ver = conn.execute(
                "SELECT * FROM versions WHERE doc_id = ? ORDER BY number DESC LIMIT 1", (doc_id,)
            ).fetchone()
        if not ver or not ver["filename"].lower().endswith(".docx"):
            raise HTTPException(422, "Source version must be a .docx")
        tpls = {}
        for lang in langs:
            tpls[lang] = _latest_template(conn, lang)
            if not tpls[lang]:
                raise HTTPException(422, "no_template_for_language")
    user_name = user["name"]
    src_lang = (src["language"] or "en").upper()

    def work(report) -> dict:
        from ..engine import text as engine_text

        docs, reports = [], []
        with db.connect() as conn:
            with storage.local_path(ver["stored_name"]) as p:
                source_text = engine_text.docx_text(str(p))
            sponsor_text = f"=== {src['title']} (v{ver['number']}) ===\n{source_text}"
            reporters = report.parallel(langs)

            def fill(i: int, lang: str):
                return _fill_template(
                    tpls[lang],
                    sponsor_text=sponsor_text,
                    notes=(
                        f"Fill the placeholders by translating the content of the {src_lang} "
                        "source "
                        f"ICF into {LANG_NAMES[lang]}. Keep names, numbers and dates exactly as in "
                        "the source."
                    ),
                    language=lang,
                    icf_type=src["icf_type"] or "adult",
                    progress=reporters[i],
                    thinking_budget=0,  # mechanical translation: no reasoning needed
                )

            # target languages are independent: fill them concurrently (ai._slots caps Vertex calls)
            with ThreadPoolExecutor(max_workers=len(langs)) as pool:
                results = list(pool.map(lambda a: fill(*a), enumerate(langs)))
            for i, lang in enumerate(langs):
                data, rep = results[i]
                title = _translated_title(src["title"], lang)
                note = f"Translated from {src_lang} v{ver['number']}"
                existing = conn.execute(
                    "SELECT id FROM project_docs WHERE source_doc_id = ? AND language = ?"
                    " ORDER BY id LIMIT 1",
                    (doc_id, lang),
                ).fetchone()
                filename = f"{title}.docx".replace("/", "-")
                if existing:
                    services.add_version(
                        conn, existing["id"], filename, data, note, "generated", user_name
                    )
                    row = conn.execute(
                        "SELECT * FROM project_docs WHERE id = ?", (existing["id"],)
                    ).fetchone()
                    doc = services.doc_dict(conn, row)
                else:
                    doc = services.create_doc_with_version(
                        conn,
                        src["project_id"],
                        title=title,
                        role="icf",
                        icf_type=src["icf_type"],
                        language=lang,
                        filename=filename,
                        data=data,
                        note=note,
                        source="generated",
                        user_name=user_name,
                        source_doc_id=doc_id,
                    )
                docs.append(doc)
                reports.append(rep)
                reporters[i]("saving", 1, 1)
        return {"docs": docs, "reports": reports}

    return {"task_id": tasks.start_task("translate", work, langs[0])}


@router.post("/project-documents/{doc_id}/update-template", status_code=202)
def update_to_latest_template(doc_id: int, body: UpdateIn, user: User) -> dict:
    """Update mode: rebuild an uploaded ICF on the latest template of its own language."""
    with db.connect() as conn:
        src = _doc_row(conn, doc_id)
        if src["role"] != "icf":
            raise HTTPException(422, "Only ICF documents can be updated")
        lang = src["language"]
        if lang not in LANG_NAMES:
            raise HTTPException(422, "Document language must be set (en/nl/fr)")
        if body.version_id is not None:
            ver = conn.execute(
                "SELECT * FROM versions WHERE id = ? AND doc_id = ?", (body.version_id, doc_id)
            ).fetchone()
        else:
            ver = conn.execute(
                "SELECT * FROM versions WHERE doc_id = ? ORDER BY number DESC LIMIT 1", (doc_id,)
            ).fetchone()
        if not ver or not ver["filename"].lower().endswith(".docx"):
            raise HTTPException(422, "Source version must be a .docx")
        tpl = _latest_template(conn, lang)
        if not tpl:
            raise HTTPException(422, "no_template_for_language")
    user_name = user["name"]

    def work(report) -> dict:
        from ..engine import text as engine_text

        with db.connect() as conn:
            with storage.local_path(ver["stored_name"]) as p:
                source_text = engine_text.docx_text(str(p))
            data, rep = _fill_template(
                tpl,
                sponsor_text=f"=== {src['title']} (v{ver['number']}) ===\n{source_text}",
                notes=(
                    f"The source is an existing {LANG_NAMES[lang]} ICF written with an older "
                    "template. Fill the placeholders of the new template with the content of the "
                    f"source ICF, in {LANG_NAMES[lang]}, keeping names, numbers and dates "
                    "exactly. Flag anything the source does not cover."
                ),
                language=lang,
                icf_type=src["icf_type"] or "adult",
                progress=report,
                thinking_budget=0,
            )
            vid_note = f"Updated to template v{tpl['version'] or '?'} from v{ver['number']}"
            services.add_version(
                conn,
                doc_id,
                f"{src['title']}.docx".replace("/", "-"),
                data,
                vid_note,
                "generated",
                user_name,
            )
            row = conn.execute("SELECT * FROM project_docs WHERE id = ?", (doc_id,)).fetchone()
            doc = services.doc_dict(conn, row)
        report("saving", 1, 1)
        return {"docs": [doc], "reports": [rep]}

    return {"task_id": tasks.start_task("translate", work, lang)}


@router.get("/tasks/{task_id}")
def get_task(task_id: str) -> dict:
    t = tasks.get_task(task_id)
    if t is None:
        raise HTTPException(404, "Task not found")
    return t
