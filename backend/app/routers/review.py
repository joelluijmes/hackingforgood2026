from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from .. import db, services, storage
from ..auth import User, current_staff

router = APIRouter(prefix="/api", dependencies=[Depends(current_staff)], tags=["review"])


def _lang(lang: str | None, user: dict) -> str:
    return services.check_lang(lang) or user["language"]


def _ensure_version(conn, vid: int):
    row = conn.execute("SELECT * FROM versions WHERE id = ?", (vid,)).fetchone()
    if not row:
        raise HTTPException(404, "Version not found")
    return row


@router.get("/versions/{vid}/comments")
def list_comments(vid: int, user: User, lang: str | None = None) -> list[dict]:
    lang = _lang(lang, user)
    with db.connect() as conn:
        _ensure_version(conn, vid)
        return services.comments_for_version(conn, vid, lang)


class NewComment(BaseModel):
    text: str
    anchor_text: str


@router.post("/versions/{vid}/comments")
def add_comment(vid: int, body: NewComment, user: User) -> dict:
    """User comment anchored on selected text; written into the stored docx as a Word comment."""
    import tempfile
    from pathlib import Path

    from ..engine import comments as engine_comments

    text, anchor = body.text.strip(), body.anchor_text.strip()
    if not text or not anchor:
        raise HTTPException(422, "Comment text and selected text are required")
    with db.connect() as conn:
        v = _ensure_version(conn, vid)
    if not v["filename"].lower().endswith(".docx"):
        raise HTTPException(422, "Comments can only be added to .docx versions")
    initials = "".join(w[0] for w in user["name"].split()[:2]).upper() or "U"
    try:
        with tempfile.TemporaryDirectory() as tmp, storage.local_path(v["stored_name"]) as src:
            dst = Path(tmp) / "out.docx"
            ext_id, matched = engine_comments.add_user_comment(
                str(src), str(dst), anchor=anchor, text=text, author=user["name"],
                initials=initials,
            )  # fmt: skip
            data = dst.read_bytes()
    except FileNotFoundError:
        raise HTTPException(404, "File missing from storage") from None
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    storage.put(v["stored_name"], data)
    with db.connect() as conn:
        conn.execute("UPDATE versions SET size = ? WHERE id = ?", (len(data), vid))
        cur = conn.execute(
            "INSERT INTO comments (version_id, ext_id, author, initials, date, text, anchor_text,"
            " language, status) VALUES (?,?,?,?,?,?,?,?,'open')",
            (vid, ext_id, user["name"], initials, db.now_iso(), text,
             " ".join(matched.split())[:300], user["language"]),
        )  # fmt: skip
        conn.commit()
        row = conn.execute("SELECT * FROM comments WHERE id = ?", (cur.lastrowid,)).fetchone()
        return services.comment_dict(row)


class Decision(BaseModel):
    status: Literal["open", "approved", "declined"]
    note: str | None = None


@router.post("/comments/{cid}/decision")
def decide(cid: int, body: Decision, user: User) -> dict:
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM comments WHERE id = ?", (cid,)).fetchone():
            raise HTTPException(404, "Comment not found")
        if body.status == "open":
            args = ("open", None, None, None)
        else:
            args = (body.status, user["name"], db.now_iso(), (body.note or "").strip() or None)
        conn.execute(
            "UPDATE comments SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?"
            " WHERE id = ?",
            (*args, cid),
        )
        conn.commit()  # release the write lock before the (slow) translation call
        row = conn.execute("SELECT * FROM comments WHERE id = ?", (cid,)).fetchone()
        c = services.comment_dict(row)
        lang = user["language"]
        return services.translate_comments(conn, [c], lang)[0]


class BatchDecision(BaseModel):
    comment_id: int
    status: Literal["open", "approved", "declined"]
    note: str | None = None


class BatchReplacement(BaseModel):
    comment_id: int
    text: str


class BatchIn(BaseModel):
    decisions: list[BatchDecision] = []
    replacements: list[BatchReplacement] = []
    note: str | None = None  # review summary, appended to the new version's note


