import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Mail,
  MessageSquare,
  Mic,
  MicOff,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { HolographicCanvas, JarvisStage } from "./components/HolographicCanvas";
import { OscilloscopeCanvas } from "./components/OscilloscopeCanvas";
import { SparklineSvg } from "./components/SparklineSvg";
import { PackageAuditData, PackageAuditPanel } from "./components/PackageAuditPanel";

interface StockItem {
  sym: string;
  symbol: string;
  name: string;
  category: "india" | "global";
  currency: string;
  price: number;
  change: number;
  pct: number;
  pct_change: number;
  mom: number;
  above: boolean;
  smaShort: number;
  smaLong: number;
  signal: "STRONG BUY" | "BUY / ACCUMULATE" | "HOLD" | "SELL / TAKE PROFIT" | "STRONG SELL";
  reason: string;
  high: number;
  low: number;
  spark: number[];
  stale: boolean;
  updatedAt: string;
}

interface ChatEntry {
  i: number;
  k: "you" | "jarvis" | "sys";
  x: string;
  t: string;
  actionUrl?: string;
  actionLabel?: string;
  source?: "LOCAL_DETERMINISTIC" | "CLOUD_BRAIN" | "FAILOVER_ENGINE";
}

interface BriefingCard {
  i: number;
  title: string;
  body: string;
  t: string;
  actionUrl?: string;
  actionLabel?: string;
  category?: "market" | "mail" | "whatsapp" | "system";
}

interface MailItem {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  priority: "HIGH" | "URGENT" | "NORMAL";
  receivedAt: string;
}

interface HudTelemetryState {
  state: JarvisStage;
  note: string;
  mode: string;
  model: string;
  t_rec: number;
  t_think: number;
  last_tool: string;
  tools: number;
  facts: number;
  mail_age: number;
  last_you: string;
  tool_active: boolean;
  failover_active: boolean;
  cooldown_remaining: number;
  volume: number;
  muted: boolean;
  chat: ChatEntry[];
  cards: BriefingCard[];
  unread_emails: MailItem[];
  stocks: StockItem[];
  sys: {
    cpu: number;
    ram: number;
    disk: number;
    free: number;
    bat: number;
    plug: boolean;
    up: number;
  };
}

type ActiveTab = "hud" | "market" | "automation" | "package";

const STAGE_LABELS: Record<JarvisStage, string> = {
  listening: "LISTENING",
  recognizing: "HEARING YOU",
  thinking: "PROCESSING QUERY",
  speaking: "ORNION RESPONDING",
  idle: "STANDBY",
  cooldown: "LOCAL FALLBACK ACTIVE",
};

