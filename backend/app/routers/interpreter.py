"""Read-only, audience-aware interpretation of ICFs and their review history."""

import json
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db, storage
from ..auth import current_user
from ..engine import interpreter as interpreter_engine
from ..routers.projects import _doc_row

log = logging.getLogger("icf.interpreter")
router = APIRouter(
    prefix="/api/interpreter", dependencies=[Depends(current_user)], tags=["interpreter"]
)

Persona = Literal[
    "pi", "ethical_reviewer", "parent_guardian", "adult", "adolescent", "child"
]
Language = Literal["en", "nl", "fr"]
AgeGroup = Literal["8-11", "12-17", "adult"]


def _doc(conn, icf_id: int):
    doc = _doc_row(conn, icf_id)
    if doc["role"] != "icf":
        raise HTTPException(422, "Interpreter context is available for ICF documents only")
    return doc


def _version_context(conn, version) -> dict:
    metadata = {
        "version_id": version["id"],
        "version_number": version["number"],
        "uploaded_at": version["uploaded_at"],
        "uploaded_by": version["uploaded_by"],
        "source": version["source"],
        "note": version["note"],
    }
    comments = [
        {
            "author": row["author"],
            "text": row["text"],
            "anchor_text": row["anchor_text"],
            "status": row["status"],
            "decision_note": row["decision_note"],
            "parent_id": row["parent_id"],
        }
        for row in conn.execute(
            "SELECT * FROM comments WHERE version_id = ? ORDER BY id", (version["id"],)
        )
    ]
    if not version["filename"].lower().endswith(".docx"):
        return {**metadata, "sections": [], "comments": comments, "content_available": False}
    from ..engine import edit

    try:
        with storage.local_path(version["stored_name"]) as path:
            paragraphs = edit.list_paragraphs(str(path))
    except FileNotFoundError:
        raise HTTPException(404, "File missing from storage") from None
    except Exception as exc:
        log.exception("Could not read ICF version %s", version["id"])
        raise HTTPException(422, "Could not read this ICF version") from exc

    sections = []
    section_id, heading = "s-intro", "Introduction"
    for paragraph in paragraphs:
        if paragraph["heading"]:
            section_id = f"s-{version['id']}-{paragraph['idx']}"
            heading = paragraph["text"]
            sections.append(
                {
                    "section_id": section_id,
                    "heading": heading,
                    "text": paragraph["text"],
                    "anchor": paragraph.get("anchor"),
                }
            )
        elif sections and sections[-1]["section_id"] == section_id:
            sections[-1]["text"] += "\n" + paragraph["text"]
        else:
            sections.append(
                {
                    "section_id": section_id,
                    "heading": heading,
                    "text": paragraph["text"],
                    "anchor": None,
                }
            )

    return {
        **metadata,
        "sections": sections,
        "comments": comments,
        "content_available": True,
    }


def _context(conn, doc, selected_ids: list[int] | None = None) -> dict:
    rows = conn.execute("SELECT * FROM versions WHERE doc_id = ? ORDER BY number", (doc["id"],))
    versions = [_version_context(conn, row) for row in rows]
    if not versions:
        raise HTTPException(404, "ICF has no versions")
    ids = {version["version_id"] for version in versions}
    if selected_ids and any(vid not in ids for vid in selected_ids):
        raise HTTPException(422, "Selected version does not belong to this ICF")
    history = [
        {
            "source_version_id": row["source_version_id"],
            "result_version_id": row["result_version_id"],
            "instruction": row["instruction"],
            "created_by": row["created_by"],
            "created_at": row["created_at"],
            "edits": json.loads(row["edits_json"]),
        }
        for row in conn.execute("SELECT * FROM changes WHERE doc_id = ? ORDER BY id", (doc["id"],))
    ]
    version_diffs = []
    from ..engine import diff as engine_diff

    for old, new in zip(versions, versions[1:], strict=False):
        if not old["content_available"] or not new["content_available"]:
            continue
        old_row = conn.execute(
            "SELECT stored_name FROM versions WHERE id = ?", (old["version_id"],)
        ).fetchone()
        new_row = conn.execute(
            "SELECT stored_name FROM versions WHERE id = ?", (new["version_id"],)
        ).fetchone()
        try:
            with (
                storage.local_path(old_row["stored_name"]) as old_path,
                storage.local_path(new_row["stored_name"]) as new_path,
            ):
                diff = engine_diff.diff_docs(str(old_path), str(new_path))
        except Exception:
            log.exception(
                "Could not build version diff %s -> %s", old["version_id"], new["version_id"]
            )
            continue
        version_diffs.append({
            "from_version_id": old["version_id"],
            "to_version_id": new["version_id"],
            "stats": diff["stats"],
            "blocks": diff["blocks"],
        })
    return {
        "icf": {
            "id": doc["id"],
            "project_id": doc["project_id"],
            "title": doc["title"],
            "icf_type": doc["icf_type"],
            "language": doc["language"],
        },
        "latest_version_id": versions[-1]["version_id"],
        "selected_version_ids": selected_ids or [versions[-1]["version_id"]],
        "versions": versions,
        "version_diffs": version_diffs,
        "change_history": history,
    }


@router.get("/context/{icf_id}")
def get_context(icf_id: int, version_id: int | None = None):
    with db.connect() as conn:
        doc = _doc(conn, icf_id)
        return _context(conn, doc, [version_id] if version_id else None)


class InterpreterMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str


class InterpretRequest(BaseModel):
    icf_id: int
    section_id: str | None = None
    version_id: int | None = None
    compare_version_id: int | None = None
    persona: Persona = "adult"
    age_group: AgeGroup | None = None
    language: Language = "en"
    question: str | None = None
    text: str | None = None
    term: str | None = None
    source_language: Language | None = None
    history: list[InterpreterMessage] = Field(default_factory=list, max_length=12)


def _validate_body(body: InterpretRequest, operation: str) -> None:
    needs = {
        "explain": body.section_id or body.question,
        "simplify": body.text or body.section_id,
        "translate": body.text or body.section_id,
        "ask": body.question,
        "compare": True,
        "clarify": body.term or body.question or body.section_id,
    }
    if not needs[operation]:
        raise HTTPException(422, f"{operation} requires its text, section, or question input")
    if body.persona == "child" and body.age_group not in (None, "8-11"):
        raise HTTPException(422, "Child persona age_group must be 8-11")
    if body.persona == "adolescent" and body.age_group not in (None, "12-17"):
        raise HTTPException(422, "Adolescent persona age_group must be 12-17")


def _interpret(operation: str, body: InterpretRequest) -> dict:
    _validate_body(body, operation)
    with db.connect() as conn:
        doc = _doc(conn, body.icf_id)
        rows = conn.execute(
            "SELECT * FROM versions WHERE doc_id = ? ORDER BY number", (doc["id"],)
        ).fetchall()
        if not rows:
            raise HTTPException(404, "ICF has no versions")
        latest_id = rows[-1]["id"]
        first_id = body.version_id or latest_id
        if first_id not in {row["id"] for row in rows}:
            raise HTTPException(422, "Selected version does not belong to this ICF")
        selected_ids = [first_id]
        if operation == "compare":
            second_id = body.compare_version_id
            if second_id is None:
                first_number = next(row["number"] for row in rows if row["id"] == first_id)
                previous = [row["id"] for row in rows if row["number"] < first_number]
                if not previous:
                    raise HTTPException(422, "A second version is required to compare")
                second_id = previous[-1]
            if second_id == first_id:
                raise HTTPException(422, "Comparison requires two different versions")
            selected_ids = [first_id, second_id]
        context = _context(conn, doc, selected_ids)

    selected_sections = []
    for version in context["versions"]:
        if version["version_id"] in selected_ids:
            selected_sections.extend(
                section for section in version["sections"]
                if not body.section_id or section["section_id"] == body.section_id
            )
    if body.section_id and not selected_sections:
        # A section may only be in a historical version, still available in the full context.
        matches = [
            section
            for version in context["versions"]
            for section in version["sections"]
            if section["section_id"] == body.section_id
        ]
        if not matches:
            raise HTTPException(404, "Section not found in ICF history")
        selected_sections = matches
    if operation == "compare" and len(selected_ids) != 2:
        raise HTTPException(422, "Comparison requires two versions")

    if operation == "compare":
        request = {
            "question": body.question or "Explain the meaningful changes and any implications.",
            "from_version_id": selected_ids[1],
            "to_version_id": selected_ids[0],
            "section_id": body.section_id,
            "conversation": [message.model_dump() for message in body.history],
        }
        # Present comparison order clearly and let the model see the complete version history.
        context["comparison"] = {
            "from_version_id": selected_ids[1],
            "to_version_id": selected_ids[0],
        }
    else:
        request = {
            "question": body.question,
            "text": body.text,
            "term": body.term,
            "section_id": body.section_id,
            "selected_version_id": first_id,
            "default_version_id": latest_id,
            "historical_version_handling": (
                "The latest version is the default. If the question clearly asks about a prior "
                "version, answer from that version and identify it. Do not blend versions."
            ),
            "selected_source_sections": selected_sections,
            "source_language": body.source_language,
            "conversation": [message.model_dump() for message in body.history],
        }

    from ..engine import ai

    if not ai.ai_status()["enabled"]:
        raise HTTPException(503, "Interpreter AI is unavailable (check Vertex AI configuration)")
    result = interpreter_engine.response(
        operation=operation,
        persona=body.persona,
        age_group=body.age_group or {"child": "8-11", "adolescent": "12-17"}.get(body.persona),
        language=body.language,
        request=request,
        context=context,
    )
    if result is None:
        raise HTTPException(502, "Interpreter could not produce a grounded answer; please retry")
    result["source_references"] = [
        {
            "version_id": version["version_id"],
            "version_number": version["version_number"],
            "section_id": section_id,
            "heading": section["heading"],
            "anchor": section.get("anchor"),
        }
        for reference in result["source_references"]
        for version in context["versions"]
        for section in version["sections"]
        if reference == f"v{version['version_id']}:{section['section_id']}"
        for section_id in [section["section_id"]]
    ]
    return result


@router.post("/explain")
def explain(body: InterpretRequest):
    return _interpret("explain", body)


@router.post("/simplify")
def simplify(body: InterpretRequest):
    return _interpret("simplify", body)


@router.post("/translate")
def translate(body: InterpretRequest):
    return _interpret("translate", body)


@router.post("/ask")
def ask(body: InterpretRequest):
    return _interpret("ask", body)


@router.post("/compare")
def compare(body: InterpretRequest):
    return _interpret("compare", body)


@router.post("/clarify")
def clarify(body: InterpretRequest):
    return _interpret("clarify", body)
