from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import db, facts
from ..auth import User, current_staff
from .projects import _project_row

router = APIRouter(prefix="/api", dependencies=[Depends(current_staff)], tags=["facts"])


class FactsPatch(BaseModel):
    values: dict[str, str | None]
    source: str = "manual"  # 'manual' | 'inferred'


def _clean(values: dict[str, str | None]) -> dict[str, str]:
    bad = [k for k in values if k not in facts.BY_KEY]
    if bad:
        raise HTTPException(422, f"Unknown fact keys: {', '.join(bad)}")
    return {k: (v or "").strip() for k, v in values.items()}


def _project_payload(conn, pid: int) -> dict:
    eff = facts.effective(conn, pid)
    filled = sum(1 for k in facts.KEY_FACTS if eff[k]["value"])
    return {
        "schema": facts.SCHEMA,
        "facts": eff,
        "globals": facts.global_values(conn),
        "key_facts": facts.KEY_FACTS,
        "filled": filled,
        "total": len(facts.KEY_FACTS),
    }


def _global_payload(conn) -> dict:
    return {
        "schema": [f for f in facts.SCHEMA if f["scope"] in ("global", "both")],
        "values": facts.global_values(conn),
    }


@router.get("/global-facts")
def get_global_facts() -> dict:
    with db.connect() as conn:
        return _global_payload(conn)


@router.put("/global-facts")
def put_global_facts(body: FactsPatch, user: User) -> dict:
    vals = _clean(body.values)
    with db.connect() as conn:
        for k, v in vals.items():
            if v:
                conn.execute(
                    "INSERT INTO global_facts (key, value, updated_at, updated_by) VALUES (?,?,?,?)"
                    " ON CONFLICT(key) DO UPDATE SET value=excluded.value,"
                    " updated_at=excluded.updated_at, updated_by=excluded.updated_by",
                    (k, v, db.now_iso(), user["name"]),
                )
            else:
                conn.execute("DELETE FROM global_facts WHERE key = ?", (k,))
        return _global_payload(conn)


@router.get("/projects/{pid}/facts")
def get_project_facts(pid: int) -> dict:
    with db.connect() as conn:
        _project_row(conn, pid)
        return _project_payload(conn, pid)


@router.put("/projects/{pid}/facts")
def put_project_facts(pid: int, body: FactsPatch, user: User) -> dict:
    vals = _clean(body.values)
    source = body.source if body.source in ("manual", "inferred") else "manual"
    with db.connect() as conn:
        _project_row(conn, pid)
        for k, v in vals.items():
            if v:
                conn.execute(
                    "INSERT INTO project_facts (project_id, key, value, source, updated_at,"
                    " updated_by) VALUES (?,?,?,?,?,?) ON CONFLICT(project_id, key) DO UPDATE SET"
                    " value=excluded.value, source=excluded.source,"
                    " updated_at=excluded.updated_at, updated_by=excluded.updated_by",
                    (pid, k, v, source, db.now_iso(), user["name"]),
                )
            else:
                conn.execute("DELETE FROM project_facts WHERE project_id=? AND key=?", (pid, k))
        if vals.get("study_summary") and source == "inferred":
            conn.execute(
                "UPDATE projects SET description = ? WHERE id = ?", (vals["study_summary"], pid)
            )
        return _project_payload(conn, pid)


INFER_SYSTEM = (
    "You extract study facts from clinical trial sponsor documents. Use ONLY what the documents "
    "explicitly state; never guess or invent. Use null for anything not stated. Keep names, "
    "numbers, phone numbers, e-mails and addresses exactly as written."
)


@router.post("/projects/{pid}/facts/infer")
def infer_facts(pid: int) -> dict:
    """Suggest values from the project's sponsor docs. Nothing is saved; the user accepts."""
    from ..engine import ai
    from .generate import _sponsor_text

    with db.connect() as conn:
        _project_row(conn, pid)
        vids = [
            r["id"]
            for r in conn.execute(
                "SELECT (SELECT id FROM versions v WHERE v.doc_id = d.id ORDER BY number DESC"
                " LIMIT 1) AS id FROM project_docs d WHERE d.project_id = ? AND d.role = 'sponsor'",
                (pid,),
            )
            if r["id"]
        ]
        text = _sponsor_text(conn, vids)[:60_000]
        current = facts.effective(conn, pid)
    if not text.strip():
        raise HTTPException(422, "no_sponsor_documents")
    if not ai.ai_status()["enabled"]:
        raise HTTPException(503, "ai_unavailable")
    spec = {k: facts.BY_KEY[k]["label"] for k in facts.INFERABLE}
    prompt = (
        f"SPONSOR DOCUMENTS:\n{text}\n\nReturn a JSON object with exactly these keys (value: "
        f"string or null):\n{spec}\n\nstudy_summary must be a plain-language description of the "
        "study in 2-4 sentences (aim, population, treatment), in English, based only on the "
        "documents."
    )
    data = ai.generate_json(prompt, INFER_SYSTEM, thinking_budget=0)
    if not isinstance(data, dict):
        raise HTTPException(502, "ai_failed")
    out = []
    for k in facts.INFERABLE:
        v = data.get(k)
        if isinstance(v, str) and v.strip() and v.strip() != current[k]["value"]:
            out.append(
                {
                    "key": k,
                    "value": v.strip(),
                    "current": current[k]["value"],
                    "current_source": current[k]["source"],
                }
            )
    return {"suggestions": out}
