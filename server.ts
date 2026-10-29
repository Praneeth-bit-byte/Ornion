import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn, execFileSync } from "child_process";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));

// ============================================================================
// 0. SECURITY & CREDENTIAL SANITIZATION HELPERS
// ============================================================================

function sanitizeSecrets(input: unknown): string {
  const raw = String(input ?? "");
  return raw
    .replace(/nvapi-[a-zA-Z0-9_-]+/g, "[REDACTED_NVIDIA_KEY]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED_TOKEN]")
    .replace(/AIza[a-zA-Z0-9_-]+/g, "[REDACTED_API_KEY]");
}

function getNvidiaApiKey(): string | null {
  const envKey = process.env.NVIDIA_API_KEY?.trim();
  if (
    envKey &&
    envKey !== "YOUR_NVIDIA_API_KEY" &&
    envKey !== "MY_NVIDIA_API_KEY" &&
    envKey.length > 10
  ) {
    return envKey;
  }

  // Optional local keyfile fallback (~/.ornion/nvidia.key or ~/.ornion/free.key)
  const candidates = [
    path.join(os.homedir(), ".ornion", "nvidia.key"),
    path.join(os.homedir(), ".ornion", "free.key"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const val = fs.readFileSync(file, "utf-8").trim();
        if (val.startsWith("nvapi-") && val.length > 20) {
          return val;
        }
      }
    } catch {
      // ignore read errors
    }
  }
  return null;
}

function getNvidiaModel(): string {
  return (process.env.NVIDIA_MODEL || "mistralai/mistral-large-4-1t-a52b").trim();
}

function getNvidiaBaseUrl(): string {
  return (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1")
    .trim()
    .replace(/\/+$/, "");
}

function getNvidiaTimeoutMs(): number {
  const parsed = Number(process.env.NVIDIA_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 3000 ? parsed : 25_000;
}

// ============================================================================
// 1. STRUCTURED EXECUTION REPORT & TELEMETRY TYPES
// ============================================================================

export type ExecutionStatus =
  | "COMPLETED"
  | "INITIATED"
  | "REQUIRES_USER_ACTION"
  | "REQUIRES_AUTH"
  | "UNAVAILABLE"
  | "ERROR";

export interface ExecutionReport {
  intent:
    | "conversation"
    | "youtube_media"
    | "gmail_briefing"
    | "os_app_launch"
    | "web_navigation"
    | "market_intelligence"
    | "whatsapp_prepare"
    | "system_volume"
    | "system_clock"
    | "system_diagnostics";
  tool: string;
  executed: boolean;
  status: ExecutionStatus;
  evidence: string;
  nextStep?: string;
}

export interface YouTubeMediaPayload {
  query: string;
  title: string;
  videoId?: string;
  watchUrl: string;
  embedUrl?: string;
  searchUrl: string;
  mode: "play" | "search";
}

export interface GmailMessageItem {
  id: string;
  threadId?: string;
  sender: string;
  subject: string;
  snippet: string;
  priority: "HIGH" | "URGENT" | "NORMAL";
  receivedAt: string;
  isLiveGmail: boolean;
}

export interface GmailStatusState {
  connected: boolean;
  emailAddress: string | null;
  unreadCount: number;
  lastSyncedAt: string | null;
  error: string | null;
}

interface ChatLogItem {
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

interface BriefingCardItem {
  i: number;
  title: string;
  body: string;
  t: string;
  actionUrl?: string;
  actionLabel?: string;
  category?: "market" | "mail" | "whatsapp" | "system";
}

// ============================================================================
// 2. ORNION MARKET INTELLIGENCE ENGINE (LIVE YAHOO FINANCE + LABELED FALLBACK)
// ============================================================================

const DEFAULT_TICKERS: Record<
  string,
  { name: string; currency: string; category: "india" | "global"; basePrice: number }
> = {
  "^NSEI": { name: "Nifty 50", currency: "₹", category: "india", basePrice: 24850.4 },
  "^BSESN": { name: "Sensex", currency: "₹", category: "india", basePrice: 81420.15 },
  "RELIANCE.NS": { name: "Reliance Industries", currency: "₹", category: "india", basePrice: 2945.8 },
  "TCS.NS": { name: "TCS", currency: "₹", category: "india", basePrice: 4128.5 },
  "INFY.NS": { name: "Infosys", currency: "₹", category: "india", basePrice: 1876.25 },
  "HDFCBANK.NS": { name: "HDFC Bank", currency: "₹", category: "india", basePrice: 1742.9 },
  NVDA: { name: "Nvidia", currency: "$", category: "global", basePrice: 138.6 },
  AAPL: { name: "Apple", currency: "$", category: "global", basePrice: 234.15 },
  "BTC-USD": { name: "Bitcoin", currency: "$", category: "global", basePrice: 89450.0 },
};

interface StockAnalysis {
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
  dataSource: "LIVE_YAHOO_FINANCE" | "OFFLINE_ESTIMATE";
  updatedAt: string;
}

const marketCache = new Map<string, { data: StockAnalysis; timestamp: number }>();
const CACHE_TTL_MS = 45_000;

function computeSignalFromQuotes(
  symbol: string,
  name: string,
  currency: string,
  category: "india" | "global",
  price: number,
  prevClose: number,
  validQuotes: number[],
  high: number,
  low: number,
  stale: boolean,
  dataSource: "LIVE_YAHOO_FINANCE" | "OFFLINE_ESTIMATE"
): StockAnalysis {
  const change = price - prevClose;
  const pctChange = prevClose ? (change / prevClose) * 100 : 0;

  let signal: StockAnalysis["signal"] = "HOLD";
  let reason = "Consolidating near previous close within intraday equilibrium band.";
  let smaShort = price;
  let smaLong = price;
  let above = true;
  let mom = pctChange;

  if (validQuotes.length >= 10) {
    const shortSlice = validQuotes.slice(-5);
    const longSlice = validQuotes.slice(-15);
    smaShort = shortSlice.reduce((a, b) => a + b, 0) / shortSlice.length;
    smaLong = longSlice.reduce((a, b) => a + b, 0) / longSlice.length;
    above = price >= smaShort;

    const firstQuote = validQuotes[0] || prevClose;
    mom = firstQuote ? ((price - firstQuote) / firstQuote) * 100 : pctChange;

    if (price > smaShort && smaShort > smaLong && pctChange > 0.5) {
      signal = "STRONG BUY";
      reason = "Bullish momentum above short-term (5-period) and medium-term (15-period) moving averages.";
    } else if (price > smaShort && pctChange >= 0.0) {
      signal = "BUY / ACCUMULATE";
      reason = "Holding above short-term SMA support with positive accumulation flow.";
    } else if (price < smaShort && smaShort < smaLong && pctChange < -0.5) {
      signal = "STRONG SELL";
      reason = "Bearish crossover below major moving averages with active distribution pressure.";
    } else if (price < smaShort) {
      signal = "SELL / TAKE PROFIT";
      reason = "Slipping below intraday 5-period SMA support; elevated risk of mean reversion.";
    }
  }

  if (stale) {
    reason = `[Offline Estimate — Yahoo Finance unreachable] ${reason}`;
  }

  return {
    sym: symbol,
    symbol,
    name,
    category,
    currency,
    price: Number(price.toFixed(2)),
    change: Number(change.toFixed(2)),
    pct: Number(pctChange.toFixed(2)),
    pct_change: Number(pctChange.toFixed(2)),
    mom: Number(mom.toFixed(2)),
    above,
    smaShort: Number(smaShort.toFixed(2)),
    smaLong: Number(smaLong.toFixed(2)),
    signal,
    reason,
    high: Number(high.toFixed(2)),
    low: Number(low.toFixed(2)),
    spark: validQuotes.slice(-24),
    stale,
    dataSource,
    updatedAt: new Date().toLocaleTimeString("en-GB", { hour12: false }),
  };
}

function generateOfflineEstimateSeries(
  symbol: string,
  metaInfo: { name: string; currency: string; category: "india" | "global"; basePrice: number }
): StockAnalysis {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = (hash * 31 + symbol.charCodeAt(i)) % 10000;
  }
  const quotes: number[] = [];
  let curr = metaInfo.basePrice;
  for (let i = 0; i < 24; i++) {
    const wave = Math.sin((hash + i) * 0.5) * 0.002;
    curr = curr * (1 + wave);
    quotes.push(Number(curr.toFixed(2)));
  }
  const price = quotes[quotes.length - 1];
  const prevClose = quotes[0];
  const high = Math.max(...quotes);
  const low = Math.min(...quotes);

  return computeSignalFromQuotes(
    symbol,
    metaInfo.name,
    metaInfo.currency,
    metaInfo.category,
    price,
    prevClose,
    quotes,
    high,
    low,
    true, // Marked stale = true so UI and voice briefings never pass offline estimates off as live data
    "OFFLINE_ESTIMATE"
  );
}

async function analyzeTicker(symbol: string): Promise<StockAnalysis> {
  const cleanSym = symbol.toUpperCase().trim();
  const cached = marketCache.get(cleanSym);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const metaInfo = DEFAULT_TICKERS[cleanSym] || {
    name: cleanSym.replace(".NS", ""),
    currency: cleanSym.endsWith(".NS") || cleanSym.startsWith("^") ? "₹" : "$",
    category: (cleanSym.endsWith(".NS") || cleanSym.startsWith("^") ? "india" : "global") as
      | "india"
      | "global",
    basePrice: 500,
  };

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSym)}?range=5d&interval=15m`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (resp.ok) {
      const json: any = await resp.json();
      const result = json?.chart?.result?.[0];
      if (result) {
        const meta = result.meta || {};
        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose || meta.previousClose || price;
        const rawQuotes: Array<number | null> = result.indicators?.quote?.[0]?.close || [];
        const validQuotes = rawQuotes.filter(
          (q): q is number => typeof q === "number" && !Number.isNaN(q)
        );

        if (typeof price === "number" && validQuotes.length > 0) {
          const currencyCode =
            meta.currency ||
            (cleanSym.includes(".NS") || cleanSym.startsWith("^") ? "INR" : "USD");
          const currSym = currencyCode === "INR" ? "₹" : "$";
          const high = meta.regularMarketDayHigh || Math.max(...validQuotes.slice(-12), price);
          const low = meta.regularMarketDayLow || Math.min(...validQuotes.slice(-12), price);

          const analysis = computeSignalFromQuotes(
            cleanSym,
            DEFAULT_TICKERS[cleanSym]?.name || meta.shortName || cleanSym,
            currSym,
            metaInfo.category,
            price,
            prevClose,
            validQuotes,
            high,
            low,
            false,
            "LIVE_YAHOO_FINANCE"
          );
          marketCache.set(cleanSym, { data: analysis, timestamp: Date.now() });
          return analysis;
        }
      }
    }
  } catch {
    // Yahoo Finance unreachable or timed out
  }

  const fallback = generateOfflineEstimateSeries(cleanSym, metaInfo);
  marketCache.set(cleanSym, { data: fallback, timestamp: Date.now() });
  return fallback;
}

async function getMarketWatchlist(): Promise<StockAnalysis[]> {
  const symbols = Object.keys(DEFAULT_TICKERS);
  return Promise.all(symbols.map((sym) => analyzeTicker(sym)));
}

async function getSpokenMarketBriefing(): Promise<{ text: string; anyStale: boolean }> {
  const focus = ["^NSEI", "RELIANCE.NS", "NVDA", "BTC-USD"];
  const items = await Promise.all(focus.map((s) => analyzeTicker(s)));
  const anyStale = items.some((i) => i.stale);
  const sentences = items.map((d) => {
    const dir = d.pct_change >= 0 ? "up" : "down";
    return `${d.name} is at ${d.currency}${d.price.toLocaleString("en-IN")}, ${dir} ${Math.abs(d.pct_change)}% (${d.signal}).`;
  });
  const prefix = anyStale
    ? "Note: Some quotes are using cached offline estimates because Yahoo Finance was unreachable. "
    : "";
  return {
    text: prefix + sentences.join(" "),
    anyStale,
  };
}

// ============================================================================
// 3. REAL YOUTUBE SEARCH & EMBED RESOLVER
// ============================================================================

const CURATED_YOUTUBE_STREAMS: Record<string, { videoId: string; title: string }> = {
  lofi: { videoId: "jfKfPfyJRdk", title: "lofi hip hop radio 📚 beats to relax/study to (Lofi Girl)" },
  "lo-fi": { videoId: "jfKfPfyJRdk", title: "lofi hip hop radio 📚 beats to relax/study to (Lofi Girl)" },
  "relaxing music": { videoId: "lFcSrYw-ARY", title: "Relaxing Ambient Study & Focus Music" },
  relaxing: { videoId: "lFcSrYw-ARY", title: "Relaxing Ambient Study & Focus Music" },
  jazz: { videoId: "Dx5qFachd3A", title: "Relaxing Jazz Piano Radio - Slow Jazz Music" },
  ambient: { videoId: "S_MOd40zlYU", title: "Dark Space Ambient Music for Coding & Focus" },
  classical: { videoId: "BMuknRb7woc", title: "Classical Piano Music for Studying & Concentration" },
};

async function resolveYouTubeVideo(
  rawQuery: string,
  mode: "play" | "search"
): Promise<YouTubeMediaPayload> {
  const cleanQuery = rawQuery.trim() || "lofi hip hop radio";
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;

  // 1. Try live YouTube search scrape to find top real playable videoId and title
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (resp.ok) {
      const html = await resp.text();
      const match = html.match(
        /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"/
      );
      if (match && match[1]) {
        const videoId = match[1];
        const title = match[2] || cleanQuery;
        return {
          query: cleanQuery,
          title,
          videoId,
          watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
          embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`,
          searchUrl,
          mode,
        };
      }
    }
  } catch {
    // Fall back to curated stream or search URL if YouTube scrape times out
  }

  // 2. Check curated known streams for common music genres
  const qLower = cleanQuery.toLowerCase();
  for (const [key, item] of Object.entries(CURATED_YOUTUBE_STREAMS)) {
    if (qLower.includes(key)) {
      return {
        query: cleanQuery,
        title: item.title,
        videoId: item.videoId,
        watchUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
        embedUrl: `https://www.youtube.com/embed/${item.videoId}?autoplay=1&rel=0`,
        searchUrl,
        mode,
      };
    }
  }

  // 3. Return honest search URL without claiming a direct video stream was embedded
  return {
    query: cleanQuery,
    title: `YouTube Search: ${cleanQuery}`,
    watchUrl: searchUrl,
    searchUrl,
    mode,
  };
}

