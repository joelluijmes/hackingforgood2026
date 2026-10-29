"""Vertex AI Gemini helpers. Never raises; returns None / None-lists on any failure."""

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
import time

log = logging.getLogger("icf.ai")

LANGS = ("en", "nl", "fr")
LANG_NAMES = {"en": "English", "nl": "Dutch", "fr": "French"}

_lock = threading.Lock()
_state: dict = {
    "project": None,
    "project_resolved": False,
    "client": None,
    "mode": "adc",  # "adc" | "gcloud"
    "client_at": 0.0,
    "broken_until": 0.0,
}


def _gcloud(*args: str, timeout: int = 20) -> str:
    """Run gcloud and return stdout ('' on failure).

    Resolves gcloud.cmd on Windows (subprocess cannot run .cmd shims by bare name) and points
    gcloud at this interpreter when CLOUDSDK_PYTHON is unset, since gcloud needs Python >= 3.10
    and otherwise picks up whatever `python` is first on PATH.
    """
    exe = shutil.which("gcloud")
    if not exe:
        return ""
    env = dict(os.environ)
    env.setdefault("CLOUDSDK_PYTHON", sys.executable)
    try:
        out = subprocess.run([exe, *args], capture_output=True, text=True, timeout=timeout, env=env)
    except Exception as e:  # noqa: BLE001
        log.warning("gcloud %s failed: %s", " ".join(args), e)
        return ""
    if out.returncode != 0:
        log.warning("gcloud %s failed: %s", " ".join(args), out.stderr.strip()[:300])
    return out.stdout.strip()


def _project() -> str | None:
    if not _state["project_resolved"]:
        proj = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCLOUD_PROJECT")
        if not proj:
            proj = _gcloud("config", "get-value", "project", timeout=10) or None
            if proj == "(unset)":
                proj = None
        _state["project"] = proj
        _state["project_resolved"] = True
    return _state["project"]


def _location() -> str:
    return os.environ.get("GOOGLE_CLOUD_LOCATION", "europe-west4")


def _model() -> str:
    return os.environ.get("VERTEX_MODEL", "gemini-2.5-flash")


def ai_status() -> dict:
    project = _project()
    enabled = bool(project) and time.time() >= _state["broken_until"]
    return {
        "enabled": enabled,
        "provider": "vertex" if enabled else "none",
        "model": _model() if enabled else None,
        "project": project if enabled else None,
    }


def _make_client():
    from google import genai
    from google.genai import types

    kwargs: dict = {
        "vertexai": True,
        "project": _project(),
        "location": _location(),
        "http_options": types.HttpOptions(timeout=75_000),
    }
    if _state["mode"] == "gcloud":
        from google.oauth2.credentials import Credentials

        tok = _gcloud("auth", "print-access-token")
        if not tok:
            raise RuntimeError("gcloud access token unavailable")
        kwargs["credentials"] = Credentials(tok)
    return genai.Client(**kwargs)


def _get_client(force: bool = False):
    with _lock:
        stale = _state["mode"] == "gcloud" and time.time() - _state["client_at"] > 1800
        if force or stale or _state["client"] is None:
            _state["client"] = _make_client()
            _state["client_at"] = time.time()
        return _state["client"]


def _is_auth_error(e: Exception) -> bool:
    code = getattr(e, "code", None)
    return code in (401, 403) or "PERMISSION_DENIED" in str(e) or "UNAUTHENTICATED" in str(e)