@router.post("/versions/{vid}/comments/batch")
def batch(vid: int, body: BatchIn, user: User) -> dict:
    """Apply staged review changes at once: decisions in place; text replacements of the anchored
    text as tracked changes in ONE new version (comment decisions carry over)."""
    from ..engine import edit
    from . import editing

    skipped: list[dict] = []
    repl: dict[int, str] = {
        r.comment_id: r.text.strip() for r in body.replacements if r.text.strip()
    }
    with db.connect() as conn:
        v = _ensure_version(conn, vid)
        anchors = {}
        for cid in repl:
            row = conn.execute(
                "SELECT anchor_text FROM comments WHERE id = ? AND version_id = ?", (cid, vid)
            ).fetchone()
            if not row or not (row["anchor_text"] or "").strip():
                skipped.append({"comment_id": cid, "why": "comment has no anchored text"})
            else:
                anchors[cid] = row["anchor_text"].strip()
        now = db.now_iso()
        for d in body.decisions:
            if d.comment_id in anchors:
                continue  # decided below as "Provided text"
            if d.status == "open":
                args = ("open", None, None, None)
            else:
                args = (d.status, user["name"], now, (d.note or "").strip() or None)
            conn.execute(
                "UPDATE comments SET status = ?, decided_by = ?, decided_at = ?,"
                " decision_note = ? WHERE id = ? AND version_id = ?",
                (*args, d.comment_id, vid),
            )
        conn.commit()
    if not anchors:
        return {"version": None, "decided": len(body.decisions), "skipped": skipped}

    with editing._docx_path(v) as path:
        paras = edit.list_paragraphs(path)
    new_text = {p["idx"]: p["text"] for p in paras}
    olds = dict(new_text)
    done: list[int] = []
    for cid, anchor in anchors.items():
        hit = next((i for i, t in new_text.items() if anchor in t), None)
        if hit is None:
            n = edit.norm(anchor)
            hit = next((i for i, t in new_text.items() if n in edit.norm(t)), None)
            if hit is None:
                skipped.append({"comment_id": cid, "why": "placeholder text not found"})
                continue
            new_text[hit] = edit.norm(new_text[hit]).replace(n, repl[cid], 1)
        else:
            new_text[hit] = new_text[hit].replace(anchor, repl[cid], 1)
        done.append(cid)
    edits = [
        {"idx": i, "old": olds[i], "new": t, "reason": "Provided by reviewer"}
        for i, t in new_text.items()
        if t != olds[i]
    ]
    if not edits:
        return {"version": None, "decided": len(body.decisions), "skipped": skipped}
    with db.connect() as conn:  # mark before the copy so the decision carries to the new version
        for cid in done:
            conn.execute(
                "UPDATE comments SET status = 'approved', decided_by = ?, decided_at = ?,"
                " decision_note = 'Text provided' WHERE id = ?",
                (user["name"], db.now_iso(), cid),
            )
        conn.commit()
    vnote = f"Review: {len(done)} text(s) provided"
    if (body.note or "").strip():
        vnote += f" - {body.note.strip()}"
    new_vid, sk = editing._write_version(vid, edits, vnote, "edited", user)
    skipped += [{"comment_id": 0, "why": f"paragraph {x['idx']}: {x['why']}"} for x in sk]
    with db.connect() as conn:
        return {
            "version": services.version_dict(conn, editing._version_row(conn, new_vid)),
            "decided": len(body.decisions),
            "skipped": skipped,
        }


@router.get("/diff")
def diff(
    user: User,
    from_: Annotated[int, Query(alias="from")],
    to: int,
    lang: str | None = None,
) -> dict:
    from ..engine import diff as engine_diff

    lang = _lang(lang, user)
    with db.connect() as conn:
        a, b = _ensure_version(conn, from_), _ensure_version(conn, to)
        for v in (a, b):
            if not v["filename"].lower().endswith(".docx"):
                raise HTTPException(422, "Diff is only available for .docx versions")
        try:
            with (
                storage.local_path(a["stored_name"]) as pa,
                storage.local_path(b["stored_name"]) as pb,
            ):
                result = engine_diff.diff_docs(str(pa), str(pb))
        except FileNotFoundError:
            raise HTTPException(404, "File missing from storage") from None
        except Exception as exc:
            raise HTTPException(422, f"Could not diff these documents: {exc}") from exc

        def load(vid: int) -> list[dict]:
            rows = conn.execute("SELECT * FROM comments WHERE version_id = ? ORDER BY id", (vid,))
            return [services.comment_dict(r) for r in rows]

        def key(c: dict) -> tuple[str, str]:
            return (c["author"], engine_diff.normalize_comment_text(c["text"]))

        old, new = load(from_), load(to)
        old_keys, new_keys = {key(c) for c in old}, {key(c) for c in new}
        added = [c for c in new if key(c) not in old_keys]
        removed = [c for c in old if key(c) not in new_keys]
        services.translate_comments(conn, added + removed, lang)
        return {
            "from": services.version_dict(conn, a),
            "to": services.version_dict(conn, b),
            "stats": result["stats"],
            "blocks": result["blocks"],
            "comments": {"added": added, "removed": removed},
        }