// ============================================================================
// 4. REAL GMAIL OAUTH 2.0 API INTEGRATION
// ============================================================================

let liveGmailMessages: GmailMessageItem[] = [];
let gmailStatus: GmailStatusState = {
  connected: false,
  emailAddress: null,
  unreadCount: 0,
  lastSyncedAt: null,
  error: null,
};

// Separate local scratchpad notes (never presented as live Gmail unread messages)
let localScratchpadNotes: Array<{
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  priority: "HIGH" | "URGENT" | "NORMAL";
  receivedAt: string;
}> = [];

function parseEmailHeader(headers: Array<{ name: string; value: string }>, targetName: string): string {
  const found = headers.find((h) => h.name.toLowerCase() === targetName.toLowerCase());
  return found?.value || "";
}

async function fetchLiveGmailUnread(accessToken: string): Promise<{
  ok: boolean;
  status: number;
  emailAddress: string | null;
  messages: GmailMessageItem[];
  unreadCount: number;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    // 1. Verify profile & get email address
    const profileResp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });

    if (!profileResp.ok) {
      clearTimeout(timer);
      const errBody = await profileResp.text().catch(() => "");
      let reason = `Gmail API returned HTTP ${profileResp.status}`;
      if (profileResp.status === 401) {
        reason = "Google OAuth access token expired or was revoked. Please sign in with Google again.";
      } else if (profileResp.status === 403) {
        reason = "Gmail read permission (gmail.readonly) was not granted or Gmail API is disabled.";
      } else if (errBody) {
        reason = `Gmail API error (${profileResp.status}): ${sanitizeSecrets(errBody.slice(0, 160))}`;
      }
      gmailStatus = {
        connected: false,
        emailAddress: null,
        unreadCount: 0,
        lastSyncedAt: null,
        error: reason,
      };
      liveGmailMessages = [];
      return { ok: false, status: profileResp.status, emailAddress: null, messages: [], unreadCount: 0, error: reason };
    }

    const profileData: any = await profileResp.json();
    const emailAddress: string = profileData.emailAddress || "Authorized Gmail Account";

    // 2. List unread messages in INBOX
    const listResp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+in:inbox&maxResults=8",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      }
    );

    if (!listResp.ok) {
      clearTimeout(timer);
      const reason = `Failed to list unread Gmail messages (HTTP ${listResp.status}).`;
      gmailStatus.error = reason;
      return { ok: false, status: listResp.status, emailAddress, messages: [], unreadCount: 0, error: reason };
    }

    const listData: any = await listResp.json();
    const msgRefs: Array<{ id: string; threadId?: string }> = listData.messages || [];
    const resultSizeEstimate: number = listData.resultSizeEstimate ?? msgRefs.length;

    if (msgRefs.length === 0) {
      clearTimeout(timer);
      liveGmailMessages = [];
      gmailStatus = {
        connected: true,
        emailAddress,
        unreadCount: 0,
        lastSyncedAt: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        error: null,
      };
      return { ok: true, status: 200, emailAddress, messages: [], unreadCount: 0 };
    }

    // 3. Fetch metadata for each unread message
    const detailed = await Promise.all(
      msgRefs.slice(0, 8).map(async (ref) => {
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          ref.id
        )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
        const mResp = await fetch(msgUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (!mResp.ok) return null;
        const mJson: any = await mResp.json();
        const headers: Array<{ name: string; value: string }> = mJson.payload?.headers || [];
        const rawFrom = parseEmailHeader(headers, "From") || "Unknown Sender";
        const cleanSender = rawFrom.replace(/<[^>]+>/g, "").replace(/"/g, "").trim() || rawFrom;
        const subject = parseEmailHeader(headers, "Subject") || "(No Subject)";
        const rawDate = parseEmailHeader(headers, "Date");
        const labels: string[] = mJson.labelIds || [];
        const priority: "URGENT" | "HIGH" | "NORMAL" = labels.includes("IMPORTANT")
          ? "HIGH"
          : "NORMAL";

        let receivedAt = "Unread";
        if (rawDate) {
          const parsedDate = new Date(rawDate);
          if (!Number.isNaN(parsedDate.getTime())) {
            receivedAt = parsedDate.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            });
          }
        }

        const item: GmailMessageItem = {
          id: ref.id,
          threadId: ref.threadId,
          sender: cleanSender,
          subject,
          snippet: mJson.snippet || "",
          priority,
          receivedAt,
          isLiveGmail: true,
        };
        return item;
      })
    );

    clearTimeout(timer);
    const validMessages = detailed.filter((m): m is GmailMessageItem => m !== null);
    liveGmailMessages = validMessages;
    gmailStatus = {
      connected: true,
      emailAddress,
      unreadCount: Math.max(validMessages.length, resultSizeEstimate),
      lastSyncedAt: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      error: null,
    };

    return {
      ok: true,
      status: 200,
      emailAddress,
      messages: validMessages,
      unreadCount: gmailStatus.unreadCount,
    };
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "Gmail API request timed out after 10 seconds."
        : `Gmail request failed: ${sanitizeSecrets(err?.message || err)}`;
    gmailStatus.error = msg;
    return {
      ok: false,
      status: 500,
      emailAddress: gmailStatus.emailAddress,
      messages: [],
      unreadCount: 0,
      error: msg,
    };
  }
}

// ============================================================================
// 5. ALLOWLISTED WINDOWS & CROSS-PLATFORM DESKTOP APPLICATION LAUNCHER
// ============================================================================

interface AllowlistedDesktopApp {
  id: string;
  displayName: string;
  aliases: string[];
  winCandidates: string[];
  macAppName: string;
  linuxCandidates: string[];
  webAlternativeUrl?: string;
}

const DESKTOP_APP_ALLOWLIST: AllowlistedDesktopApp[] = [
  {
    id: "notepad",
    displayName: "Notepad",
    aliases: ["notepad", "notepad.exe", "text editor"],
    winCandidates: [
      path.join(process.env.SystemRoot || "C:\\Windows", "System32", "notepad.exe"),
      path.join(process.env.SystemRoot || "C:\\Windows", "notepad.exe"),
      "notepad.exe",
    ],
    macAppName: "TextEdit",
    linuxCandidates: ["gedit", "kate", "mousepad", "xed"],
  },
  {
    id: "calculator",
    displayName: "Calculator",
    aliases: ["calculator", "calc", "calc.exe"],
    winCandidates: [
      path.join(process.env.SystemRoot || "C:\\Windows", "System32", "calc.exe"),
      "calc.exe",
    ],
    macAppName: "Calculator",
    linuxCandidates: ["gnome-calculator", "kcalc", "galculator"],
  },
  {
    id: "vscode",
    displayName: "Visual Studio Code",
    aliases: ["visual studio code", "vs code", "vscode", "code"],
    winCandidates: [
      path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "Microsoft VS Code",
        "Code.exe"
      ),
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft VS Code", "Code.exe"),
      path.join(
        process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
        "Microsoft VS Code",
        "Code.exe"
      ),
    ],
    macAppName: "Visual Studio Code",
    linuxCandidates: ["code", "codium"],
    webAlternativeUrl: "https://vscode.dev",
  },
  {
    id: "mspaint",
    displayName: "Paint",
    aliases: ["paint", "mspaint", "ms paint"],
    winCandidates: [
      path.join(process.env.SystemRoot || "C:\\Windows", "System32", "mspaint.exe"),
      "mspaint.exe",
    ],
    macAppName: "Preview",
    linuxCandidates: ["kolourpaint", "gimp"],
  },
  {
    id: "explorer",
    displayName: "File Explorer",
    aliases: ["file explorer", "explorer", "windows explorer", "files"],
    winCandidates: [
      path.join(process.env.SystemRoot || "C:\\Windows", "explorer.exe"),
      "explorer.exe",
    ],
    macAppName: "Finder",
    linuxCandidates: ["nautilus", "dolphin", "thunar"],
  },
  {
    id: "taskmgr",
    displayName: "Task Manager",
    aliases: ["task manager", "taskmgr"],
    winCandidates: [
      path.join(process.env.SystemRoot || "C:\\Windows", "System32", "Taskmgr.exe"),
      "taskmgr.exe",
    ],
    macAppName: "Activity Monitor",
    linuxCandidates: ["gnome-system-monitor", "ksysguard"],
  },
  {
    id: "cmd",
    displayName: "Command Prompt",
    aliases: ["command prompt", "cmd", "terminal"],
    winCandidates: [
      path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe"),
    ],
    macAppName: "Terminal",
    linuxCandidates: ["gnome-terminal", "konsole", "xfce4-terminal"],
  },
  {
    id: "powershell",
    displayName: "Windows PowerShell",
    aliases: ["powershell", "windows powershell"],
    winCandidates: [
      path.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe"
      ),
    ],
    macAppName: "Terminal",
    linuxCandidates: ["pwsh"],
  },
];