def _generate(contents: str, system: str | None = None, json_output: bool = False) -> str | None:
    """One Gemini call with credential fallback (ADC first, then gcloud's active account)."""
    if not ai_status()["enabled"]:
        return None
    from google.genai import types

    cfg: dict = {"temperature": 0.2}
    if system:
        cfg["system_instruction"] = system
    if json_output:
        cfg["response_mime_type"] = "application/json"
    config = types.GenerateContentConfig(**cfg)
    for attempt in range(3):
        try:
            client = _get_client(force=attempt > 0 and _state["client"] is None)
            resp = client.models.generate_content(model=_model(), contents=contents, config=config)
            return resp.text
        except Exception as e:  # noqa: BLE001 - never raise
            if attempt == 0 and _is_auth_error(e) and _state["mode"] == "adc":
                log.warning("Vertex ADC denied, falling back to gcloud account token: %s", e)
                _state["mode"] = "gcloud"
                _state["client"] = None
                continue
            if attempt < 2 and _is_auth_error(e) and _state["mode"] == "gcloud":
                _state["client"] = None
                continue
            log.error("Vertex call failed: %s", e)
            _state["client"] = None
            _state["broken_until"] = time.time() + 20
            return None
    return None


def generate_text(prompt: str, system: str | None = None) -> str | None:
    try:
        text = _generate(prompt, system)
        return text.strip() if text else None
    except Exception as e:  # noqa: BLE001
        log.error("generate_text failed: %s", e)
        return None


def generate_json(prompt: str, system: str | None = None):
    """Gemini call with JSON output parsed to Python; None on failure."""
    try:
        text = _generate(prompt, system, json_output=True)
        if not text:
            return None
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
        return json.loads(text)
    except Exception as e:  # noqa: BLE001
        log.error("generate_json failed: %s", e)
        return None


# -- language detection ------------------------------------------------------------------------

_STOP = {
    "en": "the and of to in is that for with you your are this be will not have as on or by from "
    "can may if it at an we our they what which when about who has was were been but".split(),
    "nl": "de het een en van in is dat op te voor met niet zijn je u uw wordt worden dit als er "
    "ook aan bij of naar door maar om kan kunt heeft hebben wij ons onze deze".split(),
    "fr": "le la les des du de un une et en est que qui pour dans avec pas vous votre vos sont ce "
    "cette sur par au aux ou il elle nous ne se sera peut être avez avoir mais plus".split(),
}


def _score(text: str) -> dict[str, int]:
    words = re.findall(r"[^\W\d_]+", text.lower())
    return {k: sum(1 for w in words if w in set(v)) for k, v in _STOP.items()}


def detect_language(text: str) -> str | None:
    text = (text or "").strip()
    if not text:
        return None
    s = _score(text)
    ranked = sorted(s.items(), key=lambda kv: kv[1], reverse=True)
    (best, b), (_, second) = ranked[0], ranked[1]
    if b >= 2 and b >= 2 * second:
        return best
    if ai_status()["enabled"]:
        out = generate_text(
            "Which language is this text written in? Answer with exactly one code: en, nl or fr "
            "(or 'other').\n\n" + text[:1000]
        )
        if out:
            code = out.strip().lower()[:5]
            for lang in LANGS:
                if code.startswith(lang):
                    return lang
            return None
    return best if b > 0 and b > second else None


def translate(texts: list[str], target: str) -> list[str | None]:
    n = len(texts)
    if n == 0:
        return []
    if target not in LANG_NAMES or not ai_status()["enabled"]:
        return [None] * n
    idx = [i for i, t in enumerate(texts) if t and t.strip()]
    result: list[str | None] = [t if not (t and t.strip()) else None for t in texts]
    if not idx:
        return result
    payload = json.dumps([texts[i] for i in idx], ensure_ascii=False)
    prompt = (
        f"Translate each string of this JSON array into {LANG_NAMES[target]}. Keep meaning, tone "
        "and any names or numbers; if a string is already in the target language return it "
        "unchanged. Return ONLY a JSON array of strings with exactly the same length and "
        f"order.\n\n{payload}"
    )
    data = generate_json(prompt, "You are a precise medical-domain translator.")
    if isinstance(data, list) and len(data) == len(idx) and all(isinstance(x, str) for x in data):
        for i, tr in zip(idx, data, strict=True):
            result[i] = tr
    else:
        log.error("translate: unexpected response shape")
    return result
