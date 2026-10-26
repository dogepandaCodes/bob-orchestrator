import { useState } from "react";
import { SESSIONS, type Session } from "../lib/data";
import type { ProviderId } from "../lib/themes";
import { ProviderBadge } from "../components/Logos";
import { CornerMark } from "../components/CornerMark";

function ProviderTrail({ trail }: { trail: Session["trail"] }) {
  return (
    <div className="flex items-center gap-1.5">
      {trail.map((id, i) => {
        const isLast = i === trail.length - 1;
        return (
          <ProviderBadge
            key={i}
            id={id}
            size={isLast ? 30 : 26}
            faded={!isLast}
            ring={isLast}
          />
        );
      })}
    </div>
  );
}

function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="inline-block -mt-0.5">
      <circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="9" r="2.5" />
      <path d="M6 8.5v7M8.5 6H14a2 2 0 0 1 2 2v0" />
    </svg>
  );
}

function Row({ s, onResume }: { s: Session; onResume: (s: Session) => void }) {
  return (
    <button onClick={() => onResume(s)} className="w-full text-left rounded-xl p-3.5 flex items-start gap-4 transition-colors hover:opacity-95 ui" style={{ background: "var(--card)", border: "0.5px solid var(--border)" }}>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium truncate" style={{ color: "var(--fg)" }}>{s.title}</div>
        {s.pending ? (
          <div className="mt-2 space-y-1.5">
            <div className="h-2.5 rounded w-[70%]" style={{ background: "var(--surface)", animation: "pulse-bar 1.4s ease-in-out infinite" }} />
            <div className="h-2.5 rounded w-[45%]" style={{ background: "var(--surface)", animation: "pulse-bar 1.4s ease-in-out infinite 0.2s" }} />
          </div>
        ) : (
          <p className="text-[13px] mt-1 leading-normal" style={{ color: "var(--muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.summary}</p>
        )}
        <div className="flex items-center gap-2 mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
          <span>{s.pending ? "Summarizing…" : s.when}</span>
          <span>·</span>
          <span>{s.messages} messages</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1"><BranchIcon /> Bob {s.bobCalls} calls · {s.bobTokens} tokens</span>
        </div>
      </div>
      <div className="shrink-0 pt-0.5"><ProviderTrail trail={s.trail} /></div>
    </button>
  );
}

export function Context({
  active,
  dark,
  onResume,
}: {
  active: ProviderId;
  dark: boolean;
  onResume: (s: Session) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = SESSIONS.filter(
    (s) => s.title.toLowerCase().includes(q.toLowerCase()) || s.summary.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="relative h-full overflow-y-auto p-6">
      <CornerMark active={active} dark={dark} />
      <div className="relative max-w-[880px] mx-auto">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[22px] font-semibold ui" style={{ color: "var(--fg)" }}>Context</h1>
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sessions" className="w-[180px] rounded-lg pl-8 pr-3 py-1.5 text-[12.5px] ui outline-none" style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }} />
          </div>
        </div>
        <p className="text-[12px] mt-1.5 mb-5 ui" style={{ color: "var(--muted)" }}>Providers shown oldest to most recent · resumes on the last one used</p>

        <div className="space-y-2.5">
          {filtered.map((s) => <Row key={s.id} s={s} onResume={onResume} />)}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-[13px] ui" style={{ color: "var(--muted)" }}>No sessions match “{q}”.</div>
          )}
        </div>
      </div>
    </div>
  );
}
