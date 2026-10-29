"""Study profile: fixed schema of project/site facts, global defaults and effective values."""

from . import db

# (key, label, group, kind, scope, hint)
_S = [
    ("study_official_title", "Official study title", "study", "multiline", "project", ""),
    ("study_short_title", "Short title / acronym", "study", "text", "project", ""),
    ("eu_ct_number", "EU CT number", "study", "text", "project", "e.g. 2023-501234-12-00"),
    ("trial_number", "Protocol / trial number", "study", "text", "project", ""),
    ("sponsor_name", "Sponsor name", "study", "text", "both", ""),
    ("sponsor_address", "Sponsor address", "study", "multiline", "both", ""),
    ("eu_representative", "Legal / European representative", "study", "text", "project", ""),
    ("cro", "CRO", "study", "text", "project", ""),
    ("study_summary", "Study description", "study", "multiline", "project", "2-4 sentences"),
    ("site_name", "Site (hospital) name", "site", "text", "both", ""),
    ("site_address", "Site address", "site", "multiline", "both", ""),
    ("site_accreditation_number", "Site accreditation number", "site", "text", "both", ""),
    ("pi_name", "Principal investigator: name", "contacts", "text", "project", ""),
    ("pi_function", "Principal investigator: function", "contacts", "text", "project", ""),
    ("pi_phone", "Principal investigator: phone", "contacts", "phone", "project", ""),
    ("pi_email", "Principal investigator: e-mail", "contacts", "email", "project", ""),
    ("doctor_name", "Study doctor / 24h contact: name", "contacts", "text", "project", ""),
    ("doctor_phone", "Study doctor / 24h contact: phone", "contacts", "phone", "project", ""),
    ("nurse_name", "Study nurse / coordinator: name", "contacts", "text", "project", ""),
    ("nurse_phone", "Study nurse / coordinator: phone", "contacts", "phone", "project", ""),
    ("nurse_email", "Study nurse / coordinator: e-mail", "contacts", "email", "project", ""),
    ("ombudsperson_phone", "Ombudsperson (patient rights): phone", "contacts", "phone", "both",
     "Site ombudsperson; the CT-College can replace it"),
    ("ombudsperson_email", "Ombudsperson (patient rights): e-mail", "contacts", "email", "both",
     "Fallback: ct-college@health.fgov.be"),
    ("dpo_name", "Data protection officer of the site: name", "privacy", "text", "both", ""),
    ("dpo_phone", "Data protection officer of the site: phone", "privacy", "phone", "both", ""),
    ("dpo_email", "Data protection officer of the site: e-mail", "privacy", "email", "both", ""),
    ("dpa_name", "Belgian Data Protection Authority", "privacy", "text", "global", ""),
    ("dpa_phone", "Belgian DPA: phone", "privacy", "phone", "global", ""),
    ("dpa_email", "Belgian DPA: e-mail", "privacy", "email", "global", ""),
    ("ethics_committee_name", "Ethics committee: name", "ethics", "text", "both", ""),
    ("ethics_committee_contact", "Ethics committee: contact", "ethics", "multiline", "both", ""),
    ("insurer_name", "Insurance company of the sponsor", "insurance", "text", "both", ""),
    ("insurer_policy_number", "Insurance policy number", "insurance", "text", "project", ""),
    ("insurer_address", "Insurer address", "insurance", "multiline", "both", ""),
    ("insurer_phone", "Insurer phone", "insurance", "phone", "both", ""),
    ("insurer_email", "Insurer e-mail", "insurance", "email", "both", ""),
]  # fmt: skip
SCHEMA = [
    {"key": k, "label": lb, "group": g, "kind": kd, "scope": sc, "hint": h}
    for k, lb, g, kd, sc, h in _S
]
BY_KEY = {f["key"]: f for f in SCHEMA}
# facts that count towards the completeness indicator
KEY_FACTS = [
    "study_official_title", "sponsor_name", "study_summary", "site_name", "site_address",
    "pi_name", "pi_phone", "pi_email", "doctor_phone", "dpo_email", "ombudsperson_phone",
    "insurer_name", "insurer_policy_number", "insurer_address",
]  # fmt: skip
# study-level facts the AI may infer from sponsor documents
INFERABLE = [
    "study_official_title", "study_short_title", "eu_ct_number", "trial_number", "sponsor_name",
    "sponsor_address", "eu_representative", "cro", "study_summary", "insurer_name",
    "insurer_policy_number", "insurer_address", "insurer_phone", "insurer_email",
]  # fmt: skip
# Verified generic defaults (Belgian national template, front-page contact table).
DEFAULT_GLOBALS = {
    "dpa_name": "Gegevensbeschermingsautoriteit / Autorité de protection des données (GBA/APD)",
    "dpa_phone": "+32 (0)2 274 48 00",
    "dpa_email": "contact@apd-gba.be",
}


def seed_global_defaults() -> None:
    """Insert the generic defaults once (only when the table is empty)."""
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM global_facts LIMIT 1").fetchone():
            return
        for k, v in DEFAULT_GLOBALS.items():
            conn.execute(
                "INSERT INTO global_facts (key, value, updated_at, updated_by) VALUES (?,?,?,?)",
                (k, v, db.now_iso(), "system"),
            )


def global_values(conn) -> dict[str, str]:
    return {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM global_facts")}


def effective(conn, pid: int) -> dict[str, dict]:
    """key -> {value, source ('manual'|'inferred'|'global'|'')}: project override > global."""
    glob = global_values(conn)
    out = {
        f["key"]: {
            "value": glob.get(f["key"], ""),
            "source": "global" if glob.get(f["key"]) else "",
        }
        for f in SCHEMA
    }
    for r in conn.execute(
        "SELECT key, value, source FROM project_facts WHERE project_id = ?", (pid,)
    ):
        if r["key"] in out and r["value"]:
            out[r["key"]] = {"value": r["value"], "source": r["source"]}
    return out


def facts_prompt(conn, pid: int) -> str:
    """Authoritative 'known facts' block for the generator; '' when nothing is known."""
    eff = effective(conn, pid)
    lines = [f"- {k} ({BY_KEY[k]['label']}): {v['value']}" for k, v in eff.items() if v["value"]]
    if not lines:
        return ""
    return (
        "KNOWN STUDY PROFILE FACTS (authoritative, maintained by the study team). Use these values "
        "verbatim (do not translate or reword names, phone numbers, e-mails, addresses, policy "
        "numbers) for any placeholder about the study, sponsor, site, investigator, contacts, "
        "ombudsperson, data protection officer, ethics committee or insurance. They take "
        "precedence over the sponsor documents.\n" + "\n".join(lines)
    )


def profile_keys_prompt() -> str:
    """Tells the model how to flag a missing fact so the gap comment can name the profile field."""
    keys = ", ".join(BY_KEY)
    return (
        "When a placeholder asks for a study/site/contact/insurance fact that is not known, answer "
        "'MISSING:<fact_key>' using the matching key from this list instead of plain MISSING: "
        f"{keys}."
    )


def missing_hint(key: str) -> str:
    f = BY_KEY.get(key)
    return f" (profile field: {f['label']})" if f else ""
