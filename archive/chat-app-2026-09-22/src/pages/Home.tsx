import { useEffect, useRef, useState } from "react";
import { PROVIDERS, type ProviderId } from "../lib/themes";
import type { Turn } from "../lib/useChat";
import type { ModelOption } from "../lib/providers";
import { ProviderBadge } from "../components/Logos";
import { CornerMark } from "../components/CornerMark";
import { AccountDial } from "../components/AccountDial";
import { ModelSelector } from "../components/ModelSelector";

function Thinking() {
  return (
    <div className="flex gap-1.5 items-center py-1" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full inline-block"
          style={{
            background: "var(--muted)",
            animation: `pulse-bar 1.1s ease-in-out infinite ${i * 0.18}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Compact token counts — 1240 reads as "1.2k". */
function fmtTokens(n?: number): string {
  if (!n) return "0";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function UsageLine({ turn }: { turn: Turn }) {
  const u = turn.usage;
  if (!u || (!u.input && !u.output)) return null;
  return (
    <div className="mono text-[10.5px] mt-1.5 flex flex-wrap gap-x-2" style={{ color: "var(--muted)" }}>
      {turn.model && <span>{turn.model}</span>}
      <span>{fmtTokens(u.input)} in · {fmtTokens(u.output)} out</span>
      {u.cacheRead ? <span>{fmtTokens(u.cacheRead)} cached</span> : null}
    </div>
  );
}

function Bubble({ turn, streaming }: { turn: Turn; streaming: boolean }) {
  if (turn.role === "assistant") {
    const empty = turn.text.length === 0;
    return (
      <div className="flex gap-2.5 items-start" style={{ maxWidth: "82%" }}>
        <div className="mt-0.5"><ProviderBadge id={turn.provider} size={28} /></div>
        <div className="min-w-0">
          {turn.error ? (
            <div
              className="ui text-[12.5px] leading-relaxed rounded-lg px-3 py-2"
              style={{ background: "color-mix(in srgb, #e5484d 12%, transparent)", color: "#e5484d", border: "0.5px solid color-mix(in srgb, #e5484d 35%, transparent)" }}
            >
              {turn.text}
            </div>
          ) : empty && streaming ? (
            <Thinking />
          ) : (
            <div className="conv text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--fg)" }}>
              {turn.text}
            </div>
          )}
          {!turn.error && <UsageLine turn={turn} />}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5 items-start self-end flex-row-reverse" style={{ maxWidth: "78%" }}>
      <div className="mt-0.5 w-7 h-7 rounded-full inline-flex items-center justify-center text-[11px] font-semibold ui shrink-0" style={{ background: "var(--surface)", color: "var(--fg)" }}>You</div>
      <div className="conv text-[15px] leading-relaxed rounded-2xl px-3.5 py-2 whitespace-pre-wrap" style={{ background: "var(--user-bubble)", color: "var(--user-bubble-fg)" }}>
        {turn.text}
      </div>
    </div>
  );
}

// Neutral placeholder — showing a real provider mark here would imply a
// selection the user has not made.
function EmptyConnect({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center ui">
      <div
        className="w-16 h-16 rounded-full mb-5 inline-flex items-center justify-center"
        style={{ border: "1.5px dashed var(--border)", color: "var(--muted)" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </div>
      <h2 className="text-[19px] font-semibold conv" style={{ color: "var(--fg)" }}>No AI connected yet</h2>
      <p className="text-[13px] mt-2 mb-5 max-w-[320px]" style={{ color: "var(--muted)" }}>
        Add an API key to start. You can connect more than one and switch between
        them without losing the thread.
      </p>
      <button onClick={onConnect} className="rounded-lg px-4 py-2 text-[13px] font-medium" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>Connect an AI</button>
    </div>
  );
}

function EmptyThread({ active }: { active: ProviderId }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center ui">
      <div className="opacity-30 mb-4"><ProviderBadge id={active} size={52} /></div>
      <p className="text-[13.5px]" style={{ color: "var(--muted)" }}>
        Talking to {PROVIDERS[active].name}. Ask anything.
      </p>
    </div>
  );
}

export function Home({
  active,
  theme,
  connected,
  dark,
  turns,
  streaming,
  models,
  model,
  onModelChange,
  onSend,
  onStop,
  onSwitch,
  onConnect,
}: {
  /** Null until the user connects something — no provider is preselected. */
  active: ProviderId | null;
  /** Concrete provider used for styling; the app always renders some theme. */
  theme: ProviderId;
  connected: ProviderId[];
  dark: boolean;
  turns: Turn[];
  streaming: boolean;
  models: ModelOption[];
  model: string;
  onModelChange: (id: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onSwitch: (id: ProviderId) => void;
  onConnect: () => void;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // Grow the composer with its content. `rows={1}` alone pins it to one line,
  // which left the max-height below unreachable.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  function submit() {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft("");
    onSend(text);
  }

  // Nothing selected — nothing to send to, and no account row to show.
  if (!active || connected.length === 0) {
    return (
      <div className="relative h-full flex flex-col">
        <CornerMark active={theme} dark={dark} />
        <div className="relative flex-1 overflow-y-auto p-6">
          <EmptyConnect onConnect={onConnect} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      {active === "gemini" && (
        <div className="pointer-events-none absolute inset-0" style={{ background: PROVIDERS[active].dark.glow }} />
      )}
      <CornerMark active={active} dark={dark} />

      <div ref={scrollRef} className="relative flex-1 overflow-y-auto p-6">
        {turns.length === 0 ? (
          <EmptyThread active={active} />
        ) : (
          <div className="max-w-[880px] mx-auto flex flex-col gap-3.5">
            {turns.map((t, i) => (
              <div key={t.id} className="flex flex-col">
                <Bubble turn={t} streaming={streaming && i === turns.length - 1} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="relative px-6 py-4" style={{ borderTop: "0.5px solid var(--border)" }}>
        <div className="max-w-[880px] mx-auto">
          <div
            className="rounded-2xl px-4 py-3 ui flex items-end gap-2"
            style={{
              background: active === "chatgpt" ? "var(--surface)" : "var(--card)",
              border: active === "claude" ? "none" : "0.5px solid var(--border)",
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={`Message ${PROVIDERS[active].name}`}
              className="flex-1 block bg-transparent outline-none resize-none conv text-[15px] leading-6 py-1 max-h-[160px] overflow-y-auto"
              style={{ color: "var(--fg)" }}
            />
            {streaming ? (
              <button
                onClick={onStop}
                aria-label="Stop generating"
                className="shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center transition-opacity hover:opacity-80"
                style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2.5" /></svg>
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={draft.trim().length === 0}
                aria-label="Send"
                className="shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center transition-opacity disabled:opacity-30"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              </button>
            )}
          </div>
          <div className="flex items-center justify-between mt-3 gap-3">
            <AccountDial
              connected={connected}
              active={active}
              locked={streaming}
              onSwitch={onSwitch}
              onAdd={onConnect}
            />
            <ModelSelector models={models} value={model} onChange={onModelChange} disabled={streaming} />
          </div>
        </div>
      </div>
    </div>
  );
}
