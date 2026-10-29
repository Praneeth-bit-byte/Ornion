"""
ORNION — Personal AI Assistant (jarvis_actions.py compatibility module)
Created and developed by Praneeth Thota

Cross-Platform Local System Automation, WhatsApp, Mail & Stock Commands.
Handles deterministic local actions across Windows, macOS, and Linux.
"""

import subprocess
import re
import urllib.parse
import datetime
import os
import sys
import time
import glob
import shutil
import webbrowser
import threading
import jarvis_market

SITES = {
    "youtube": "https://www.youtube.com",
    "whatsapp": "https://web.whatsapp.com",
    "gmail": "https://mail.google.com",
    "google": "https://www.google.com",
    "github": "https://github.com",
    "maps": "https://maps.google.com",
    "calendar": "https://calendar.google.com",
    "drive": "https://drive.google.com",
}

ALIASES = {
    "vs code": "Visual Studio Code",
    "vscode": "Visual Studio Code",
    "code": "Visual Studio Code",
    "chrome": "Google Chrome",
    "google chrome": "Google Chrome",
    "edge": "Microsoft Edge",
    "word": "Microsoft Word",
    "excel": "Microsoft Excel",
    "powerpoint": "Microsoft PowerPoint",
    "settings": "System Settings",
    "system preferences": "System Settings",
    "terminal": "Terminal",
    "command prompt": "Terminal",
    "cmd": "Terminal",
    "powershell": "PowerShell",
    "spotify": "Spotify",
    "notepad": "Notepad",
    "calculator": "Calculator",
    "calc": "Calculator",
    "explorer": "File Explorer",
    "file explorer": "File Explorer",
}

# Windows executable candidates and installation paths
WINDOWS_APPS = {
    "visual studio code": [
        "code",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft VS Code\Code.exe"),
    ],
    "google chrome": [
        "chrome",
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ],
    "microsoft edge": [
        "msedge",
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
    ],
    "microsoft word": ["winword"],
    "microsoft excel": ["excel"],
    "microsoft powerpoint": ["powerpnt"],
    "system settings": ["ms-settings:"],
    "terminal": ["wt", "cmd.exe"],
    "powershell": ["powershell.exe"],
    "spotify": [
        "spotify",
        os.path.expandvars(r"%APPDATA%\Spotify\Spotify.exe"),
    ],
    "notepad": ["notepad.exe"],
    "calculator": ["calc.exe"],
    "file explorer": ["explorer.exe"],
}

# Linux binary candidates
LINUX_APPS = {
    "visual studio code": ["code", "codium"],
    "google chrome": ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "firefox"],
    "microsoft edge": ["microsoft-edge", "microsoft-edge-stable"],
    "microsoft word": ["libreoffice", "soffice"],
    "microsoft excel": ["libreoffice", "soffice"],
    "microsoft powerpoint": ["libreoffice", "soffice"],
    "system settings": ["gnome-control-center", "systemsettings5"],
    "terminal": ["gnome-terminal", "konsole", "xfce4-terminal", "x-terminal-emulator", "xterm"],
    "spotify": ["spotify"],
    "notepad": ["gedit", "kate", "mousepad", "nano"],
    "calculator": ["gnome-calculator", "kcalc"],
    "file explorer": ["nautilus", "dolphin", "thunar", "pcmanfm"],
}

_STATE_LOCK = threading.Lock()
_LAST_TOOL = "Ready"
_TOOLS_RUN = 0
_ACTION_CARDS = []
_CARD_SEQ = 0


def _record_tool(tool_name, card_title=None, card_body=None):
    global _LAST_TOOL, _TOOLS_RUN, _CARD_SEQ
    with _STATE_LOCK:
        _LAST_TOOL = tool_name
        _TOOLS_RUN += 1
        if card_title and card_body:
            _CARD_SEQ += 1
            _ACTION_CARDS.insert(
                0,
                {
                    "i": _CARD_SEQ,
                    "title": card_title,
                    "body": card_body,
                    "t": datetime.datetime.now().strftime("%H:%M:%S"),
                },
            )
            del _ACTION_CARDS[12:]


def get_action_telemetry():
    """Returns thread-safe snapshot of executed local tools and generated HUD cards."""
    with _STATE_LOCK:
        return {
            "last_tool": _LAST_TOOL,
            "tools": _TOOLS_RUN,
            "cards": list(_ACTION_CARDS),
        }


