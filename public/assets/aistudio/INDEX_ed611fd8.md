# 🚀 ORNION — PERSONAL AI ASSISTANT (Installation & User Guide)

**Product:** ORNION — Personal AI Assistant  
**Creator / Author:** Praneeth Thota  
**Category:** Personal AI Assistant and Automation Platform  
**Primary Development Environment:** Windows 10/11 (also supports macOS & Linux)  

---

## 📦 What's Inside This Package?

Everything you need to run the **ORNION Personal AI Assistant** with:
- ✅ Voice & text automation (open apps, play YouTube media, web search)
- ✅ WhatsApp Web pre-filled message automation
- ✅ Unread email briefing from local cache
- ✅ Live stock market technical analysis + SMA Buy/Sell signals
- ✅ Hybrid cloud AI + local deterministic fallback during API cooldowns
- ✅ 3D **ORNION Neural Interface HUD** (`http://127.0.0.1:8765`)
- ✅ Cross-platform support for Windows, macOS, and Linux

---

## 🎯 Quick Start

### Step 1: System Requirements
- **Python:** 3.10 or newer ([python.org](https://python.org))
- **Optional Groq API Key:** Obtain from [console.groq.com/keys](https://console.groq.com/keys)
- **OS:** Windows 10/11 (Primary), macOS, or Linux

### Step 2: Run ORNION Setup
**On Windows:**
Double-click `install.bat` or open Command Prompt and run:
```cmd
install.bat
```

**On macOS / Linux:**
```bash
chmod +x install.sh
./install.sh
```

### Step 3: Optional Groq API Key
1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Generate an API key
3. Paste it when prompted (or save to `~/.ornion/free.key`)

### Step 4: Launch ORNION
```bash
python jarvis_voice.py
```

### Step 5: Open ORNION Neural Interface HUD
Open `http://127.0.0.1:8765` in your browser (or open `jarvis_workplace.html`).

---

## 🎤 Voice & Text Commands

| Command | What Happens |
| :--- | :--- |
| `"Ornion, open VS Code"` | Launches Visual Studio Code (or target installed desktop app) |
| `"Play lofi on YouTube"` | Opens YouTube search in your default browser |
| `"Stock market report"` | Analyzes Nifty 50, Sensex, Reliance, Nvidia, Bitcoin |
| `"Should I buy Reliance?"` | Checks 5/15 moving averages and gives Buy/Sell/Hold signal |
| `"Check my unread emails"` | Reads local inbox cache and speaks a concise briefing |
| `"Send WhatsApp to Pallavi saying hello"` | Opens WhatsApp Web with your message pre-filled |
| `"Volume up"` / `"Mute"` | Adjusts system audio volume |
| `"What time is it?"` | Tells current time and date |

---

## 📁 File Guide (Compatibility Module Names Retained)

### Core Engine Files
- **`jarvis_brain.py`** — ORNION AI reasoning engine (Groq cloud + local fallback)
- **`jarvis_voice.py`** — Microphone/console listener & local `127.0.0.1:8765` HUD server
- **`jarvis_actions.py`** — Cross-platform local app automation, WhatsApp, mail, and stock actions
- **`jarvis_market.py`** — Live Yahoo Finance integration with SMA Buy/Sell signals

### Configuration & Setup
- **`requirements.txt`** — Python dependencies
- **`install.bat`** — Windows 1-click setup script
- **`install.sh`** — macOS/Linux 1-click setup script

### Documentation & UI
- **`jarvis_workplace.html`** — ORNION Neural Interface 3D HUD
- **`Jarvis_Setup_Guide.pdf`** — Printable installation & user guide
- **`Jarvis_Setup_Guide.html`** — HTML installation & user guide
- **`README.md`** — Quick reference guide
- **`INDEX.md`** — This master index

---

## 🛡️ Hybrid Cloud + Local Cooldown Fallback

1. **Deterministic Check First** → Local commands (time, date, apps, volume, WhatsApp URL, YouTube URL, market charts) execute locally in Python.
2. **Cloud AI Query** → Open-ended queries use Groq Cloud LLM endpoints when configured.
3. **Rate Limit Hit (HTTP 429)?** → ORNION parses the retry-after cooldown duration and falls back to local deterministic command handling during the cooldown window.

---

## 📜 Authorship & Attribution

**ORNION — Personal AI Assistant**  
**Created and developed by Praneeth Thota**

Third-party libraries and external services (Python, OpenAI SDK, Groq API, SpeechRecognition, Yahoo Finance, psutil) remain the property of their respective authors and license holders.
