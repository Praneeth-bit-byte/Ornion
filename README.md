# ORNION — Personal AI Assistant

**Product Name:** ORNION  
**Product Description:** Personal AI Assistant  
**Creator / Author / Project Owner:** Praneeth Thota  
**Category:** Personal AI Assistant and Automation Platform  
**Primary Development Environment:** Windows (with cross-platform support for macOS and Linux)

---

## 1. Project Overview & Purpose

**ORNION** is a voice-and-text-driven Personal AI Assistant and Automation Platform created and developed by **Praneeth Thota**. It combines a web and desktop **ORNION Neural Interface HUD** with deterministic local command execution, live stock market technical analysis, browser automation, and cloud AI reasoning with automatic rate-limit cooldown fallback.

---

## 2. Key Features & Supported Platforms

- **ORNION Neural Interface HUD**: 3D wireframe globe, animated reactor core, 4-tier real-time voice frequency oscilloscope, and 5-stage neural pipeline (`MIC` › `EAR` › `MIND` › `HANDS` › `VOICE`).
- **Voice & Text Command Processing**: Supports continuous or push-to-talk speech recognition (Web Speech API in browser; `SpeechRecognition` + `PyAudio` on desktop) alongside an interactive text command dock and spoken TTS output.
- **Market Intelligence Scanner**: Connects to Yahoo Finance chart feeds for Indian indices/bluechips (`Nifty 50`, `Sensex`, `Reliance`, `TCS`, `Infosys`, `HDFC Bank`), US tech (`Nvidia`, `Apple`), and crypto (`Bitcoin`) to compute 5-day momentum and 5-period vs. 15-period SMA crossover signals (`STRONG BUY`, `BUY / ACCUMULATE`, `HOLD`, `SELL / TAKE PROFIT`, `STRONG SELL`).
- **Browser & Desktop Automation**:
  - Pre-fills WhatsApp Web messages via `webbrowser.open()`.
  - Launches YouTube searches, Google queries, and local desktop applications (`VS Code`, `Chrome`, `Notepad`, `Calculator`, `Terminal`, etc.).
  - Reads local unread email briefing caches (`~/.ornion/mail_cache.txt`).
  - Adjusts system audio volume across Windows (PowerShell `WScript.Shell`), macOS (`osascript`), and Linux (`pactl`/`amixer`).
- **Rate-Limit Cooldown Fallback**: Detects cloud API rate limits (HTTP 429), parses retry-after cooldown durations, and routes deterministic commands to local execution so the assistant remains responsive during API cooldowns.
- **Supported Platforms**:
  - **Windows 10 / 11 (Primary Development Environment)**
  - **macOS 10.14+**
  - **Linux (Ubuntu, Debian, Fedora)**

---

## 3. Technology Stack

- **Frontend Web & HUD**: React 19, TypeScript, Vite, Tailwind CSS, HTML5 Canvas 2D/3D projection, Web Speech API, Web Audio API (`AnalyserNode`), Lucide Icons.
- **Web Backend**: Node.js, Express, `@google/genai` SDK (server-side AI reasoning proxy and market feed aggregator).
- **Desktop Assistant Engine**: Python 3.10+, `openai` SDK (configured for Groq API endpoints), `SpeechRecognition`, `pyttsx3` / `PyAudio`, `psutil`, `certifi`, and Python's standard `http.server` (`ThreadingHTTPServer` bound to `127.0.0.1:8765`).

---

## 4. Installation & Startup Instructions

### A. Web Application (Node.js / Vite / Express)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables in `.env` (see `.env.example`):
   ```env
   GEMINI_API_KEY="YOUR_API_KEY"
   ```
3. Start the development server on port `3000`:
   ```bash
   npm run dev
   ```

### B. Desktop Assistant Package (Python — Windows, macOS, Linux)

1. **On Windows (Primary Environment)**:
   Double-click `install.bat` or run in Command Prompt:
   ```cmd
   install.bat
   ```
