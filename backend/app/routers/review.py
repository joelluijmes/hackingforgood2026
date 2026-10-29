from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from .. import db, services, storage
from ..auth import User, current_user

router = APIRouter(prefix="/api", dependencies=[Depends(current_user)], tags=["review"])


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
