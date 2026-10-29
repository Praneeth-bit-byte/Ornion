import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  LogOut,
  Mail,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Youtube,
  Zap,
} from "lucide-react";
import { HolographicCanvas, JarvisStage } from "./components/HolographicCanvas";
import { OscilloscopeCanvas } from "./components/OscilloscopeCanvas";
import { SparklineSvg } from "./components/SparklineSvg";
import { PackageAuditData, PackageAuditPanel } from "./components/PackageAuditPanel";
import {
  initAuth,
  googleSignIn,
  getAccessToken,
  logout as googleLogout,
} from "./services/googleAuth";

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
  dataSource?: "LIVE_YAHOO_FINANCE" | "OFFLINE_ESTIMATE";
  updatedAt: string;
}

interface ExecutionReport {
  intent: string;
  tool: string;
  executed: boolean;
  status:
    | "COMPLETED"
    | "INITIATED"
    | "REQUIRES_USER_ACTION"
    | "REQUIRES_AUTH"
    | "UNAVAILABLE"
    | "ERROR";
  evidence: string;
  nextStep?: string;
}

interface YouTubeMediaPayload {
  query: string;
  title: string;
  videoId?: string;
  watchUrl: string;
  embedUrl?: string;
  searchUrl: string;
  mode: "play" | "search";
}

interface ChatEntry {
  i: number;
  k: "you" | "jarvis" | "sys";
  x: string;
  t: string;
  actionUrl?: string;
  actionLabel?: string;
  source?:
    | "NVIDIA_MISTRAL"
    | "LOCAL_DETERMINISTIC"
    | "CLOUD_BRAIN"
    | "FAILOVER_ENGINE"
    | "AI_SERVICE_ERROR";
  execution?: ExecutionReport;
  media?: YouTubeMediaPayload;
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
  isLiveGmail?: boolean;
}

interface GmailStatusState {
  connected: boolean;
  emailAddress: string | null;
  unreadCount: number;
  lastSyncedAt: string | null;
  error: string | null;
}

interface HudTelemetryState {
  state: JarvisStage;
  note: string;
  mode: string;
  model: string;
  ai_configured?: boolean;
  last_ai_error?: string | null;
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
  gmail?: GmailStatusState;
  unread_emails: MailItem[];
  local_notes?: MailItem[];
  active_media?: YouTubeMediaPayload | null;
  stocks: StockItem[];
  sys: {
    cpu: number;
    ram: number;
    disk: number;
    free: number;
    bat: number;
    plug: boolean;
    up: number;
    platform?: string;
  };
}

type ActiveTab = "hud" | "market" | "automation" | "package";

const STAGE_LABELS: Record<JarvisStage, string> = {
  listening: "LISTENING",
  recognizing: "HEARING YOU",
  thinking: "PROCESSING QUERY",
  speaking: "ORNION RESPONDING",
  idle: "STANDBY",
  cooldown: "RATE-LIMIT COOLDOWN",
};

const QUICK_VOICE_COMMANDS = [
  "Hello",
  "What can you do?",
  "Play lofi music on YouTube",
  "Check my unread emails",
  "Open Calculator",
  "Open Notepad",
  "Stock market report",
  "Should I buy Reliance?",
];

