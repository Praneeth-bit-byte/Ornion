# Jarvis AI Executive Assistant & Holographic Workplace HUD

An interactive, full-stack web implementation of the **Jarvis AI Personal Assistant (v2.0 Executive Edition)** that brings the uploaded Python engine (`jarvis_brain`, `jarvis_actions`, `jarvis_market`, `jarvis_voice`) and the 3D Holographic Workplace HUD into a live, voice-controlled command center—complete with a real-time package status audit and setup inspector.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Package Audit Status Discovery**: Upon inspecting all 11 uploaded files in your Jarvis Setup Package, the core Python modules (`jarvis_brain.py`, `jarvis_actions.py`, `jarvis_market.py`, `jarvis_voice.py`), Windows installer (`install.bat`), dependencies (`requirements.txt`), documentation (`INDEX.md`, `README.md`, `Jarvis_Setup_Guide.pdf/.html`), and HUD (`jarvis_workplace.html`) are intact and well-structured. However, two key gaps were identified and will be resolved automatically in this application:
> 1. **Missing `/api/state` Backend Bridge**: `jarvis_workplace.html` polls `/api/state` every 400ms for live voice telemetry, chat logs, market sparklines, and system vitals, which was not yet wired in the standalone Python scripts. We will build the full live backend server to power this telemetry plus interactive REST endpoints.
> 2. **Missing `install.sh` Script**: `INDEX.md`, `README.md`, and the Setup Guide instruct macOS/Linux users to run `./install.sh`, which was missing from the uploaded bundle (only `install.bat` was present). The application will provide a ready-to-download `install.sh` script alongside a complete Package Status & Diagnostic Audit panel.

- **Confirmed Decision — Primary Application Focus**: Live Holographic Workplace HUD powered by the full backend engine, paired with an integrated Package Status & Setup Inspector.
- **Confirmed Decision — Voice & Audio Engine**: Real browser Web Speech API (`SpeechRecognition`) for continuous or push-to-talk voice commands, Web Audio API (`AnalyserNode`) for the live 4-tier frequency oscilloscope, and `speechSynthesis` for natural spoken responses—supplemented by a text command bar and one-click command triggers.
- **Confirmed Decision — Feature Suite**: Full executive suite featuring live Yahoo Finance market quotes with 5-day/15-day SMA Buy/Sell/Hold signals, WhatsApp Web deep-link message dispatch, interactive executive inbox briefings, YouTube/Google automation launchers, and Hybrid Cloud-to-Local Failover simulation.

---

## 1. Overview & Core Concept