function resolveWindowsExecutable(appEntry: AllowlistedDesktopApp): string | null {
  for (const candidate of appEntry.winCandidates) {
    if (!candidate) continue;
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  // Check PATH via where.exe without shell
  const binaryNames =
    appEntry.id === "vscode"
      ? ["Code.exe", "code.cmd", "code"]
      : appEntry.winCandidates.map((c) => path.basename(c));
  for (const bin of binaryNames) {
    try {
      const out = execFileSync("where.exe", [bin], {
        encoding: "utf-8",
        timeout: 2500,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const firstLine = out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && fs.existsSync(l));
      if (firstLine) return firstLine;
    } catch {
      // not found in PATH
    }
  }
  return null;
}

function resolveLinuxExecutable(appEntry: AllowlistedDesktopApp): string | null {
  for (const bin of appEntry.linuxCandidates) {
    try {
      const out = execFileSync("which", [bin], {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (out && fs.existsSync(out)) return out;
    } catch {
      // continue
    }
  }
  return null;
}

async function launchAllowlistedDesktopApp(targetRaw: string): Promise<{
  reply: string;
  toolName: string;
  execution: ExecutionReport;
  actionUrl?: string;
  actionLabel?: string;
}> {
  const cleaned = targetRaw.toLowerCase().trim();

  // Security check: Reject any command injection / shell metacharacters
  if (/[;&|`$<>]/.test(cleaned) || cleaned.includes("..")) {
    return {
      reply: `Rejected unsafe application launch request ("${targetRaw}"). ORNION only launches verified applications from its security allowlist.`,
      toolName: "OS Application Guard",
      execution: {
        intent: "os_app_launch",
        tool: "OS Application Guard",
        executed: false,
        status: "ERROR",
        evidence: "Input contained disallowed shell metacharacters or path traversal.",
        nextStep: `Request an allowlisted app: ${DESKTOP_APP_ALLOWLIST.map((a) => a.displayName).join(", ")}.`,
      },
    };
  }

  const matchedApp = DESKTOP_APP_ALLOWLIST.find((entry) =>
    entry.aliases.some((alias) => cleaned === alias || cleaned.includes(alias))
  );

  if (!matchedApp) {
    const allowedList = DESKTOP_APP_ALLOWLIST.map((a) => a.displayName).join(", ");
    return {
      reply: `"${targetRaw}" is not on ORNION's verified desktop application allowlist. Supported desktop applications are: ${allowedList}.`,
      toolName: "OS Application Launcher",
      execution: {
        intent: "os_app_launch",
        tool: "OS Application Launcher",
        executed: false,
        status: "UNAVAILABLE",
        evidence: `Target "${targetRaw}" is not in DESKTOP_APP_ALLOWLIST.`,
        nextStep: `Try "Open Notepad", "Open Calculator", or "Open Visual Studio Code".`,
      },
    };
  }

  const platform = process.platform;

  if (platform === "win32") {
    const exePath = resolveWindowsExecutable(matchedApp);
    if (!exePath) {
      const checked = matchedApp.winCandidates.filter(Boolean).join("; ");
      const webHint = matchedApp.webAlternativeUrl
        ? ` Note: The desktop app is not installed, so it was NOT launched. You can optionally open the web version below.`
        : "";
      return {
        reply: `${matchedApp.displayName} is not installed on this Windows system (checked: ${checked}).${webHint}`,
        toolName: `Windows App Launcher (${matchedApp.displayName})`,
        actionUrl: matchedApp.webAlternativeUrl,
        actionLabel: matchedApp.webAlternativeUrl
          ? `Open ${matchedApp.displayName} Web (Desktop Not Installed)`
          : undefined,
        execution: {
          intent: "os_app_launch",
          tool: `Windows App Launcher (${matchedApp.displayName})`,
          executed: false,
          status: "UNAVAILABLE",
          evidence: `Executable not found on Windows. Checked paths: ${checked}`,
          nextStep: `Install ${matchedApp.displayName} on Windows or verify its installation path.`,
        },
      };
    }

    // Spawn verified Windows executable without shell (unless .cmd wrapper for VS Code)
    return new Promise((resolve) => {
      try {
        const isCmdScript = exePath.toLowerCase().endsWith(".cmd");
        const child = isCmdScript
          ? spawn("cmd.exe", ["/c", exePath], {
              detached: true,
              stdio: "ignore",
              windowsHide: false,
            })
          : spawn(exePath, [], {
              detached: true,
              stdio: "ignore",
              shell: false,
            });

        let failed = false;
        child.once("error", (err) => {
          failed = true;
          resolve({
            reply: `Failed to start ${matchedApp.displayName}: ${err.message}`,
            toolName: `Windows App Launcher (${matchedApp.displayName})`,
            execution: {
              intent: "os_app_launch",
              tool: `Windows App Launcher (${matchedApp.displayName})`,
              executed: true,
              status: "ERROR",
              evidence: `spawn(${exePath}) failed: ${err.message}`,
            },
          });
        });

        setTimeout(() => {
          if (failed) return;
          if (child.pid && child.pid > 0) {
            child.unref();
            resolve({
              reply: `Launched ${matchedApp.displayName} on Windows (verified PID ${child.pid}).`,
              toolName: `Windows App Launcher (${matchedApp.displayName})`,
              execution: {
                intent: "os_app_launch",
                tool: `Windows App Launcher (${matchedApp.displayName})`,
                executed: true,
                status: "COMPLETED",
                evidence: `Process spawned on Windows 11/10 — Executable: ${exePath}, PID: ${child.pid}`,
              },
            });
          } else {
            resolve({
              reply: `Attempted to launch ${matchedApp.displayName}, but the OS did not assign a process ID.`,
              toolName: `Windows App Launcher (${matchedApp.displayName})`,
              execution: {
                intent: "os_app_launch",
                tool: `Windows App Launcher (${matchedApp.displayName})`,
                executed: true,
                status: "ERROR",
                evidence: `No PID returned for ${exePath}`,
              },
            });
          }
        }, 350);
      } catch (err: any) {
        resolve({
          reply: `Error launching ${matchedApp.displayName}: ${err?.message || err}`,
          toolName: `Windows App Launcher (${matchedApp.displayName})`,
          execution: {
            intent: "os_app_launch",
            tool: `Windows App Launcher (${matchedApp.displayName})`,
            executed: false,
            status: "ERROR",
            evidence: String(err?.message || err),
          },
        });
      }
    });
  }

  if (platform === "darwin") {
    try {
      execFileSync("open", ["-a", matchedApp.macAppName], { timeout: 4000 });
      return {
        reply: `Launched ${matchedApp.macAppName} on macOS.`,
        toolName: `macOS App Launcher (${matchedApp.macAppName})`,
        execution: {
          intent: "os_app_launch",
          tool: `macOS App Launcher (${matchedApp.macAppName})`,
          executed: true,
          status: "COMPLETED",
          evidence: `Executed 'open -a "${matchedApp.macAppName}"' with exit code 0.`,
        },
      };
    } catch (err: any) {
      return {
        reply: `Could not launch ${matchedApp.macAppName} on macOS: application not found.`,
        toolName: `macOS App Launcher (${matchedApp.macAppName})`,
        execution: {
          intent: "os_app_launch",
          tool: `macOS App Launcher (${matchedApp.macAppName})`,
          executed: false,
          status: "UNAVAILABLE",
          evidence: String(err?.message || err),
        },
      };
    }
  }

  // Linux / Cloud Container host
  const linuxBin = resolveLinuxExecutable(matchedApp);
  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  if (!linuxBin || !hasDisplay) {
    return {
      reply: `Cannot launch desktop application "${matchedApp.displayName}" because the backend is currently running on a headless Linux environment (${platform}) without "${matchedApp.linuxCandidates[0]}" or an active GUI display. When you run "npm run dev" locally on your Windows 11 PC, ORNION spawns "${matchedApp.winCandidates[0]}" directly and verifies the Windows PID.`,
      toolName: `OS App Launcher (${matchedApp.displayName})`,
      actionUrl: matchedApp.webAlternativeUrl,
      actionLabel: matchedApp.webAlternativeUrl
        ? `Open ${matchedApp.displayName} Web (Optional)`
        : undefined,
      execution: {
        intent: "os_app_launch",
        tool: `OS App Launcher (${matchedApp.displayName})`,
        executed: false,
        status: "UNAVAILABLE",
        evidence: `Host OS is ${platform} (DISPLAY=${process.env.DISPLAY || "none"}, binary=${linuxBin || "not installed"}). Desktop GUI launch requires local Windows/macOS/Linux desktop session.`,
        nextStep: `Run 'npm run dev' on your local Windows 11 PC to launch native Windows executables (${matchedApp.winCandidates[0]}).`,
      },
    };
  }

  const child = spawn(linuxBin, [], { detached: true, stdio: "ignore", shell: false });
  child.unref();
  return {
    reply: `Launched ${matchedApp.displayName} (${linuxBin}, PID ${child.pid}).`,
    toolName: `Linux App Launcher (${matchedApp.displayName})`,
    execution: {
      intent: "os_app_launch",
      tool: `Linux App Launcher (${matchedApp.displayName})`,
      executed: true,
      status: "COMPLETED",
      evidence: `Spawned ${linuxBin} with PID ${child.pid}.`,
    },
  };
}

// ============================================================================
// 6. STATE, CONVERSATION MEMORY & BRIEFING CARDS
// ============================================================================

const WEB_SITES: Record<string, { title: string; url: string }> = {
  youtube: { title: "YouTube", url: "https://www.youtube.com" },
  whatsapp: { title: "WhatsApp Web", url: "https://web.whatsapp.com" },
  gmail: { title: "Gmail", url: "https://mail.google.com" },
  google: { title: "Google", url: "https://www.google.com" },
  github: { title: "GitHub", url: "https://github.com" },
  maps: { title: "Google Maps", url: "https://maps.google.com" },
  "google maps": { title: "Google Maps", url: "https://maps.google.com" },
  calendar: { title: "Google Calendar", url: "https://calendar.google.com" },
  "google calendar": { title: "Google Calendar", url: "https://calendar.google.com" },
  drive: { title: "Google Drive", url: "https://drive.google.com" },
  "google drive": { title: "Google Drive", url: "https://drive.google.com" },
  spotify: { title: "Spotify Web Player", url: "https://open.spotify.com" },
};

let chatCounter = 2;
let cardCounter = 2;
let toolsRunCount = 0;
let systemVolume = 75;
let systemMuted = false;
let cooldownUntil = 0;
let simulatedFailoverMode = false;
let lastAiError: string | null = null;
let activeYouTubeMedia: YouTubeMediaPayload | null = null;

// Deduplication guard against rapid duplicate submissions
let lastProcessedCommand = { query: "", timestamp: 0 };

// Multi-turn conversation memory for NVIDIA Mistral Large 4
interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}
let conversationMemory: ConversationTurn[] = [];

const nowTimeStr = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

let chatHistory: ChatLogItem[] = [
  {
    i: 1,
    k: "sys",
    x: `ORNION — Personal AI Assistant initialized. AI Provider: NVIDIA API Catalog (${getNvidiaModel()}).`,
    t: nowTimeStr(),
    source: "LOCAL_DETERMINISTIC",
  },
  {
    i: 2,
    k: "jarvis",
    x: "Hello! I am ORNION, your personal AI assistant created by Praneeth Thota. I am connected to NVIDIA Mistral Large 4 for conversation and reasoning, and wired to real tools for YouTube media, Gmail unread briefings, live market analysis, and allowlisted desktop actions. How can I help you?",
    t: nowTimeStr(),
    source: "NVIDIA_MISTRAL",
  },
];

let briefingCards: BriefingCardItem[] = [
  {
    i: 1,
    title: "ORNION AI BACKEND · NVIDIA MISTRAL LARGE 4",
    body: `Configured model: ${getNvidiaModel()} via NVIDIA API Catalog. Multi-turn conversational memory and validated tool execution are active.`,
    t: nowTimeStr(),
    category: "system",
  },
  {
    i: 2,
    title: "GMAIL INTEGRATION · READY FOR AUTHORIZATION",
    body: "Gmail is currently disconnected. Click 'Sign in with Google' to authorize read-only access (gmail.readonly) and retrieve your real unread inbox messages.",
    t: nowTimeStr(),
    category: "mail",
  },
];

let hudRuntimeState = {
  state: "listening" as "listening" | "recognizing" | "thinking" | "speaking" | "idle",
  note: "ORNION AI ONLINE · NVIDIA MISTRAL LARGE 4",
  mode: "NVIDIA MISTRAL + TOOLS",
  model: getNvidiaModel(),
  t_rec: 0.35,
  t_think: 0.42,
  last_tool: "System Ready",
  last_you: "",
  tool_active: false,
};

function addCard(
  title: string,
  body: string,
  category: BriefingCardItem["category"] = "system",
  actionUrl?: string,
  actionLabel?: string
) {
  cardCounter += 1;
  briefingCards.unshift({
    i: cardCounter,
    title,
    body,
    t: nowTimeStr(),
    category,
    actionUrl,
    actionLabel,
  });
  if (briefingCards.length > 12) {
    briefingCards = briefingCards.slice(0, 12);
  }
}

function addChat(
  k: ChatLogItem["k"],
  x: string,
  source?: ChatLogItem["source"],
  actionUrl?: string,
  actionLabel?: string,
  execution?: ExecutionReport,
  media?: YouTubeMediaPayload
) {
  chatCounter += 1;
  const item: ChatLogItem = {
    i: chatCounter,
    k,
    x,
    t: nowTimeStr(),
    source,
    actionUrl,
    actionLabel,
    execution,
    media,
  };
  chatHistory.push(item);
  if (chatHistory.length > 80) {
    chatHistory = chatHistory.slice(-80);
  }
  return item;
}

function recordConversationTurn(userText: string, assistantText: string) {
  conversationMemory.push(
    { role: "user", content: userText },
    { role: "assistant", content: assistantText }
  );
  if (conversationMemory.length > 16) {
    conversationMemory = conversationMemory.slice(-16);
  }
}

// ============================================================================
// 7. STRICT DETERMINISTIC TOOL ROUTER (NO FALSE-POSITIVE INTERCEPTION)
// ============================================================================

interface ToolDispatchResult {
  reply: string;
  toolName: string;
  source:
    | "NVIDIA_MISTRAL"
    | "LOCAL_DETERMINISTIC"
    | "FAILOVER_ENGINE"
    | "AI_SERVICE_ERROR";
  actionUrl?: string;
  actionLabel?: string;
  execution: ExecutionReport;
  media?: YouTubeMediaPayload;
}

async function tryStrictDeterministicTool(
  rawQuery: string,
  gmailAccessToken?: string | null
): Promise<ToolDispatchResult | null> {
  const qTrim = rawQuery.trim();
  const qClean = qTrim.toLowerCase().replace(/^[.,!?\s]+|[.,!?\s]+$/g, "");

  // --------------------------------------------------------------------------
  // A. YOUTUBE PLAYBACK & SEARCH COMMANDS
  // --------------------------------------------------------------------------
  const ytPlayExplicit = qClean.match(
    /^(?:please\s+)?(?:play|stream|listen\s+to)\s+(.+?)\s+(?:on|in|from)\s+youtube$/i
  );
  const ytSearchExplicit =
    qClean.match(/^(?:please\s+)?(?:search|find|look\s+up)\s+(?:on\s+)?youtube\s+(?:for\s+)?(.+)$/i) ||
    qClean.match(/^(?:please\s+)?(?:search|find|look\s+up)\s+(.+?)\s+(?:on|in)\s+youtube$/i);
  const genericMusicPlay =
    qClean.match(
      /^(?:please\s+)?play\s+(.+?\b(?:music|beats|songs?|radio|lofi|lo-fi|jazz|ambient|piano|relaxing|study|focus|instrumental)\b.*)$/i
    ) ||
    qClean.match(
      /^(?:please\s+)?play\s+(lofi|lo-fi|relaxing\s+music|ambient\s+music|study\s+music|classical\s+music|jazz\s+music)$/i
    );

  if (ytPlayExplicit || ytSearchExplicit || genericMusicPlay) {
    const isSearch = Boolean(ytSearchExplicit);
    const rawMediaQuery = (
      ytPlayExplicit?.[1] ||
      ytSearchExplicit?.[1] ||
      genericMusicPlay?.[1] ||
      "relaxing music"
    )
      .replace(/^(?:some|a|the)\s+/i, "")
      .trim();

    const mediaPayload = await resolveYouTubeVideo(
      rawMediaQuery,
      isSearch ? "search" : "play"
    );
    activeYouTubeMedia = mediaPayload;

    if (isSearch) {
      const reply = mediaPayload.videoId
        ? `Prepared YouTube search results for "${rawMediaQuery}" (top result: "${mediaPayload.title}"). I have loaded the top video into the ORNION Media Player and provided the YouTube search link below.`
        : `Prepared YouTube search results for "${rawMediaQuery}". Click 'Open YouTube Search Results' below to view them in your browser.`;

      addCard(
        `YOUTUBE SEARCH · ${rawMediaQuery.toUpperCase()}`,
        reply,
        "system",
        mediaPayload.searchUrl,
        `Search YouTube: ${rawMediaQuery}`
      );

      return {
        reply,
        toolName: "YouTube Search Resolver",
        source: "LOCAL_DETERMINISTIC",
        actionUrl: mediaPayload.searchUrl,
        actionLabel: `Open YouTube Search: "${rawMediaQuery}"`,
        media: mediaPayload,
        execution: {
          intent: "youtube_media",
          tool: "YouTube Search Resolver",
          executed: true,
          status: "INITIATED",
          evidence: mediaPayload.videoId
            ? `Resolved top YouTube videoId=${mediaPayload.videoId} ("${mediaPayload.title}") and search URL ${mediaPayload.searchUrl}`
            : `Constructed YouTube search URL: ${mediaPayload.searchUrl}`,
          nextStep: "Click the YouTube link or press Play in the embedded player to start playback.",
        },
      };
    }

    // Play mode
    const reply = mediaPayload.videoId
      ? `Loaded "${mediaPayload.title}" into the ORNION YouTube Player for "${rawMediaQuery}". Because browsers block unmuted background autoplay without a direct click on the video frame, click Play in the embedded player or click 'Open on YouTube' below if audio does not start automatically.`
      : `Prepared YouTube search destination for "${rawMediaQuery}". Click 'Open on YouTube' below to select and play a track in your browser.`;

    addCard(
      `YOUTUBE MEDIA · ${rawMediaQuery.toUpperCase()}`,
      `Target: "${mediaPayload.title}" (${mediaPayload.watchUrl})`,
      "system",
      mediaPayload.watchUrl,
      `Open "${mediaPayload.title}" on YouTube`
    );

    return {
      reply,
      toolName: "YouTube Media Controller",
      source: "LOCAL_DETERMINISTIC",
      actionUrl: mediaPayload.watchUrl,
      actionLabel: mediaPayload.videoId
        ? `Open "${mediaPayload.title}" on YouTube`
        : `Search "${rawMediaQuery}" on YouTube`,
      media: mediaPayload,
      execution: {
        intent: "youtube_media",
        tool: "YouTube Media Controller",
        executed: true,
        status: mediaPayload.videoId ? "INITIATED" : "REQUIRES_USER_ACTION",
        evidence: mediaPayload.videoId
          ? `Embedded YouTube player initialized with videoId=${mediaPayload.videoId} (${mediaPayload.watchUrl}).`
          : `Resolved YouTube search URL ${mediaPayload.searchUrl}.`,
        nextStep:
          "Interact with the embedded YouTube player or click the action button if browser autoplay restrictions pause audio.",
      },
    };
  }

  // --------------------------------------------------------------------------
  // B. GENUINE GMAIL & EMAIL BRIEFING COMMANDS
  // --------------------------------------------------------------------------
  const isMailQuery =
    /^(?:please\s+)?(?:check|read|show|get|summarize|give\s+me)\s+(?:my\s+)?(?:unread\s+|latest\s+|new\s+)?(?:emails?|mail|gmail|inbox)(?:\s+brief(?:ing)?)?$/i.test(
      qClean
    ) ||
    /^(?:mail\s+brief(?:ing)?|inbox\s+summary|inbox\s+brief(?:ing)?|unread\s+emails?|check\s+my\s+unread\s+emails?)$/i.test(
      qClean
    );

  if (isMailQuery) {
    if (!gmailAccessToken) {
      gmailStatus.connected = false;
      const disconnectedReply =
        "Gmail is not connected. I will not fabricate unread emails. Click 'Sign in with Google' in the top bar or inside the Automation & Inbox tab to grant read-only Gmail permission, then ask me to check your unread emails again.";
      addCard(
        "GMAIL DISCONNECTED · AUTH REQUIRED",
        disconnectedReply,
        "mail"
      );
      return {
        reply: disconnectedReply,
        toolName: "Gmail API Briefing (Disconnected)",
        source: "LOCAL_DETERMINISTIC",
        execution: {
          intent: "gmail_briefing",
          tool: "Gmail OAuth Bridge",
          executed: false,
          status: "REQUIRES_AUTH",
          evidence: "No Google OAuth 2.0 Bearer access token provided with request.",
          nextStep: "Click 'Sign in with Google' to authorize gmail.readonly access.",
        },
      };
    }

    const gmailRes = await fetchLiveGmailUnread(gmailAccessToken);
    if (!gmailRes.ok) {
      const errReply = `Could not retrieve unread emails from Gmail: ${gmailRes.error}`;
      addCard("GMAIL SYNC ERROR", errReply, "mail");
      return {
        reply: errReply,
        toolName: "Gmail API Briefing",
        source: "LOCAL_DETERMINISTIC",
        execution: {
          intent: "gmail_briefing",
          tool: "Gmail REST API (users.messages.list)",
          executed: true,
          status: gmailRes.status === 401 || gmailRes.status === 403 ? "REQUIRES_AUTH" : "ERROR",
          evidence: gmailRes.error || `HTTP ${gmailRes.status}`,
          nextStep: "Re-authenticate via 'Sign in with Google' and ensure Gmail read permission is checked.",
        },
      };
    }

    if (gmailRes.messages.length === 0) {
      const zeroReply = `Connected to Gmail (${gmailRes.emailAddress}). You currently have 0 unread emails in your inbox.`;
      addCard("GMAIL INBOX BRIEFING · 0 UNREAD", zeroReply, "mail", "https://mail.google.com", "Open Gmail");
      return {
        reply: zeroReply,
        toolName: "Gmail API Briefing",
        source: "LOCAL_DETERMINISTIC",
        actionUrl: "https://mail.google.com",
        actionLabel: "Open Gmail Inbox",
        execution: {
          intent: "gmail_briefing",
          tool: "Gmail REST API (users.messages.list)",
          executed: true,
          status: "COMPLETED",
          evidence: `Verified 0 unread messages in ${gmailRes.emailAddress} via gmail.googleapis.com.`,
        },
      };
    }

    const topItems = gmailRes.messages
      .slice(0, 3)
      .map((m, idx) => `${idx + 1}) "${m.subject}" from ${m.sender}`)
      .join("; ");
    const liveReply = `You have ${gmailRes.unreadCount} unread email${gmailRes.unreadCount === 1 ? "" : "s"} in ${gmailRes.emailAddress}. Top unread: ${topItems}.`;

    addCard(
      `GMAIL LIVE BRIEFING · ${gmailRes.unreadCount} UNREAD`,
      liveReply,
      "mail",
      "https://mail.google.com",
      "Open Gmail Inbox"
    );

    return {
      reply: liveReply,
      toolName: "Gmail API Briefing",
      source: "LOCAL_DETERMINISTIC",
      actionUrl: "https://mail.google.com",
      actionLabel: "Open Gmail Inbox",
      execution: {
        intent: "gmail_briefing",
        tool: "Gmail REST API (users.messages.list)",
        executed: true,
        status: "COMPLETED",
        evidence: `Retrieved ${gmailRes.messages.length} unread message metadata records from ${gmailRes.emailAddress}.`,
      },
    };
  }

  // --------------------------------------------------------------------------
  // C. EXPLICIT STOCK MARKET & TICKER ANALYSIS COMMANDS
  // --------------------------------------------------------------------------
  const isMarketOverview =
    /^(?:please\s+)?(?:give\s+me\s+(?:a\s+|the\s+)?)?(?:stock\s+market\s+report|market\s+report|market\s+brief(?:ing)?|stock\s+report|stock\s+market\s+overview|market\s+summary|how\s+is\s+the\s+(?:stock\s+)?market(?:\s+doing)?)$/i.test(
      qClean
    );

  const isTickerAnalysis =
    /\b(?:should\s+i\s+(?:buy|sell)|analyze\s+(?:stock|ticker)?|stock\s+price\s+of|share\s+price\s+of|how\s+is\s+(?:nifty|sensex|reliance|tcs|infosys|hdfc|nvidia|nvda|apple|aapl|bitcoin|btc))\b/i.test(
      qClean
    ) ||
    (Object.entries(DEFAULT_TICKERS).some(([sym, info]) => {
      const shortSym = sym.toLowerCase().replace(".ns", "").replace("^", "").replace("-usd", "");
      return qClean.includes(info.name.toLowerCase()) || (shortSym.length >= 3 && qClean.includes(shortSym));
    }) &&
      /\b(?:stock|share|price|buy|sell|market|chart|sma|signal|report|analyze|trading)\b/i.test(qClean));

  if (isMarketOverview || isTickerAnalysis) {
    if (!isMarketOverview) {
      for (const [sym, info] of Object.entries(DEFAULT_TICKERS)) {
        const shortSym = sym.toLowerCase().replace(".ns", "").replace("^", "").replace("-usd", "");
        if (
          qClean.includes(info.name.toLowerCase()) ||
          (shortSym.length >= 3 && new RegExp(`\\b${shortSym}\\b`, "i").test(qClean))
        ) {
          const data = await analyzeTicker(sym);
          const dir = data.pct_change >= 0 ? "up" : "down";
          const sourceNote = data.stale
            ? " (Note: Offline fallback estimate; live Yahoo Finance feed was unreachable)"
            : "";
          const reply = `${data.name} (${data.symbol}) is at ${data.currency}${data.price.toLocaleString("en-IN")}, ${dir} ${Math.abs(data.pct_change)}% (5-day momentum ${data.mom >= 0 ? "+" : ""}${data.mom}%). Algorithmic signal: ${data.signal}.${sourceNote} ${data.reason}`;
          addCard(
            `TECHNICAL SIGNAL · ${data.name.toUpperCase()}`,
            `${data.currency}${data.price.toLocaleString("en-IN")} (${data.pct_change >= 0 ? "+" : ""}${data.pct_change}%) · 5-SMA: ${data.currency}${data.smaShort.toLocaleString("en-IN")} · 15-SMA: ${data.currency}${data.smaLong.toLocaleString("en-IN")} → ${data.signal}`,
            "market"
          );
          return {
            reply,
            toolName: `Market Analyzer (${data.symbol})`,
            source: "LOCAL_DETERMINISTIC",
            execution: {
              intent: "market_intelligence",
              tool: `Market Analyzer (${data.symbol})`,
              executed: true,
              status: "COMPLETED",
              evidence: `Data source: ${data.dataSource}, Price: ${data.currency}${data.price}, SMA5: ${data.smaShort}, SMA15: ${data.smaLong}`,
            },
          };
        }
      }
    }

    const overview = await getSpokenMarketBriefing();
    addCard("MARKET WATCHLIST BRIEFING", overview.text, "market");
    return {
      reply: `Market Briefing: ${overview.text}`,
      toolName: "Yahoo Finance Watchlist",
      source: "LOCAL_DETERMINISTIC",
      execution: {
        intent: "market_intelligence",
        tool: "Yahoo Finance Watchlist",
        executed: true,
        status: "COMPLETED",
        evidence: overview.anyStale
          ? "Watchlist computed with fallback estimates (Yahoo Finance unreachable)."
          : "Live 5-day 15m chart data retrieved from query1.finance.yahoo.com.",
      },
    };
  }

  // --------------------------------------------------------------------------
  // D. WHATSAPP MESSAGE PREPARATION
  // --------------------------------------------------------------------------
  const waMatch = qClean.match(
    /^(?:please\s+)?(?:send|reply|message|draft)\s+(?:a\s+)?(?:on\s+whatsapp\s+to|whatsapp\s+to|whatsapp\s+message\s+to|to)\s+(.+?)(?:\s+saying\s+(.+)|$)$/i
  );
  if (qClean.includes("whatsapp") && waMatch) {
    const contact = waMatch[1].replace(/\s+on\s+whatsapp$/i, "").trim();
    const message =
      waMatch[2]?.trim() ||
      "Hello from ORNION. I received your message and will follow up shortly.";
    const waUrl = `https://web.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    const contactCap = contact.charAt(0).toUpperCase() + contact.slice(1);
    const reply = `Prepared WhatsApp Web message draft for ${contactCap}: "${message}". Note: WhatsApp Web requires you to select ${contactCap} and press Send in your browser to complete delivery.`;
    addCard(
      `WHATSAPP DRAFT · ${contactCap.toUpperCase()}`,
      `Prepared text: "${message}" (User confirmation required in WhatsApp Web)`,
      "whatsapp",
      waUrl,
      `Open WhatsApp Web (${contactCap})`
    );
    return {
      reply,
      toolName: "WhatsApp Web Preparer",
      source: "LOCAL_DETERMINISTIC",
      actionUrl: waUrl,
      actionLabel: `Open WhatsApp Web for ${contactCap}`,
      execution: {
        intent: "whatsapp_prepare",
        tool: "WhatsApp Web Preparer",
        executed: true,
        status: "REQUIRES_USER_ACTION",
        evidence: `Encoded URL generated: ${waUrl}`,
        nextStep: `Click 'Open WhatsApp Web for ${contactCap}' and press Send inside WhatsApp Web.`,
      },
    };
  }

  // --------------------------------------------------------------------------
  // E. GOOGLE WEB SEARCH
  // --------------------------------------------------------------------------
  const googleMatch = qClean.match(
    /^(?:please\s+)?(?:search\s+google\s+for|google\s+search\s+for|google)\s+(.+)$/i
  );
  if (googleMatch) {
    const query = googleMatch[1].trim();
    const gUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    addCard(
      `WEB SEARCH · ${query.toUpperCase()}`,
      `Prepared Google search URL for "${query}".`,
      "system",
      gUrl,
      `Search Google: "${query}"`
    );
    return {
      reply: `Prepared Google search for "${query}". Click the action link below if your browser blocked the new tab.`,
      toolName: "Google Search Bridge",
      source: "LOCAL_DETERMINISTIC",
      actionUrl: gUrl,
      actionLabel: `Open Google Search: "${query}"`,
      execution: {
        intent: "web_navigation",
        tool: "Google Search Bridge",
        executed: true,
        status: "INITIATED",
        evidence: `Search URL: ${gUrl}`,
        nextStep: "View results in the opened browser tab or click the action link.",
      },
    };
  }

  // --------------------------------------------------------------------------
  // F. OS DESKTOP APPLICATION LAUNCH VS WEB DESTINATION OPEN
  // --------------------------------------------------------------------------
  const openMatch = qClean.match(/^(?:please\s+)?(?:open|launch|start)\s+(.+?)$/i);
  if (openMatch) {
    const targetName = openMatch[1].replace(/^(?:the\s+|my\s+|app\s+|application\s+)/i, "").trim();

    // 1. Check if it is an explicit website destination (NOT VS Code!)
    const matchedSiteKey = Object.keys(WEB_SITES).find(
      (k) => targetName === k || targetName === `${k}.com`
    );
    if (matchedSiteKey) {
      const site = WEB_SITES[matchedSiteKey];
      addCard(
        `WEB NAVIGATION · ${site.title.toUpperCase()}`,
        `Prepared browser navigation to ${site.url}.`,
        "system",
        site.url,
        `Open ${site.title}`
      );
      return {
        reply: `Prepared browser link for ${site.title} (${site.url}). Click 'Open ${site.title}' below if your browser blocked the popup tab.`,
        toolName: `Web Navigator (${site.title})`,
        source: "LOCAL_DETERMINISTIC",
        actionUrl: site.url,
        actionLabel: `Open ${site.title}`,
        execution: {
          intent: "web_navigation",
          tool: `Web Navigator (${site.title})`,
          executed: true,
          status: "INITIATED",
          evidence: `Target web URL: ${site.url}`,
          nextStep: `Click 'Open ${site.title}' if the tab did not open automatically.`,
        },
      };
    }

    // 2. Otherwise, route to allowlisted OS Desktop Application Launcher
    const launchResult = await launchAllowlistedDesktopApp(targetName);
    addCard(
      `OS APP LAUNCH · ${targetName.toUpperCase()}`,
      `${launchResult.reply} [${launchResult.execution.status}]`,
      "system",
      launchResult.actionUrl,
      launchResult.actionLabel
    );
    return {
      reply: launchResult.reply,
      toolName: launchResult.toolName,
      source: "LOCAL_DETERMINISTIC",
      actionUrl: launchResult.actionUrl,
      actionLabel: launchResult.actionLabel,
      execution: launchResult.execution,
    };
  }

  // --------------------------------------------------------------------------
  // G. SYSTEM VOLUME CONTROLS
  // --------------------------------------------------------------------------
  if (/^(?:please\s+)?(?:turn\s+)?(?:volume\s+up|increase\s+volume|louder)$/i.test(qClean)) {
    systemMuted = false;
    systemVolume = Math.min(100, systemVolume + 15);
    return {
      reply: `ORNION HUD audio volume increased to ${systemVolume}%.`,
      toolName: "Audio Volume Controller",
      source: "LOCAL_DETERMINISTIC",
      execution: {
        intent: "system_volume",
        tool: "Audio Volume Controller",
        executed: true,
        status: "COMPLETED",
        evidence: `HUD volume state updated to ${systemVolume}% (muted=${systemMuted}).`,
      },
    };
  }

  if (/^(?:please\s+)?(?:turn\s+)?(?:volume\s+down|decrease\s+volume|quieter)$/i.test(qClean)) {
    systemVolume = Math.max(0, systemVolume - 15);
    return {
      reply: `ORNION HUD audio volume decreased to ${systemVolume}%.`,
      toolName: "Audio Volume Controller",
      source: "LOCAL_DETERMINISTIC",
      execution: {
        intent: "system_volume",
        tool: "Audio Volume Controller",
        executed: true,
        status: "COMPLETED",
        evidence: `HUD volume state updated to ${systemVolume}% (muted=${systemMuted}).`,
      },
    };
  }

  if (/^(?:please\s+)?(?:mute|mute\s+volume|mute\s+the\s+volume|mute\s+audio)$/i.test(qClean)) {
    systemMuted = true;
    return {
      reply: "ORNION HUD audio output muted.",
      toolName: "Audio Volume Controller",
      source: "LOCAL_DETERMINISTIC",
      execution: {
        intent: "system_volume",
        tool: "Audio Volume Controller",
        executed: true,
        status: "COMPLETED",
        evidence: "HUD muted state set to true.",
      },
    };
  }

  // --------------------------------------------------------------------------
  // H. STRICT TIME & DATE QUERIES (ONLY WHEN EXPLICITLY ASKING THE TIME/DATE)
  // --------------------------------------------------------------------------
  if (
    /^(?:what\s+time\s+is\s+it|what(?:'s|\s+is)\s+the\s+(?:current\s+)?time|current\s+time|tell\s+me\s+the\s+time)$/i.test(
      qClean
    )
  ) {
    const nowFormatted = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    return {
      reply: `It is currently ${nowFormatted}.`,
      toolName: "System Clock",
      source: "LOCAL_DETERMINISTIC",
      execution: {
        intent: "system_clock",
        tool: "System Clock",
        executed: true,
        status: "COMPLETED",
        evidence: `System clock read: ${nowFormatted}`,
      },
    };
  }

  if (
    /^(?:what\s+(?:date|day)\s+is\s+(?:it|today)|what(?:'s|\s+is)\s+today(?:'s)?\s+date|today(?:'s)?\s+date)$/i.test(
      qClean
    )
  ) {
    const todayFormatted = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return {
      reply: `Today is ${todayFormatted}.`,
      toolName: "System Calendar",
      source: "LOCAL_DETERMINISTIC",
      execution: {
        intent: "system_clock",
        tool: "System Calendar",
        executed: true,
        status: "COMPLETED",
        evidence: `System date read: ${todayFormatted}`,
      },
    };
  }

  return null;
}

// ============================================================================
// 8. NVIDIA MISTRAL LARGE 4 CONVERSATIONAL & TOOL-DISPATCH ENGINE
// ============================================================================

const ORNION_SYSTEM_PROMPT = `You are ORNION — Personal AI Assistant, created and developed by Praneeth Thota.
You run inside the ORNION Neural Interface HUD and assist the user with natural conversation, technical explanations, reasoning, and system tools.

Identity & Capabilities:
- Name: ORNION (Personal AI Assistant)
- Creator / Author: Praneeth Thota
- AI Engine: NVIDIA API Catalog running Mistral Large 4 (mistralai/mistral-large-4-1t-a52b)
- Available real tools in ORNION:
  1. YouTube Media & Search (e.g., "Play lofi music on YouTube", "Play relaxing music", "Search YouTube for programming tutorials")
  2. Genuine Gmail Unread Inbox Briefings via Google OAuth 2.0 (e.g., "Check my unread emails")
  3. Live Stock Market & SMA Technical Scanner (Nifty 50, Sensex, Reliance, TCS, Infosys, HDFC Bank, Nvidia, Apple, Bitcoin)
  4. Allowlisted Windows Desktop Application Launcher (Notepad, Calculator, Visual Studio Code, Paint, File Explorer, Task Manager, Command Prompt, PowerShell)
  5. WhatsApp Web Message Draft Preparation

Tool Invocation Protocol:
If the user's message is a direct request to execute one of the tools above (and was not already handled), you may emit a single-line JSON directive on the VERY FIRST LINE in this exact format:
[TOOL_CALL: {"tool":"youtube_play","query":"..."}]
or [TOOL_CALL: {"tool":"youtube_search","query":"..."}]
or [TOOL_CALL: {"tool":"gmail_briefing"}]
or [TOOL_CALL: {"tool":"open_app","app":"..."}]
or [TOOL_CALL: {"tool":"market_report","symbol":"..."}]

For all conversational messages, greetings (like "Hello"), questions about your name or capabilities, explanations, or follow-up questions (like "What did I just ask you?"), respond directly, naturally, and concisely in 1 to 4 sentences without any [TOOL_CALL] prefix. Never invent fake emails, fake app launches, or fake playback states.`;

function isRateLimitedStatus(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  const lower = bodyText.toLowerCase();
  return ["rate limit", "too many requests", "rate_limit", "quota exceeded"].some((w) =>
    lower.includes(w)
  );
}

async function callNvidiaMistral(userMessage: string): Promise<{
  ok: boolean;
  status: number;
  content: string;
  model: string;
  error?: string;
  rateLimited?: boolean;
}> {
  const apiKey = getNvidiaApiKey();
  const model = getNvidiaModel();
  const baseUrl = getNvidiaBaseUrl();
  const timeoutMs = getNvidiaTimeoutMs();

  if (!apiKey) {
    const msg =
      "NVIDIA_API_KEY is not configured on the server. Add your NVIDIA_API_KEY to the .env file in the project root and restart the server.";
    lastAiError = msg;
    return {
      ok: false,
      status: 401,
      content: "",
      model,
      error: msg,
    };
  }

  const endpoint = `${baseUrl}/chat/completions`;
  const messages = [
    { role: "system", content: ORNION_SYSTEM_PROMPT },
    ...conversationMemory.slice(-12),
    { role: "user", content: userMessage },
  ];

  const reasoningEffort = (process.env.NVIDIA_REASONING_EFFORT || "low").trim();

  const payload = {
    model,
    messages,
    max_tokens: 4096,
    stream: false,
    temperature: 0.5,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    reasoning_effort: reasoningEffort,
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        const safeErr = sanitizeSecrets(errText.slice(0, 240));

        if (isRateLimitedStatus(resp.status, errText)) {
          const retryHeader = Number(resp.headers.get("retry-after"));
          const waitSec = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : 60;
          cooldownUntil = Math.max(cooldownUntil, Date.now() + waitSec * 1000);
          const msg = `NVIDIA API rate limit reached (HTTP 429). Cooldown active for ${waitSec}s.`;
          lastAiError = msg;
          return {
            ok: false,
            status: 429,
            content: "",
            model,
            error: msg,
            rateLimited: true,
          };
        }

        if (resp.status === 401 || resp.status === 403) {
          const msg = `NVIDIA API authentication failed (HTTP ${resp.status}). Please verify NVIDIA_API_KEY and model permissions (${model}) in your .env file.`;
          lastAiError = msg;
          return { ok: false, status: resp.status, content: "", model, error: msg };
        }

        if (resp.status === 400) {
          const msg = `NVIDIA API rejected the request (HTTP 400): ${safeErr || "Invalid parameters for model " + model}`;
          lastAiError = msg;
          return { ok: false, status: 400, content: "", model, error: msg };
        }

        // Retry once on 5xx server errors
        if (resp.status >= 500 && attempt === 1) {
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }

        const msg = `NVIDIA API returned HTTP ${resp.status}: ${safeErr || resp.statusText}`;
        lastAiError = msg;
        return { ok: false, status: resp.status, content: "", model, error: msg };
      }

      const data: any = await resp.json();
      const choice = data?.choices?.[0]?.message;
      const rawContent = (choice?.content || "").trim();

      if (rawContent) {
        lastAiError = null;
        return {
          ok: true,
          status: 200,
          content: rawContent,
          model: data?.model || model,
        };
      }

      const msg = "NVIDIA Mistral Large 4 returned an empty message content response.";
      lastAiError = msg;
      return { ok: false, status: 502, content: "", model, error: msg };
    } catch (err: any) {
      clearTimeout(timer);
      const isTimeout = err?.name === "AbortError";
      if (!isTimeout && attempt === 1) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      const msg = isTimeout
        ? `NVIDIA API request timed out after ${Math.round(timeoutMs / 1000)}s.`
        : `Network error contacting NVIDIA API Catalog: ${sanitizeSecrets(err?.message || err)}`;
      lastAiError = msg;
      return { ok: false, status: isTimeout ? 504 : 503, content: "", model, error: msg };
    }
  }

  return {
    ok: false,
    status: 500,
    content: "",
    model,
    error: "Unexpected failure communicating with NVIDIA API Catalog.",
  };
}

async function processCommandPipeline(
  cleanQuery: string,
  gmailAccessToken?: string | null
): Promise<ToolDispatchResult> {
  // 1. Check strict deterministic tools first
  const deterministic = await tryStrictDeterministicTool(cleanQuery, gmailAccessToken);
  if (deterministic) {
    recordConversationTurn(cleanQuery, deterministic.reply);
    return deterministic;
  }

  // 2. Check if simulated or real HTTP 429 rate-limit cooldown is active
  const inCooldown = simulatedFailoverMode || Date.now() < cooldownUntil;
  if (inCooldown) {
    const remainingSec = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    const reply = `NVIDIA Mistral Large 4 is currently in HTTP 429 rate-limit cooldown (${remainingSec}s remaining). Conversational AI reasoning is paused until cooldown expires, or you can click 'Restore Cloud' in the top ribbon. Deterministic tools (YouTube, Gmail briefings, stock analysis, and desktop app launching) remain available.`;
    return {
      reply,
      toolName: "Rate-Limit Cooldown Guard",
      source: "FAILOVER_ENGINE",
      execution: {
        intent: "conversation",
        tool: "Rate-Limit Cooldown Guard",
        executed: false,
        status: "UNAVAILABLE",
        evidence: `Cooldown active for ${remainingSec}s (simulated=${simulatedFailoverMode}).`,
        nextStep: "Wait for rate-limit cooldown to expire or disable simulated failover mode.",
      },
    };
  }

  // 3. Call NVIDIA Mistral Large 4
  const aiRes = await callNvidiaMistral(cleanQuery);
  if (!aiRes.ok) {
    return {
      reply: `AI Service Error: ${aiRes.error}`,
      toolName: `NVIDIA Mistral Large 4 (${aiRes.status})`,
      source: aiRes.rateLimited ? "FAILOVER_ENGINE" : "AI_SERVICE_ERROR",
      execution: {
        intent: "conversation",
        tool: `NVIDIA API Catalog (${aiRes.model})`,
        executed: true,
        status: "ERROR",
        evidence: aiRes.error || `HTTP ${aiRes.status}`,
        nextStep:
          aiRes.status === 401 || aiRes.status === 403
            ? "Check NVIDIA_API_KEY in your .env file."
            : "Retry your message in a few moments.",
      },
    };
  }

  // 4. Check if NVIDIA Mistral Large 4 emitted a structured [TOOL_CALL: {...}] directive
  const toolDirectiveMatch = aiRes.content.match(/^\[TOOL_CALL:\s*(\{.*?\})\]\s*/i);
  if (toolDirectiveMatch) {
    try {
      const parsed = JSON.parse(toolDirectiveMatch[1]);
      if (parsed.tool === "youtube_play" && typeof parsed.query === "string") {
        const routed = await tryStrictDeterministicTool(
          `play ${parsed.query} on youtube`,
          gmailAccessToken
        );
        if (routed) {
          recordConversationTurn(cleanQuery, routed.reply);
          return routed;
        }
      } else if (parsed.tool === "youtube_search" && typeof parsed.query === "string") {
        const routed = await tryStrictDeterministicTool(
          `search youtube for ${parsed.query}`,
          gmailAccessToken
        );
        if (routed) {
          recordConversationTurn(cleanQuery, routed.reply);
          return routed;
        }
      } else if (parsed.tool === "gmail_briefing") {
        const routed = await tryStrictDeterministicTool(
          "check my unread emails",
          gmailAccessToken
        );
        if (routed) {
          recordConversationTurn(cleanQuery, routed.reply);
          return routed;
        }
      } else if (parsed.tool === "open_app" && typeof parsed.app === "string") {
        const routed = await tryStrictDeterministicTool(
          `open ${parsed.app}`,
          gmailAccessToken
        );
        if (routed) {
          recordConversationTurn(cleanQuery, routed.reply);
          return routed;
        }
      } else if (parsed.tool === "market_report") {
        const routed = await tryStrictDeterministicTool(
          parsed.symbol ? `should i buy ${parsed.symbol}` : "stock market report",
          gmailAccessToken
        );
        if (routed) {
          recordConversationTurn(cleanQuery, routed.reply);
          return routed;
        }
      }
    } catch {
      // If JSON directive parsing fails, strip the tag and return the remaining text
    }
  }

  const finalReply = aiRes.content.replace(/^\[TOOL_CALL:\s*\{.*?\}\]\s*/i, "").trim();
  recordConversationTurn(cleanQuery, finalReply);

  return {
    reply: finalReply,
    toolName: `NVIDIA Mistral Large 4`,
    source: "NVIDIA_MISTRAL",
    execution: {
      intent: "conversation",
      tool: `NVIDIA API Catalog (${aiRes.model})`,
      executed: true,
      status: "COMPLETED",
      evidence: `HTTP 200 from ${getNvidiaBaseUrl()}/chat/completions (${aiRes.model})`,
    },
  };
}

// ============================================================================
// 9. EXPRESS API ENDPOINTS
// ============================================================================

function extractBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    return token.length > 10 ? token : null;
  }
  return null;
}

// GET /api/health - Safe diagnostic endpoint (never exposes secrets)
app.get("/api/health", (req, res) => {
  const apiKeyConfigured = Boolean(getNvidiaApiKey());
  const inCooldown = simulatedFailoverMode || Date.now() < cooldownUntil;
  const cooldownRemainingSec = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  const hasBearer = Boolean(extractBearerToken(req));

  res.json({
    status: apiKeyConfigured && !inCooldown ? "ok" : "degraded",
    aiProvider: "NVIDIA API Catalog",
    model: getNvidiaModel(),
    baseUrl: getNvidiaBaseUrl(),
    apiKeyConfigured,
    cooldownActive: inCooldown,
    cooldownRemainingSec,
    lastAiError,
    platform: process.platform,
    gmailConnected: gmailStatus.connected || hasBearer,
    gmailAccount: gmailStatus.emailAddress,
    allowedDesktopApps: DESKTOP_APP_ALLOWLIST.map((a) => ({
      id: a.id,
      displayName: a.displayName,
    })),
  });
});

// GET /api/gmail/unread - Retrieve real unread Gmail messages using client Bearer token
app.get("/api/gmail/unread", async (req, res) => {
  const token = extractBearerToken(req);
  if (!token) {
    gmailStatus = {
      connected: false,
      emailAddress: null,
      unreadCount: 0,
      lastSyncedAt: null,
      error: null,
    };
    liveGmailMessages = [];
    return res.status(401).json({
      connected: false,
      error: "No Google OAuth Bearer token provided. Please sign in with Google.",
      messages: [],
    });
  }

  const result = await fetchLiveGmailUnread(token);
  if (!result.ok) {
    return res.status(result.status).json({
      connected: false,
      error: result.error,
      messages: [],
    });
  }

  addCard(
    `GMAIL CONNECTED · ${result.emailAddress}`,
    `Synced ${result.unreadCount} unread message(s) from your live Gmail inbox.`,
    "mail",
    "https://mail.google.com",
    "Open Gmail Inbox"
  );

  res.json({
    connected: true,
    emailAddress: result.emailAddress,
    unreadCount: result.unreadCount,
    lastSyncedAt: gmailStatus.lastSyncedAt,
    messages: result.messages,
  });
});

// POST /api/gmail/disconnect - Clear server-side cached Gmail metadata on logout
app.post("/api/gmail/disconnect", (_req, res) => {
  liveGmailMessages = [];
  gmailStatus = {
    connected: false,
    emailAddress: null,
    unreadCount: 0,
    lastSyncedAt: null,
    error: null,
  };
  addCard(
    "GMAIL DISCONNECTED",
    "Google OAuth session disconnected and cached inbox metadata cleared.",
    "mail"
  );
  res.json({ connected: false });
});

// GET /api/state - Telemetry & state snapshot for ORNION Neural Interface HUD
app.get("/api/state", async (req, res) => {
  try {
    const token = extractBearerToken(req);
    if (token && !gmailStatus.connected) {
      await fetchLiveGmailUnread(token);
    }

    const stocks = await getMarketWatchlist();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const ramPct = Math.round(((totalMem - freeMem) / totalMem) * 100);
    const load = os.loadavg()[0] || 0.45;
    const cpuPct = Math.min(
      98,
      Math.max(8, Math.round(load * 22 + (hudRuntimeState.state === "thinking" ? 18 : 4)))
    );
    const inFailover = simulatedFailoverMode || Date.now() < cooldownUntil;
    const cooldownRem = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    const apiKeyReady = Boolean(getNvidiaApiKey());

    res.json({
      state: hudRuntimeState.state,
      note: inFailover
        ? `RATE-LIMIT COOLDOWN (${cooldownRem > 0 ? cooldownRem + "s" : "ACTIVE"})`
        : !apiKeyReady
        ? "NVIDIA_API_KEY NOT SET IN .ENV"
        : hudRuntimeState.note,
      mode: inFailover
        ? "RATE-LIMIT COOLDOWN"
        : apiKeyReady
        ? "NVIDIA MISTRAL + TOOLS"
        : "UNCONFIGURED AI KEY",
      model: inFailover ? "Cooldown Guard" : getNvidiaModel(),
      ai_configured: apiKeyReady,
      last_ai_error: lastAiError,
      t_rec: hudRuntimeState.t_rec,
      t_think: hudRuntimeState.t_think,
      last_tool: hudRuntimeState.last_tool,
      tools: toolsRunCount,
      facts: conversationMemory.length / 2 + stocks.length,
      mail_age: gmailStatus.lastSyncedAt ? 0 : -1,
      last_you: hudRuntimeState.last_you,
      tool_active: hudRuntimeState.tool_active,
      failover_active: inFailover,
      cooldown_remaining: cooldownRem,
      volume: systemVolume,
      muted: systemMuted,
      chat: chatHistory,
      cards: briefingCards,
      gmail: gmailStatus,
      unread_emails: gmailStatus.connected ? liveGmailMessages : [],
      local_notes: localScratchpadNotes,
      active_media: activeYouTubeMedia,
      stocks,
      sys: {
        cpu: cpuPct,
        ram: ramPct,
        disk: 38,
        free: 412,
        bat: 96,
        plug: true,
        up: Math.floor(os.uptime()),
        platform: process.platform,
      },
    });
  } catch (err) {
    res.status(500).json({ error: sanitizeSecrets(err) });
  }
});

// POST /api/command - Processes voice or text command through ORNION Brain & Tool Router
app.post("/api/command", async (req, res) => {
  const { query, speechLatencyMs } = req.body || {};
  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "Query is required and must be a non-empty string." });
  }

  const rawTrimmed = query.trim();
  if (rawTrimmed.length > 2000) {
    return res.status(400).json({ error: "Query exceeds maximum allowed length (2000 characters)." });
  }

  // Prevent accidental double-submission within 600ms
  const now = Date.now();
  if (
    lastProcessedCommand.query === rawTrimmed &&
    now - lastProcessedCommand.timestamp < 600
  ) {
    return res.status(429).json({
      error: "Duplicate command ignored.",
    });
  }
  lastProcessedCommand = { query: rawTrimmed, timestamp: now };

  // Strip optional wake word "ornion" (or legacy "jarvis") at the start of a command
  let cleanQuery = rawTrimmed;
  const wakeStripped = cleanQuery.replace(/^(?:ornion|jarvis)[\s,.:!?-]+/i, "").trim();
  if (/^(?:ornion|jarvis)[\s,.:!?-]*$/i.test(cleanQuery)) {
    const wakeReply = "ORNION is online and listening. How can I help you?";
    addChat("you", rawTrimmed, "LOCAL_DETERMINISTIC");
    const execution: ExecutionReport = {
      intent: "conversation",
      tool: "Wake Word Listener",
      executed: true,
      status: "COMPLETED",
      evidence: "Wake word detected.",
    };
    const msg = addChat("jarvis", wakeReply, "LOCAL_DETERMINISTIC", undefined, undefined, execution);
    return res.json({
      reply: wakeReply,
      source: "LOCAL_DETERMINISTIC",
      toolName: "Wake Word Listener",
      execution,
      message: msg,
    });
  }
  if (wakeStripped) {
    cleanQuery = wakeStripped;
  }

  const gmailToken = extractBearerToken(req);
  const startMs = Date.now();
  hudRuntimeState.state = "thinking";
  hudRuntimeState.last_you = cleanQuery;
  hudRuntimeState.t_rec = speechLatencyMs ? Number((speechLatencyMs / 1000).toFixed(2)) : 0.32;
  hudRuntimeState.tool_active = true;

  addChat("you", rawTrimmed, "LOCAL_DETERMINISTIC");

  try {
    const result = await processCommandPipeline(cleanQuery, gmailToken);
    const elapsedSec = Number(((Date.now() - startMs) / 1000).toFixed(2));
    toolsRunCount += 1;

    hudRuntimeState.t_think = Math.max(0.05, elapsedSec);
    hudRuntimeState.last_tool = result.toolName;
    hudRuntimeState.state = "speaking";
    hudRuntimeState.tool_active = false;
    hudRuntimeState.note =
      result.execution.status === "ERROR"
        ? `ERROR: ${result.toolName}`
        : `LAST ACTION: ${result.toolName.toUpperCase()}`;

    const ornionMsg = addChat(
      "jarvis",
      result.reply,
      result.source,
      result.actionUrl,
      result.actionLabel,
      result.execution,
      result.media
    );

    setTimeout(() => {
      if (hudRuntimeState.state === "speaking") {
        hudRuntimeState.state = "listening";
      }
    }, 3200);

    res.json({
      reply: result.reply,
      toolName: result.toolName,
      source: result.source,
      actionUrl: result.actionUrl,
      actionLabel: result.actionLabel,
      execution: result.execution,
      media: result.media,
      t_think: hudRuntimeState.t_think,
      message: ornionMsg,
    });
  } catch (err) {
    hudRuntimeState.state = "listening";
    hudRuntimeState.tool_active = false;
    const safeMsg = sanitizeSecrets(err);
    res.status(500).json({ error: safeMsg });
  }
});

// POST /api/market/analyze - Analyze any custom or watched stock ticker
app.post("/api/market/analyze", async (req, res) => {
  const { symbol } = req.body || {};
  if (!symbol || typeof symbol !== "string") {
    return res.status(400).json({ error: "Ticker symbol required" });
  }
  const cleanSym = symbol.toUpperCase().trim().replace(/[^A-Z0-9.^=-]/g, "");
  if (!cleanSym) {
    return res.status(400).json({ error: "Invalid ticker symbol" });
  }
  if (!DEFAULT_TICKERS[cleanSym]) {
    DEFAULT_TICKERS[cleanSym] = {
      name: cleanSym.replace(".NS", ""),
      currency: cleanSym.endsWith(".NS") || cleanSym.startsWith("^") ? "₹" : "$",
      category: cleanSym.endsWith(".NS") || cleanSym.startsWith("^") ? "india" : "global",
      basePrice: 450,
    };
  }
  marketCache.delete(cleanSym);
  const analysis = await analyzeTicker(cleanSym);
  res.json(analysis);
});

// POST /api/failover/toggle - Toggle simulated HTTP 429 rate-limit cooldown
app.post("/api/failover/toggle", (req, res) => {
  const { active, durationSec } = req.body || {};
  simulatedFailoverMode = Boolean(active);
  if (simulatedFailoverMode) {
    const secs = typeof durationSec === "number" ? durationSec : 60;
    cooldownUntil = Date.now() + secs * 1000;
    addChat(
      "sys",
      `[Rate-limit simulation enabled: HTTP 429 cooldown set for ${secs}s. AI reasoning requests will report cooldown status while deterministic tools remain available.]`,
      "FAILOVER_ENGINE"
    );
  } else {
    cooldownUntil = 0;
    addChat(
      "sys",
      `[Rate-limit simulation cleared. NVIDIA Mistral Large 4 (${getNvidiaModel()}) resumed.]`,
      "NVIDIA_MISTRAL"
    );
  }
  res.json({
    failover_active: simulatedFailoverMode,
    cooldown_remaining: Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)),
  });
});

// POST /api/mail-cache - Add a local scratchpad briefing note (explicitly separate from live Gmail)
app.post("/api/mail-cache", (req, res) => {
  const { sender, subject, snippet, priority } = req.body || {};
  if (!sender || !subject) {
    return res.status(400).json({ error: "Sender and subject required" });
  }
  const newItem = {
    id: `note-${Date.now()}`,
    sender: String(sender).trim(),
    subject: String(subject).trim(),
    snippet: String(snippet || "Local reminder note.").trim(),
    priority: (priority === "URGENT" || priority === "NORMAL" ? priority : "HIGH") as
      | "HIGH"
      | "URGENT"
      | "NORMAL",
    receivedAt: "Local Note",
  };
  localScratchpadNotes.unshift(newItem);
  res.json({ local_notes: localScratchpadNotes });
});

// DELETE /api/mail-cache/:id - Remove a local scratchpad note
app.delete("/api/mail-cache/:id", (req, res) => {
  const { id } = req.params;
  localScratchpadNotes = localScratchpadNotes.filter((m) => m.id !== id);
  res.json({ local_notes: localScratchpadNotes });
});

const PACKAGE_MANIFEST = [
  {
    displayName: "jarvis_brain.py",
    actualFile: "jarvis_brain_16af2947.py",
    category: "ORNION AI Brain",
    status: "VERIFIED",
    summary:
      "ORNION Hybrid Cloud + Local Fallback AI Brain supporting NVIDIA Mistral Large 4 and Groq with HTTP 429 cooldown handling.",
    improvements:
      "Updated to support NVIDIA API Catalog (mistralai/mistral-large-4-1t-a52b) via NVIDIA_API_KEY alongside ~/.ornion/free.key.",
  },
  {
    displayName: "jarvis_actions.py",
    actualFile: "jarvis_actions_d9be8f7a.py",
    category: "ORNION Automation",
    status: "VERIFIED",
    summary:
      "Cross-platform local action executor for Windows, macOS, and Linux with allowlisted app launching, YouTube, and volume control.",
    improvements:
      "Strict command matching and verified OS process launching without false-positive conversational interception.",
  },
  {
    displayName: "jarvis_market.py",
    actualFile: "jarvis_market_19a11d5d.py",
    category: "Market Intelligence",
    status: "VERIFIED",
    summary:
      "Live Yahoo Finance chart integration calculating 5-day momentum, 5/15 SMA crossovers, 24-point HUD sparklines, and Buy/Sell/Hold signals.",
    improvements: "Rebranded to ORNION Market Intelligence with Praneeth Thota attribution.",
  },
  {
    displayName: "jarvis_voice.py",
    actualFile: "jarvis_voice_1af7009b.py",
    category: "Voice & HUD Server",
    status: "VERIFIED",
    summary:
      "Microphone/console listener ('Ornion' wake word) with embedded local HTTP server on 127.0.0.1:8765 serving the ORNION Neural Interface HUD.",
    improvements:
      "Updated startup message ('ORNION AI is online.'), 'Ornion' wake word, and ORNION Setup API key prompt.",
  },
  {
    displayName: "jarvis_workplace.html",
    actualFile: "jarvis_workplace_88522884.html",
    category: "ORNION Neural HUD",
    status: "VERIFIED",
    summary:
      "3D ORNION Neural Interface HUD with rotating wireframe globe, reactor rings, neural pipeline, and live market tickers.",
    improvements:
      "Updated header logo to O.R.N.I.O.N, heading to ORNION Neural Interface, and author attribution to Praneeth Thota.",
  },
  {
    displayName: "install.bat",
    actualFile: "install_e8c3d9ed.bat",
    category: "Windows Setup",
    status: "VERIFIED",
    summary:
      "1-Click Windows setup script ('ORNION Setup') creating .venv, installing dependencies, and starting ORNION.",
    improvements: "Rebranded installer title to ORNION Setup — Personal AI Assistant by Praneeth Thota.",
  },
  {
    displayName: "install.sh",
    actualFile: "install.sh",
    category: "macOS/Linux Setup",
    status: "VERIFIED",
    summary:
      "1-Click macOS & Linux setup script ('ORNION Setup') configuring .venv and ~/.ornion/free.key.",
    improvements: "Rebranded installer title and configuration path to ORNION.",
  },
  {
    displayName: "requirements.txt",
    actualFile: "requirements_0bc96641.txt",
    category: "Configuration",
    status: "VERIFIED",
    summary:
      "Python package dependencies: openai>=1.12.0, SpeechRecognition>=3.10.0, requests>=2.31.0, certifi>=2024.2.2, psutil>=5.9.0.",
    improvements: "Updated header to ORNION — Personal AI Assistant by Praneeth Thota.",
  },
  {
    displayName: "INDEX.md",
    actualFile: "INDEX_ed611fd8.md",
    category: "Documentation",
    status: "VERIFIED",
    summary:
      "Master ORNION Installation & User Guide covering quick start, voice command table, and hybrid cooldown fallback.",
    improvements: "Updated all product references to ORNION and attributed to Praneeth Thota.",
  },
  {
    displayName: "README.md",
    actualFile: "README_81e87ee4.md",
    category: "Documentation",
    status: "VERIFIED",
    summary:
      "Quick-reference voice command cheat sheet and overview of ORNION Neural Interface HUD.",
    improvements: "Updated all product references to ORNION and attributed to Praneeth Thota.",
  },
  {
    displayName: "Jarvis_Setup_Guide.html",
    actualFile: "Jarvis_Setup_Guide_d4172b65.html",
    category: "User Guide (HTML)",
    status: "VERIFIED",
    summary:
      "ORNION — Installation and User Guide (HTML) featuring English + Tenglish setup summary.",
    improvements:
      "Rebranded to ORNION — Installation and User Guide created and developed by Praneeth Thota.",
  },
  {
    displayName: "Jarvis_Setup_Guide.pdf",
    actualFile: "Jarvis_Setup_Guide_27b342db.pdf",
    category: "User Guide (PDF)",
    status: "VERIFIED",
    summary:
      "2-page printable PDF manual: ORNION — Installation and User Guide by Praneeth Thota.",
    improvements:
      "Regenerated 2-page PDF with ORNION branding, commands, and Praneeth Thota attribution.",
  },
];

// GET /api/package-audit - Live filesystem status report of the ORNION package
app.get("/api/package-audit", (_req, res) => {
  const assetsDir = path.join(__dirname, "public", "assets", "aistudio");

  const enriched = PACKAGE_MANIFEST.map((item) => {
    const filePath = path.join(assetsDir, item.actualFile);
    let sizeBytes = 0;
    let lines = 0;
    let preview = "";
    let exists = false;

    try {
      if (fs.existsSync(filePath)) {
        exists = true;
        const stat = fs.statSync(filePath);
        sizeBytes = stat.size;
        if (!item.actualFile.endsWith(".pdf")) {
          const content = fs.readFileSync(filePath, "utf-8");
          lines = content.split("\n").length;
          preview = content;
        } else {
          preview =
            "[Binary PDF Document — 2 Pages — Click 'Open Live Preview' to view ORNION — Installation and User Guide]";
          lines = 2;
        }
      }
    } catch {
      // ignore read errors
    }

    return {
      ...item,
      exists,
      sizeBytes,
      lines,
      downloadUrl: `/assets/aistudio/${item.actualFile}`,
      preview,
    };
  });

  res.json({
    productName: "ORNION",
    productDescription: "Personal AI Assistant",
    creator: "Praneeth Thota",
    category: "Personal AI Assistant and Automation Platform",
    primaryEnvironment: "Windows 11 (with macOS & Linux support)",
    packageVersion: `NVIDIA Mistral Large 4 (${getNvidiaModel()})`,
    lastUpdated: "2026-10-29",
    totalFiles: enriched.length,
    verifiedCount: enriched.filter((f) => f.exists).length,
    issuesResolved: [
      {
        id: "nvidia-mistral-1",
        title: "NVIDIA API Catalog (Mistral Large 4) Conversational Engine",
        detail:
          "Connected server-side OpenAI-compatible chat completions to https://integrate.api.nvidia.com/v1/chat/completions with multi-turn memory, timeout handling, and strict tool routing.",
      },
      {
        id: "real-tools-2",
        title: "Real Gmail OAuth 2.0, YouTube Media Resolver & Verified Windows App Launching",
        detail:
          "Added Google OAuth 2.0 (gmail.readonly) live unread inbox sync, embedded YouTube video playback & search resolution, and allowlisted OS process spawning with PID verification.",
      },
    ],
    files: enriched,
  });
});

// ============================================================================
// 10. VITE DEV MIDDLEWARE OR STATIC DIST SERVING
// ============================================================================

async function startServer() {
  const PORT = 3000;
  const distPath = path.join(__dirname, "dist");

  if (process.env.NODE_ENV === "production" && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `ORNION — Personal AI Assistant running at http://localhost:${PORT} (Model: ${getNvidiaModel()})`
    );
  });
}

startServer();
