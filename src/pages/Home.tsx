import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS, type ProviderId } from "../lib/themes";
import type { Turn } from "../lib/useChat";
import type { BobChange, BobRepo, Fact } from "../lib/bob";
import { EFFORT_LABEL, type Effort, type ModelOption } from "../lib/providers";
import { ProviderBadge } from "../components/Logos";
import { CornerMark } from "../components/CornerMark";
import { AccountDial } from "../components/AccountDial";
import { ModelSelector } from "../components/ModelSelector";

function Thinking() {
  return (
    // Same box as the avatar beside it (28px tall, 2px down) so the dots sit on
    // its center line — the row aligns children to the top, not the middle.
    <div className="flex gap-1.5 items-center h-7 mt-0.5" aria-label="Thinking">
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

/**
 * Gateways spell one model several ways — `claude-opus-5-5`,
 * `us.anthropic.claude-opus-5-5-20261001-v1:0`, `vertex/claude-opus-5.5@20261001`.
 * Strip what doesn't change which model it is, so only a real swap stands out.
 */
function modelKey(id: string): string {
  return id
    .toLowerCase()
    .replace(/-v\d+(:\d+)?$/, "")
    .replace(/^.*\//, "")
    .replace(/^(?:[a-z_]+\.)+/, "")
    .replace(/@.*$/, "")
    .replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, "")
    .replace(/\./g, "-");
}

/** The model as the response named it, set against what was asked for. */
function ServedModel({ turn, live }: { turn: Turn; live: boolean }) {
  const { model, served } = turn;
  if (!model) return null;
  if (!served) {
    return live ? <span>{model}</span> : (
      <span title="The response didn't name the model that produced it.">{model} · unconfirmed</span>
    );
  }
  if (modelKey(served) === modelKey(model)) {
    return <span title={`The response names ${served}.`}>{model} ✓</span>;
  }
  return (
    <span style={{ color: "#d97706" }} title="The response names a different model from the one selected.">
      asked for {model} · answered by {served}
    </span>
  );
}

function UsageLine({ turn, live }: { turn: Turn; live: boolean }) {
  const u = turn.usage;
  const counted = Boolean(u && (u.input || u.output));
  if (!counted && !turn.model) return null;
  return (
    <div className="mono text-[10.5px] -mt-0.5 flex flex-wrap gap-x-2" style={{ color: "var(--muted)" }}>
      <ServedModel turn={turn} live={live} />
      {turn.effort && <span>{EFFORT_LABEL[turn.effort].toLowerCase()} effort</span>}
      {counted && u && <span>{fmtTokens(u.input)} in · {fmtTokens(u.output)} out</span>}
      {u?.cacheRead ? <span>{fmtTokens(u.cacheRead)} cached</span> : null}
    </div>
  );
}

/** The one argument worth reading at a glance — `route: "/api/login"`. */
function argsSummary(raw: string): string {
  try {
    const args = JSON.parse(raw || "{}");
    const parts = Object.entries(args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    return parts.join(", ");
  } catch {
    return raw;
  }
}

function prettyArgs(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw || "{}"), null, 2);
  } catch {
    return raw;
  }
}

