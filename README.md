# ORNION — Personal AI Assistant

**Created and developed by Praneeth Thota**

- **Project Category:** Personal AI Assistant and Automation Platform
- **Repository:** `https://github.com/Praneeth-bit-byte/Ornion`
- **Primary Development Environment:** Windows 11 (also supports macOS and Linux)
- **AI Provider & Model:** NVIDIA API Catalog — `mistralai/mistral-large-4-1t-a52b` (OpenAI-compatible Chat Completions API)

---

## 1. Overview

**ORNION** is a full-stack Personal AI Assistant and Neural Interface HUD combining conversational reasoning via **NVIDIA Mistral Large 4** with verified tool execution:

1. **Conversational AI Engine (NVIDIA Mistral Large 4):**
   - Server-side integration with `https://integrate.api.nvidia.com/v1/chat/completions` using `mistralai/mistral-large-4-1t-a52b`.
   - Multi-turn conversational memory (tracks recent turns for contextual follow-up questions such as *"What did I just ask you?"*).
   - Request timeouts, bounded retries on 5xx errors, HTTP 401/403/429 handling, and a secret-safe `/api/health` diagnostic endpoint.
2. **Real Tool Execution & Structured Execution Reports:**
   - Every command produces a verified `ExecutionReport` (`intent`, `tool`, `executed`, `status`, `evidence`, and `nextStep`).
   - **YouTube & Music:** Resolves real YouTube video IDs and titles for commands like *"Play lofi music on YouTube"*, *"Play relaxing music"*, and *"Search YouTube for programming tutorials"*, embedding a playable YouTube iframe in the HUD and providing direct watch/search links while respecting browser autoplay policies.
   - **Genuine Gmail Inbox Briefings (OAuth 2.0):** Uses Google Sign-In with the read-only `https://www.googleapis.com/auth/gmail.readonly` scope. Clearly displays when Gmail is disconnected and never fabricates unread messages. Once authorized, retrieves real unread message metadata (`From`, `Subject`, `Date`, `snippet`) from `gmail.googleapis.com`.
   - **Allowlisted Windows Desktop Application Launching:** Launches allowlisted Windows executables (`Notepad`, `Calculator`, `Visual Studio Code`, `Paint`, `File Explorer`, `Task Manager`, `Command Prompt`, `PowerShell`) without arbitrary shell execution and verifies the spawned process PID. Never claims a desktop app opened merely because a web URL was generated.
   - **Live Market Intelligence:** Fetches 5-day 15-minute charts from Yahoo Finance (`^NSEI`, `^BSESN`, `RELIANCE.NS`, `TCS.NS`, `INFY.NS`, `HDFCBANK.NS`, `NVDA`, `AAPL`, `BTC-USD`), computes 5-period and 15-period SMAs, and labels offline estimates honestly if Yahoo Finance is unreachable.

---

## 2. Environment Configuration (`.env`)

Copy `.env.example` to `.env` in the project root and set your NVIDIA API key:

```env
NVIDIA_API_KEY="nvapi-your_actual_key_here"
NVIDIA_MODEL="mistralai/mistral-large-4-1t-a52b"
NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
NVIDIA_TIMEOUT_MS="25000"
APP_URL="http://localhost:3000"
```

- **Security Note:** `.env` is excluded by `.gitignore`. The `NVIDIA_API_KEY` is read exclusively by `server.ts` on the backend and is never bundled into browser code or returned in API responses.

---

## 3. Running & Testing Locally on Windows 11

```powershell
# 1. Install dependencies
npm install

# 2. Start the Express + Vite full-stack server on http://localhost:3000
npm run dev

# 3. Run TypeScript static analysis and production build verification
npm run lint
npm run build
```

---

## 4. Author & Third-Party Attribution

- **Project Creator, Author & Owner:** **Praneeth Thota**
- **Third-Party Libraries & APIs:** NVIDIA API Catalog (`mistralai/mistral-large-4-1t-a52b`), Google Gmail API & Firebase Auth, React, Vite, Express, Tailwind CSS, Lucide Icons, Python `SpeechRecognition`, `pyttsx3`, `psutil`, and Yahoo Finance chart feeds remain the property of their respective owners and are subject to their respective licenses and terms of service.
