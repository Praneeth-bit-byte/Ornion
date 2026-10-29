"""
ORNION — Personal AI Assistant (jarvis_brain.py compatibility module)
Created and developed by Praneeth Thota

Hybrid Cloud + Local Fallback AI Brain with Rate-Limit Cooldown Handling.
Supports NVIDIA API Catalog (mistralai/mistral-large-4-1t-a52b) via NVIDIA_API_KEY
or ~/.ornion/nvidia.key, as well as Groq endpoints via GROQ_API_KEY or ~/.ornion/free.key.
"""

import os
import time
import re
import threading
import jarvis_actions

try:
    from openai import OpenAI
except Exception:
    OpenAI = None  # type: ignore[misc,assignment]

NVIDIA_KEYFILE = os.path.expanduser("~/.ornion/nvidia.key")
KEYFILE = os.path.expanduser("~/.ornion/free.key")
LEGACY_KEYFILE = os.path.expanduser("~/.openjarvis/free.key")

NVIDIA_BASE_URL = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
NVIDIA_MODEL = os.environ.get("NVIDIA_MODEL", "mistralai/mistral-large-4-1t-a52b")
GROQ_MODELS = ["llama-3.3-70b-versatile", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]

_BRAIN_LOCK = threading.Lock()
_client = None
_client_key = None
_client_provider = None
_history = []
_cooldown_until = 0.0
_last_model = NVIDIA_MODEL
_last_mode = "HYBRID"

SYSTEM_PROMPT = """You are ORNION, a fast, capable Personal AI Assistant created and developed by Praneeth Thota, running on the user's system.
Respond concisely in 1-3 sentences. Be direct, helpful, and natural. Do not use filler or formal corporate jargon.
"""


def _get_api_credentials():
    """Returns (provider, api_key, base_url, models) where provider is 'nvidia' or 'groq'."""
    nv_env = os.environ.get("NVIDIA_API_KEY", "").strip()
    if nv_env and nv_env != "YOUR_NVIDIA_API_KEY":
        return ("nvidia", nv_env, NVIDIA_BASE_URL, [NVIDIA_MODEL])

    for candidate in (NVIDIA_KEYFILE, KEYFILE, LEGACY_KEYFILE):
        if os.path.exists(candidate):
            try:
                with open(candidate, "r", encoding="utf-8") as f:
                    val = f.read().strip()
                    if val.startswith("nvapi-"):
                        return ("nvidia", val, NVIDIA_BASE_URL, [NVIDIA_MODEL])
                    if val:
                        return ("groq", val, "https://api.groq.com/openai/v1", GROQ_MODELS)
            except Exception:
                pass

    groq_env = os.environ.get("GROQ_API_KEY", "").strip()
    if groq_env:
        return ("groq", groq_env, "https://api.groq.com/openai/v1", GROQ_MODELS)

    return (None, None, None, [])


def ready():
    """Returns True if the cloud brain is configured and not currently rate-limited."""
    _prov, key, _url, _models = _get_api_credentials()
    if not key or OpenAI is None:
        return False
    return time.time() >= _cooldown_until


def cooldown_remaining():
    """Returns remaining cooldown seconds (0 if not in cooldown)."""
    return max(0, int(round(_cooldown_until - time.time())))


def get_brain_telemetry():
    """Returns thread-safe snapshot of brain mode, active model, cooldown, and memory count."""
    _prov, key, _url, _models = _get_api_credentials()
    cd = cooldown_remaining()
    with _BRAIN_LOCK:
        if cd > 0:
            mode = "LOCAL FAILOVER"
        elif not key or OpenAI is None:
            mode = "OFFLINE LOCAL"
        else:
            mode = "HYBRID"
        return {
            "mode": mode,
            "model": _last_model,
            "cooldown": cd,
            "facts": len(_history) // 2,
        }


def _is_rate_limited(e):
    status = getattr(e, "status_code", None)
    if status == 429:
        return True
    s = str(e).lower()
    return any(w in s for w in ("429", "rate limit", "too many requests", "rate_limit", "exceeded"))