const QUICK_VOICE_COMMANDS = [
  "Stock market report",
  "Should I buy Reliance?",
  "Check my unread emails",
  "Send WhatsApp to Pallavi saying meeting at 4pm",
  "Play lofi on YouTube",
  "Ornion, open VS Code",
  "What time is it?",
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("hud");
  const [telemetry, setTelemetry] = useState<HudTelemetryState | null>(null);
  const [packageAudit, setPackageAudit] = useState<PackageAuditData | null>(null);
  const [stage, setStage] = useState<JarvisStage>("listening");
  const [commandInput, setCommandInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Voice & Audio State
  const [micActive, setMicActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0.08);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voiceStatusNote, setVoiceStatusNote] = useState("ORNION AI is online — ready for voice or text command");

  // Market & Automation Interactive State
  const [marketFilter, setMarketFilter] = useState<"all" | "india" | "global">("all");
  const [customTickerInput, setCustomTickerInput] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [waContact, setWaContact] = useState("Pallavi");
  const [waMessage, setWaMessage] = useState("Hi Pallavi, ORNION assistant update: our 4:00 PM portfolio review is confirmed.");
  const [newMailSender, setNewMailSender] = useState("");
  const [newMailSubject, setNewMailSubject] = useState("");
  const [newMailSnippet, setNewMailSnippet] = useState("");
  const [newMailPriority, setNewMailPriority] = useState<"HIGH" | "URGENT" | "NORMAL">("HIGH");

  // Clock State
  const [clockStr, setClockStr] = useState("--:--:--");
  const [dateStr, setDateStr] = useState("");

  // Refs for Web Speech & Web Audio APIs
  const recognitionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rafMicRef = useRef<number>(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const ttsEnabledRef = useRef<boolean>(ttsEnabled);

  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);

  // Live Clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClockStr(now.toLocaleTimeString("en-GB", { hour12: false }));
      setDateStr(
        now
          .toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
          })
          .toUpperCase()
      );
    };
    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, []);

  // Speak response aloud using browser SpeechSynthesis (like jarvis_voice.py)
  const speakText = useCallback((text: string) => {
    if (!ttsEnabledRef.current || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.04;
      utterance.pitch = 0.98;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.name.includes("Samantha") ||
          v.name.includes("Daniel") ||
          v.name.includes("Google UK English Male") ||
          v.lang.startsWith("en")
      );
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => setStage("speaking");
      utterance.onend = () => setStage("listening");
      utterance.onerror = () => setStage("listening");
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore speech synthesis errors on restricted browsers
    }
  }, []);

  // Poll /api/state every 2.5 seconds
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const data: HudTelemetryState = await res.json();
      setTelemetry(data);
      if (!selectedStock && data.stocks.length > 0) {
        setSelectedStock(data.stocks[0]);
      }
    } catch {
      // Ignore transient network poll errors
    }
  }, [selectedStock]);

  // Fetch Package Audit on mount
  const fetchPackageAudit = useCallback(async () => {
    try {
      const res = await fetch("/api/package-audit");
      if (res.ok) {
        const data: PackageAuditData = await res.json();
        setPackageAudit(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchState();
    fetchPackageAudit();
    const interval = setInterval(fetchState, 2500);
    return () => clearInterval(interval);
  }, [fetchState, fetchPackageAudit]);

  // Execute voice or text command
  const executeCommand = useCallback(
    async (rawQuery: string, speechLatencyMs = 320) => {
      const trimmed = rawQuery.trim();
      if (!trimmed) return;

      setIsSubmitting(true);
      setStage("thinking");
      setVoiceStatusNote(`Processing: "${trimmed}"`);

      try {
        const res = await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, speechLatencyMs }),
        });
        if (res.ok) {
          const data = await res.json();
          setStage("speaking");
          setVoiceStatusNote(data.reply);
          speakText(data.reply);
          await fetchState();
          setTimeout(() => {
            setStage((prev) => (prev === "speaking" ? "listening" : prev));
          }, 3200);
        } else {
          setStage("listening");
        }
      } catch {
        setStage("listening");
      } finally {
        setIsSubmitting(false);
      }
    },
    [fetchState, speakText]
  );

  // Start / Stop Real Microphone & Web Speech API Recognition
  const stopVoiceLink = useCallback(() => {
    setMicActive(false);
    setInterimTranscript("");
    setAudioLevel(0.08);
    setStage("listening");
    setVoiceStatusNote("Voice link paused — click Activate Voice Link or type below");

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (rafMicRef.current) {
      cancelAnimationFrame(rafMicRef.current);
      rafMicRef.current = 0;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const startVoiceLink = useCallback(async () => {
    if (micActive) {
      stopVoiceLink();
      return;
    }

    // 1. Setup Web Audio API microphone stream for real-time frequency oscilloscope
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx: AudioContext = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMicLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length / 255;
        setAudioLevel(Math.max(0.06, Math.min(1, avg * 2.4)));
        rafMicRef.current = requestAnimationFrame(updateMicLevel);
      };
      rafMicRef.current = requestAnimationFrame(updateMicLevel);
    } catch {
      setVoiceStatusNote("Microphone permission unavailable — using simulated waveform & text/click commands");
    }

    // 2. Setup Web Speech API SpeechRecognition
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setMicActive(true);
      setVoiceStatusNote("Web Speech API not supported in this browser — use command chips or text bar below");
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      let speechStartTs = Date.now();

      recognition.onstart = () => {
        setMicActive(true);
        setStage("listening");
        setVoiceStatusNote("Microphone active — speak any command (e.g. 'Stock market report')");
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interim += transcript;
          }
        }

        if (interim) {
          setStage("recognizing");
          setInterimTranscript(interim);
        }

        if (finalTranscript.trim()) {
          const latency = Math.max(180, Math.min(1800, Date.now() - speechStartTs));
          setInterimTranscript("");
          executeCommand(finalTranscript.trim(), latency);
          speechStartTs = Date.now();
        }
      };

      recognition.onerror = () => {
        setStage("listening");
      };

      recognition.onend = () => {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch {
            // ignore restart errors
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setMicActive(false);
    }
  }, [executeCommand, micActive, stopVoiceLink]);

  useEffect(() => {
    return () => {
      stopVoiceLink();
    };
  }, [stopVoiceLink]);

  // Handle manual command form submission
  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || isSubmitting) return;
    const q = commandInput.trim();
    setCommandInput("");
    executeCommand(q, 240);
  };

  // Toggle Simulated HTTP 429 Failover Mode
  const handleToggleFailover = async () => {
    const nextState = !telemetry?.failover_active;
    try {
      await fetch("/api/failover/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextState, durationSec: 60 }),
      });
      await fetchState();
    } catch {
      // ignore
    }
  };

  // Add Custom Stock Ticker
  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTickerInput.trim()) return;
    const sym = customTickerInput.trim().toUpperCase();
    setCustomTickerInput("");
    try {
      const res = await fetch("/api/market/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym }),
      });
      if (res.ok) {
        const data: StockItem = await res.json();
        setSelectedStock(data);
        await fetchState();
      }
    } catch {
      // ignore
    }
  };

  // Add Priority Unread Email to Cache
  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMailSender.trim() || !newMailSubject.trim()) return;
    try {
      await fetch("/api/mail-cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: newMailSender,
          subject: newMailSubject,
          snippet: newMailSnippet,
          priority: newMailPriority,
        }),
      });
      setNewMailSender("");
      setNewMailSubject("");
      setNewMailSnippet("");
      await fetchState();
    } catch {
      // ignore
    }
  };

  const handleDeleteEmail = async (id: string) => {
    try {
      await fetch(`/api/mail-cache/${id}`, { method: "DELETE" });
      await fetchState();
    } catch {
      // ignore
    }
  };

  const stocks = telemetry?.stocks || [];
  const filteredStocks = stocks.filter((s) =>
    marketFilter === "all" ? true : s.category === marketFilter
  );
  const bullCount = stocks.filter((s) => s.pct >= 0).length;
  const bearCount = stocks.filter((s) => s.pct < 0).length;
  const failoverActive = Boolean(telemetry?.failover_active);
  const effectiveStage: JarvisStage = failoverActive ? "cooldown" : stage;

  const getSignalColorClass = (signal: StockItem["signal"]) => {
    if (signal.includes("BUY")) return "text-[#3dffa2]";
    if (signal.includes("SELL")) return "text-[#ff5a6e]";
    return "text-amber-300";
  };

  return (
    <div className="min-h-screen bg-[#02060D] text-[#E2F1FF] flex flex-col selection:bg-cyan-500/30">
      {/* =====================================================================
          STRICT 3-ZONE TOP BAR CONTRACT
          Zone 1: Single-line Brand Wordmark
          Zone 2: 4 Single-line View Navigation Links
          Zone 3: 1 Primary Voice Link Action Button
      ===================================================================== */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-cyan-500/25 bg-[#030A16]/90 backdrop-blur-md sticky top-0 z-30">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#hud"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab("hud");
          }}
          className="font-display text-lg font-bold tracking-[0.26em] text-white whitespace-nowrap shrink-0"
        >
          O.R.N.I.O.N
        </a>

        {/* Zone 2: 4 Concise Single-Line Navigation Links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-300 overflow-x-auto">
          <a
            href="#hud"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("hud");
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === "hud"
                ? "text-cyan-300 border-cyan-400"
                : "border-transparent hover:text-white"
            }`}
          >
            Holographic HUD
          </a>
          <a
            href="#market"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("market");
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === "market"
                ? "text-cyan-300 border-cyan-400"
                : "border-transparent hover:text-white"
            }`}
          >
            Market Intelligence
          </a>
          <a
            href="#automation"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("automation");
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === "automation"
                ? "text-cyan-300 border-cyan-400"
                : "border-transparent hover:text-white"
            }`}
          >
            Automation & Inbox
          </a>
          <a
            href="#package"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("package");
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === "package"
                ? "text-cyan-300 border-cyan-400"
                : "border-transparent hover:text-white"
            }`}
          >
            Package & About
          </a>
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center shrink-0">
          <button
            onClick={startVoiceLink}
            className={`px-4 py-2 text-xs font-semibold rounded transition-all flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              micActive
                ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.45)]"
                : "bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-[0_0_14px_rgba(6,182,212,0.35)]"
            }`}
          >
            {micActive ? (
              <>
                <Mic className="w-3.5 h-3.5" />
                Listening Live (Stop)
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                Activate Voice Link
              </>
            )}
          </button>
        </div>
      </header>

      {/* =====================================================================
          CONTEXTUAL TELEMETRY RIBBON (Status Update + Clock + Failover Control)
      ===================================================================== */}
      <div className="border-b border-cyan-500/15 bg-[#040D1A]/80 px-6 py-2 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-emerald-400 font-medium">
            ● ORNION SYSTEM STATUS: 12/12 FILES VERIFIED
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-300">
            Personal AI Assistant · Windows, macOS & Linux ·{" "}
            <code className="font-mono text-cyan-300">/api/state</code> live bridge
          </span>
          <button
            onClick={() => setActiveTab("package")}
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-4 font-medium cursor-pointer whitespace-nowrap shrink-0"
          >
            Package & Identity Info
          </button>
        </div>

        <div className="flex items-center gap-5 font-mono">
          <button
            onClick={() => setTtsEnabled((v) => !v)}
            className="text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            title="Toggle Spoken Audio Output"
          >
            {ttsEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Voice Output: ON</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                <span>Voice Output: MUTED</span>
              </>
            )}
          </button>

          <span className="text-slate-600">·</span>

          <button
            onClick={handleToggleFailover}
            className={`flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
              failoverActive ? "text-amber-400 font-semibold" : "text-slate-300 hover:text-white"
            }`}
          >
            {failoverActive ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>▲ Failover Cooldown ({telemetry?.cooldown_remaining || 60}s) — Restore Cloud</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>● Hybrid Cloud + Local Active (Test 429 Failover)</span>
              </>
            )}
          </button>

          <span className="text-slate-600">·</span>

          <div className="flex items-center gap-2 text-white tabular-nums">
            <span className="font-bold tracking-wider">{clockStr}</span>
            <span className="text-slate-400 text-[11px]">{dateStr}</span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: 3-COLUMN HOLOGRAPHIC WORKPLACE HUD
      ===================================================================== */}
      {activeTab === "hud" && (
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 max-w-[1600px] w-full mx-auto min-h-0">
          {/* LEFT TELEMETRY COLUMN (3 cols on 12-col grid) */}
          <section className="lg:col-span-3 flex flex-col gap-4 min-h-0">
            {/* Panel 1: Voice Frequency Oscilloscope */}
            <div className="border border-cyan-500/25 bg-[#051020]/80 p-4 rounded">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="font-display text-xs font-semibold tracking-wider text-cyan-400 uppercase">
                  01. Voice Frequency Oscilloscope
                </h2>
                <span className="font-mono text-[11px] text-cyan-300 tabular-nums">
                  {micActive ? `MIC ${Math.round(audioLevel * 100)}%` : "STREAM READY"}
                </span>
              </div>

              <OscilloscopeCanvas
                stage={effectiveStage}
                audioLevel={audioLevel}
                micActive={micActive}
              />

              <div className="mt-2.5 flex items-center justify-between font-mono text-[11px]">
                <span className="text-white font-semibold tracking-wider">
                  {STAGE_LABELS[effectiveStage]}
                </span>
                <button
                  onClick={startVoiceLink}
                  className="text-cyan-400 hover:text-cyan-200 flex items-center gap-1 cursor-pointer"
                >
                  {micActive ? (
                    <>
                      <MicOff className="w-3 h-3" /> Pause Mic
                    </>
                  ) : (
                    <>
                      <Mic className="w-3 h-3" /> Start Mic
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Panel 2: Neural Core Pipeline */}
            <div className="border border-cyan-500/25 bg-[#051020]/80 p-4 rounded">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="font-display text-xs font-semibold tracking-wider text-cyan-400 uppercase">
                  02. Neural Core Pipeline
                </h2>
                <span className="font-mono text-[11px] text-slate-400">
                  {telemetry?.mode || "HYBRID"}
                </span>
              </div>

              {/* 5 Pipeline Stage Nodes: MIC › EAR › MIND › HANDS › VOICE */}
              <div className="grid grid-cols-5 gap-1.5 font-mono text-center">
                {[
                  { id: "mic", label: "MIC", sub: "stream", active: effectiveStage === "listening" },
                  { id: "ear", label: "EAR", sub: "recognize", active: effectiveStage === "recognizing" },
                  { id: "mind", label: "MIND", sub: "reason", active: effectiveStage === "thinking" },
                  { id: "hands", label: "HANDS", sub: "execute", active: Boolean(telemetry?.tool_active) || effectiveStage === "cooldown" },
                  { id: "voice", label: "VOICE", sub: "respond", active: effectiveStage === "speaking" },
                ].map((node) => (
                  <div
                    key={node.id}
                    className={`py-2 px-1 rounded border transition-all ${
                      node.active
                        ? "border-cyan-400 bg-cyan-500/25 text-white shadow-[0_0_12px_rgba(34,211,238,0.35)]"
                        : "border-cyan-500/20 bg-[#020813]/70 text-slate-400"
                    }`}
                  >
                    <div className="text-[11px] font-bold tracking-wider">{node.label}</div>
                    <div className="text-[9px] opacity-80 mt-0.5">{node.sub}</div>
                  </div>
                ))}
              </div>

              {/* Key-Value Telemetry Grid */}
              <div className="mt-3.5 pt-3 border-t border-cyan-500/15 grid grid-cols-2 gap-y-1.5 gap-x-3 font-mono text-[11px]">
                <span className="text-slate-400">ENGINE MODEL</span>
                <span className="text-right text-white truncate">
                  {telemetry?.model || "Gemini 3.8 Flash + Local"}
                </span>

                <span className="text-slate-400">SPEECH LATENCY</span>
                <span className="text-right text-white tabular-nums">
                  {(telemetry?.t_rec ?? 0.35).toFixed(2)} s
                </span>

                <span className="text-slate-400">COGNITION TIME</span>
                <span className="text-right text-white tabular-nums">
                  {(telemetry?.t_think ?? 0.42).toFixed(2)} s
                </span>

                <span className="text-slate-400">LAST MODULE</span>
                <span className="text-right text-cyan-300 truncate">
                  {telemetry?.last_tool || "Market Intelligence"}
                </span>

                <span className="text-slate-400">COMMANDS RUN</span>
                <span className="text-right text-white tabular-nums">
                  {telemetry?.tools ?? 4}
                </span>

                <span className="text-slate-400">FAILOVER ENGINE</span>
                <span
                  className={`text-right font-semibold ${
                    failoverActive ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {failoverActive ? "▲ LOCAL COOLDOWN" : "● AUTO-SWITCH ON"}
                </span>
              </div>
            </div>

            {/* Panel 3: Telemetry Logs & Interactive Chat */}
            <div className="border border-cyan-500/25 bg-[#051020]/80 p-4 rounded flex-1 flex flex-col min-h-[260px]">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="font-display text-xs font-semibold tracking-wider text-cyan-400 uppercase">
                  03. Telemetry Logs & Chat
                </h2>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {telemetry?.chat?.length || 0} entries
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[320px]">
                {(telemetry?.chat || []).map((m) => (
                  <div
                    key={m.i}
                    className={`p-2.5 rounded border text-xs leading-relaxed ${
                      m.k === "you"
                        ? "border-cyan-500/30 bg-cyan-950/30 text-white"
                        : m.k === "jarvis"
                        ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-50"
                        : "border-slate-700/50 bg-slate-900/40 text-slate-300 font-mono text-[11px]"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                      <span
                        className={
                          m.k === "you"
                            ? "text-cyan-400 font-bold"
                            : m.k === "jarvis"
                            ? "text-emerald-400 font-bold"
                            : "text-amber-300 font-bold"
                        }
                      >
                        {m.k === "you"
                          ? "USER ▸"
                          : m.k === "jarvis"
                          ? `ORNION ▸ ${m.source ? `[${m.source}]` : ""}`
                          : "SYSTEM ▸"}
                      </span>
                      <span className="text-slate-400 tabular-nums">{m.t}</span>
                    </div>
                    <div>{m.x}</div>
                    {m.actionUrl && (
                      <div className="mt-2">
                        <a
                          href={m.actionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {m.actionLabel || "Launch External Action"}
                        </a>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>
          </section>

          {/* CENTER STAGE: 3D HOLOGRAPHIC REACTOR & VOICE COMMAND DOCK (5 cols on 12-col grid) */}
          <section className="lg:col-span-5 flex flex-col justify-between border border-cyan-500/25 bg-[#030914]/90 rounded relative overflow-hidden min-h-[580px]">
            {/* Top Reactor Telemetry Overlay */}
            <div className="p-4 flex items-center justify-between border-b border-cyan-500/15 z-10 bg-[#030914]/60 backdrop-blur-sm">
              <div>
                <div className="font-display text-xs tracking-wider text-cyan-400 uppercase">
                  ORNION Neural Interface Core
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {telemetry?.note || "ORNION AI IS ONLINE"}
                </div>
              </div>
              <a
                href="/assets/aistudio/jarvis_workplace_88522884.html"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded text-xs font-mono text-cyan-300 hover:text-white border border-cyan-500/30 hover:bg-cyan-500/15 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Standalone HUD HTML
              </a>
            </div>

            {/* 3D Canvas Stage */}
            <div className="relative flex-1 min-h-[340px] flex items-center justify-center">
              <HolographicCanvas
                stage={effectiveStage}
                audioLevel={audioLevel}
                failoverActive={failoverActive}
              />

              {/* Center Lower Status Readout */}
              <div className="absolute bottom-3 inset-x-4 text-center pointer-events-none">
                <div className="font-display text-2xl font-bold tracking-[0.35em] text-white drop-shadow-[0_0_16px_rgba(34,211,238,0.5)]">
                  {STAGE_LABELS[effectiveStage]}
                </div>
                <div className="mt-1 font-mono text-xs text-cyan-300/90 min-h-[18px] px-3 truncate">
                  {interimTranscript
                    ? `▸ Hearing: "${interimTranscript}"`
                    : telemetry?.last_you
                    ? `▸ Last Command: "${telemetry.last_you}"`
                    : voiceStatusNote}
                </div>
              </div>
            </div>

            {/* Bottom Interactive Voice Command Dock & Text Bar */}
            <div className="p-4 border-t border-cyan-500/20 bg-[#051020]/95 z-10">
              <div className="text-[11px] font-mono text-slate-400 mb-2 flex items-center justify-between">
                <span>INSTANT VOICE COMMAND TRIGGERS (CLICK OR SPEAK):</span>
                <span className="text-cyan-400">Wake word "Ornion" optional</span>
              </div>

              {/* Single-line scrollable/wrapped command buttons */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {QUICK_VOICE_COMMANDS.map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => executeCommand(cmd, 210)}
                    disabled={isSubmitting}
                    className="px-2.5 py-1 rounded text-[11px] font-mono bg-[#081A33] hover:bg-cyan-500/20 text-cyan-200 border border-cyan-500/25 hover:border-cyan-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    "{cmd}"
                  </button>
                ))}
              </div>

              {/* Direct Command Input Form */}
              <form onSubmit={handleCommandSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder='Ask ORNION anything (e.g., "Should I buy Nvidia?", "Send WhatsApp to Pallavi")...'
                  className="flex-1 bg-[#020710] border border-cyan-500/35 focus:border-cyan-400 rounded px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none font-mono"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !commandInput.trim()}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-semibold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  Execute
                </button>
              </form>
            </div>
          </section>

          {/* RIGHT INTELLIGENCE COLUMN (4 cols on 12-col grid) */}
          <section className="lg:col-span-4 flex flex-col gap-4 min-h-0">
            {/* Panel 4: Live Market Intelligence */}
            <div className="border border-cyan-500/25 bg-[#051020]/80 p-4 rounded flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="font-display text-xs font-semibold tracking-wider text-cyan-400 uppercase">
                    04. Live Market Intelligence
                  </h2>
                  <div className="font-mono text-[11px] text-slate-400 mt-0.5 tabular-nums">
                    {bullCount} BULL · {bearCount} BEAR · 5D/15D SMA SIGNALS
                  </div>
                </div>

                {/* Interactive Filter Controls */}
                <div className="flex items-center gap-1 bg-[#020813] p-1 rounded border border-cyan-500/20">
                  {(["all", "india", "global"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setMarketFilter(f)}
                      className={`px-2 py-1 text-[11px] font-mono rounded transition-colors cursor-pointer uppercase whitespace-nowrap shrink-0 ${
                        marketFilter === f
                          ? "bg-cyan-500 text-slate-950 font-bold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stock Ticker Rows */}
              <div className="divide-y divide-white/5 max-h-[270px] overflow-y-auto pr-1">
                {filteredStocks.map((s) => {
                  const isUp = s.pct >= 0;
                  return (
                    <button
                      key={s.symbol}
                      onClick={() => {
                        setSelectedStock(s);
                        executeCommand(`Should I buy ${s.name}?`, 180);
                      }}
                      className="w-full text-left py-2.5 px-1.5 hover:bg-white/[0.04] transition-colors grid grid-cols-12 items-center gap-2 cursor-pointer"
                    >
                      <div className="col-span-5 min-w-0">
                        <div className="font-semibold text-xs text-white truncate">
                          {s.name}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                          {s.symbol} · 5D {s.mom >= 0 ? "+" : ""}
                          {s.mom}%
                        </div>
                      </div>

                      <div className="col-span-3 flex justify-center">
                        <SparklineSvg data={s.spark} isPositive={isUp} />
                      </div>

                      <div className="col-span-4 text-right font-mono tabular-nums">
                        <div className="text-xs font-bold text-white">
                          {s.currency}
                          {s.price.toLocaleString("en-IN", {
                            maximumFractionDigits: 2,
                          })}
                        </div>
                        <div
                          className={`text-[11px] font-semibold ${
                            isUp ? "text-[#3dffa2]" : "text-[#ff5a6e]"
                          }`}
                        >
                          {isUp ? "▲ +" : "▼ "}
                          {Math.abs(s.pct).toFixed(2)}%
                        </div>
                      </div>

                      <div className="col-span-12 flex items-center justify-between text-[10px] font-mono pt-0.5">
                        <span className="text-slate-400 truncate max-w-[65%]">
                          SMA5: {s.currency}
                          {s.smaShort.toLocaleString("en-IN")} · SMA15:{" "}
                          {s.currency}
                          {s.smaLong.toLocaleString("en-IN")}
                        </span>
                        <span className={`font-bold ${getSignalColorClass(s.signal)}`}>
                          {s.signal}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Panel 5: Executive Briefings & Inbox */}
            <div className="border border-cyan-500/25 bg-[#051020]/80 p-4 rounded flex-1 flex flex-col min-h-[195px]">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="font-display text-xs font-semibold tracking-wider text-cyan-400 uppercase">
                  05. Executive Briefings & Inbox
                </h2>
                <button
                  onClick={() => executeCommand("Check my unread emails", 190)}
                  className="font-mono text-[11px] text-cyan-300 hover:text-white flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Play className="w-3 h-3" /> Speak Mail Brief
                </button>
              </div>

              <div className="space-y-2.5 overflow-y-auto max-h-[200px] pr-1">
                {(telemetry?.cards || []).map((c) => (
                  <div
                    key={c.i}
                    className="p-2.5 rounded border border-cyan-500/20 bg-[#020916]/80 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono text-[10px] text-cyan-400 mb-1">
                      <span className="font-bold tracking-wider">{c.title}</span>
                      <span className="text-slate-400 tabular-nums">{c.t}</span>
                    </div>
                    <p className="text-slate-200 leading-relaxed text-[11.5px]">
                      {c.body}
                    </p>
                    {c.actionUrl && (
                      <div className="mt-2">
                        <a
                          href={c.actionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 hover:text-emerald-300 underline underline-offset-4"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {c.actionLabel || "Open Link"}
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Panel 6: Hardware & Audio Vitals */}
            <div className="border border-cyan-500/25 bg-[#051020]/80 p-4 rounded">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="font-display text-xs font-semibold tracking-wider text-cyan-400 uppercase">
                  06. Hardware & System Vitals
                </h2>
                <span className="font-mono text-[11px] text-emerald-400 tabular-nums">
                  UPTIME{" "}
                  { telemetry?.sys?.up
                    ? `${Math.floor(telemetry.sys.up / 3600)}h ${Math.floor(
                        (telemetry.sys.up % 3600) / 60
                      )}m`
                    : "4h 18m"}
                </span>
              </div>

              <div className="space-y-2 font-mono text-[11px]">
                {[
                  { label: "CPU LOAD", val: telemetry?.sys?.cpu ?? 18, text: `${telemetry?.sys?.cpu ?? 18}%` },
                  { label: "RAM USAGE", val: telemetry?.sys?.ram ?? 46, text: `${telemetry?.sys?.ram ?? 46}%` },
                  { label: "DISK ARRAY", val: telemetry?.sys?.disk ?? 38, text: `${telemetry?.sys?.free ?? 412}G FREE` },
                  {
                    label: "AUDIO VOL",
                    val: telemetry?.muted ? 0 : telemetry?.volume ?? 75,
                    text: telemetry?.muted ? "MUTED" : `${telemetry?.volume ?? 75}%`,
                  },
                ].map((m) => (
                  <div key={m.label} className="grid grid-cols-12 items-center gap-2">
                    <span className="col-span-3 text-slate-400">{m.label}</span>
                    <div className="col-span-6 h-2 bg-[#020813] border border-cyan-500/25 rounded overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, m.val))}%` }}
                      />
                    </div>
                    <span className="col-span-3 text-right text-white tabular-nums">
                      {m.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      )}

      {/* =====================================================================
          TAB 2: EXPANDED MARKET INTELLIGENCE & TECHNICAL BUY/SELL SCANNER
      ===================================================================== */}
      {activeTab === "market" && (
        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-500/20 pb-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">
                Real-Time Stock Market Intelligence & SMA Scanner
              </h1>
              <p className="text-xs text-slate-300 mt-1">
                Powered by <code className="font-mono text-cyan-300">jarvis_market.py</code> algorithm: 5-day 15-minute charts, 5-period vs 15-period moving average crossovers, and momentum signals.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <form onSubmit={handleAddTicker} className="flex items-center gap-2">
                <input
                  type="text"
                  value={customTickerInput}
                  onChange={(e) => setCustomTickerInput(e.target.value)}
                  placeholder="Add Yahoo Symbol (e.g. TSLA, SBIN.NS)..."
                  className="bg-[#051020] border border-cyan-500/35 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Analyze Ticker
                </button>
              </form>

              <button
                onClick={() => executeCommand("Stock market report", 180)}
                className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 font-mono text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Volume2 className="w-3.5 h-3.5" /> Speak Full Market Briefing
              </button>
            </div>
          </div>

          {/* Selected Ticker Spotlight */}
          {selectedStock && (
            <div className="border border-cyan-500/30 bg-[#061326]/90 p-5 rounded grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-5">
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                  <span>ACTIVE TECHNICAL SPOTLIGHT</span>
                  <span>·</span>
                  <span>{selectedStock.symbol}</span>
                </div>
                <h2 className="font-display text-2xl font-bold text-white mt-1">
                  {selectedStock.name}
                </h2>
                <div className="mt-2 flex items-baseline gap-3 font-mono tabular-nums">
                  <span className="text-3xl font-bold text-white">
                    {selectedStock.currency}
                    {selectedStock.price.toLocaleString("en-IN")}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      selectedStock.pct >= 0 ? "text-[#3dffa2]" : "text-[#ff5a6e]"
                    }`}
                  >
                    {selectedStock.pct >= 0 ? "▲ +" : "▼ "}
                    {Math.abs(selectedStock.pct).toFixed(2)}% ({selectedStock.currency}
                    {selectedStock.change})
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  {selectedStock.reason}
                </p>
              </div>

              <div className="lg:col-span-4 grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3 rounded bg-[#020813] border border-cyan-500/15">
                  <div className="text-slate-400 text-[10px]">SHORT SMA (5-PERIOD)</div>
                  <div className="text-white font-bold text-sm mt-1 tabular-nums">
                    {selectedStock.currency}
                    {selectedStock.smaShort.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="p-3 rounded bg-[#020813] border border-cyan-500/15">
                  <div className="text-slate-400 text-[10px]">MEDIUM SMA (15-PERIOD)</div>
                  <div className="text-white font-bold text-sm mt-1 tabular-nums">
                    {selectedStock.currency}
                    {selectedStock.smaLong.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="p-3 rounded bg-[#020813] border border-cyan-500/15">
                  <div className="text-slate-400 text-[10px]">DAY RANGE (LOW — HIGH)</div>
                  <div className="text-white font-bold text-xs mt-1 tabular-nums">
                    {selectedStock.currency}
                    {selectedStock.low.toLocaleString("en-IN")} — {selectedStock.currency}
                    {selectedStock.high.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="p-3 rounded bg-[#020813] border border-cyan-500/15">
                  <div className="text-slate-400 text-[10px]">ALGORITHMIC SIGNAL</div>
                  <div className={`font-bold text-sm mt-1 ${getSignalColorClass(selectedStock.signal)}`}>
                    {selectedStock.signal}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-3 flex flex-col items-end justify-center gap-3">
                <SparklineSvg
                  data={selectedStock.spark}
                  isPositive={selectedStock.pct >= 0}
                />
                <button
                  onClick={() => executeCommand(`Should I buy ${selectedStock.name}?`, 180)}
                  className="w-full py-2.5 px-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded transition-colors cursor-pointer text-center"
                >
                  Ask ORNION Voice Analysis
                </button>
              </div>
            </div>
          )}

          {/* Full Watchlist Data Table */}
          <div className="border border-cyan-500/25 bg-[#051020]/85 rounded overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-cyan-500/20 font-mono text-[11px] text-cyan-400 uppercase bg-[#020813]/60">
                  <th className="py-3 px-4">Instrument</th>
                  <th className="py-3 px-4 text-right">Last Price</th>
                  <th className="py-3 px-4 text-right">Intraday Change</th>
                  <th className="py-3 px-4 text-right">5D Momentum</th>
                  <th className="py-3 px-4 text-right">5-SMA / 15-SMA</th>
                  <th className="py-3 px-4 text-center">5D Trend</th>
                  <th className="py-3 px-4">Signal & Technical Rationale</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/10 text-xs">
                {stocks.map((s) => {
                  const isUp = s.pct >= 0;
                  return (
                    <tr
                      key={s.symbol}
                      onClick={() => setSelectedStock(s)}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{s.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">{s.symbol}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-white tabular-nums">
                        {s.currency}
                        {s.price.toLocaleString("en-IN")}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-semibold tabular-nums ${
                          isUp ? "text-[#3dffa2]" : "text-[#ff5a6e]"
                        }`}
                      >
                        {isUp ? "▲ +" : "▼ "}
                        {Math.abs(s.pct).toFixed(2)}%
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          s.mom >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {s.mom >= 0 ? "+" : ""}
                        {s.mom.toFixed(2)}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300 tabular-nums">
                        {s.currency}
                        {s.smaShort.toLocaleString("en-IN")} / {s.currency}
                        {s.smaLong.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-center">
                          <SparklineSvg data={s.spark} isPositive={isUp} />
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className={`font-mono font-bold text-xs ${getSignalColorClass(s.signal)}`}>
                          {s.signal}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {s.reason}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStock(s);
                            executeCommand(`Should I buy ${s.name}?`, 180);
                          }}
                          className="px-2.5 py-1 rounded font-mono text-[11px] bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/30 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Analyze
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* =====================================================================
          TAB 3: AUTOMATION, WHATSAPP DISPATCH & EXECUTIVE INBOX
      ===================================================================== */}
      {activeTab === "automation" && (
        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 6 Cols: WhatsApp Automation & App/Media Launchers */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            {/* WhatsApp Auto-Message Composer */}
            <div className="border border-cyan-500/25 bg-[#051020]/85 p-5 rounded">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-sm font-bold tracking-wider text-cyan-400 uppercase flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> 01. WhatsApp Web Automation (jarvis_actions.py)
                </h2>
                <span className="font-mono text-xs text-emerald-400">● INSTANT DISPATCH</span>
              </div>
              <p className="text-xs text-slate-300 mb-4">
                Say <code className="font-mono text-cyan-300">"Send WhatsApp to [Name] saying [Message]"</code> or compose below to trigger pre-encoded WhatsApp Web automation.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block font-mono text-[11px] text-slate-400 mb-1">
                    RECIPIENT CONTACT NAME
                  </label>
                  <input
                    type="text"
                    value={waContact}
                    onChange={(e) => setWaContact(e.target.value)}
                    className="w-full bg-[#020813] border border-cyan-500/30 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[11px] text-slate-400 mb-1">
                    AUTOMATED MESSAGE PAYLOAD
                  </label>
                  <textarea
                    rows={3}
                    value={waMessage}
                    onChange={(e) => setWaMessage(e.target.value)}
                    className="w-full bg-[#020813] border border-cyan-500/30 rounded p-3 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    onClick={() =>
                      executeCommand(
                        `Send WhatsApp to ${waContact || "Contact"} saying ${waMessage}`,
                        200
                      )
                    }
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded transition-colors cursor-pointer"
                  >
                    Log & Speak via ORNION
                  </button>
                  <a
                    href={`https://web.whatsapp.com/send?text=${encodeURIComponent(waMessage)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 font-mono text-xs rounded transition-colors flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Launch WhatsApp Web Directly
                  </a>
                </div>
              </div>
            </div>

            {/* Instant App, YouTube & Google Search Matrix */}
            <div className="border border-cyan-500/25 bg-[#051020]/85 p-5 rounded">
              <h2 className="font-display text-sm font-bold tracking-wider text-cyan-400 uppercase mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" /> 02. Local App, Media & Search Automation
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { label: "Open VS Code", cmd: "Ornion, open VS Code", url: "https://vscode.dev" },
                  { label: "Play Lofi on YouTube", cmd: "Play lofi hip hop radio on YouTube", url: "https://www.youtube.com/results?search_query=lofi+hip+hop+radio" },
                  { label: "Open GitHub", cmd: "Open GitHub", url: "https://github.com" },
                  { label: "Open Gmail", cmd: "Open Gmail", url: "https://mail.google.com" },
                  { label: "Open Google Calendar", cmd: "Open Calendar", url: "https://calendar.google.com" },
                  { label: "Open Google Maps", cmd: "Open Maps", url: "https://maps.google.com" },
                ].map((act) => (
                  <div
                    key={act.label}
                    className="p-3 rounded border border-cyan-500/20 bg-[#020813] flex flex-col justify-between gap-2"
                  >
                    <div className="font-mono text-xs font-semibold text-white">
                      {act.label}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        onClick={() => executeCommand(act.cmd, 180)}
                        className="text-[11px] font-mono text-cyan-400 hover:text-cyan-200 cursor-pointer"
                      >
                        Voice Run
                      </button>
                      <a
                        href={act.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
                      >
                        Open <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right 6 Cols: Unread Email Cache (~/.ornion/mail_cache.txt) */}
          <div className="lg:col-span-6 border border-cyan-500/25 bg-[#051020]/85 p-5 rounded flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold tracking-wider text-cyan-400 uppercase flex items-center gap-2">
                  <Mail className="w-4 h-4" /> 03. Unread Inbox Briefing Cache
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mirrors <code className="font-mono text-cyan-300">~/.ornion/mail_cache.txt</code> for 30-second spoken briefings.
                </p>
              </div>
              <button
                onClick={() => executeCommand("Check my unread emails", 180)}
                className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Volume2 className="w-3.5 h-3.5" /> Speak 30s Mail Briefing
              </button>
            </div>

            {/* Unread Email List */}
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {(telemetry?.unread_emails || []).map((mail) => (
                <div
                  key={mail.id}
                  className="p-3.5 rounded border border-cyan-500/20 bg-[#020813] flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span
                        className={
                          mail.priority === "URGENT"
                            ? "text-rose-400 font-bold"
                            : "text-cyan-400 font-bold"
                        }
                      >
                        ● {mail.priority}
                      </span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-300 truncate">{mail.sender}</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-400">{mail.receivedAt}</span>
                    </div>
                    <h3 className="font-semibold text-xs text-white mt-1">
                      {mail.subject}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {mail.snippet}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteEmail(mail.id)}
                    className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer shrink-0"
                    title="Mark as Read / Remove from Cache"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Priority Email to Briefing Cache */}
            <form
              onSubmit={handleAddEmail}
              className="pt-4 border-t border-cyan-500/20 space-y-3"
            >
              <div className="font-mono text-xs text-cyan-300 font-semibold">
                + SIMULATE INCOMING PRIORITY EMAIL IN CACHE
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={newMailSender}
                  onChange={(e) => setNewMailSender(e.target.value)}
                  placeholder="Sender (e.g. Board of Directors)"
                  className="sm:col-span-2 bg-[#020813] border border-cyan-500/30 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                />
                <select
                  value={newMailPriority}
                  onChange={(e) =>
                    setNewMailPriority(e.target.value as "HIGH" | "URGENT" | "NORMAL")
                  }
                  className="bg-[#020813] border border-cyan-500/30 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                >
                  <option value="HIGH">HIGH PRIORITY</option>
                  <option value="URGENT">URGENT</option>
                  <option value="NORMAL">NORMAL</option>
                </select>
              </div>
              <input
                type="text"
                value={newMailSubject}
                onChange={(e) => setNewMailSubject(e.target.value)}
                placeholder="Email Subject Line..."
                className="w-full bg-[#020813] border border-cyan-500/30 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMailSnippet}
                  onChange={(e) => setNewMailSnippet(e.target.value)}
                  placeholder="Brief summary snippet for ORNION to read aloud..."
                  className="flex-1 bg-[#020813] border border-cyan-500/30 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Add to Inbox Cache
                </button>
              </div>
            </form>
          </div>
        </main>
      )}

      {/* =====================================================================
          TAB 4: PACKAGE STATUS AUDIT & SETUP INSPECTOR
      ===================================================================== */}
      {activeTab === "package" && (
        <main className="flex-1">
          <PackageAuditPanel
            audit={packageAudit}
            onRunCommand={(cmd) => {
              setActiveTab("hud");
              executeCommand(cmd, 200);
            }}
          />
        </main>
      )}

      {/* =====================================================================
          APPLICATION FOOTER — ORNION PROJECT OWNERSHIP ATTRIBUTION
      ===================================================================== */}
      <footer className="border-t border-cyan-500/20 bg-[#030914]/90 px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display font-bold tracking-wider text-cyan-300">
            ORNION — Personal AI Assistant
          </span>
          <span className="text-slate-600">·</span>
          <span>Created and developed by <strong className="text-white font-medium">Praneeth Thota</strong></span>
        </div>
        <div className="font-mono text-[11px] text-slate-500">
          Personal AI Assistant & Automation Platform · Third-party libraries & APIs remain property of their respective owners
        </div>
      </footer>
    </div>
  );
}
