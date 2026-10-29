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
# parallel generate/translate tasks share Vertex quota: cap in-flight calls
_slots = threading.BoundedSemaphore(int(os.environ.get("AI_CONCURRENCY", "16")))
_state: dict = {
    "project": None,
    "project_resolved": False,
    "client": None,  # default-location client (legacy name); others live in _clients
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


_clients: dict[tuple[str, int], object] = {}


def parse_model(spec: str) -> tuple[str, str]:
    """'gemini-3.1-pro-preview@global' -> (model, location); no '@' = default location."""
    model, _, loc = spec.partition("@")
    return model.strip(), (loc.strip() or _location())


def fast_model() -> str:
    """Cheap model for extraction / classification (ICF_FAST_MODEL, default VERTEX_MODEL)."""
    return os.environ.get("ICF_FAST_MODEL") or _model()


def fill_models() -> list[str]:
    """Model specs for the strong ICF writing step, best first, falling back to the fast model.

    ICF_FILL_MODEL may be a comma separated list of 'model[@location]'.
    """
    raw = os.environ.get("ICF_FILL_MODEL") or "gemini-3.1-pro-preview@global,gemini-2.5-pro"
    specs = [x.strip() for x in raw.split(",") if x.strip()]
    if fast_model() not in specs:
        specs.append(fast_model())
    return specs


def ai_status() -> dict:
    project = _project()
    enabled = bool(project) and time.time() >= _state["broken_until"]
    return {
        "enabled": enabled,
        "provider": "vertex" if enabled else "none",
        "model": _model() if enabled else None,
        "project": project if enabled else None,
    }


def _make_client(location: str | None = None, timeout_ms: int = 75_000):
    from google import genai
    from google.genai import types

    kwargs: dict = {
        "vertexai": True,
        "project": _project(),
        "location": location or _location(),
        "http_options": types.HttpOptions(timeout=timeout_ms),
    }
    if _state["mode"] == "gcloud":
        from google.oauth2.credentials import Credentials

        tok = _gcloud("auth", "print-access-token")
        if not tok:
            raise RuntimeError("gcloud access token unavailable")
        kwargs["credentials"] = Credentials(tok)
    return genai.Client(**kwargs)


def _get_client(force: bool = False, location: str | None = None, timeout_ms: int = 75_000):
    with _lock:
        stale = _state["mode"] == "gcloud" and time.time() - _state["client_at"] > 1800
        if force or stale or _state["client"] is None:
            _clients.clear()
            _state["client"] = _make_client()
            _state["client_at"] = time.time()
        loc = location or _location()
        if loc == _location() and timeout_ms == 75_000:
            return _state["client"]
        key = (loc, timeout_ms)
        if key not in _clients:
            _clients[key] = _make_client(loc, timeout_ms)
        return _clients[key]


def _is_auth_error(e: Exception) -> bool:
    code = getattr(e, "code", None)
    return code in (401, 403) or "PERMISSION_DENIED" in str(e) or "UNAUTHENTICATED" in str(e)


def _is_rate_limit(e: Exception) -> bool:
    return getattr(e, "code", None) == 429 or "RESOURCE_EXHAUSTED" in str(e)


_unavailable: set[tuple[str, str]] = set()  # (model, location) that answered 404 NOT_FOUND


def _is_model_missing(e: Exception) -> bool:
    return getattr(e, "code", None) == 404 or "NOT_FOUND" in str(e)


def _thinking_config(model: str, thinking):
    """thinking: int budget (2.x models) or 'LOW'/'MEDIUM'/'HIGH' level (3.x models)."""
    from google.genai import types

    if isinstance(thinking, str) and not thinking.lstrip("-").isdigit():
        return types.ThinkingConfig(thinking_level=thinking.upper())
    if thinking is None:
        if "flash" not in model:
            return None
        thinking = os.environ.get("AI_THINKING_BUDGET", "0")
    # extraction/translation needs no reasoning; thinking made each call 5-20 s slower
    if model.startswith("gemini-3"):
        return types.ThinkingConfig(thinking_level="LOW" if int(thinking) else "MINIMAL")
    return types.ThinkingConfig(thinking_budget=int(thinking))


def _generate(
    contents: str,
    system: str | None = None,
    json_output: bool = False,
    thinking_budget=None,
    model: str | None = None,
    location: str | None = None,
    timeout_ms: int = 75_000,
    temperature: float = 0.2,
) -> str | None:
    """One Gemini call with credential fallback (ADC first, then gcloud's active account)."""
    if not ai_status()["enabled"]:
        return None
    from google.genai import types

    model = model or _model()
    loc = location or _location()
    if (model, loc) in _unavailable:
        return None
    cfg: dict = {"temperature": temperature}
    if system:
        cfg["system_instruction"] = system
    if json_output:
        cfg["response_mime_type"] = "application/json"
    tc = _thinking_config(model, thinking_budget)
    if tc is not None:
        cfg["thinking_config"] = tc
    config = types.GenerateContentConfig(**cfg)
    throttled = 0
    attempt = -1
    while attempt < 2:
        attempt += 1
        try:
            client = _get_client(
                force=attempt > 0 and _state["client"] is None, location=loc, timeout_ms=timeout_ms
            )
            with _slots:
                resp = client.models.generate_content(model=model, contents=contents, config=config)
            return resp.text
        except Exception as e:  # noqa: BLE001 - never raise
            if _is_rate_limit(e) and throttled < 5:
                throttled += 1
                attempt -= 1  # rate limits don't use up a credential attempt
                time.sleep(min(2**throttled, 30))  # 2, 4, 8, 16, 30 s
                continue
            if _is_model_missing(e):
                log.warning("Vertex model %s@%s not available: %s", model, loc, str(e)[:120])
                _unavailable.add((model, loc))
                return None
            if attempt == 0 and _is_auth_error(e) and _state["mode"] == "adc":
                log.warning("Vertex ADC denied, falling back to gcloud account token: %s", e)
                _state["mode"] = "gcloud"
                _state["client"] = None
                continue
            if attempt < 2 and _is_auth_error(e) and _state["mode"] == "gcloud":
                _state["client"] = None
                continue
            log.error("Vertex call failed (%s): %s", model, e)
            _state["client"] = None
            if timeout_ms <= 75_000:  # long strong-model calls must not disable the whole AI
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


def generate_json(prompt: str, system: str | None = None, thinking_budget: int | None = None):
    """Gemini call with JSON output parsed to Python; None on failure."""
    try:
        text = _generate(prompt, system, json_output=True, thinking_budget=thinking_budget)
        if not text:
            return None
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
        return json.loads(text)
    except Exception as e:  # noqa: BLE001
        log.error("generate_json failed: %s", e)
        return None


def generate_json_models(
    prompt: str,
    system: str | None,
    specs: list[str],
    thinking=None,
    timeout_ms: int = 240_000,
    temperature: float = 0.2,
):
    """Try each 'model[@location]' spec in order until one returns parseable JSON.

    Returns (data, spec) or (None, None). A model that is not available (404) is skipped for good.
    """
    for spec in specs:
        model, loc = parse_model(spec)
        try:
            text = _generate(
                prompt,
                system,
                json_output=True,
                thinking_budget=thinking,
                model=model,
                location=loc,
                timeout_ms=timeout_ms,
                temperature=temperature,
            )
            if not text:
                continue
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
            return json.loads(text), spec
        except Exception as e:  # noqa: BLE001
            log.error("generate_json_models(%s) failed: %s", spec, e)
    return None, None


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