const fmtMs = (ms?: number) => (ms === undefined ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

/** The page's view of the Implementer's changes, and the user's two decisions on them. */
interface Changes {
  list: BobChange[];
  reload: () => Promise<void>;
  decide: (id: string, decision: "apply" | "discard") => Promise<void>;
}
const ChangesContext = createContext<Changes | null>(null);

const ROLE_TOOLS: Record<string, string> = { implement_change: "implementer", review_change: "reviewer" };

/** The Bob role behind a call, for the calls that have one. */
function roleOf(fact: Fact): string | null {
  if (fact.trace?.role) return fact.trace.role;
  if (ROLE_TOOLS[fact.tool]) return ROLE_TOOLS[fact.tool];
  if (fact.tool !== "delegate") return null;
  try {
    return String(JSON.parse(fact.args || "{}").role ?? "") || null;
  } catch {
    return null;
  }
}

/** A role call's one argument worth reading — its task, or the change it reviews. */
function taskOf(fact: Fact): string {
  try {
    const args = JSON.parse(fact.args || "{}");
    if (typeof args.task === "string") return args.task;
    if (typeof args.change_id === "string") return `change ${args.change_id}`;
  } catch {
    // fall through
  }
  return argsSummary(fact.args);
}

type Tone = "good" | "warn" | null;
const TONE: Record<string, string> = { good: "#30a46c", warn: "#d97706" };

/** What the role came back with, in a few words. */
function outcomeOf(fact: Fact): { text: string; tone: Tone } | null {
  const t = fact.trace;
  if (!t || fact.status !== "done") return null;
  if (t.role === "reviewer" && t.verdict) {
    return t.verdict === "approve" ? { text: "approved", tone: "good" } : { text: "changes requested", tone: "warn" };
  }
  if (t.role === "implementer" && t.files !== undefined) {
    return {
      text: t.files ? `+${t.insertions} −${t.deletions} in ${t.files} file${t.files === 1 ? "" : "s"}` : "no changes",
      tone: null,
    };
  }
  if (t.cited) {
    const failing = t.cited - (t.verified ?? 0);
    return failing
      ? { text: `${failing} of ${t.cited} citations don't hold`, tone: "warn" }
      : { text: `${t.cited} citation${t.cited === 1 ? "" : "s"} checked`, tone: "good" };
  }
  return null;
}

/**
 * The user's decision on a change: it lives only in its own worktree until
 * they apply it. No model can press these — applying is not a tool.
 */
function ChangeActions({ id, round }: { id: string; round?: number }) {
  const ctx = useContext(ChangesContext);
  const change = ctx?.list.find((c) => c.id === id);
  const [busy, setBusy] = useState<"apply" | "discard" | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef("");

  // A change made moments ago isn't in the list the page last fetched.
  useEffect(() => {
    const key = `${id}:${round}`;
    if (!ctx || asked.current === key) return;
    if (!change || (round ?? 0) > change.rounds) {
      asked.current = key;
      void ctx.reload().catch(() => {});
    }
  }, [ctx, id, round, change]);

  if (!ctx) return null;
  const status = change?.status ?? "open";

  const decide = async (decision: "apply" | "discard") => {
    setBusy(decision);
    setError(null);
    try {
      await ctx.decide(id, decision);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
    setConfirmDiscard(false);
  };

  return (
    <div className="ui text-[11.5px] flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5" style={{ borderTop: "0.5px solid var(--border)", color: "var(--muted)" }}>
      {status === "applied" ? (
        <span>Applied to your files as uncommitted edits. Review them, then commit.</span>
      ) : status === "discarded" ? (
        <span>Discarded.</span>
      ) : (
        <>
          <span className="mr-auto">Change {id} is only in its own worktree until you apply it.</span>
          <button
            onClick={() => void decide("apply")}
            disabled={busy !== null}
            className="rounded-md px-2 py-0.5 font-medium disabled:opacity-60"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {busy === "apply" ? "Applying…" : "Apply to my files"}
          </button>
          <button
            onClick={() => (confirmDiscard ? void decide("discard") : setConfirmDiscard(true))}
            onBlur={() => setConfirmDiscard(false)}
            disabled={busy !== null}
            className="rounded-md px-2 py-0.5 disabled:opacity-60"
            style={{ border: "0.5px solid var(--border)", color: confirmDiscard ? "#e5484d" : "var(--fg)" }}
          >
            {busy === "discard" ? "Discarding…" : confirmDiscard ? "Discard for good?" : "Discard"}
          </button>
        </>
      )}
      {error && <span className="w-full" style={{ color: "#e5484d" }}>{error}</span>}
    </div>
  );
}

/**
 * One Bob call, rendered as a tool call rather than as prose. Collapsed it
 * reads as a single line; open, it shows exactly what the model sent and got
 * back — the same bytes that now ground every later reply.
 */
function BobTrace({ fact, actions = false }: { fact: Fact; actions?: boolean }) {
  const [open, setOpen] = useState(false);
  const running = fact.status === "running";
  const failed = fact.status === "error";
  const role = roleOf(fact);
  const outcome = outcomeOf(fact);
  const round = fact.trace?.round;
  const who = fact.trace?.source === "bob" ? "Bob" : fact.trace?.source === "scanner" ? "scanner" : null;
  const state = running
    ? "running…"
    : fact.status === "stopped"
      ? "stopped"
      : [who, failed ? "failed" : null, fmtMs(fact.ms)].filter(Boolean).join(" · ");
  const redactions = fact.trace?.redactions ?? 0;

  return (
    <div
      className="mono text-[11.5px] rounded-lg overflow-hidden"
      style={{ background: "var(--surface)", border: "0.5px solid var(--border)", color: "var(--fg)" }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={running}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left disabled:cursor-default"
      >
        {running ? (
          <span
            className="w-3 h-3 shrink-0 rounded-full"
            style={{ border: "1.5px solid var(--muted)", borderTopColor: "transparent", animation: "spin-slow 0.9s linear infinite" }}
          />
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={failed ? "#e5484d" : "var(--muted)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M8 6l-6 6 6 6M16 6l6 6-6 6" />
          </svg>
        )}
        <span className="font-semibold shrink-0">
          {role ? `Bob · ${role}` : fact.tool}
          {role && round && round > 1 ? ` · round ${round}` : ""}
        </span>
        <span className="truncate min-w-0" style={{ color: "var(--muted)" }}>{role ? taskOf(fact) : argsSummary(fact.args)}</span>
        {outcome && (
          <span className="ml-auto shrink-0 pl-2" style={{ color: outcome.tone ? TONE[outcome.tone] : "var(--muted)" }}>{outcome.text}</span>
        )}
        <span className={`${outcome ? "" : "ml-auto "}shrink-0 pl-2`} style={{ color: failed ? "#e5484d" : "var(--muted)" }}>{state}</span>
        {!running && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.4" strokeLinecap="round" className="shrink-0" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 pt-2 flex flex-col gap-2" style={{ borderTop: "0.5px solid var(--border)" }}>
          <div>
            <div className="ui text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>Arguments</div>
            <pre className="whitespace-pre-wrap break-words">{prettyArgs(fact.args)}</pre>
          </div>
          <div>
            <div className="ui text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>Result</div>
            <pre className="whitespace-pre-wrap break-words max-h-[280px] overflow-y-auto" style={{ color: failed ? "#e5484d" : "var(--fg)" }}>
              {fact.result ?? "(none)"}
            </pre>
          </div>
          {fact.trace && (
            <div className="ui text-[10.5px] flex flex-wrap gap-x-2" style={{ color: "var(--muted)" }}>
              {fact.trace.security && <span>{fact.trace.security} security</span>}
              {redactions > 0 && <span>{redactions} value{redactions === 1 ? "" : "s"} redacted</span>}
              {fact.trace.blocked && <span>blocked</span>}
              {fact.trace.source === "bob" && fact.trace.tool_calls !== undefined && (
                <span>{fact.trace.tool_calls} Bob tool call{fact.trace.tool_calls === 1 ? "" : "s"}</span>
              )}
              {fact.trace.session_costs !== undefined && (
                <span>
                  Bob cost {fact.trace.session_costs.toFixed(3)}
                  {fact.trace.round && fact.trace.round > 1 ? " so far" : ""}
                </span>
              )}
              {fact.trace.total_tokens ? <span>{fmtTokens(fact.trace.total_tokens)} Bob tokens</span> : null}
              {fact.trace.task_id && <span>task {fact.trace.task_id.slice(0, 8)}</span>}
            </div>
          )}
        </div>
      )}
      {actions && fact.trace?.change_id && <ChangeActions id={fact.trace.change_id} round={round} />}
    </div>
  );
}

type Piece = { kind: "text"; key: string; text: string } | { kind: "fact"; key: string; fact: Fact };

/** The reply's text cut at each call, so every trace sits where it happened. */
function interleave(text: string, facts: Fact[]): Piece[] {
  const out: Piece[] = [];
  const push = (from: number, to: number) => {
    const chunk = text.slice(from, to).replace(/^\n+|\n+$/g, "");
    if (chunk) out.push({ kind: "text", key: `t${from}`, text: chunk });
  };
  let from = 0;
  for (const fact of facts) {
    const at = Math.min(Math.max(fact.at, from), text.length);
    push(from, at);
    out.push({ kind: "fact", key: fact.id, fact });
    from = at;
  }
  push(from, text.length);
  return out;
}

function Bubble({ turn, streaming }: { turn: Turn; streaming: boolean }) {
  if (turn.role === "assistant") {
    const facts = turn.facts ?? [];
    // Waiting on the model, not on Bob: nothing written since the last call.
    const since = facts.length ? facts[facts.length - 1].at : 0;
    const waiting = streaming && !facts.some((f) => f.status === "running") && turn.text.length <= since;
    // A change's buttons sit on its latest trace — after the last review, not between rounds.
    const latest = new Map<string, string>();
    for (const f of facts) if (f.status === "done" && f.trace?.change_id) latest.set(f.trace.change_id, f.id);
    const actionsFor = (f: Fact) => Boolean(f.trace?.change_id) && latest.get(f.trace!.change_id!) === f.id;
    return (
      <div className="flex gap-2.5 items-start" style={{ maxWidth: "82%" }}>
        <div className="mt-0.5"><ProviderBadge id={turn.provider} size={28} /></div>
        <div className="min-w-0 flex flex-col gap-2">
          {turn.error ? (
            <>
              {facts.map((f) => <BobTrace key={f.id} fact={f} actions={actionsFor(f)} />)}
              <div
                className="ui text-[12.5px] leading-relaxed rounded-lg px-3 py-2"
                style={{ background: "color-mix(in srgb, #e5484d 12%, transparent)", color: "#e5484d", border: "0.5px solid color-mix(in srgb, #e5484d 35%, transparent)" }}
              >
                {turn.text}
              </div>
            </>
          ) : (
            <>
              {interleave(turn.text, facts).map((p) =>
                p.kind === "fact" ? (
                  <BobTrace key={p.key} fact={p.fact} actions={actionsFor(p.fact)} />
                ) : (
                  <div key={p.key} className="conv text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--fg)" }}>
                    {p.text}
                  </div>
                ),
              )}
              {waiting && <Thinking />}
            </>
          )}
          {!turn.error && <UsageLine turn={turn} live={streaming} />}
          {turn.note && (
            <div className="ui text-[11px] -mt-1 italic" style={{ color: "var(--muted)" }}>{turn.note}</div>
          )}
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
function EmptyConnect({ onConnect, onConnectIca }: { onConnect: () => void; onConnectIca: () => void }) {
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
      <div className="flex items-center gap-2">
        <button onClick={onConnectIca} className="rounded-lg px-4 py-2 text-[13px] font-medium" style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}>Connect via ICA</button>
        <button onClick={onConnect} className="rounded-lg px-4 py-2 text-[13px] font-medium" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>Connect an AI</button>
      </div>
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
  efforts,
  effort,
  onEffortChange,
  onSend,
  onStop,
  onSwitch,
  onConnect,
  onConnectIca,
  changes = [],
  onReloadChanges,
  onDecideChange,
  repo,
  onOpenRepo,
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
  /** Levels the current model accepts; null hides the picker. */
  efforts: Effort[] | null;
  /** Always one of `efforts` when the picker is shown. */
  effort: Effort | undefined;
  onEffortChange: (e: Effort) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onSwitch: (id: ProviderId) => void;
  onConnect: () => void;
  onConnectIca: () => void;
  /** The Implementer's changes, for the Apply and Discard buttons on its traces. */
  changes?: BobChange[];
  onReloadChanges?: () => Promise<void>;
  onDecideChange?: (id: string, decision: "apply" | "discard") => Promise<void>;
  /** The folder Bob works in; shown by the composer, chosen on the Bob page. */
  repo?: BobRepo;
  onOpenRepo?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const changesCtx = useMemo<Changes | null>(
    () => (onReloadChanges && onDecideChange ? { list: changes, reload: onReloadChanges, decide: onDecideChange } : null),
    [changes, onReloadChanges, onDecideChange],
  );
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
          <EmptyConnect onConnect={onConnect} onConnectIca={onConnectIca} />
        </div>
      </div>
    );
  }

  return (
    <ChangesContext.Provider value={changesCtx}>
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
            <div className="flex items-center gap-2 min-w-0">
              {repo && (
                <button
                  onClick={onOpenRepo}
                  title={`Bob works in ${repo.display}. Change it on the Bob page.`}
                  className="ui min-w-0 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px]"
                  style={{ color: "var(--muted)" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                  <span className="truncate max-w-[160px]">{repo.name}</span>
                </button>
              )}
              {efforts && effort && (
                // Same picker as the model, fed the levels this model accepts.
                <ModelSelector
                  models={efforts.map((e) => ({ id: e, label: `${EFFORT_LABEL[e]} effort` }))}
                  value={effort}
                  onChange={(id) => onEffortChange(id as Effort)}
                  disabled={streaming}
                />
              )}
              <ModelSelector models={models} value={model} onChange={onModelChange} disabled={streaming} />
            </div>
          </div>
        </div>
      </div>
    </div>
    </ChangesContext.Provider>
  );
}
