"""Gemini prompts for 'chat with the form' edits and propagating an edit to sibling ICFs."""

import json

from . import ai

LANG_NAMES = {"en": "English", "nl": "Dutch", "fr": "French"}
AUDIENCE = {
    "adult": "adult participants (18+), formal register (FR 'vous', NL 'u')",
    "parent": "parents / legal guardians, about their child ('your child'), formal register",
    "adolescent": "adolescents aged 12-17: short sentences, plain words, 'doctor' rather than "
    "'investigator', medical terms explained in brackets, informal register (FR 'tu', NL 'je')",
    "child": "children aged 8-11: very simple, warm, first-person questions as headings, no "
    "insurance/GDPR/cost details, informal register (FR 'tu', NL 'je')",
}
MAX_CHARS = 120_000

SYSTEM = (
    "You edit Belgian informed consent forms (ICFs) for paediatric cancer trials (BSPHO). "
    "Make the smallest edits that satisfy the request; never rewrite paragraphs that do not need "
    "to change, never invent trial facts, numbers, drugs or names. Keep the document's language "
    "and register. Mandatory wording of the Belgian national template (CT-College) should stay "
    "verbatim; if the request requires changing it, do it but say so in the reason."
)


def _numbered(paragraphs: list[dict]) -> str:
    lines, total = [], 0
    for p in paragraphs:
        line = f"[{p['idx']}] {'## ' if p.get('heading') else ''}{p['text']}"
        total += len(line)
        if total > MAX_CHARS:
            break
        lines.append(line)
    return "\n".join(lines)


def _clean_edits(data, known: dict[int, str]) -> list[dict]:
    out = []
    for e in data.get("edits") or []:
        if not isinstance(e, dict):
            continue
        try:
            idx = int(e["idx"])
        except (KeyError, TypeError, ValueError):
            continue
        new = e.get("new")
        if idx not in known or not isinstance(new, str) or not new.strip():
            continue
        if " ".join(new.split()) == " ".join(known[idx].split()):
            continue
        out.append({"idx": idx, "old": known[idx], "new": new.strip(),
                    "reason": str(e.get("reason") or "").strip()})  # fmt: skip
    return out


def propose(
    paragraphs: list[dict],
    *,
    instruction: str,
    history: list[dict],
    icf_type: str | None,
    language: str | None,
    comment: dict | None = None,
) -> dict | None:
    """-> {reply, edits:[{idx, old, new, reason}]} or None when AI is unavailable/failed."""
    known = {p["idx"]: p["text"] for p in paragraphs}
    convo = "\n".join(f"{m['role'].upper()}: {m['text']}" for m in history[-8:])
    ec = ""
    if comment:
        ec = (
            "\nETHICS COMMITTEE COMMENT being addressed (may be in another language):\n"
            f"comment: {comment['text']}\nanchored on text: {comment['anchor_text']}\n"
        )
    prompt = (
        f"Document language: {LANG_NAMES.get(language or 'en', 'English')}. "
        f"Audience: {AUDIENCE.get(icf_type or 'adult', AUDIENCE['adult'])}.\n\n"
        f"DOCUMENT (one paragraph per line, [index] text; '## ' marks headings):\n"
        f"{_numbered(paragraphs)}\n\n"
        f"CONVERSATION SO FAR:\n{convo or '(none)'}\n{ec}\n"
        f"USER REQUEST (from the principal investigator): {instruction}\n\n"
        'Return JSON: {"reply": short answer to the user in the language of their request '
        '(say what you changed and anything they should check), "edits": [{"idx": paragraph '
        'index, "new": full new text of that paragraph, "reason": one line}]}. '
        "Use an empty edits list if the request is a question or nothing should change."
    )
    data = ai.generate_json(prompt, SYSTEM)
    if not isinstance(data, dict):
        return None
    return {"reply": str(data.get("reply") or "").strip(), "edits": _clean_edits(data, known)}


def propagate(
    change: dict,
    paragraphs: list[dict],
    *,
    icf_type: str | None,
    language: str | None,
) -> dict | None:
    """Adapt one accepted change set to a sibling ICF.

    change = {instruction, icf_type, language, edits:[{old,new,reason}]}
    -> {applicable, reason, edits:[{idx, old, new, reason}]} or None on AI failure.
    """
    known = {p["idx"]: p["text"] for p in paragraphs}
    src_edits = [{"before": e["old"], "after": e["new"], "reason": e.get("reason", "")}
                 for e in change["edits"]]  # fmt: skip
    lang = LANG_NAMES.get(language or "en", "English")
    prompt = (
        "A change was approved in one version of an ICF. Apply the SAME change to another "
        "version of the same ICF written for a different audience and/or language.\n\n"
        f"SOURCE: audience {change['icf_type']}, language "
        f"{LANG_NAMES.get(change['language'] or 'en')}. Request: {change['instruction']}\n"
        f"Source edits (before -> after):\n{json.dumps(src_edits, ensure_ascii=False)}\n\n"
        f"TARGET: audience {AUDIENCE.get(icf_type or 'adult', AUDIENCE['adult'])}; "
        f"language {lang}.\n"
        f"TARGET DOCUMENT ([index] text):\n{_numbered(paragraphs)}\n\n"
        "Rules: find the target paragraphs that express the same content and change only them. "
        f"Write in {lang} at the target audience's level and register (parents: 'your child'; "
        "children: much simpler, and skip details that this audience's form does not cover). "
        "For Dutch/French, mandatory template wording keeps the official Belgian template "
        "phrasing. If the target does not cover this content at all, it is not applicable.\n"
        'Return JSON: {"applicable": true|false, "reason": one line explaining what you did or '
        'why it does not apply (in English), "edits": [{"idx": index, "new": full new '
        'paragraph text, "reason": one line}]}.'
    )
    data = ai.generate_json(prompt, SYSTEM)
    if not isinstance(data, dict):
        return None
    edits = _clean_edits(data, known)
    applicable = bool(data.get("applicable")) and bool(edits)
    return {
        "applicable": applicable,
        "reason": str(data.get("reason") or "").strip(),
        "edits": edits if applicable else [],
    }
