"""
ORNION — Personal AI Assistant (jarvis_brain.py compatibility module)
Created and developed by Praneeth Thota

Hybrid Cloud + Local Fallback AI Brain with Rate-Limit Cooldown Handling.
Uses Groq endpoints for cloud LLM responses and falls back to local deterministic
command processing when rate-limited or when no cloud key is configured.
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

KEYFILE = os.path.expanduser("~/.ornion/free.key")
LEGACY_KEYFILE = os.path.expanduser("~/.openjarvis/free.key")
MODELS = ["llama-3.3-70b-versatile", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]

_BRAIN_LOCK = threading.Lock()
_client = None
_client_key = None
_history = []
_cooldown_until = 0.0
_last_model = "Local Action Engine"
_last_mode = "HYBRID"

SYSTEM_PROMPT = """You are ORNION, a fast, capable Personal AI Assistant running on the user's system.
Respond concisely in 1-2 sentences. Be direct, helpful, and natural. Do not use filler or formal corporate jargon.
"""


def _get_api_key():
    if os.environ.get("GROQ_API_KEY"):
        val = os.environ["GROQ_API_KEY"].strip()
        if val:
            return val
    for candidate in (KEYFILE, LEGACY_KEYFILE):
        if os.path.exists(candidate):
            try:
                with open(candidate, "r", encoding="utf-8") as f:
                    val = f.read().strip()
                    if val:
                        return val
            except Exception:
                pass
    return None


def ready():
    """Returns True if the cloud brain is configured and not currently rate-limited."""
    key = _get_api_key()
    if not key or OpenAI is None:
        return False
    return time.time() >= _cooldown_until


def cooldown_remaining():
    """Returns remaining cooldown seconds (0 if not in cooldown)."""
    return max(0, int(round(_cooldown_until - time.time())))


def get_brain_telemetry():
    """Returns thread-safe snapshot of brain mode, active model, cooldown, and memory count."""
    key = _get_api_key()
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
    Called when Groq API is temporarily rate-limited or unconfigured.
    Provides immediate local action execution or clear local fallback guidance.
    """
    global _last_model, _last_mode
    action_res = jarvis_actions.try_action(q)
    if action_res:
        with _BRAIN_LOCK:
            _last_model = "Local Action Engine"
        return action_res

    cd = cooldown_remaining()
    with _BRAIN_LOCK:
        if cd > 0:
            _last_mode = "LOCAL FAILOVER"
            _last_model = f"Local Fallback (Cooldown {cd}s)"
        else:
            _last_mode = "OFFLINE LOCAL"
            _last_model = "Local Action Engine"

    return (
        "Cloud API is cooling down, but ORNION local commands are active. "
        "I can open your apps, draft WhatsApp messages, or analyze stock charts for you."
    )


def think(q):
    """
    Main entry point for queries. Tries local deterministic actions first,
    then cloud AI with automatic fallback if rate-limited.
    """
    global _client, _client_key, _history, _last_model, _last_mode

    if not q or not isinstance(q, str):
        return "I didn't catch that command."

    # 1. Immediate local action check
    local_done = jarvis_actions.try_action(q)
    if local_done:
        with _BRAIN_LOCK:
            _last_model = "Local Action Engine"
        return local_done

    key = _get_api_key()
    if not key or OpenAI is None or time.time() < _cooldown_until:
        return _local_fallback(q)

    with _BRAIN_LOCK:
        if _client is None or _client_key != key:
            _client = OpenAI(api_key=key, base_url="https://api.groq.com/openai/v1")
            _client_key = key
        client = _client
        msgs = [{"role": "system", "content": SYSTEM_PROMPT}] + _history[-6:] + [{"role": "user", "content": q}]

    for model in MODELS:
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=msgs,
                max_tokens=350,
                temperature=0.6,
            )
            answer = (resp.choices[0].message.content or "").strip()
            if answer:
                with _BRAIN_LOCK:
                    _history += [{"role": "user", "content": q}, {"role": "assistant", "content": answer}]
                    del _history[:-20]
                    _last_model = f"Groq / {model}"
                    _last_mode = "HYBRID"
                return answer
        except Exception as e:
            if _is_rate_limited(e):
                wait_sec = _retry_after_seconds(e)
                _set_cooldown(wait_sec)
                print(f"[ORNION rate-limit triggered: cooldown for {wait_sec}s]")
                return _local_fallback(q)
            print(f"[Model {model} failed: {e}]")

    return _local_fallback(q)


if __name__ == "__main__":
    print("Testing ORNION Brain...")
    print(think("what time is it"))
    print(think("how are you"))
