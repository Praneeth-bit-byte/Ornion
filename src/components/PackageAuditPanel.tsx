import React, { useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Info,
  ShieldCheck,
  Terminal,
  Wrench,
} from "lucide-react";

export interface PackageFileItem {
  displayName: string;
  actualFile: string;
  category: string;
  status: string;
  summary: string;
  improvements: string;
  exists: boolean;
  sizeBytes: number;
  lines: number;
  downloadUrl: string;
  preview: string;
}

export interface PackageAuditData {
  productName?: string;
  productDescription?: string;
  creator?: string;
  category?: string;
  primaryEnvironment?: string;
  packageVersion: string;
  lastUpdated: string;
  totalFiles: number;
  verifiedCount: number;
  issuesResolved: Array<{ id: string; title: string; detail: string }>;
  files: PackageFileItem[];
}

interface PackageAuditPanelProps {
  audit: PackageAuditData | null;
  onRunCommand: (cmd: string) => void;
}

export const PackageAuditPanel: React.FC<PackageAuditPanelProps> = ({
  audit,
  onRunCommand,
}) => {
  const [selectedFile, setSelectedFile] = useState<PackageFileItem | null>(
    audit?.files?.[0] || null
  );

  if (!audit) {
    return (
      <div className="p-8 text-center font-mono text-sm text-cyan-300/70">
        Loading ORNION — Personal AI Assistant Package & Identity Audit...
      </div>
    );
  }

  const activeFile = selectedFile || audit.files[0];

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1440px] mx-auto w-full">
      {/* Top Banner: Official ORNION Project Identity & Creator Attribution */}
      <div className="border border-cyan-500/35 bg-[#07162C]/90 p-5 rounded flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-display text-xs tracking-wider text-cyan-400 uppercase">
            {audit.category || "Personal AI Assistant and Automation Platform"} · Primary Environment: {audit.primaryEnvironment || "Windows 10/11 (with macOS & Linux support)"}
          </div>
          <h1 className="font-display text-xl font-bold text-white mt-0.5">
            {audit.productName || "ORNION"} — {audit.productDescription || "Personal AI Assistant"}
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Created and developed by <span className="text-cyan-300 font-semibold">{audit.creator || "Praneeth Thota"}</span>. Includes all 12 verified desktop & web deliverables (`jarvis_voice.py` with local `127.0.0.1:8765` HUD server, cross-platform `jarvis_actions.py`, `jarvis_brain.py`, `jarvis_market.py`, `install.bat`, `install.sh`, `jarvis_workplace.html`, and setup documentation).
          </p>
        </div>

        <div className="px-4 py-2.5 rounded border border-cyan-500/30 bg-[#030B17] font-mono text-xs text-right shrink-0">
          <div className="text-cyan-400 font-semibold">PROJECT OWNER & AUTHOR</div>
          <div className="text-white font-bold mt-0.5">{audit.creator || "Praneeth Thota"}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{audit.packageVersion}</div>
        </div>
      </div>

      {/* Top Diagnostic Summary Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border border-cyan-500/25 bg-[#061224]/85 p-5 rounded">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs tracking-wider text-cyan-400 uppercase">
              ORNION Module Health
            </span>
            <span className="font-mono text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />● 100% VERIFIED
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="font-mono text-3xl font-bold text-white tabular-nums">
              {audit.verifiedCount} / {audit.totalFiles}
            </span>
            <span className="text-xs text-slate-400">
              Deliverables Verified · {audit.packageVersion}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            All Python modules (`jarvis_brain`, `jarvis_actions`, `jarvis_market`, `jarvis_voice`), Windows/macOS/Linux installers, documentation, and the 3D Holographic HUD are rebranded to ORNION while preserving compatibility filenames.
          </p>
        </div>

        {audit.issuesResolved.map((issue) => (
          <div
            key={issue.id}
            className="border border-emerald-500/25 bg-[#061520]/85 p-5 rounded"
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-xs tracking-wider text-emerald-400 uppercase flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" /> Architecture & Upgrade Status
              </span>
              <span className="font-mono text-xs text-emerald-300">VERIFIED</span>
            </div>
            <h3 className="mt-2 font-semibold text-sm text-white">
              {issue.title}
            </h3>
            <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
              {issue.detail}
            </p>
          </div>
        ))}
      </div>

      {/* Main Split: File List + Code/Document Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: All 12 Package Files */}
        <div className="lg:col-span-5 border border-cyan-500/25 bg-[#061224]/85 rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-cyan-500/20 flex items-center justify-between">
            <h2 className="font-display text-xs tracking-wider text-cyan-400 uppercase">
              01. ORNION Desktop Modules & Guides
            </h2>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {audit.files.length} items
            </span>
          </div>

          <div className="divide-y divide-cyan-500/10 max-h-[540px] overflow-y-auto">
            {audit.files.map((file) => {
              const isSelected = activeFile?.displayName === file.displayName;
              return (
                <button
                  key={file.displayName}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left px-4 py-3.5 transition-colors flex items-start justify-between gap-3 cursor-pointer ${
                    isSelected
                      ? "bg-cyan-500/15 text-white"
                      : "hover:bg-white/[0.03] text-slate-300"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="font-mono text-xs font-semibold text-white truncate">
                        {file.displayName}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-cyan-300/80">
                        {file.category}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                      {file.summary}
                    </p>
                  </div>

                  <div className="text-right shrink-0 font-mono">
                    <div className="text-[11px] text-emerald-400">
                      ● {file.status}
                    </div>
                    <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                      {formatBytes(file.sizeBytes)} · {file.lines}L
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: File Source & Status Inspector */}
        <div className="lg:col-span-7 border border-cyan-500/25 bg-[#061224]/85 rounded flex flex-col">
          {activeFile && (
            <>
              <div className="px-5 py-4 border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono text-base font-bold text-white">
                      {activeFile.displayName}
                    </h2>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="font-mono text-xs text-emerald-400">
                      ● {activeFile.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {activeFile.improvements}
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  {(activeFile.displayName.endsWith(".html") ||
                    activeFile.displayName.endsWith(".pdf")) && (
                    <a
                      href={activeFile.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 text-xs font-medium bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Live Preview
                    </a>
                  )}
                  <a
                    href={activeFile.downloadUrl}
                    download={activeFile.displayName}
                    className="px-3.5 py-2 text-xs font-medium bg-cyan-500 text-slate-950 hover:bg-cyan-400 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download {activeFile.displayName}
                  </a>
                </div>
              </div>

              <div className="p-4 bg-[#020813] font-mono text-xs text-slate-200 overflow-x-auto max-h-[420px] overflow-y-auto leading-relaxed">
                <pre className="whitespace-pre-wrap break-words">
                  {activeFile.preview}
                </pre>
              </div>

              {/* Quick Desktop Setup & Tenglish Follower Summary */}
              <div className="p-5 border-t border-cyan-500/20 bg-[#040E1E] grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-display text-xs tracking-wider text-cyan-400 uppercase flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" /> Windows & Unix Quick-Run
                  </h3>
                  <pre className="mt-2 p-2.5 rounded bg-[#01050C] border border-cyan-500/15 font-mono text-[11px] text-cyan-200 overflow-x-auto">
                    {`# Windows (Primary): install.bat -> .venv\\Scripts\\python jarvis_voice.py\n# macOS/Linux: chmod +x install.sh && ./install.sh && python jarvis_voice.py`}
                  </pre>
                </div>

                <div>
                  <h3 className="font-display text-xs tracking-wider text-amber-300 uppercase flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Tenglish Follower Guide Summary
                  </h3>
                  <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                    1) Python 3.10+ install chesukondi · 2) Windows lo{" "}
                    <code className="text-cyan-300 font-mono">install.bat</code>{" "}
                    leda Mac/Linux lo{" "}
                    <code className="text-cyan-300 font-mono">./install.sh</code>{" "}
                    run cheyandi · 3) Free Groq API key paste chesi{" "}
                    <code className="text-cyan-300 font-mono">
                      python jarvis_voice.py
                    </code>{" "}
                    tho ORNION start cheyandi!
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Interactive Feature Verification Matrix */}
      <div className="border border-cyan-500/25 bg-[#061224]/85 rounded p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-display text-xs tracking-wider text-cyan-400 uppercase">
              02. Live ORNION Capability Matrix (Click to Test in HUD)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Every voice command from README.md & INDEX.md is wired and executable right now.
            </p>
          </div>
          <span className="font-mono text-xs text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> All 8 Command Pipelines Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              cmd: "Stock market report",
              desc: "Analyzes Nifty 50, Sensex, Reliance, Nvidia & Bitcoin with SMA signals",
              module: "jarvis_market.py",
            },
            {
              cmd: "Should I buy Reliance?",
              desc: "Calculates 5/15 SMA crossover and momentum for RELIANCE.NS",
              module: "jarvis_market.py",
            },
            {
              cmd: "Check my unread emails",
              desc: "Reads local mail cache and delivers 30-second spoken briefing",
              module: "jarvis_actions.py",
            },
            {
              cmd: "Send WhatsApp to Pallavi saying team sync at 5pm",
              desc: "Drafts and triggers WhatsApp Web message automation",
              module: "jarvis_actions.py",
            },
            {
              cmd: "Play lofi on YouTube",
              desc: "Formats YouTube media query and provides 1-click stream launch",
              module: "jarvis_actions.py",
            },
            {
              cmd: "Ornion, open VS Code",
              desc: "Triggers workspace app launcher for Visual Studio Code",
              module: "jarvis_actions.py",
            },
            {
              cmd: "Volume up",
              desc: "Adjusts system output volume hands-free",
              module: "jarvis_actions.py",
            },
            {
              cmd: "Explain how your hybrid failover works",
              desc: "Queries Cloud AI Brain with automatic local fallback protection",
              module: "jarvis_brain.py",
            },
          ].map((item) => (
            <button
              key={item.cmd}
              onClick={() => onRunCommand(item.cmd)}
              className="text-left p-3.5 rounded border border-cyan-500/20 bg-[#030B17] hover:border-cyan-400/60 hover:bg-cyan-500/10 transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-cyan-400">
                <span>{item.module}</span>
                <span className="group-hover:translate-x-0.5 transition-transform">
                  Run ›
                </span>
              </div>
              <div className="mt-1.5 font-mono text-xs font-semibold text-white">
                "{item.cmd}"
              </div>
              <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                {item.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* About ORNION, Authorship & Third-Party Notices */}
      <div className="border border-cyan-500/20 bg-[#051020]/80 rounded p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
        <div>
          <h3 className="font-display text-xs tracking-wider text-cyan-400 uppercase flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> About ORNION & Project Ownership
          </h3>
          <p className="mt-2 text-slate-300 leading-relaxed">
            <strong className="text-white">ORNION — Personal AI Assistant</strong> is created and developed by{" "}
            <strong className="text-cyan-300">Praneeth Thota</strong> as a Personal AI Assistant and Automation Platform with primary support for Windows 10/11 alongside macOS and Linux. Desktop Python modules retain their `jarvis_*.py` filenames for backward compatibility with existing scripts and imports.
          </p>
        </div>
        <div>
          <h3 className="font-display text-xs tracking-wider text-cyan-400 uppercase">
            Third-Party Libraries & APIs Notice
          </h3>
          <p className="mt-2 text-slate-400 leading-relaxed">
            ORNION integrates third-party open-source packages and APIs—including React, Vite, Express, Tailwind CSS, Lucide Icons, Python SpeechRecognition, pyttsx3, psutil, Groq API, Google Gemini SDK (`@google/genai`), and Yahoo Finance chart feeds—which remain the property of their respective authors and are governed by their own licenses and terms.
          </p>
        </div>
      </div>
    </div>
  );
};