2. **On macOS / Linux**:
   ```bash
   chmod +x install.sh
   ./install.sh
   ```
3. **Start ORNION Desktop Voice & Local HUD Server**:
   ```bash
   python jarvis_voice.py
   ```
   *(Note: Module filenames such as `jarvis_voice.py`, `jarvis_brain.py`, `jarvis_actions.py`, and `jarvis_market.py` are retained for backward script and import compatibility).*
4. **Open the Local Neural Interface HUD**:
   Navigate to `http://127.0.0.1:8765` in your browser or open `jarvis_workplace.html`.

---

## 5. Configuration & API-Key Setup

- **Desktop Cloud AI (Groq API)**:
  - Obtain an API key from [console.groq.com/keys](https://console.groq.com/keys).
  - Set the `GROQ_API_KEY` environment variable or save the key in `~/.ornion/free.key` (legacy path `~/.openjarvis/free.key` is also supported).
  - On first interactive launch, the desktop runner prompts for your key; press `Enter` to skip and use local deterministic commands only.
- **Web Application Cloud AI**:
  - Set `GEMINI_API_KEY` on the server environment. Never hardcode API keys in source files or client bundles.

---

## 6. Security & Privacy Considerations

- **Localhost-Only Desktop HUD Binding**: The desktop HTTP telemetry server in `jarvis_voice.py` binds strictly to `127.0.0.1:8765` (with automatic local port fallback to `8766–8775`) so it is not exposed to external network interfaces.
- **Zero Hardcoded Secrets**: API keys are loaded strictly from environment variables or user-local configuration files (`~/.ornion/free.key`) outside the repository.
- **Voice Recognition Privacy**: Browser voice recognition uses the browser's native Web Speech API implementation, and desktop speech recognition uses `recognizer.recognize_google()` via `SpeechRecognition`, which transmits captured audio snippets to Google's speech recognition service when microphone listening is active.

---

## 7. Known Limitations & Troubleshooting

- **PyAudio on Windows**: On newer Python versions (e.g., Python 3.12+ on Windows), `pip install pyaudio` may fail if C++ build tools are missing. When `PyAudio` or a physical microphone is unavailable, ORNION automatically falls back to interactive text console mode while keeping TTS (`pyttsx3`) and the local `127.0.0.1:8765` HUD server active.
- **WhatsApp Web Delivery**: WhatsApp automation opens `https://web.whatsapp.com/send?text=...` in your default browser with the message pre-filled; final recipient selection and pressing Send occur in the browser tab.
- **Offline Scope**: Deterministic commands (time/date, app launching, volume control, cached email briefing) operate locally without cloud LLM calls, whereas open-ended natural-language questions, live Yahoo Finance quotes, and cloud speech recognition require internet connectivity.

---

## 8. Authorship, Attribution & Third-Party Notices

- **Project Creator & Author**: **Praneeth Thota**
- **Project Name**: **ORNION — Personal AI Assistant**
- **Repository**: Configure your Git remote URL when pushing to GitHub (`git remote add origin <your-repo-url>`).
- **License Note**: Application source files include `SPDX-License-Identifier: Apache-2.0` headers and open-source distribution notes. Please review and confirm your preferred `LICENSE` file before publishing to a public repository.
- **Third-Party Components & Attribution**:
  Project-level architecture, integration, and customization are authored by **Praneeth Thota**. Third-party libraries, SDKs, and external services remain the property of their respective authors and license holders:
  - React & Vite (MIT License)
  - Express & Lucide Icons (MIT License)
  - `@google/genai` SDK (Apache-2.0 License)
  - Python `openai` SDK (Apache-2.0 License), `SpeechRecognition` (BSD License), `psutil` (BSD License), `pyttsx3` (MPL-2.0 / MIT)
  - Groq Cloud API and Yahoo Finance chart feeds (subject to their respective API terms of service).
