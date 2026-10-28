"""
ORNION — Personal AI Assistant (jarvis_voice.py compatibility module)
Created and developed by Praneeth Thota

Live Speech Recognition, Audio Response & Local HUD Telemetry Server.
Listens through your microphone (or console fallback), processes commands, speaks back,
and serves the ORNION Neural Interface HUD on http://127.0.0.1:8765 with real-time state.
"""

import sys
import os
import subprocess
import time
import json
import math
import struct
import shutil
import datetime
import threading
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import speech_recognition as sr
except Exception:
    sr = None  # type: ignore[assignment]

try:
    import psutil
except Exception:
    psutil = None  # type: ignore[assignment]

import jarvis_brain
import jarvis_actions
import jarvis_market


# ==============================================================================
# 1. THREAD-SAFE HUD STATE STORE
# ==============================================================================

class HudStateStore:
    def __init__(self):
        self._lock = threading.Lock()
        self.state = "starting"
        self.note = "Calibrating audio & initializing ORNION Neural Interface..."
        self.t_rec = 0.0
        self.t_think = 0.0
        self.last_you = ""
        self.tool_active = False
        self.chat = []
        self.chat_seq = 0
        self.mic_seq = 0
        self.mic_levels = []
        self.stocks = []
        self.hud_port = 8765
        self.should_exit = False
        self.add_chat("sys", "ORNION AI is online. Neural Interface initialized.")

    def set_stage(self, state, note=None, tool_active=None):
        with self._lock:
            self.state = state
            if note is not None:
                self.note = note
            if tool_active is not None:
                self.tool_active = bool(tool_active)

    def record_recognition(self, query_text, rec_duration):
        with self._lock:
            self.last_you = query_text
            self.t_rec = round(float(rec_duration), 2)

    def record_thinking(self, think_duration):
        with self._lock:
            self.t_think = round(float(think_duration), 2)

    def add_chat(self, kind, text):
        if not text:
            return
        with self._lock:
            self.chat_seq += 1
            self.chat.append(
                {
                    "i": self.chat_seq,
                    "k": kind,
                    "x": str(text),
                    "t": datetime.datetime.now().strftime("%H:%M:%S"),
                }
            )
            del self.chat[:-80]

    def push_mic_samples(self, samples):
        if not samples:
            return
        with self._lock:
            for s in samples:
                self.mic_seq += 1
                self.mic_levels.append((self.mic_seq, round(max(0.0, min(1.0, float(s))), 3)))
            del self.mic_levels[:-40]

    def update_stocks(self, stock_list):
        with self._lock:
            self.stocks = list(stock_list)

    def get_system_vitals(self):
        sys_info = {}
        try:
            if psutil is not None:
                sys_info["cpu"] = round(float(psutil.cpu_percent(interval=None)), 1)
                sys_info["ram"] = round(float(psutil.virtual_memory().percent), 1)
                sys_info["up"] = int(time.time() - psutil.boot_time())
                if hasattr(psutil, "sensors_battery"):
                    bat = psutil.sensors_battery()
                    if bat is not None and bat.percent is not None:
                        sys_info["bat"] = int(round(bat.percent))
                        sys_info["plug"] = bool(bat.power_plugged)
        except Exception:
            pass

        try:
            usage = shutil.disk_usage(os.path.abspath("."))
            if usage.total > 0:
                sys_info["disk"] = int(round((usage.used / usage.total) * 100.0))
                sys_info["free"] = int(round(usage.free / (1024 ** 3)))
        except Exception:
            pass
        return sys_info

    def snapshot(self, since_lv=0):
        brain_meta = jarvis_brain.get_brain_telemetry()
        action_meta = jarvis_actions.get_action_telemetry()
        mail_age = jarvis_actions.get_mail_cache_age_minutes()
        sys_vitals = self.get_system_vitals()

        with self._lock:
            new_levels = [val for seq, val in self.mic_levels if seq > since_lv]
            curr_mic_seq = self.mic_seq
            note = self.note
            if brain_meta["cooldown"] > 0:
                note = f"CLOUD COOLDOWN ({brain_meta['cooldown']}s) · LOCAL FAILOVER ACTIVE"

            return {
                "state": self.state,
                "note": note,
                "mode": brain_meta["mode"],
                "model": brain_meta["model"],
                "t_rec": self.t_rec,
                "t_think": self.t_think,
                "last_tool": action_meta["last_tool"],
                "tools": action_meta["tools"],
                "facts": brain_meta["facts"],
                "mail_age": mail_age,
                "last_you": self.last_you,
                "tool_active": self.tool_active,
                "chat": list(self.chat),
                "cards": action_meta["cards"],
                "stocks": list(self.stocks),
                "sys": sys_vitals,
                "mic": {
                    "n": curr_mic_seq,
                    "a": new_levels,
                },
            }