- **What It Does**: Combines the Iron Man Mark VII 3D Holographic HUD with a working full-stack Jarvis reasoning and automation backend. Users can speak directly into their microphone (or click/type commands) to analyze live Indian & US stocks (`Nifty 50`, `Sensex`, `Reliance`, `TCS`, `Infosys`, `HDFC Bank`, `Nvidia`, `Apple`, `Bitcoin`), draft and launch WhatsApp messages, hear 30-second unread email briefings, trigger web searches, and inspect the health status of their desktop Python package.
- **Target Audience / Persona**: Developers, traders, and productivity enthusiasts running or distributing the Jarvis v2.0 Executive Assistant package.
- **Key Value**: Transforms static local scripts into an immediately operable browser workplace while providing a diagnostic audit report, missing macOS/Linux installer generation, and live hybrid failover testing.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Live Voice & Command Execution**: User clicks "Activate Voice Link" (or presses Space / types in the command bar) and says *"Stock market report"*, *"Should I buy Reliance?"*, *"Send WhatsApp to Pallavi saying meeting at 4pm"*, or *"Check my unread emails"*. The Neural Core Pipeline highlights each active stage (`MIC` → `EAR` → `MIND` → `HANDS` → `VOICE`), the 3D Arc Reactor shifts hue dynamically by state, and Jarvis speaks the response aloud.
  2. **Live Market Intelligence & Technical Scanner**: The right-hand Market Intelligence panel streams live quotes, 5-day sparklines, intraday high/low ranges, momentum percentages, and algorithmic `STRONG BUY`, `BUY`, `HOLD`, or `SELL` signals. Clicking any ticker triggers a deep-dive technical breakdown and spoken briefing.
  3. **Executive Briefings, WhatsApp & Action Center**: Displays dynamic cards for unread priority emails (with interactive add/edit cache controls), instant WhatsApp Web message composer & launcher, and quick-action triggers for YouTube playback and Google search.
  4. **Package Status & Diagnostic Audit Modal/View**: A dedicated view inspecting all uploaded package files, verifying dependencies, highlighting the resolved `/api/state` and `install.sh` items, and allowing users to preview or download any script (including the newly generated `install.sh` and original PDF/HTML guides).
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Precision Aerospace & Holographic Telemetry Console inspired by `jarvis_workplace.html` and calibrated against scientific telemetry design standards.
  - *Color Palette & Mood*:
    - **60% Dominant Canvas**: Deep Obsidian Space (`#02060D` to `#070D19`).
    - **30% Structural Surfaces**: Translucent Dark Slate glass panels (`rgba(8, 20, 38, 0.76)`) with crisp `1px` calibrated cyan hairlines (`rgba(56, 189, 248, 0.24)`).
    - **10% Dynamic State & Semantic Accents**: State-reactive primary hue shifting smoothly across `Listening` (Laser Cyan `#00E5FF`), `Recognizing` (Telemetry Amber `#FBBF24`), `Thinking` (Quantum Violet `#A855F7`), and `Speaking` (Emerald `#10B981`), paired with semantic market tones (`#3DFFA2` Bullish / Buy, `#FF5A6E` Bearish / Sell).
  - *Typography & Hierarchy*:
    - **Display & HUD Headers**: `Chakra Petch` or `Outfit` for crisp geometric technical headers with balanced tracking.
    - **Body & Briefings**: `Plus Jakarta Sans` for high-legibility executive summaries and setup documentation.
    - **Data, Prices & Telemetry**: `JetBrains Mono` with strict `font-variant-numeric: tabular-nums` so fluctuating stock prices, latency counters, and system vitals never jitter horizontally.
  - *Component Styling & Layout*: Full-viewport 1440px+ 3-column asymmetric console layout (`Left: Voice Oscilloscope, Neural Pipeline & Telemetry Chat` | `Center: Interactive 3D Canvas Arc Reactor, Wireframe Globe & Voice Command Dock` | `Right: Live Market Intelligence, Executive Briefings & System Status`) with a clean 3-zone top navigation bar.