def _retry_after_seconds(e, default=60):
    s = str(e).lower()
    m = re.search(r"try again in\s*(\d+)m\s*([0-9]+(?:\.[0-9]+)?)s", s)
    if m:
        return int(float(m.group(1)) * 60 + float(m.group(2))) + 2
    m = re.search(r"try again in\s*([0-9]+(?:\.[0-9]+)?)s", s)
    if m:
        return int(float(m.group(1))) + 2
    return default


def _set_cooldown(secs):
    global _cooldown_until
    with _BRAIN_LOCK:
        _cooldown_until = max(_cooldown_until, time.time() + float(secs))


def _local_fallback(q):
    """
    Called when Cloud API is temporarily rate-limited or unconfigured.
    Provides immediate local action execution or clear local fallback guidance.
    """
    global _last_model, _last_mode
    action_res = jarvis_actions.try_action(q)
    if action_res:
        with _BRAIN_LOCK:
            _last_model = "Local Action Engine"
        return action_res

    cd = cooldown_remaining()
    _prov, key, _url, _models = _get_api_credentials()
    with _BRAIN_LOCK:
        if cd > 0:
            _last_mode = "LOCAL FAILOVER"
            _last_model = f"Local Fallback (Cooldown {cd}s)"
            return (
                f"Cloud AI is in rate-limit cooldown ({cd}s remaining). "
                "Deterministic local tools (stock analysis, app launching, YouTube, and volume control) remain active."
            )
        if not key:
            _last_mode = "OFFLINE LOCAL"
            _last_model = "Unconfigured Cloud Key"
            return (
                "No NVIDIA_API_KEY or ~/.ornion/free.key is configured yet. "
                "Add your API key to enable conversational AI, or use local commands like 'Open Calculator' or 'Stock market report'."
            )
        _last_mode = "OFFLINE LOCAL"
        _last_model = "Local Action Engine"

    return (
        "Cloud AI service was unreachable, so ORNION Local Mode is active. "
        "I can still open your desktop apps, prepare WhatsApp messages, or analyze stock charts."
    )


def think(q):
    """
    Main entry point for queries. Tries strict local deterministic actions first,
    then NVIDIA Mistral Large 4 / Groq cloud AI with automatic cooldown handling.
    """
    global _client, _client_key, _client_provider, _history, _last_model, _last_mode

    if not q or not isinstance(q, str):
        return "I didn't catch that command."

    # 1. Immediate strict local action check
    local_done = jarvis_actions.try_action(q)
    if local_done:
        with _BRAIN_LOCK:
            _last_model = "Local Action Engine"
        return local_done

    provider, key, base_url, models = _get_api_credentials()
    if not key or OpenAI is None or time.time() < _cooldown_until:
        return _local_fallback(q)

    with _BRAIN_LOCK:
        if _client is None or _client_key != key or _client_provider != provider:
            _client = OpenAI(api_key=key, base_url=base_url)
            _client_key = key
            _client_provider = provider
        client = _client
        msgs = [{"role": "system", "content": SYSTEM_PROMPT}] + _history[-8:] + [{"role": "user", "content": q}]

    for model in models:
        try:
            extra_body = {"reasoning_effort": "low"} if provider == "nvidia" else None
            max_tok = 2048 if provider == "nvidia" else 450
            resp = client.chat.completions.create(
                model=model,
                messages=msgs,
                max_tokens=max_tok,
                temperature=0.5,
                extra_body=extra_body,
            )
            answer = (resp.choices[0].message.content or "").strip()
            if answer:
                with _BRAIN_LOCK:
                    _history += [{"role": "user", "content": q}, {"role": "assistant", "content": answer}]
                    del _history[:-20]
                    _last_model = f"NVIDIA / {model}" if provider == "nvidia" else f"Groq / {model}"
                    _last_mode = "HYBRID"
                return answer
        except Exception as e:
            if _is_rate_limited(e):
                wait_sec = _retry_after_seconds(e)
                _set_cooldown(wait_sec)
                print(f"[ORNION rate-limit triggered: cooldown for {wait_sec}s]")
                return _local_fallback(q)
            print(f"[Model {model} error: {type(e).__name__}]")

    return _local_fallback(q)


if __name__ == "__main__":
    print("Testing ORNION Brain...")
    print(think("what time is it"))
    print(think("Hello! What is your name?"))