HUD_STATE = HudStateStore()


def _extract_pcm_envelope(raw_bytes, sample_width=2, buckets=8):
    """Calculates real normalized RMS amplitude samples from captured 16-bit PCM microphone audio."""
    if not raw_bytes or sample_width != 2 or len(raw_bytes) < 4:
        return []
    total_samples = len(raw_bytes) // 2
    step = max(1, total_samples // buckets)
    levels = []
    for b in range(buckets):
        start = b * step * 2
        end = min(len(raw_bytes), (b + 1) * step * 2)
        chunk = raw_bytes[start:end]
        count = len(chunk) // 2
        if count == 0:
            continue
        shorts = struct.unpack(f"<{count}h", chunk[: count * 2])
        sq_sum = sum(s * s for s in shorts)
        rms = math.sqrt(sq_sum / count) / 32768.0
        levels.append(min(1.0, rms * 3.5))
    return levels


# ==============================================================================
# 2. LOCAL HTTP SERVER (127.0.0.1:8765) FOR ORNION NEURAL INTERFACE HUD
# ==============================================================================

def _find_hud_html_path():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(base_dir, "ornion_workplace.html"),
        os.path.join(base_dir, "jarvis_workplace.html"),
        os.path.join(base_dir, "jarvis_workplace_88522884.html"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


class HudRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _send_cors_headers(self):
        origin = self.headers.get("Origin", "")
        if origin in ("null", f"http://127.0.0.1:{HUD_STATE.hud_port}", f"http://localhost:{HUD_STATE.hud_port}"):
            self.send_header("Access-Control-Allow-Origin", origin)
        else:
            self.send_header("Access-Control-Allow-Origin", f"http://127.0.0.1:{HUD_STATE.hud_port}")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ("/", "/ornion_workplace.html", "/jarvis_workplace.html"):
            html_path = _find_hud_html_path()
            if not html_path:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"ORNION HUD HTML file not found")
                return
            try:
                with open(html_path, "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode("utf-8"))
            return

        if parsed.path == "/api/state":
            qs = urllib.parse.parse_qs(parsed.query)
            try:
                since_lv = int(qs.get("lv", ["0"])[0])
            except Exception:
                since_lv = 0
            payload = json.dumps(HUD_STATE.snapshot(since_lv=since_lv)).encode("utf-8")
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/command":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length).decode("utf-8", "ignore")
                body = json.loads(raw) if raw else {}
                query = str(body.get("query", "")).strip()
                if not query:
                    self.send_response(400)
                    self._send_cors_headers()
                    self.end_headers()
                    self.wfile.write(b'{"error":"query required"}')
                    return
                reply = process_command(query, speak_aloud=bool(body.get("speak", False)))
                resp_bytes = json.dumps({"reply": reply, "state": HUD_STATE.snapshot()}).encode("utf-8")
                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(resp_bytes)
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()


def _market_refresh_loop():
    """Background daemon that refreshes live Yahoo Finance stock quotes for the HUD."""
    while not HUD_STATE.should_exit:
        try:
            watchlist = jarvis_market.get_market_watchlist()
            if watchlist:
                HUD_STATE.update_stocks(watchlist)
        except Exception:
            pass
        for _ in range(45):
            if HUD_STATE.should_exit:
                return
            time.sleep(1.0)


def start_hud_server(preferred_port=8765, open_browser=False):
    """
    Starts the local HUD HTTP server bound strictly to 127.0.0.1.
    Automatically tries ports 8765..8775 if 8765 is already occupied.
    """
    server = None
    bound_port = preferred_port
    for candidate in range(preferred_port, preferred_port + 11):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", candidate), HudRequestHandler)
            bound_port = candidate
            break
        except OSError:
            continue

    if server is None:
        HUD_STATE.add_chat("sys", "Notice: Local HUD HTTP server could not bind to 127.0.0.1:8765-8775.")
        return None, None

    HUD_STATE.hud_port = bound_port
    url = f"http://127.0.0.1:{bound_port}"
    HUD_STATE.add_chat("sys", f"ORNION Neural Interface HUD live at {url}")

    srv_thread = threading.Thread(target=server.serve_forever, daemon=True)
    srv_thread.start()

    mkt_thread = threading.Thread(target=_market_refresh_loop, daemon=True)
    mkt_thread.start()

    if open_browser:
        try:
            webbrowser.open(url, new=2)
        except Exception:
            pass

    return server, url


# ==============================================================================
# 3. SPEECH SYNTHESIS & COMMAND EXECUTION PIPELINE
# ==============================================================================

def speak(text):
    """Speaks output aloud using native macOS speech or pyttsx3 fallback, and updates HUD state."""
    if not text:
        return
    print(f"\n[ORNION]: {text}\n")
    HUD_STATE.set_stage("speaking", note="ORNION responding...", tool_active=False)

    if os.environ.get("ORNION_MUTE_TTS") == "1" or os.environ.get("JARVIS_MUTE_TTS") == "1":
        HUD_STATE.set_stage("listening", note="Listening for voice commands...")
        return

    if sys.platform == "darwin" and shutil.which("say"):
        try:
            subprocess.run(["say", "-v", "Samantha", text], timeout=25)
        except Exception:
            pass
    else:
        try:
            import pyttsx3
            engine = pyttsx3.init()
            engine.say(text)
            engine.runAndWait()
        except Exception:
            pass

    HUD_STATE.set_stage("listening", note="Listening for voice commands...")


def process_command(raw_query, rec_duration=0.2, speak_aloud=True):
    """Processes a recognized voice or text query and updates all HUD telemetry stages."""
    q_raw = (raw_query or "").strip()
    if not q_raw:
        return ""

    HUD_STATE.record_recognition(q_raw, rec_duration)
    HUD_STATE.add_chat("you", q_raw)

    q_clean = q_raw.lower()
    # Support "ornion" wake word (and legacy "jarvis" wake word for compatibility)
    for wake_word in ("ornion", "jarvis"):
        if wake_word in q_clean:
            q_clean = q_clean.replace(wake_word, "").strip(" ,.!?")

    if not q_clean:
        reply = "ORNION is online and listening."
        HUD_STATE.add_chat("jarvis", reply)
        if speak_aloud:
            speak(reply)
        return reply

    if q_clean in ("close workplace", "exit", "quit", "shutdown", "shut down ornion", "shut down jarvis"):
        reply = "Shutting down ORNION Neural Interface. Goodbye!"
        HUD_STATE.add_chat("jarvis", reply)
        HUD_STATE.set_stage("off", note="System offline")
        HUD_STATE.should_exit = True
        if speak_aloud:
            speak(reply)
        return reply

    if q_clean in ("open workplace", "open hud", "show hud", "launch hud"):
        hud_url = f"http://127.0.0.1:{HUD_STATE.hud_port}"
        jarvis_actions.open_url(hud_url)
        reply = f"Opening ORNION Neural Interface HUD at {hud_url}."
        HUD_STATE.add_chat("jarvis", reply)
        if speak_aloud:
            speak(reply)
        return reply

    HUD_STATE.set_stage("thinking", note=f"Processing: \"{q_clean}\"", tool_active=True)
    t0 = time.time()
    response = jarvis_brain.think(q_clean)
    think_elapsed = time.time() - t0

    HUD_STATE.record_thinking(think_elapsed)
    HUD_STATE.add_chat("jarvis", response)

    if speak_aloud:
        speak(response)
    else:
        HUD_STATE.set_stage("listening", note="Ready")

    return response


def ensure_first_run_api_key():
    """
    On first interactive run, if no Groq API key is present, prompts the user
    to paste their free Groq key or press Enter to use Offline Local Mode.
    """
    if (
        os.environ.get("GROQ_API_KEY")
        or os.path.exists(jarvis_brain.KEYFILE)
        or os.path.exists(jarvis_brain.LEGACY_KEYFILE)
    ):
        return
    if not sys.stdin or not sys.stdin.isatty() or "--no-prompt" in sys.argv:
        return
    print("\n" + "-" * 60)
    print("  ORNION SETUP: FREE GROQ CLOUD API KEY (OPTIONAL)")
    print("  Get a free key at: https://console.groq.com/keys")
    print("  Press Enter to skip and run in Local Action Mode.")
    print("-" * 60)
    try:
        entered = input("Paste Groq API Key (or press Enter to skip): ").strip()
        if entered:
            os.makedirs(os.path.dirname(jarvis_brain.KEYFILE), exist_ok=True)
            with open(jarvis_brain.KEYFILE, "w", encoding="utf-8") as f:
                f.write(entered)
            print(f"[OK] Saved API key to {jarvis_brain.KEYFILE}\n")
        else:
            print("[OK] Continuing in Local Action Mode.\n")
    except (EOFError, KeyboardInterrupt):
        print("\n[OK] Continuing in Local Action Mode.\n")


def _console_input_loop():
    """Fallback console loop when no microphone hardware is available."""
    HUD_STATE.set_stage("listening", note="Console text input mode (microphone unavailable)")
    HUD_STATE.add_chat("sys", "Microphone unavailable — switched to interactive text console mode.")
    while not HUD_STATE.should_exit:
        try:
            user_input = input("You: ")
            if user_input.strip():
                process_command(user_input.strip(), rec_duration=0.1, speak_aloud=True)
        except (KeyboardInterrupt, EOFError):
            print("\nShutting down ORNION. Goodbye!")
            HUD_STATE.set_stage("off", note="Offline")
            break


def listen_loop(open_browser=False):
    ensure_first_run_api_key()
    server, hud_url = start_hud_server(preferred_port=8765, open_browser=open_browser)

    print("\n" + "=" * 64)
    print("  ORNION AI IS ONLINE — PERSONAL AI ASSISTANT")
    print("  Created and developed by Praneeth Thota")
    if hud_url:
        print(f"  ORNION Neural Interface HUD: {hud_url}")
    print("  Say or type commands like:")
    print("    - 'Ornion, open VS Code'")
    print("    - 'Play lofi on YouTube'")
    print("    - 'Stock market report' / 'Should I buy Reliance?'")
    print("    - 'Send WhatsApp to Pallavi saying hello'")
    print("    - 'Check my unread emails'")
    print("=" * 64 + "\n")

    if sr is None:
        print("SpeechRecognition package not installed. Falling back to text console mode.")
        _console_input_loop()
        if server:
            server.shutdown()
        return

    recognizer = sr.Recognizer()
    recognizer.dynamic_energy_threshold = True
    recognizer.pause_threshold = 0.8

    try:
        mic = sr.Microphone()
        with mic as source:
            HUD_STATE.set_stage("starting", note="Calibrating ambient microphone noise...")
            recognizer.adjust_for_ambient_noise(source, duration=1.0)
    except Exception as e:
        print(f"Error accessing microphone: {e}")
        print("Falling back to text console input mode.")
        _console_input_loop()
        if server:
            server.shutdown()
        return

    HUD_STATE.set_stage("listening", note="Listening on microphone...")

    while not HUD_STATE.should_exit:
        try:
            with mic as source:
                HUD_STATE.set_stage("listening", note="Listening on microphone...")
                print("Listening... ", end="", flush=True)
                audio = recognizer.listen(source, timeout=10, phrase_time_limit=8)

            try:
                raw_pcm = audio.get_raw_data(convert_rate=16000, convert_width=2)
                HUD_STATE.push_mic_samples(_extract_pcm_envelope(raw_pcm))
            except Exception:
                pass

            HUD_STATE.set_stage("recognizing", note="Transcribing speech audio...")
            print("Processing... ", end="", flush=True)
            t_rec_start = time.time()
            query = recognizer.recognize_google(audio).strip()
            rec_dur = time.time() - t_rec_start
            print(f"\nYou said: \"{query}\"")

            process_command(query, rec_duration=rec_dur, speak_aloud=True)

        except sr.WaitTimeoutError:
            continue
        except sr.UnknownValueError:
            HUD_STATE.set_stage("listening", note="Listening on microphone...")
            continue
        except KeyboardInterrupt:
            print("\nShutting down ORNION. Goodbye!")
            HUD_STATE.set_stage("off", note="Offline")
            break
        except Exception as e:
            print(f"\n[Notice]: {e}")
            HUD_STATE.set_stage("listening", note=f"Notice: {e}")
            time.sleep(0.5)

    if server:
        server.shutdown()


if __name__ == "__main__":
    auto_open = "--open-hud" in sys.argv
    listen_loop(open_browser=auto_open)