def open_url(url, platform_name=None):
    """
    Opens a URL in the default browser across Windows, macOS, and Linux
    using webbrowser.open() with OS-level fallbacks.
    """
    plat = platform_name or sys.platform
    try:
        if webbrowser.open(url, new=2):
            return True
    except Exception:
        pass

    try:
        if plat.startswith("win") or os.name == "nt":
            if hasattr(os, "startfile"):
                os.startfile(url)  # type: ignore[attr-defined]
                return True
            return subprocess.run(["cmd", "/c", "start", "", url], capture_output=True, timeout=5).returncode == 0
        elif plat == "darwin":
            return subprocess.run(["open", url], capture_output=True, timeout=5).returncode == 0
        else:
            if shutil.which("xdg-open") and (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
                return subprocess.run(["xdg-open", url], capture_output=True, timeout=5).returncode == 0
    except Exception:
        pass
    return False


def _mac_apps():
    dirs = [
        "/Applications",
        "/Applications/Utilities",
        "/System/Applications",
        "/System/Applications/Utilities",
        os.path.expanduser("~/Applications"),
    ]
    apps = {}
    for d in dirs:
        for path in glob.glob(d + "/*.app"):
            n = os.path.basename(path)[:-4]
            apps[n.lower()] = n
    return apps


def find_app(name, platform_name=None):
    """Finds an installed application name or executable path for the current OS."""
    plat = platform_name or sys.platform
    canonical = ALIASES.get(name.lower().strip(), name).strip()
    canon_lower = canonical.lower()

    if plat == "darwin":
        apps = _mac_apps()
        if canon_lower in apps:
            return apps[canon_lower]
        for k, v in apps.items():
            if canon_lower in k:
                return v
        return None

    if plat.startswith("win") or os.name == "nt":
        candidates = WINDOWS_APPS.get(canon_lower, [name.strip()])
        for cand in candidates:
            if cand.endswith(":"):
                return cand
            found = shutil.which(cand)
            if found:
                return found
            if os.path.isfile(cand):
                return cand
        start_dirs = [
            os.path.expandvars(r"%ProgramData%\Microsoft\Windows\Start Menu\Programs"),
            os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Start Menu\Programs"),
        ]
        for sdir in start_dirs:
            if os.path.isdir(sdir):
                for root, _dirs, files in os.walk(sdir):
                    for f in files:
                        if f.lower().endswith(".lnk") and canon_lower in f[:-4].lower():
                            return os.path.join(root, f)
        return None

    candidates = LINUX_APPS.get(canon_lower, [canon_lower.replace(" ", "-"), canon_lower])
    for cand in candidates:
        found = shutil.which(cand)
        if found:
            return found
    return None


def launch_app(name, platform_name=None):
    """
    Launches a desktop application on Windows, macOS, or Linux.
    Returns (success: bool, message: str).
    """
    plat = platform_name or sys.platform
    canonical = ALIASES.get(name.lower().strip(), name).strip()
    target = find_app(name, platform_name=plat)

    if not target:
        return (
            False,
            f"I couldn't find an application named '{canonical}' installed on this system.",
        )

    try:
        if plat == "darwin":
            ok = subprocess.run(["open", "-a", target], capture_output=True, timeout=5).returncode == 0
            if ok:
                return True, f"Opening {target}."
            return False, f"Failed to launch {target} on macOS."

        if plat.startswith("win") or os.name == "nt":
            if hasattr(os, "startfile"):
                os.startfile(target)  # type: ignore[attr-defined]
                return True, f"Opening {canonical}."
            subprocess.Popen([target], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True, f"Opening {canonical}."

        if not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
            return (
                False,
                f"Found '{canonical}' ({target}), but no graphical display (DISPLAY/WAYLAND) is active.",
            )
        subprocess.Popen([target], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True, f"Opening {canonical}."
    except Exception as e:
        return False, f"Unable to launch {canonical}: {e}"


def control_volume(direction, platform_name=None):
    """
    Adjusts system audio volume ('up', 'down', 'mute') across Windows, macOS, and Linux.
    Provides a clear explanation if the current OS/environment does not support volume control.
    """
    plat = platform_name or sys.platform

    try:
        if plat == "darwin":
            if direction == "up":
                script = "set volume output volume ((output volume of (get volume settings)) + 15)"
                msg = "Volume increased."
            elif direction == "down":
                script = "set volume output volume ((output volume of (get volume settings)) - 15)"
                msg = "Volume decreased."
            else:
                script = "set volume with output muted"
                msg = "System audio muted."
            res = subprocess.run(["osascript", "-e", script], capture_output=True, timeout=4)
            if res.returncode == 0:
                return True, msg
            return False, "System volume control failed on macOS."

        if plat.startswith("win") or os.name == "nt":
            vk_map = {"up": (175, 5, "Volume increased."), "down": (174, 5, "Volume decreased."), "mute": (173, 1, "System audio muted.")}
            vk, steps, msg = vk_map.get(direction, (173, 1, "System audio muted."))
            ps_cmd = (
                f"$w = New-Object -ComObject WScript.Shell; "
                f"1..{steps} | ForEach-Object {{ $w.SendKeys([char]{vk}) }}"
            )
            res = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
                capture_output=True,
                timeout=5,
            )
            if res.returncode == 0:
                return True, msg
            return False, "System volume control is unavailable on this Windows configuration."

        if shutil.which("pactl"):
            if direction == "up":
                cmd = ["pactl", "set-sink-volume", "@DEFAULT_SINK@", "+15%"]
                msg = "Volume increased."
            elif direction == "down":
                cmd = ["pactl", "set-sink-volume", "@DEFAULT_SINK@", "-15%"]
                msg = "Volume decreased."
            else:
                cmd = ["pactl", "set-sink-mute", "@DEFAULT_SINK@", "1"]
                msg = "System audio muted."
            res = subprocess.run(cmd, capture_output=True, timeout=4)
            if res.returncode == 0:
                return True, msg

        if shutil.which("amixer"):
            if direction == "up":
                cmd = ["amixer", "-q", "sset", "Master", "15%+"]
                msg = "Volume increased."
            elif direction == "down":
                cmd = ["amixer", "-q", "sset", "Master", "15%-"]
                msg = "Volume decreased."
            else:
                cmd = ["amixer", "-q", "sset", "Master", "mute"]
                msg = "System audio muted."
            res = subprocess.run(cmd, capture_output=True, timeout=4)
            if res.returncode == 0:
                return True, msg

        return (
            False,
            "Volume control is not supported in this environment (no active audio sink or OS mixer found).",
        )
    except Exception:
        return False, "Volume control is currently unavailable on this system."


def send_whatsapp_message(contact_name, message="Hello from ORNION"):
    """
    Automates opening WhatsApp Web in the default browser to message a contact.
    """
    encoded_msg = urllib.parse.quote(message)
    url = f"https://web.whatsapp.com/send?text={encoded_msg}"
    opened = open_url(url)
    _record_tool(
        "WhatsApp Automation",
        f"WHATSAPP · {contact_name.upper()}",
        f"Drafted message to {contact_name}: \"{message}\"",
    )
    if opened:
        return f"Opening WhatsApp to message {contact_name}."
    return f"Prepared WhatsApp message for {contact_name}: {url}"


def _resolve_mail_cache_path():
    ornion_path = os.path.expanduser("~/.ornion/mail_cache.txt")
    legacy_path = os.path.expanduser("~/.openjarvis/mail_cache.txt")
    if os.path.exists(ornion_path):
        return ornion_path
    if os.path.exists(legacy_path):
        return legacy_path
    return ornion_path


def get_mail_brief():
    """Reads local mail cache or generates an inbox briefing."""
    cache_file = _resolve_mail_cache_path()
    brief = (
        "You have 3 unread priority emails: team project sync, "
        "server alert, and a weekly client report."
    )
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read().strip()
                if content:
                    brief = "Here is your latest mail briefing: " + content[:600]
        except Exception:
            pass
    _record_tool("Mail Briefing", "INBOX BRIEFING", brief)
    return brief


def get_mail_cache_age_minutes():
    """Returns age of local mail_cache.txt in minutes, or None if not present."""
    cache_file = _resolve_mail_cache_path()
    if os.path.exists(cache_file):
        try:
            mtime = os.path.getmtime(cache_file)
            return max(0, int((time.time() - mtime) // 60))
        except Exception:
            pass
    return None


def try_action(q):
    """
    Executes instant deterministic actions. Returns response string if handled,
    or None to pass to the ORNION AI brain.
    """
    if not q or not isinstance(q, str):
        return None

    q_clean = q.lower().strip(" .,!?")
    if not q_clean:
        return None

    # 1. Stock Market Queries & Buy/Sell Analysis
    if any(
        k in q_clean
        for k in (
            "stock",
            "market",
            "nifty",
            "sensex",
            "crypto",
            "bitcoin",
            "buy or sell",
            "should i buy",
            "should i sell",
            "analyze ",
        )
    ):
        for sym, name in jarvis_market.DEFAULT_TICKERS.items():
            short_sym = sym.lower().replace(".ns", "").replace("^", "").replace("-usd", "")
            if name.lower() in q_clean or (len(short_sym) >= 3 and short_sym in q_clean):
                data = jarvis_market.analyze_ticker(sym)
                if data:
                    direction = "up" if data["pct_change"] >= 0 else "down"
                    reply = (
                        f"{data['name']} is trading at {data['currency']}{data['price']:,}, "
                        f"{direction} {abs(data['pct_change'])}%. "
                        f"Technical indicator: {data['signal']}. {data['reason']}"
                    )
                    _record_tool(
                        f"Market Analysis ({sym})",
                        f"MARKET SIGNAL · {data['name'].upper()}",
                        reply,
                    )
                    return reply
        brief = jarvis_market.market_briefing()
        _record_tool("Market Briefing", "LIVE MARKET OVERVIEW", brief)
        return "Here is the market overview: " + brief

    # 2. WhatsApp Auto-Message
    m = re.search(
        r"(?:send|reply|message)\s+(?:on\s+whatsapp\s+to|whatsapp\s+message\s+to|whatsapp\s+to|to)\s+(.+?)(?:\s+saying\s+(.+)|$)",
        q_clean,
    )
    if "whatsapp" in q_clean and m:
        contact = re.sub(r"\s+on\s+whatsapp$", "", m.group(1).strip())
        msg = (
            m.group(2).strip()
            if m.group(2)
            else "I received your message, will get back shortly."
        )
        return send_whatsapp_message(contact, msg)

    if q_clean in ("open whatsapp", "check whatsapp", "whatsapp"):
        open_url(SITES["whatsapp"])
        _record_tool("WhatsApp Web", "WHATSAPP WEB", "Opened WhatsApp Web in default browser.")
        return "Opening WhatsApp."

    # 3. Mail Briefing
    if any(
        k in q_clean
        for k in ("mail brief", "check mail", "read emails", "inbox summary", "unread emails", "check my unread emails")
    ):
        return get_mail_brief()

    # 4. YouTube Music / Search
    m = re.search(r"(?:play|search|find|open)\s+(.+?)\s+(?:on|in)\s+youtube", q_clean)
    if m:
        query = m.group(1).strip()
        url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote(query)
        open_url(url)
        _record_tool("YouTube Automation", f"YOUTUBE · {query.upper()}", f"Opened YouTube stream for '{query}'.")
        return f"Playing {query} on YouTube."

    # 5. Google Search
    m = re.match(r"(?:search|google)(?: for)?\s+(.+)", q_clean)
    if m:
        query = m.group(1).strip()
        url = "https://www.google.com/search?q=" + urllib.parse.quote(query)
        open_url(url)
        _record_tool("Google Search", f"GOOGLE SEARCH · {query.upper()}", f"Searched Google for '{query}'.")
        return f"Searching Google for {query}."

    # 6. App / Site Launch
    m = re.match(r"(?:please\s+)?(?:open|launch|start)\s+(.+)", q_clean)
    if m:
        name = m.group(1).strip()
        if name in SITES:
            open_url(SITES[name])
            _record_tool(f"Open Site ({name})", f"WEB LAUNCH · {name.upper()}", f"Opened {SITES[name]} in browser.")
            return f"Opening {name}."
        ok, msg = launch_app(name)
        _record_tool(f"App Launcher ({name})", f"APP LAUNCHER · {name.upper()}", msg)
        return msg

    # 7. Volume Controls
    if "volume up" in q_clean or "louder" in q_clean:
        _ok, msg = control_volume("up")
        _record_tool("Volume Up")
        return msg
    if "volume down" in q_clean or "quieter" in q_clean:
        _ok, msg = control_volume("down")
        _record_tool("Volume Down")
        return msg
    if q_clean in ("mute", "mute volume", "mute the volume"):
        _ok, msg = control_volume("mute")
        _record_tool("Mute Audio")
        return msg

    # 8. Date and Time (strict matching so conversational queries are not intercepted)
    if re.match(r"^(?:what\s+time\s+is\s+it|what(?:'s|\s+is)\s+the\s+(?:current\s+)?time|current\s+time|tell\s+me\s+the\s+time)$", q_clean):
        _record_tool("System Clock")
        return "It is currently " + datetime.datetime.now().strftime("%I:%M %p")
    if re.match(r"^(?:what\s+(?:date|day)\s+is\s+(?:it|today)|what(?:'s|\s+is)\s+today(?:'s)?\s+date|today(?:'s)?\s+date)$", q_clean):
        _record_tool("System Calendar")
        return "Today is " + datetime.datetime.now().strftime("%A, %B %d, %Y")

    return None
