# ⚡ ORNION — Personal AI Assistant

**Created and developed by Praneeth Thota**  
*Personal AI Assistant and Automation Platform*

> **A voice-and-text-controlled Personal AI Assistant for Windows, macOS, and Linux.**  
> Features desktop app launching, YouTube & Google search automation, WhatsApp Web message drafting, unread email briefings, stock market technical analysis (SMA Buy/Sell signals), rate-limit cooldown fallback, and the 3D **ORNION Neural Interface HUD**!

---

## 🚀 Quick Start

### On Windows (Primary Development Environment):
Double-click `install.bat` or run in Command Prompt:
```cmd
install.bat
```

### On macOS / Linux:
```bash
chmod +x install.sh
./install.sh
```

### Start ORNION:
```bash
python jarvis_voice.py
```
*(Module filenames are retained for backward script and import compatibility).*

---

## 🎙️ Voice & Text Commands Cheat-Sheet

| What You Say / Type | What ORNION Does |
| :--- | :--- |
| `"Ornion, open VS Code"` | Launches Visual Studio Code (or target desktop app) |
| `"Play lofi on YouTube"` | Opens YouTube search/playback in your default browser |
| `"Stock market report"` | Analyzes Nifty 50, Sensex, Reliance, Nvidia & Bitcoin |
| `"Should I buy Reliance?"` | Calculates 5/15 moving averages and gives Buy/Sell/Hold signal |
| `"Check my unread emails"` | Reads your local mail cache and provides a spoken briefing |
| `"Send WhatsApp to Pallavi saying hello"` | Opens WhatsApp Web with your message pre-filled |
| `"Volume up" / "Mute"` | Adjusts your system audio volume |

---

## 🛡️ Hybrid Cloud + Local Fallback
When cloud LLM endpoints hit rate limits (HTTP 429) or when no cloud API key is configured, ORNION's **Rate-Limit Cooldown & Local Action Engine**:
- Parses retry-after cooldown durations when HTTP 429 occurs.
- Routes deterministic commands (time, date, apps, volume, WhatsApp URL, YouTube URL, cached mail brief, market chart queries) to local Python execution.

---

## 🌐 ORNION Neural Interface HUD
When `python jarvis_voice.py` is running, open **`http://127.0.0.1:8765`** (or open `jarvis_workplace.html`) in your browser to view the 3D wireframe globe, reactor core, live voice frequency oscilloscope, and real-time market tickers.

---

**Project:** ORNION — Personal AI Assistant  
**Creator / Author:** Praneeth Thota