// Official Google Sign-In SVG Button Component per Workspace Integration Guidelines
const GoogleSignInButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
}> = ({ onClick, disabled, compact }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center gap-2.5 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-900 font-medium rounded border border-slate-300 shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
      compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-xs"
    }`}
  >
    <svg
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      className="w-4 h-4 block shrink-0"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
    <span>{disabled ? "Connecting Gmail..." : "Sign in with Google"}</span>
  </button>
);

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
  const [voiceStatusNote, setVoiceStatusNote] = useState(
    "ORNION AI is online — ready for voice or text command"
  );

  // Google OAuth / Gmail State (in-memory token managed by src/services/googleAuth.ts)
  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [gmailUserEmail, setGmailUserEmail] = useState<string | null>(null);
  const [isSigningInGmail, setIsSigningInGmail] = useState(false);
  const [isSyncingGmail, setIsSyncingGmail] = useState(false);
  const [gmailAuthError, setGmailAuthError] = useState<string | null>(null);

  // Active YouTube Media Player State
  const [activeMedia, setActiveMedia] = useState<YouTubeMediaPayload | null>(null);

  // Market & Automation Interactive State
  const [marketFilter, setMarketFilter] = useState<"all" | "india" | "global">("all");
  const [customTickerInput, setCustomTickerInput] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [waContact, setWaContact] = useState("Pallavi");
  const [waMessage, setWaMessage] = useState(
    "Hi Pallavi, ORNION assistant update: our 4:00 PM portfolio review is confirmed."
  );
  const [newMailSender, setNewMailSender] = useState("");
  const [newMailSubject, setNewMailSubject] = useState("");
  const [newMailSnippet, setNewMailSnippet] = useState("");
  const [newMailPriority, setNewMailPriority] = useState<"HIGH" | "URGENT" | "NORMAL">("HIGH");

  // Clock State
  const [clockStr, setClockStr] = useState("--:--:--");
  const [dateStr, setDateStr] = useState("");

  // Refs
  const recognitionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rafMicRef = useRef<number>(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const ttsEnabledRef = useRef<boolean>(ttsEnabled);
  const gmailTokenRef = useRef<string | null>(gmailToken);
  const prevChatCountRef = useRef<number>(0);

  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);

  useEffect(() => {
    gmailTokenRef.current = gmailToken;
  }, [gmailToken]);

  // Initialize Firebase Google Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGmailToken(token);
        setGmailUserEmail(user.email || user.displayName || "Authorized User");
      },
      () => {
        setGmailToken(null);
        setGmailUserEmail(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Auto-scroll chat container when new messages arrive
  useEffect(() => {
    const currentLen = telemetry?.chat?.length || 0;
    if (currentLen > prevChatCountRef.current) {
      prevChatCountRef.current = currentLen;
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [telemetry?.chat?.length]);

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

  // Speak response aloud using browser SpeechSynthesis
  const speakText = useCallback((text: string) => {
    if (
      !ttsEnabledRef.current ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
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

  // Poll /api/state every 3 seconds
  const fetchState = useCallback(async () => {
    try {
      const token = gmailTokenRef.current || (await getAccessToken());
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/state", { cache: "no-store", headers });
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

  // Sync Gmail Unread Messages explicitly with Bearer token
  const syncGmailInbox = useCallback(
    async (explicitToken?: string) => {
      const token = explicitToken || gmailTokenRef.current || (await getAccessToken());
      if (!token) return;
      setIsSyncingGmail(true);
      setGmailAuthError(null);
      try {
        const res = await fetch("/api/gmail/unread", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setGmailAuthError(data.error || `Gmail sync failed (${res.status})`);
          if (res.status === 401 || res.status === 403) {
            setGmailToken(null);
          }
        } else {
          setGmailUserEmail(data.emailAddress || gmailUserEmail);
        }
        await fetchState();
      } catch (err: any) {
        setGmailAuthError(err?.message || "Failed to contact Gmail sync endpoint.");
      } finally {
        setIsSyncingGmail(false);
      }
    },
    [fetchState, gmailUserEmail]
  );

  // Handle Google OAuth Sign-In for Gmail
  const handleGoogleLogin = async () => {
    setIsSigningInGmail(true);
    setGmailAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setGmailToken(result.accessToken);
        setGmailUserEmail(
          result.user.email || result.user.displayName || "Authorized Gmail User"
        );
        await syncGmailInbox(result.accessToken);
      }
    } catch (err: any) {
      const msg =
        err?.code === "auth/popup-closed-by-user"
          ? "Google sign-in popup was closed before authorization completed."
          : err?.message || "Google sign-in failed.";
      setGmailAuthError(msg);
    } finally {
      setIsSigningInGmail(false);
    }
  };

  // Handle Gmail Disconnect
  const handleGoogleDisconnect = async () => {
    try {
      await googleLogout();
      setGmailToken(null);
      setGmailUserEmail(null);
      setGmailAuthError(null);
      await fetch("/api/gmail/disconnect", { method: "POST" });
      await fetchState();
    } catch {
      // ignore
    }
  };

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
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, [fetchState, fetchPackageAudit]);

  // Execute voice or text command
  const executeCommand = useCallback(
    async (rawQuery: string, speechLatencyMs = 320) => {
      const trimmed = rawQuery.trim();
      if (!trimmed || isSubmitting) return;

      setIsSubmitting(true);
      setStage("thinking");
      setVoiceStatusNote(`Processing: "${trimmed}"`);

      try {
        const token = gmailTokenRef.current || (await getAccessToken());
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const res = await fetch("/api/command", {
          method: "POST",
          headers,
          body: JSON.stringify({ query: trimmed, speechLatencyMs }),
        });

        const data = await res.json();
        if (res.ok) {
          setStage("speaking");
          setVoiceStatusNote(data.reply);
          if (data.media) {
            setActiveMedia(data.media);
          }
          speakText(data.reply);
          await fetchState();
          setTimeout(() => {
            setStage((prev) => (prev === "speaking" ? "listening" : prev));
          }, 3200);
        } else {
          setStage("listening");
          setVoiceStatusNote(data.error || `Command failed (HTTP ${res.status})`);
          await fetchState();
        }
      } catch (err: any) {
        setStage("listening");
        setVoiceStatusNote(
          `Network error submitting command: ${err?.message || "unreachable"}`
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [fetchState, isSubmitting, speakText]
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
      setVoiceStatusNote(
        "Microphone permission unavailable — using simulated waveform & text/click commands"
      );
    }

    // 2. Setup Web Speech API SpeechRecognition
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setMicActive(true);
      setVoiceStatusNote(
        "Web Speech API not supported in this browser — use command chips or text bar below"
      );
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
        setVoiceStatusNote(
          "Microphone active — speak any question or command (e.g. 'Hello', 'Play lofi music on YouTube')"
        );
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

  // Add Local Scratchpad Note
  const handleAddLocalNote = async (e: React.FormEvent) => {
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

  const handleDeleteLocalNote = async (id: string) => {
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
  const isGmailConnected = Boolean(gmailToken || telemetry?.gmail?.connected);
  const currentMedia = activeMedia || telemetry?.active_media || null;

  const getSignalColorClass = (signal: StockItem["signal"]) => {
    if (signal.includes("BUY")) return "text-[#3dffa2]";
    if (signal.includes("SELL")) return "text-[#ff5a6e]";
    return "text-amber-300";
  };

  const getExecutionBadgeClass = (status: ExecutionReport["status"]) => {
    switch (status) {
      case "COMPLETED":
        return "text-emerald-300 border-emerald-500/40 bg-emerald-950/40";
      case "INITIATED":
        return "text-cyan-300 border-cyan-500/40 bg-cyan-950/40";
      case "REQUIRES_USER_ACTION":
      case "REQUIRES_AUTH":
        return "text-amber-300 border-amber-500/40 bg-amber-950/40";
      default:
        return "text-rose-300 border-rose-500/40 bg-rose-950/40";
    }
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
          CONTEXTUAL TELEMETRY RIBBON (NVIDIA Model + Gmail Auth + Clock)
      ===================================================================== */}
      <div className="border-b border-cyan-500/15 bg-[#040D1A]/80 px-6 py-2 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`font-mono font-medium ${
              telemetry?.ai_configured === false ? "text-amber-400" : "text-emerald-400"
            }`}
          >
            ● AI ENGINE: {telemetry?.model || "mistralai/mistral-large-4-1t-a52b"}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-300">
            Gmail:{" "}
            {isGmailConnected ? (
              <span className="text-emerald-400 font-mono">
                Connected ({telemetry?.gmail?.emailAddress || gmailUserEmail})
              </span>
            ) : (
              <span className="text-amber-300 font-mono">Not Connected</span>
            )}
          </span>
          {!isGmailConnected && (
            <button
              onClick={handleGoogleLogin}
              disabled={isSigningInGmail}
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-4 font-medium cursor-pointer whitespace-nowrap shrink-0"
            >
              {isSigningInGmail ? "Connecting..." : "Connect Gmail"}
            </button>
          )}
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
              failoverActive
                ? "text-amber-400 font-semibold"
                : "text-slate-300 hover:text-white"
            }`}
          >
            {failoverActive ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>
                  ▲ 429 Cooldown ({telemetry?.cooldown_remaining || 60}s) — Restore Cloud
                </span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>● NVIDIA Mistral Active (Test 429 Cooldown)</span>
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
                  {telemetry?.mode || "NVIDIA MISTRAL + TOOLS"}
                </span>
              </div>

              {/* 5 Pipeline Stage Nodes: MIC › EAR › MIND › HANDS › VOICE */}
              <div className="grid grid-cols-5 gap-1.5 font-mono text-center">
                {[
                  {
                    id: "mic",
                    label: "MIC",
                    sub: "stream",
                    active: effectiveStage === "listening",
                  },
                  {
                    id: "ear",
                    label: "EAR",
                    sub: "recognize",
                    active: effectiveStage === "recognizing",
                  },
                  {
                    id: "mind",
                    label: "MIND",
                    sub: "reason",
                    active: effectiveStage === "thinking" || isSubmitting,
                  },
                  {
                    id: "hands",
                    label: "HANDS",
                    sub: "execute",
                    active:
                      Boolean(telemetry?.tool_active) || effectiveStage === "cooldown",
                  },
                  {
                    id: "voice",
                    label: "VOICE",
                    sub: "respond",
                    active: effectiveStage === "speaking",
                  },
                ].map((node) => (
                  <div
                    key={node.id}
                    className={`py-2 px-1 rounded border transition-all ${
                      node.active
                        ? "border-cyan-400 bg-cyan-500/25 text-white shadow-[0_0_12px_rgba(34,211,238,0.35)]"
                        : "border-cyan-500/20 bg-[#020813]/70 text-slate-400"
                    }`}
                  >
                    <div className="text-[11px] font-bold tracking-wider">
                      {node.label}
                    </div>
                    <div className="text-[9px] opacity-80 mt-0.5">{node.sub}</div>
                  </div>
                ))}
              </div>

              {/* Key-Value Telemetry Grid */}
              <div className="mt-3.5 pt-3 border-t border-cyan-500/15 grid grid-cols-2 gap-y-1.5 gap-x-3 font-mono text-[11px]">
                <span className="text-slate-400">AI MODEL</span>
                <span className="text-right text-white truncate" title={telemetry?.model}>
                  {telemetry?.model || "mistralai/mistral-large-4-1t-a52b"}
                </span>

                <span className="text-slate-400">SPEECH LATENCY</span>
                <span className="text-right text-white tabular-nums">
                  {(telemetry?.t_rec ?? 0.35).toFixed(2)} s
                </span>

                <span className="text-slate-400">COGNITION TIME</span>
                <span className="text-right text-white tabular-nums">
                  {(telemetry?.t_think ?? 0.42).toFixed(2)} s
                </span>

                <span className="text-slate-400">LAST TOOL</span>
                <span className="text-right text-cyan-300 truncate">
                  {telemetry?.last_tool || "System Ready"}
                </span>

                <span className="text-slate-400">COMMANDS RUN</span>
                <span className="text-right text-white tabular-nums">
                  {telemetry?.tools ?? 0}
                </span>

                <span className="text-slate-400">HOST OS</span>
                <span className="text-right text-emerald-400 uppercase">
                  {telemetry?.sys?.platform || "win32"}
                </span>
              </div>
            </div>

            {/* Panel 3: Conversation & Verified Execution Log */}
            <div className="border border-cyan-500/25 bg-[#051020]/80 p-4 rounded flex-1 flex flex-col min-h-[300px]">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="font-display text-xs font-semibold tracking-wider text-cyan-400 uppercase">
                  03. Conversation & Execution Audit
                </h2>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {telemetry?.chat?.length || 0} messages
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[360px]">
                {(telemetry?.chat || []).map((m) => (
                  <div
                    key={m.i}
                    className={`p-2.5 rounded border text-xs leading-relaxed ${
                      m.k === "you"
                        ? "border-cyan-500/30 bg-cyan-950/30 text-white"
                        : m.k === "jarvis"
                        ? m.source === "AI_SERVICE_ERROR"
                          ? "border-rose-500/40 bg-rose-950/25 text-rose-100"
                          : "border-emerald-500/30 bg-emerald-950/20 text-emerald-50"
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

                    <div className="whitespace-pre-wrap">{m.x}</div>

                    {/* Structured Tool Execution Evidence Badge */}
                    {m.execution && (
                      <div className="mt-2 pt-2 border-t border-white/10 font-mono text-[10px] space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="text-slate-300">
                            TOOL: <strong className="text-white">{m.execution.tool}</strong>
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${getExecutionBadgeClass(
                              m.execution.status
                            )}`}
                          >
                            {m.execution.status}
                          </span>
                        </div>
                        <div className="text-slate-400 break-words">
                          Evidence: {m.execution.evidence}
                        </div>
                        {m.execution.nextStep && (
                          <div className="text-cyan-300">
                            Next: {m.execution.nextStep}
                          </div>
                        )}
                      </div>
                    )}

                    {m.actionUrl && (
                      <div className="mt-2">
                        <a
                          href={m.actionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {m.actionLabel || "Open Destination"}
                        </a>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>
          </section>

          {/* CENTER STAGE: 3D HOLOGRAPHIC REACTOR, EMBEDDED YOUTUBE PLAYER & COMMAND DOCK (5 cols) */}
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

            {/* Active Embedded YouTube Media Player Dock (Appears when user requests music/video) */}
            {currentMedia && (
              <div className="mx-4 mt-3 border border-cyan-500/40 bg-[#041022]/95 rounded p-3 z-20 shadow-lg">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Youtube className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="font-mono text-xs font-semibold text-white truncate">
                      {currentMedia.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={currentMedia.watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded text-[11px] font-mono bg-cyan-500 text-slate-950 font-semibold hover:bg-cyan-400 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open on YouTube
                    </a>
                    <button
                      onClick={() => setActiveMedia(null)}
                      className="text-slate-400 hover:text-white p-1 cursor-pointer"
                      title="Close Media Dock"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {currentMedia.embedUrl ? (
                  <div className="aspect-video w-full rounded overflow-hidden border border-cyan-500/20 bg-black">
                    <iframe
                      src={currentMedia.embedUrl}
                      title={currentMedia.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="p-3 rounded bg-[#020813] text-xs text-slate-300 font-mono">
                    Search prepared for "{currentMedia.query}". Click "Open on YouTube" above to launch playback in your browser.
                  </div>
                )}
              </div>
            )}

            {/* 3D Canvas Stage */}
            <div className="relative flex-1 min-h-[290px] flex items-center justify-center">
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
                <div className="mt-1 font-mono text-xs text-cyan-300/90 min-h-[18px] px-3 line-clamp-2">
                  {interimTranscript
                    ? `▸ Hearing: "${interimTranscript}"`
                    : voiceStatusNote}
                </div>
              </div>
            </div>

            {/* Bottom Interactive Voice Command Dock & Text Bar */}
            <div className="p-4 border-t border-cyan-500/20 bg-[#051020]/95 z-10">
              <div className="text-[11px] font-mono text-slate-400 mb-2 flex items-center justify-between">
                <span>QUICK CONVERSATION & TOOL TRIGGERS (CLICK OR SPEAK):</span>
                <span className="text-cyan-400">NVIDIA Mistral Large 4</span>
              </div>

              {/* Command chips */}
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
                  placeholder='Ask ORNION anything (e.g., "Hello", "Explain AI simply", "Play lofi music on YouTube")...'
                  className="flex-1 bg-[#020710] border border-cyan-500/35 focus:border-cyan-400 rounded px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none font-mono"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !commandInput.trim()}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-semibold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSubmitting ? "Thinking..." : "Send"}
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
              <div className="divide-y divide-white/5 max-h-[250px] overflow-y-auto pr-1">
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

            {/* Panel 5: Genuine Gmail Inbox Briefing & Activity Cards */}
            <div className="border border-cyan-500/25 bg-[#051020]/80 p-4 rounded flex-1 flex flex-col min-h-[215px]">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <h2 className="font-display text-xs font-semibold tracking-wider text-cyan-400 uppercase">
                  05. Gmail Briefing & System Cards
                </h2>
                {isGmailConnected ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => executeCommand("Check my unread emails", 190)}
                      className="font-mono text-[11px] text-cyan-300 hover:text-white flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Play className="w-3 h-3" /> Speak Gmail Brief
                    </button>
                  </div>
                ) : (
                  <GoogleSignInButton
                    onClick={handleGoogleLogin}
                    disabled={isSigningInGmail}
                    compact
                  />
                )}
              </div>

              {gmailAuthError && (
                <div className="mb-2 p-2 rounded border border-rose-500/40 bg-rose-950/30 text-[11px] text-rose-200 font-mono">
                  {gmailAuthError}
                </div>
              )}

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
                  {telemetry?.sys?.up
                    ? `${Math.floor(telemetry.sys.up / 3600)}h ${Math.floor(
                        (telemetry.sys.up % 3600) / 60
                      )}m`
                    : "0h 15m"}
                </span>
              </div>

              <div className="space-y-2 font-mono text-[11px]">
                {[
                  {
                    label: "CPU LOAD",
                    val: telemetry?.sys?.cpu ?? 18,
                    text: `${telemetry?.sys?.cpu ?? 18}%`,
                  },
                  {
                    label: "RAM USAGE",
                    val: telemetry?.sys?.ram ?? 46,
                    text: `${telemetry?.sys?.ram ?? 46}%`,
                  },
                  {
                    label: "DISK ARRAY",
                    val: telemetry?.sys?.disk ?? 38,
                    text: `${telemetry?.sys?.free ?? 412}G FREE`,
                  },
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
                Powered by <code className="font-mono text-cyan-300">jarvis_market.py</code>{" "}
                algorithm: 5-day 15-minute charts, 5-period vs 15-period moving average crossovers, and momentum signals.
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
                  <span>·</span>
                  <span
                    className={
                      selectedStock.stale ? "text-amber-300" : "text-emerald-400"
                    }
                  >
                    {selectedStock.stale ? "OFFLINE ESTIMATE" : "LIVE YAHOO FEED"}
                  </span>
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
                  <div
                    className={`font-bold text-sm mt-1 ${getSignalColorClass(
                      selectedStock.signal
                    )}`}
                  >
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
                  onClick={() =>
                    executeCommand(`Should I buy ${selectedStock.name}?`, 180)
                  }
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
                        <div className="font-mono text-[11px] text-slate-400">
                          {s.symbol} {s.stale ? "(Offline Est.)" : ""}
                        </div>
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
                        <div
                          className={`font-mono font-bold text-xs ${getSignalColorClass(
                            s.signal
                          )}`}
                        >
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
          TAB 3: AUTOMATION, ALLOWLISTED WINDOWS APPS, YOUTUBE & LIVE GMAIL INBOX
      ===================================================================== */}
      {activeTab === "automation" && (
        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 6 Cols: Allowlisted OS Desktop Apps, YouTube & WhatsApp */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            {/* 01. Allowlisted Windows Desktop Application Launcher */}
            <div className="border border-cyan-500/25 bg-[#051020]/85 p-5 rounded">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-display text-sm font-bold tracking-wider text-cyan-400 uppercase flex items-center gap-2">
                  <Monitor className="w-4 h-4" /> 01. Allowlisted Desktop Applications (Windows 11)
                </h2>
                <span className="font-mono text-[11px] text-emerald-400">
                  HOST: {telemetry?.sys?.platform || "win32"}
                </span>
              </div>
              <p className="text-xs text-slate-300 mb-3">
                Spawns real OS processes from ORNION's verified executable allowlist and checks the assigned PID. Never executes arbitrary shell commands or reports a web URL as a desktop launch.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { label: "Notepad", cmd: "Open Notepad", exe: "notepad.exe" },
                  { label: "Calculator", cmd: "Open Calculator", exe: "calc.exe" },
                  {
                    label: "Visual Studio Code",
                    cmd: "Open Visual Studio Code",
                    exe: "Code.exe",
                  },
                  { label: "Paint", cmd: "Open Paint", exe: "mspaint.exe" },
                  { label: "File Explorer", cmd: "Open File Explorer", exe: "explorer.exe" },
                  { label: "Task Manager", cmd: "Open Task Manager", exe: "Taskmgr.exe" },
                ].map((appItem) => (
                  <button
                    key={appItem.label}
                    onClick={() => {
                      executeCommand(appItem.cmd, 180);
                    }}
                    disabled={isSubmitting}
                    className="p-3 rounded border border-cyan-500/20 bg-[#020813] hover:border-cyan-400/60 hover:bg-cyan-500/10 text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5"
                  >
                    <div className="font-mono text-xs font-semibold text-white">
                      {appItem.label}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400">
                      <span>{appItem.exe}</span>
                      <span>Launch ›</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 02. YouTube Media & Browser Destinations */}
            <div className="border border-cyan-500/25 bg-[#051020]/85 p-5 rounded">
              <h2 className="font-display text-sm font-bold tracking-wider text-cyan-400 uppercase mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" /> 02. YouTube Playback & Web Destinations
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    label: "Play Lofi Music",
                    cmd: "Play lofi music on YouTube",
                    url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
                  },
                  {
                    label: "Play Relaxing Music",
                    cmd: "Play relaxing music",
                    url: "https://www.youtube.com/watch?v=lFcSrYw-ARY",
                  },
                  {
                    label: "Programming Tutorials",
                    cmd: "Search YouTube for programming tutorials",
                    url: "https://www.youtube.com/results?search_query=programming+tutorials",
                  },
                  {
                    label: "Open GitHub",
                    cmd: "Open GitHub",
                    url: "https://github.com",
                  },
                  {
                    label: "Open Gmail Web",
                    cmd: "Open Gmail",
                    url: "https://mail.google.com",
                  },
                  {
                    label: "Open Google Calendar",
                    cmd: "Open Calendar",
                    url: "https://calendar.google.com",
                  },
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
                        Run Tool
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

            {/* 03. WhatsApp Web Draft Preparation */}
            <div className="border border-cyan-500/25 bg-[#051020]/85 p-5 rounded">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-display text-sm font-bold tracking-wider text-cyan-400 uppercase flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> 03. WhatsApp Web Message Preparation
                </h2>
                <span className="font-mono text-xs text-amber-300">
                  ● REQUIRES USER SEND IN BROWSER
                </span>
              </div>
              <p className="text-xs text-slate-300 mb-4">
                Prepares a pre-encoded WhatsApp Web message URL. You must select the recipient and click Send in WhatsApp Web to complete delivery.
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
                    MESSAGE DRAFT
                  </label>
                  <textarea
                    rows={2}
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
                    Prepare via ORNION
                  </button>
                  <a
                    href={`https://web.whatsapp.com/send?text=${encodeURIComponent(
                      waMessage
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 font-mono text-xs rounded transition-colors flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open WhatsApp Web Draft
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Right 6 Cols: Genuine Gmail OAuth 2.0 Inbox & Local Notes */}
          <div className="lg:col-span-6 border border-cyan-500/25 bg-[#051020]/85 p-5 rounded flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/20 pb-4">
              <div>
                <h2 className="font-display text-sm font-bold tracking-wider text-cyan-400 uppercase flex items-center gap-2">
                  <Mail className="w-4 h-4" /> 04. Live Gmail Inbox (OAuth 2.0 · gmail.readonly)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isGmailConnected
                    ? `Authorized account: ${
                        telemetry?.gmail?.emailAddress || gmailUserEmail
                      } · Synced at ${telemetry?.gmail?.lastSyncedAt || "just now"}`
                    : "Disconnected — Sign in with Google to read actual unread emails from your Gmail inbox."}
                </p>
              </div>

              {isGmailConnected ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => syncGmailInbox()}
                    disabled={isSyncingGmail}
                    className="px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 font-mono text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isSyncingGmail ? "animate-spin" : ""}`}
                    />
                    Sync Inbox
                  </button>
                  <button
                    onClick={() => executeCommand("Check my unread emails", 180)}
                    className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" /> Speak Briefing
                  </button>
                  <button
                    onClick={handleGoogleDisconnect}
                    className="p-2 text-slate-400 hover:text-rose-400 border border-slate-700 rounded cursor-pointer"
                    title="Disconnect Gmail OAuth Session"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <GoogleSignInButton
                  onClick={handleGoogleLogin}
                  disabled={isSigningInGmail}
                />
              )}
            </div>

            {gmailAuthError && (
              <div className="p-3 rounded border border-rose-500/40 bg-rose-950/30 text-xs text-rose-200 font-mono">
                {gmailAuthError}
              </div>
            )}

            {/* Disconnected Honest State vs Connected Live Messages */}
            {!isGmailConnected ? (
              <div className="p-6 rounded border border-amber-500/30 bg-[#020813] text-center space-y-3">
                <div className="font-mono text-xs text-amber-300 uppercase tracking-wider">
                  ● GMAIL NOT CONNECTED
                </div>
                <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                  ORNION does not display fabricated unread emails. Click{" "}
                  <strong>Sign in with Google</strong> above to grant read-only permission (
                  <code className="font-mono text-cyan-300">gmail.readonly</code>) and retrieve your actual unread inbox metadata.
                </p>
              </div>
            ) : (telemetry?.unread_emails || []).length === 0 ? (
              <div className="p-6 rounded border border-emerald-500/30 bg-[#020813] text-center space-y-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                <div className="font-mono text-xs text-emerald-300 font-semibold">
                  0 UNREAD EMAILS IN INBOX
                </div>
                <p className="text-xs text-slate-400">
                  Verified live against Gmail API for{" "}
                  {telemetry?.gmail?.emailAddress || gmailUserEmail}.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {(telemetry?.unread_emails || []).map((mail) => (
                  <div
                    key={mail.id}
                    className="p-3.5 rounded border border-cyan-500/20 bg-[#020813] flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="text-emerald-400 font-bold">● LIVE GMAIL</span>
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
                  </div>
                ))}
              </div>
            )}

            {/* Separate Local Scratchpad Notes (Clearly labeled as local notes, not Gmail) */}
            <form
              onSubmit={handleAddLocalNote}
              className="pt-4 border-t border-cyan-500/20 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-cyan-300 font-semibold">
                  LOCAL REMINDER SCRATCHPAD (OFFLINE NOTES — NOT LIVE GMAIL)
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  {(telemetry?.local_notes || []).length} notes
                </span>
              </div>

              {(telemetry?.local_notes || []).length > 0 && (
                <div className="space-y-2 max-h-[140px] overflow-y-auto">
                  {(telemetry?.local_notes || []).map((note) => (
                    <div
                      key={note.id}
                      className="p-2.5 rounded border border-slate-700 bg-[#020813] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-[10px] text-amber-300 mr-2">
                          [LOCAL NOTE]
                        </span>
                        <strong className="text-white">{note.subject}</strong>{" "}
                        <span className="text-slate-400">— {note.snippet}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteLocalNote(note.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={newMailSender}
                  onChange={(e) => setNewMailSender(e.target.value)}
                  placeholder="Category / Contact..."
                  className="sm:col-span-2 bg-[#020813] border border-cyan-500/30 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                />
                <select
                  value={newMailPriority}
                  onChange={(e) =>
                    setNewMailPriority(
                      e.target.value as "HIGH" | "URGENT" | "NORMAL"
                    )
                  }
                  className="bg-[#020813] border border-cyan-500/30 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                >
                  <option value="HIGH">HIGH</option>
                  <option value="URGENT">URGENT</option>
                  <option value="NORMAL">NORMAL</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMailSubject}
                  onChange={(e) => setNewMailSubject(e.target.value)}
                  placeholder="Reminder title..."
                  className="flex-1 bg-[#020813] border border-cyan-500/30 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                />
                <input
                  type="text"
                  value={newMailSnippet}
                  onChange={(e) => setNewMailSnippet(e.target.value)}
                  placeholder="Note details..."
                  className="flex-1 bg-[#020813] border border-cyan-500/30 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Add Note
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
          <span>
            Created and developed by{" "}
            <strong className="text-white font-medium">Praneeth Thota</strong>
          </span>
        </div>
        <div className="font-mono text-[11px] text-slate-500">
          AI Provider: NVIDIA API Catalog (Mistral Large 4) · Third-party libraries & APIs remain property of their respective owners
        </div>
      </footer>
    </div>
  );
}