- **Interactive Feedback & Motion**:
  - 60fps HTML5 Canvas rendering of the 3D wireframe globe, counter-rotating degree rings, audio-reactive plasma corona spikes, and 4-layer sine-wave oscilloscope.
  - Instant `<150ms` visual state transitions across pipeline nodes and non-hue-only status indicators (`● Nominal`, `▲ Failover Cooldown`, `■ Offline`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Server-Side Market & AI Proxy with Autonomous Local Failover**
  - *Chosen Approach*: Port `jarvis_market.py`, `jarvis_actions.py`, and `jarvis_brain.py` into Express backend routes (`/api/state`, `/api/command`, `/api/market`, `/api/package-status`) powered by `@google/genai` (`gemini-3.8-flash`) with an automatic deterministic fallback engine and rate-limit cooldown simulator.
  - *Why*: Calling Yahoo Finance from the server avoids browser CORS errors and provides real live stock data with smart 60-second caching; keeping Gemini API calls server-side protects credentials while preserving the exact Hybrid Cloud + Offline Failover architecture from `jarvis_brain.py`.
- **Decision 2: Dual-Input Voice Architecture (Real Web Speech + Manual Command Dock)**
  - *Chosen Approach*: Combine native browser `SpeechRecognition` + Web Audio `AnalyserNode` microphone streaming with a bottom HUD command input bar and clickable preset voice chips.
  - *Why*: Delivers a genuine hands-free voice experience while ensuring users in quiet environments or browsers without microphone permissions can still test every voice command seamlessly.

---

## 4. Technical Architecture & Data Strategy

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   TOP BAR: Brand Wordmark · View Tabs · Mic CTA             │
├───────────────────────┬─────────────────────────────┬───────────────────────┤
│   LEFT TELEMETRY COL  │     CENTER HOLOGRAPHIC      │  RIGHT INTELLIGENCE   │
│                       │         REACTOR STAGE       │        COLUMN         │
│ ┌───────────────────┐ │                             │ ┌───────────────────┐ │
│ │ Voice Frequency   │ │   ┌─────────────────────┐   │ │ Live Market       │ │
│ │ Oscilloscope      │ │   │ 3D Wireframe Globe  │   │ │ Intelligence      │ │
│ │ (Web Audio API)   │ │   │ + Arc Reactor Core  │   │ │ (Sparklines +     │ │
│ └───────────────────┘ │   │ + Audio Corona      │   │ │  SMA Buy/Sell)    │ │
│ ┌───────────────────┐ │   └─────────────────────┘   │ └───────────────────┘ │
│ │ Neural Pipeline   │ │                             │ ┌───────────────────┐ │
│ │ MIC›EAR›MIND›HANDS│ │   ┌─────────────────────┐   │ │ Executive Inbox & │ │
│ └───────────────────┘ │   │ Live Transcript &   │   │ │ WhatsApp Dispatch │ │
│ ┌───────────────────┐ │   │ Quick Command Dock  │   │ └───────────────────┘ │
│ │ Telemetry Logs &  │ │   └─────────────────────┘   │ ┌───────────────────┐ │
│ │ Interactive Chat  │ │                             │ │ Package Audit &   │ │
│ └───────────────────┘ │                             │ │ System Vitals     │ │
│                       │                             │ └───────────────────┘ │
└───────────────────────┴─────────────────────────────┴───────────────────────┘
                                      │▲
                         REST / JSON  ││  (/api/state, /api/command,
                                      ▼│   /api/market, /api/package)
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EXPRESS BACKEND SERVER                               │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐  │
│  │ Deterministic Action │  │ Hybrid AI Brain      │  │ Live Yahoo Finance│  │
│  │ Engine (WhatsApp,    │─▶│ (@google/genai +     │  │ Fetcher & SMA     │  │
│  │ Mail, YouTube, Time) │  │  Cooldown Failover)  │  │ Signal Calculator │  │
│  └──────────────────────┘  └──────────────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - `HudState`: Tracks current operational mode (`listening`, `recognizing`, `thinking`, `speaking`, `idle`), active neural pipeline node, speech/cognition latency metrics, failover status (`cloud_active` vs `local_cooldown`), and system vitals.
  - `MarketTicker`: Stores symbol, name, currency (`₹` or `$`), real-time price, change percentage, 5-day close sparkline array, 5-period & 15-period moving averages, and computed technical signal (`STRONG BUY`, `BUY / ACCUMULATE`, `HOLD`, `SELL / TAKE PROFIT`, `STRONG SELL`).
  - `BriefingCard & ChatEntry`: Structured log of user voice/text queries, Jarvis responses, actionable deep links (WhatsApp pre-filled URL, YouTube search URL, Google query URL), and editable unread email cache items.
  - `PackageAuditReport`: Live verification status of all 11 uploaded files plus the auto-generated `install.sh` script for macOS/Linux.
- **Interactive Component & State Mapping**:
  - **Voice & Command Controller**: Toggles `SpeechRecognition` and `navigator.mediaDevices.getUserMedia({ audio: true })`, pipes real-time FFT amplitude to the canvas oscilloscope and reactor corona, sends recognized speech to `/api/command`, triggers `window.speechSynthesis.speak()`, and opens external automation links when requested.
  - **Market Watchlist & Custom Ticker Inspector**: Filters between `All`, `Indian Indices & Bluechips`, and `US Tech & Crypto`, allows adding custom Yahoo Finance symbols, and triggers instant spoken technical analysis on row click.
  - **Failover Simulator Toggle**: Allows the user to intentionally trigger an HTTP 429 rate-limit cooldown state to watch Jarvis seamlessly switch to its local deterministic engine with zero downtime.
  - **Package Status & File Inspector**: Lets the user inspect the code and status of every uploaded file (`jarvis_brain.py`, `jarvis_market.py`, `jarvis_actions.py`, `jarvis_voice.py`, `jarvis_workplace.html`, `Jarvis_Setup_Guide.pdf`) and download the missing `install.sh` installer.
