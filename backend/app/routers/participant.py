"""Participant access to explicitly published trial documents."""

import hashlib
import re
import secrets
import subprocess
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import auth, db, storage
from ..engine import interpreter as interpreter_engine

router = APIRouter(prefix="/api", tags=["participant"])


def participant_user(request: Request):
    user = auth.current_user(request)
    if user["role"] != "participant":
        raise HTTPException(403, "Participant account required")
    return user


Participant = Depends(participant_user)


class AcceptInvite(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=10, max_length=256)
    language: Literal["en", "nl", "fr"] = "en"


def _published_doc(conn, project_id: int, doc_id: int):
    row = conn.execute(
        "SELECT d.*, p.version_id, v.number, v.filename, v.stored_name FROM project_docs d "
        "JOIN participant_publications p ON p.doc_id=d.id "
        "JOIN versions v ON v.id=p.version_id AND v.doc_id=d.id "
        "WHERE d.id=? AND d.project_id=? AND d.role!='sponsor'",
        (doc_id, project_id),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Published document not found")
    return row


def _sections(version) -> list[dict]:
    version_id = version["version_id"] if "version_id" in version.keys() else version["id"]
    suffix = version["filename"].lower()
    if suffix.endswith(".pdf"):
        try:
            with storage.local_path(version["stored_name"]) as path:
                extracted = subprocess.run(
                    ["pdftotext", "-layout", str(path), "-"],
                    capture_output=True,
                    check=True,
                    text=True,
                    timeout=15,
                ).stdout
        except FileNotFoundError as exc:
            if exc.filename == "pdftotext":
                raise HTTPException(422, "PDF text extraction is unavailable") from None
            raise HTTPException(404, "Document content unavailable") from None
        except (subprocess.SubprocessError, OSError):
            raise HTTPException(422, "Could not extract readable text from this PDF") from None
        pages = [page.strip() for page in extracted.split("\f") if page.strip()]
        if not pages:
            raise HTTPException(422, "This PDF has no extractable text")
        return [
            {
                "section_id": f"doc-{version_id}-page-{i}",
                "heading": f"Page {i}",
                "text": page,
                "anchor": None,
            }
            for i, page in enumerate(pages, 1)
        ]
    if not suffix.endswith(".docx"):
        raise HTTPException(422, "This document format has no safe text view")
    from ..engine import edit

    try:
        with storage.local_path(version["stored_name"]) as path:
            paras = edit.list_paragraphs(str(path))
    except FileNotFoundError:
        raise HTTPException(404, "Document content unavailable") from None
    result = []
    section_id, heading = f"doc-{version_id}-intro", "Introduction"
    for para in paras:
        if para["heading"]:
            section_id, heading = f"doc-{version_id}-{para['idx']}", para["text"]
            result.append(
                {
                    "section_id": section_id,
                    "heading": edit.plain(para["text"]),
                    "text": edit.plain(para["text"]),
                    "anchor": para.get("anchor"),
                }
            )
        elif result:
            result[-1]["text"] += "\n" + edit.plain(para["text"])
        else:
            result.append(
                {
                    "section_id": section_id,
                    "heading": heading,
                    "text": edit.plain(para["text"]),
                    "anchor": None,
                }
            )
    return result


@router.post("/participant/invitations/{token}/accept")
def accept_invitation(token: str, body: "AcceptInvite"):
    digest = hashlib.sha256(token.encode()).hexdigest()
    with db.connect() as conn:
        invite = conn.execute(
            "SELECT * FROM participant_invites WHERE token_hash=?", (digest,)
        ).fetchone()
        if not invite or invite["used_at"] or invite["expires_at"] < db.now_iso():
            raise HTTPException(410, "Invitation is invalid or expired")
        exists = conn.execute("SELECT id FROM users WHERE email=?", (invite["email"],)).fetchone()
        if exists:
            raise HTTPException(409, "An account already exists for this email")
        cur = conn.execute(
            "INSERT INTO users(email,name,language,pw_hash,role,created_at) VALUES(?,?,?,?,?,?)",
            (
                invite["email"],
                body.name.strip(),
                body.language,
                auth.hash_password(body.password),
                "participant",
                db.now_iso(),
            ),
        )
        uid = cur.lastrowid
        conn.execute(
            "INSERT INTO participant_memberships(user_id,project_id) VALUES(?,?)",
            (uid, invite["project_id"]),
        )
        conn.execute(
            "UPDATE participant_invites SET used_at=? WHERE token_hash=?", (db.now_iso(), digest)
        )
    with db.connect() as conn:
        user = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return {"token": auth._new_session(uid), "user": auth.user_dict(user)}


class PortalSettings(BaseModel):
    enabled: bool = False
    contact: str = Field(default="", max_length=1000)
    urgent_guidance: str = Field(default="", max_length=3000)


class PublishVersion(BaseModel):
    version_id: int


class InviteBody(BaseModel):
    email: str


@router.get("/projects/{project_id}/participant-portal")
def portal_settings(project_id: int, user=Depends(auth.current_staff)):
    with db.connect() as conn:
        if not conn.execute("SELECT id FROM projects WHERE id=?", (project_id,)).fetchone():
            raise HTTPException(404, "Trial not found")
        settings = conn.execute(
            "SELECT * FROM participant_portals WHERE project_id=?", (project_id,)
        ).fetchone()
        pubs = conn.execute(
            "SELECT p.doc_id,p.version_id,v.number FROM participant_publications p "
            "JOIN versions v ON v.id=p.version_id "
            "JOIN project_docs d ON d.id=p.doc_id WHERE d.project_id=?",
            (project_id,),
        ).fetchall()
        return {
            "enabled": bool(settings["enabled"]) if settings else False,
            "contact": settings["contact"] if settings else "",
            "urgent_guidance": settings["urgent_guidance"] if settings else "",
            "publications": [dict(x) for x in pubs],
        }


@router.put("/projects/{project_id}/participant-portal")
def save_portal(project_id: int, body: PortalSettings, user=Depends(auth.current_staff)):
    if body.enabled and (not body.contact.strip() or not body.urgent_guidance.strip()):
        raise HTTPException(
            422, "Add a trial contact and urgent-help instructions before enabling access"
        )
    with db.connect() as conn:
        if not conn.execute("SELECT id FROM projects WHERE id=?", (project_id,)).fetchone():
            raise HTTPException(404, "Trial not found")
        conn.execute(
            "INSERT INTO participant_portals(project_id,enabled,contact,urgent_guidance) "
            "VALUES(?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET "
            "enabled=excluded.enabled,contact=excluded.contact,"
            "urgent_guidance=excluded.urgent_guidance",
            (project_id, int(body.enabled), body.contact.strip(), body.urgent_guidance.strip()),
        )
    return {"ok": True}


@router.put("/project-documents/{doc_id}/participant-publication")
def publish_doc(doc_id: int, body: PublishVersion, user=Depends(auth.current_staff)):
    with db.connect() as conn:
        doc = conn.execute("SELECT * FROM project_docs WHERE id=?", (doc_id,)).fetchone()
        if not doc or doc["role"] == "sponsor":
            raise HTTPException(404, "Participant document not found")
        project = conn.execute(
            "SELECT stage FROM projects WHERE id=?", (doc["project_id"],)
        ).fetchone()
        portal = conn.execute(
            "SELECT enabled FROM participant_portals WHERE project_id=?", (doc["project_id"],)
        ).fetchone()
        version = conn.execute(
            "SELECT id,filename FROM versions WHERE id=? AND doc_id=?", (body.version_id, doc_id)
        ).fetchone()
        if not version:
            raise HTTPException(422, "Version does not belong to this document")
        if project["stage"] not in ("approved", "participants"):
            raise HTTPException(
                409, "Trial must be approved before publishing participant documents"
            )
        if not portal or not portal["enabled"]:
            raise HTTPException(409, "Enable the participant portal first")
        if not version["filename"].lower().endswith((".docx", ".pdf")):
            raise HTTPException(422, "Only DOCX and PDF documents are publishable")
        _sections(
            {
                "version_id": version["id"],
                "filename": version["filename"],
                "stored_name": conn.execute(
                    "SELECT stored_name FROM versions WHERE id=?", (version["id"],)
                ).fetchone()["stored_name"],
            }
        )
        conn.execute(
            "INSERT INTO participant_publications(doc_id,version_id,updated_at) "
            "VALUES(?,?,?) ON CONFLICT(doc_id) DO UPDATE SET "
            "version_id=excluded.version_id,updated_at=excluded.updated_at",
            (doc_id, body.version_id, db.now_iso()),
        )
    return {"published": True, "version_id": body.version_id}


@router.delete("/project-documents/{doc_id}/participant-publication")
def unpublish_doc(doc_id: int, user=Depends(auth.current_staff)):
    with db.connect() as conn:
        conn.execute("DELETE FROM participant_publications WHERE doc_id=?", (doc_id,))
    return {"published": False}


@router.post("/projects/{project_id}/participant-invitations")
def create_invitation(project_id: int, body: InviteBody, user=Depends(auth.current_staff)):
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(422, "Valid email required")
    raw = secrets.token_urlsafe(32)
    with db.connect() as conn:
        portal = conn.execute(
            "SELECT enabled FROM participant_portals WHERE project_id=?", (project_id,)
        ).fetchone()
        if not portal or not portal["enabled"]:
            raise HTTPException(409, "Enable participant portal before inviting participants")
        digest = hashlib.sha256(raw.encode()).hexdigest()
        expires = (datetime.now(UTC) + timedelta(days=7)).isoformat(timespec="seconds")
        conn.execute(
            "INSERT INTO participant_invites(token_hash,email,project_id,expires_at) "
            "VALUES(?,?,?,?)",
            (digest, email, project_id, expires),
        )
    return {"email": email, "token": raw, "expires_at": expires}


@router.get("/participant/trials")
def participant_trials(user=Participant):
    with db.connect() as conn:
        return [
            dict(r)
            for r in conn.execute(
                "SELECT p.id,p.name,p.study FROM projects p "
                "JOIN participant_memberships m ON m.project_id=p.id "
                "JOIN participant_portals x ON x.project_id=p.id "
                "WHERE m.user_id=? AND x.enabled=1",
                (user["id"],),
            )
        ]


class AskBody(BaseModel):
    question: str = Field(min_length=1, max_length=3000)
    persona: Literal["adult", "parent_guardian", "adolescent", "child"] = "adult"
    language: Literal["en", "nl", "fr"] = "en"
    history: list[dict] = Field(default_factory=list, max_length=12)


URGENT_TERMS = (
    "chest pain",
    "can't breathe",
    "cannot breathe",
    "seizure",
    "overdose",
    "suicid",
    "unconscious",
    "emergency",
    "side effect",
    "sick",
    "fever",
    "vomit",
    "pain",
    "reaction",
    "symptom",
    "hurt",
)
ILLUSTRATION_TERMS = {
    "head": {"en": ("head", "face"), "nl": ("hoofd", "gezicht"), "fr": ("tête", "visage")},
    "brain": {"en": ("brain",), "nl": ("hersenen",), "fr": ("cerveau",)},
    "eye": {"en": ("eye", "eyes"), "nl": ("oog", "ogen"), "fr": ("œil", "yeux", "oeil")},
    "ear": {"en": ("ear", "ears"), "nl": ("oor", "oren"), "fr": ("oreille", "oreilles")},
    "nose": {"en": ("nose",), "nl": ("neus",), "fr": ("nez",)},
    "mouth": {"en": ("mouth",), "nl": ("mond",), "fr": ("bouche",)},
    "throat": {"en": ("throat", "neck"), "nl": ("keel", "nek"), "fr": ("gorge", "cou")},
    "heart": {"en": ("heart",), "nl": ("hart",), "fr": ("cœur", "coeur")},
    "lungs": {"en": ("lung", "lungs"), "nl": ("long", "longen"), "fr": ("poumon", "poumons")},
    "chest": {"en": ("chest", "thorax"), "nl": ("borst",), "fr": ("poitrine", "thorax")},
    "back": {"en": ("back",), "nl": ("rug",), "fr": ("dos",)},
    "abdomen": {
        "en": ("abdomen", "belly", "tummy"),
        "nl": ("buik", "buikje"),
        "fr": ("abdomen", "ventre"),
    },
    "pelvis": {"en": ("pelvis", "pelvic"), "nl": ("bekken",), "fr": ("bassin",)},
    "stomach": {
        "en": ("stomach",),
        "nl": ("maag",),
        "fr": ("estomac",),
    },
    "intestines": {
        "en": ("intestine", "intestines", "bowel", "bowels"),
        "nl": ("darm", "darmen"),
        "fr": ("intestin", "intestins"),
    },
    "liver": {"en": ("liver",), "nl": ("lever",), "fr": ("foie",)},
    "kidney": {"en": ("kidney", "kidneys"), "nl": ("nier", "nieren"), "fr": ("rein", "reins")},
    "bladder": {"en": ("bladder",), "nl": ("blaas",), "fr": ("vessie",)},
    "skin": {"en": ("skin",), "nl": ("huid",), "fr": ("peau",)},
    "bone": {"en": ("bone", "bones"), "nl": ("bot", "botten"), "fr": ("os", "ossement")},
    "muscle": {
        "en": ("muscle", "muscles"),
        "nl": ("spier", "spieren"),
        "fr": ("muscle", "muscles"),
    },
    "joint": {
        "en": ("joint", "joints", "shoulder", "elbow", "wrist", "knee", "ankle", "hip"),
        "nl": ("gewricht", "gewrichten", "schouder", "elleboog", "pols", "knie", "enkel", "heup"),
        "fr": (
            "articulation",
            "articulations",
            "épaule",
            "coude",
            "poignet",
            "genou",
            "cheville",
            "hanche",
        ),
    },
    "hand": {
        "en": ("hand", "hands", "finger", "fingers", "thumb", "thumbs"),
        "nl": ("hand", "handen", "vinger", "vingers", "duim", "duimen"),
        "fr": ("main", "mains", "doigt", "doigts", "pouce", "pouces"),
    },
    "arm": {"en": ("arm", "arms"), "nl": ("arm", "armen"), "fr": ("bras",)},
    "leg": {"en": ("leg", "legs"), "nl": ("been", "benen"), "fr": ("jambe", "jambes")},
    "foot": {
        "en": ("foot", "feet", "toe", "toes"),
        "nl": ("voet", "voeten", "teen", "tenen"),
        "fr": ("pied", "pieds", "orteil", "orteils"),
    },
    "blood": {"en": ("blood",), "nl": ("bloed",), "fr": ("sang",)},
    "tooth": {
        "en": ("tooth", "teeth"),
        "nl": ("tand", "tanden"),
        "fr": ("dent", "dents"),
    },
    "fingernail": {
        "en": ("fingernail", "finger nail", "nail", "nails"),
        "nl": ("vingernagel", "nagel", "nagels"),
        "fr": ("ongle",),
    },
}
PERSONAL_SYMPTOM_TERMS = (
    "hurt",
    "hurts",
    "hurting",
    "ache",
    "aches",
    "aching",
    "toothache",
    "stomachache",
    "bellyache",
    "headache",
    "migraine",
    "sore",
    "pain",
    "painful",
    "sick",
    "nausea",
    "nauseous",
    "fever",
    "vomit",
    "swollen",
    "swelling",
    "rash",
    "bleeding",
    "bleed",
    "loose",
    "pijn",
    "pijnlijk",
    "maagpijn",
    "buikpijn",
    "misselijk",
    "koorts",
    "braken",
    "bloed",
    "loszittend",
    "hoofdpijn",
    "douleur",
    "mal",
    "migraine",
    "fièvre",
    "vomir",
    "nausée",
    "saigne",
)
_VERSION_COLS = "v.id AS version_id, v.number, v.filename, v.stored_name"
PERSONA_ICF_TYPE = {
    "adult": "adult",
    "parent_guardian": "parent",
    "adolescent": "adolescent",
    "child": "child",
}


def _require_membership(conn, user, project_id: int) -> None:
    if not conn.execute(
        "SELECT 1 FROM participant_memberships m "
        "JOIN participant_portals p ON p.project_id=m.project_id "
        "WHERE m.user_id=? AND m.project_id=? AND p.enabled=1",
        (user["id"], project_id),
    ).fetchone():
        raise HTTPException(404, "Trial unavailable")


def _published_rows(conn, project_id: int) -> list[dict]:
    rows = conn.execute(
        f"SELECT d.*, {_VERSION_COLS} FROM project_docs d "
        "JOIN participant_publications p ON p.doc_id=d.id "
        "JOIN versions v ON v.id=p.version_id AND v.doc_id=d.id "
        "WHERE d.project_id=? AND d.role!='sponsor' ORDER BY d.id",
        (project_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _preview_rows(conn, project_id: int, persona: str, language: str) -> tuple[list[dict], bool]:
    """Published docs, else the latest versions of the persona's ICF type (demo)."""
    published = _published_rows(conn, project_id)
    if published:
        return published, False
    rows = []
    for d in conn.execute(
        "SELECT * FROM project_docs WHERE project_id=? AND role!='sponsor' AND icf_type=? "
        "ORDER BY id",
        (project_id, PERSONA_ICF_TYPE[persona]),
    ).fetchall():
        v = conn.execute(
            f"SELECT {_VERSION_COLS} FROM versions v WHERE v.doc_id=? "
            "AND (lower(v.filename) LIKE '%.docx' OR lower(v.filename) LIKE '%.pdf') "
            "ORDER BY v.number DESC LIMIT 1",
            (d["id"],),
        ).fetchone()
        if v:
            rows.append({**dict(d), **dict(v)})
    same_lang = [r for r in rows if r["language"] == language]
    return (same_lang or rows), True


def _doc_summary(r) -> dict:
    return {
        "id": r["id"],
        "title": r["title"],
        "icf_type": r["icf_type"],
        "language": r["language"],
        "role": r["role"],
        "version_id": r["version_id"],
        "version_number": r["number"],
    }


def _document_content(r) -> dict:
    return {**_doc_summary(r), "sections": _sections(r)}


def _answer(rows: list[dict], body: AskBody, contact: str, urgent: str) -> dict:
    """Shared interpreter logic for real participants and the staff preview."""
    q = body.question.lower()
    if any(term in q for term in URGENT_TERMS):
        return {
            "explanation": (
                "I can’t assess symptoms or tell you what treatment to use. "
                f"Please contact the trial team at {contact}. "
                f"If this may be urgent, follow these instructions: {urgent}"
            ),
            "source_references": [],
            "unanswered_questions": ["A member of the clinical team should advise you."],
            "requires_human_followup": True,
        }
    if not rows:
        return {
            "explanation": (
                "There are no readable participant documents published for this trial yet."
            ),
            "source_references": [],
            "unanswered_questions": [],
            "requires_human_followup": True,
        }
    versions = [
        {
            "version_id": d["version_id"],
            "version_number": d["number"],
            "language": d.get("language") or body.language,
            "source": "published",
            "note": "",
            "sections": _sections(d),
        }
        for d in rows
    ]
    history = [
        m
        for m in body.history
        if isinstance(m, dict)
        and m.get("role") in ("user", "assistant")
        and isinstance(m.get("text"), str)
    ][:12]
    reply = interpreter_engine.response(
        operation="ask",
        persona=body.persona,
        age_group=None,
        language=body.language,
        request={"question": body.question, "history": history},
        context={"versions": versions},
    )
    if not reply:
        return {
            "explanation": "I can’t answer that right now. Please contact the trial team at "
            + contact,
            "source_references": [],
            "unanswered_questions": [body.question],
            "requires_human_followup": True,
        }
    refs = []
    for ref in reply["source_references"]:
        try:
            vid, section = ref.split(":", 1)
            vid = int(vid.lstrip("v"))
        except ValueError:
            continue
        d = next((d for d in rows if d["version_id"] == vid), None)
        if d:
            src = next(
                (
                    s
                    for v in versions
                    if v["version_id"] == vid
                    for s in v["sections"]
                    if s["section_id"] == section
                ),
                None,
            )
            refs.append(
                {
                    "doc_id": d["id"],
                    "title": d["title"],
                    "version_id": vid,
                    "section_id": section,
                    "heading": src["heading"] if src else section,
                }
            )
    illustration_id = _grounded_illustration(body, reply, refs, versions)
    return {
        **reply,
        "source_references": refs,
        "illustration_id": illustration_id,
    }


def _has_term(text: str, terms: tuple[str, ...]) -> bool:
    return any(re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text, re.IGNORECASE) for term in terms)


def _grounded_illustration(
    body: AskBody, reply: dict, refs: list[dict], versions: list[dict]
) -> str | None:
    """Select a local visual only for a safe child answer grounded in its cited section."""
    if body.persona != "child" or reply["requires_human_followup"] or not refs:
        return None
    question = body.question.lower()
    if any(term in question for term in URGENT_TERMS) or _has_term(
        question, PERSONAL_SYMPTOM_TERMS
    ):
        return None

    grounded_sections = []
    for ref in refs:
        version = next((v for v in versions if v["version_id"] == ref["version_id"]), None)
        if version:
            section = next(
                (s for s in version["sections"] if s["section_id"] == ref["section_id"]),
                None,
            )
            if section:
                grounded_sections.append((version["language"], section))
    explanation = reply["explanation"].lower()
    question_candidates = []
    answer_candidates = []
    for illustration_id, languages in ILLUSTRATION_TERMS.items():
        answer_terms = languages[body.language]
        if not _has_term(explanation, answer_terms):
            continue
        in_question = _has_term(question, answer_terms)
        for source_language, section in grounded_sections:
            source_terms = languages.get(source_language, answer_terms)
            if _has_term(f"{section['heading']} {section['text']}", source_terms):
                (question_candidates if in_question else answer_candidates).append(illustration_id)
                break
    candidates = question_candidates or answer_candidates
    return candidates[0] if len(candidates) == 1 else None


def _portal_texts(conn, project_id: int) -> tuple[str, str]:
    s = conn.execute(
        "SELECT contact,urgent_guidance FROM participant_portals WHERE project_id=?",
        (project_id,),
    ).fetchone()
    contact = (s["contact"] if s else "") or "the trial team (no contact configured yet)"
    urgent = (s["urgent_guidance"] if s else "") or "call your local emergency number"
    return contact, urgent


@router.get("/participant/trials/{project_id}/documents")
def participant_documents(project_id: int, user=Participant):
    with db.connect() as conn:
        _require_membership(conn, user, project_id)
        return [_doc_summary(r) for r in _published_rows(conn, project_id)]


@router.get("/participant/trials/{project_id}/documents/{doc_id}")
def participant_document(project_id: int, doc_id: int, user=Participant):
    with db.connect() as conn:
        _require_membership(conn, user, project_id)
        return _document_content(_published_doc(conn, project_id, doc_id))


@router.post("/participant/trials/{project_id}/ask")
def ask(project_id: int, body: AskBody, user=Participant):
    with db.connect() as conn:
        _require_membership(conn, user, project_id)
        rows = _published_rows(conn, project_id)
        contact, urgent = _portal_texts(conn, project_id)
    return _answer(rows, body, contact, urgent)


# --- staff preview of the participant experience (no membership, no invites) ---
Persona = Literal["adult", "parent_guardian", "adolescent", "child"]
Lang = Literal["en", "nl", "fr"]


def _preview_project(conn, project_id: int):
    p = conn.execute("SELECT id,name,study FROM projects WHERE id=?", (project_id,)).fetchone()
    if not p:
        raise HTTPException(404, "Trial not found")
    return p


@router.get("/projects/{project_id}/portal-preview/documents")
def preview_documents(
    project_id: int,
    persona: Persona = "adult",
    lang: Lang = "en",
    user=Depends(auth.current_staff),
):
    with db.connect() as conn:
        p = _preview_project(conn, project_id)
        rows, demo = _preview_rows(conn, project_id, persona, lang)
        return {"trial": dict(p), "demo": demo, "documents": [_doc_summary(r) for r in rows]}


@router.get("/projects/{project_id}/portal-preview/documents/{doc_id}")
def preview_document(
    project_id: int,
    doc_id: int,
    persona: Persona = "adult",
    lang: Lang = "en",
    user=Depends(auth.current_staff),
):
    with db.connect() as conn:
        _preview_project(conn, project_id)
        rows, _ = _preview_rows(conn, project_id, persona, lang)
    row = next((r for r in rows if r["id"] == doc_id), None)
    if not row:
        raise HTTPException(404, "Document not available in this preview")
    return _document_content(row)


@router.post("/projects/{project_id}/portal-preview/ask")
def preview_ask(project_id: int, body: AskBody, user=Depends(auth.current_staff)):
    with db.connect() as conn:
        _preview_project(conn, project_id)
        rows, _ = _preview_rows(conn, project_id, body.persona, body.language)
        contact, urgent = _portal_texts(conn, project_id)
    return _answer(rows, body, contact, urgent)


@router.get("/projects/{project_id}/participant-invitations")
def list_invitations(project_id: int, user=Depends(auth.current_staff)):
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT email,expires_at,used_at FROM participant_invites WHERE project_id=? "
            "ORDER BY rowid DESC",
            (project_id,),
        ).fetchall()
    now = db.now_iso()
    return [
        {
            "email": r["email"],
            "expires_at": r["expires_at"],
            "status": "accepted"
            if r["used_at"]
            else ("expired" if r["expires_at"] < now else "pending"),
        }
        for r in rows
    ]
