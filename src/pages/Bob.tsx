import { useState } from "react";
import { CornerMark } from "../components/CornerMark";
import { AddSkillModal } from "../components/AddSkillModal";
import type { ProviderId } from "../lib/themes";
import { bobReady, type BobChange, type BobRepo, type BobStatus, type SecurityLevel } from "../lib/bob";

const SECURITY_LEVELS: {
  id: SecurityLevel;
  title: string;
  tag: string;
  desc: string;
  impl: string;
  accent: string;
}[] = [
  {
    id: "none",
    title: "None",
    tag: "Full access",
    desc: "Tool results reach the model exactly as Bob and the scanner produced them. Nothing is filtered.",
    impl: "No filter applied",
    accent: "#8b8b8b",
  },
  {
    id: "restricted",
    title: "Restricted mode",
    tag: "Recommended",
    desc: "Every result is scrubbed of API keys, bearer tokens, JWTs, private keys and KEY=value secret assignments before any model sees it. The scanner never opens .env, .pem or SSH key files.",
    impl: "Enforced by the orchestrator server",
    accent: "#e2a336",
  },
  {
    id: "private",
    title: "Private mode",
    tag: "Strictest",
    desc: "Everything in Restricted, but a result that needed any redaction is withheld entirely instead of sent scrubbed. An AST pass that strips function bodies is planned, not built yet.",
    impl: "Redaction + blocking · AST planned",
    accent: "#3aa676",
  },
];

interface BobSkill {
  id: string;
  name: string;
  desc: string;
  instructions?: string;
  on: boolean;
}

const INITIAL_SKILLS: BobSkill[] = [
  { id: "endpoints", name: "Endpoint mapper", desc: "Reads route contracts and callers straight from source.", on: true },
  { id: "secrets", name: "Secret redaction", desc: "Strips API keys, tokens, and env values from context.", on: true },
  { id: "gitblame", name: "Git history", desc: "Surfaces recent commits and blame for touched files.", on: true },
  { id: "tests", name: "Test locator", desc: "Finds tests and fixtures that cover a given symbol.", on: false },
];

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className="inline-flex items-center shrink-0 rounded-full transition-colors"
      style={{
        width: 34,
        height: 20,
        padding: 2,
        background: on ? "var(--accent)" : "color-mix(in srgb, var(--muted) 35%, transparent)",
        justifyContent: on ? "flex-end" : "flex-start",
      }}
    >
      <span
        className="rounded-full transition-all"
        style={{ width: 16, height: 16, background: on ? "var(--accent-fg)" : "var(--card)" }}
      />
    </span>
  );
}

function SkillRow({
  skill,
  onToggle,
  onEdit,
}: {
  skill: BobSkill;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="ui w-full flex items-center gap-3 py-3 px-1">
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium" style={{ color: "var(--fg)" }}>{skill.name}</div>
        <div className="text-[12px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>{skill.desc}</div>
      </div>
      <button
        onClick={onEdit}
        aria-label={`Edit ${skill.name}`}
        className="shrink-0 w-8 h-8 rounded-lg inline-flex items-center justify-center transition-colors"
        style={{ color: "var(--muted)" }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      </button>
      <button onClick={onToggle} aria-pressed={skill.on} aria-label={`Toggle ${skill.name}`} className="shrink-0">
        <Toggle on={skill.on} />
      </button>
    </div>
  );
}

function SecurityCard({
  level,
  selected,
  disabled,
  onSelect,
}: {
  level: (typeof SECURITY_LEVELS)[number];
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      disabled={disabled}
      className="ui text-left rounded-xl p-4 transition-colors flex flex-col disabled:opacity-60 disabled:cursor-default"
      style={{
        background: selected
          ? "color-mix(in srgb, var(--accent) 10%, var(--card))"
          : "var(--card)",
        border: selected
          ? "1px solid var(--accent)"
          : "0.5px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
            style={{ background: level.accent }}
          />
          <span className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>
            {level.title}
          </span>
        </div>
        <span
          className="text-[10.5px] font-medium rounded-full px-2 py-0.5"
          style={{ background: "var(--surface)", color: "var(--muted)" }}
        >
          {level.tag}
        </span>
      </div>
      <p className="text-[12.5px] mt-2 leading-relaxed" style={{ color: "var(--muted)" }}>
        {level.desc}
      </p>
      <div
        className="mono text-[10.5px] mt-auto pt-2.5 flex items-center gap-1.5"
        style={{ color: selected ? "var(--accent)" : "var(--muted)" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" /></svg>
        {level.impl}
      </div>
    </button>
  );
}

type Link = "connected" | "scanner" | "offline" | "checking";

/**
 * Three honest states rather than an on/off switch: the connection is a fact
 * about this machine, so the button re-checks it instead of pretending to set it.
 */
function linkOf(status: BobStatus | null, checking: boolean): Link {
  if (bobReady(status)) return "connected";
  if (status) return "scanner";
  return checking ? "checking" : "offline";
}

const LINK: Record<Link, { label: string; dot: string; pulse: boolean; tint: boolean }> = {
  connected: { label: "Connected", dot: "#3aa676", pulse: false, tint: true },
  scanner: { label: "Scanner only", dot: "#e2a336", pulse: false, tint: false },
  offline: { label: "Not connected", dot: "#e5484d", pulse: false, tint: false },
  checking: { label: "Checking…", dot: "#e2a336", pulse: true, tint: false },
};

function StatusButton({ link, checking, onRefresh }: { link: Link; checking: boolean; onRefresh: () => void }) {
  const l = LINK[link];
  return (
    <button
      onClick={onRefresh}
      disabled={checking}
      title="Check again"
      className="ui inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors disabled:cursor-default"
      style={{
        background: l.tint ? "color-mix(in srgb, #3aa676 18%, transparent)" : "var(--surface)",
        color: l.tint ? "#3aa676" : "var(--muted)",
        border: "0.5px solid var(--border)",
      }}
    >
      <span
        className="w-2 h-2 rounded-full inline-block"
        style={{ background: l.dot, animation: l.pulse || checking ? "pulse-bar 1.4s ease-in-out infinite" : undefined }}
      />
      {l.label}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
        <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
      </svg>
    </button>
  );
}

function StatusRow({ label, ok, children }: { label: string; ok: boolean | null; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5">
      <span
        className="w-2 h-2 rounded-full inline-block shrink-0 self-center"
        style={{ background: ok === null ? "var(--muted)" : ok ? "#3aa676" : "#e2a336" }}
      />
      <span className="text-[13px] w-[130px] shrink-0" style={{ color: "var(--fg)" }}>{label}</span>
      <span className="text-[12.5px] min-w-0 break-words" style={{ color: "var(--muted)" }}>{children}</span>
    </div>
  );
}

const Code = ({ children }: { children: string }) => (
  <pre className="mono text-[12px] mt-2 rounded-lg p-3 overflow-x-auto whitespace-pre" style={{ background: "var(--surface)", color: "var(--fg)" }}>{children}</pre>
);

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div
        className="ui shrink-0 w-6 h-6 rounded-full inline-flex items-center justify-center text-[12px] font-semibold"
        style={
          done
            ? { background: "color-mix(in srgb, #3aa676 18%, transparent)", color: "#3aa676" }
            : { background: "var(--surface)", color: "var(--fg)" }
        }
      >
        {done ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
        ) : (
          n
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium" style={{ color: "var(--fg)" }}>{title}</div>
        <div className="text-[13px] mt-0.5 leading-relaxed" style={{ color: "var(--muted)" }}>{children}</div>
      </div>
    </div>
  );
}

function RepoRow({
  repo,
  current = false,
  busy = false,
  disabled = false,
  onUse,
}: {
  repo: BobRepo;
  current?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onUse?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className="w-2 h-2 rounded-full inline-block shrink-0"
        style={{ background: current ? "var(--accent)" : "transparent", border: current ? "none" : "1px solid var(--border)" }}
      />
      <div className="flex-1 min-w-0">
        <span className="text-[13px]" style={{ color: "var(--fg)" }}>{repo.name}</span>
        <span className="mono text-[11.5px] ml-2 break-all" style={{ color: "var(--muted)" }}>{repo.display}</span>
      </div>
      <span className="text-[11px] shrink-0" style={{ color: repo.git ? "var(--muted)" : "#e2a336" }}>
        {repo.git ? "git" : "no git · read-only"}
      </span>
      {current ? (
        <span className="text-[11.5px] shrink-0 w-[52px] text-right" style={{ color: "var(--muted)" }}>current</span>
      ) : (
        <button
          onClick={onUse}
          disabled={disabled}
          className="shrink-0 w-[52px] rounded-md px-2 py-0.5 text-[11.5px] disabled:opacity-60"
          style={{ border: "0.5px solid var(--border)", color: "var(--fg)" }}
        >
          {busy ? "…" : "Use"}
        </button>
      )}
    </div>
  );
}

/**
 * Which folder Bob works in. The dialog is the operating system's own, opened
 * by the server — a browser's folder picker gives the page a handle, never the
 * path a Bob process needs.
 */
function RepoPicker({
  status,
  onChoose,
  onSelect,
}: {
  status: BobStatus;
  onChoose: () => Promise<string | null>;
  onSelect: (path: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const { current, recent } = status.repos;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  return (
    <div className="ui rounded-xl px-4 py-3 mb-4" style={{ background: "var(--card)", border: "0.5px solid var(--border)" }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-medium" style={{ color: "var(--fg)" }}>Repository</div>
          <div className="text-[12px] mt-0.5 leading-relaxed" style={{ color: "var(--muted)" }}>
            Bob works in one folder at a time. A switch applies from the next question, and what Bob found in the
            previous folder stops being passed to the model.
          </div>
        </div>
        <button
          onClick={() => void run("choose", onChoose)}
          disabled={busy !== null}
          className="shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-60"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {busy === "choose" ? "Waiting for the dialog…" : "Choose folder…"}
        </button>
      </div>
      <div className="mt-2.5 flex flex-col">
        <RepoRow repo={current} current />
        {recent.map((r) => (
          <RepoRow key={r.path} repo={r} busy={busy === r.path} disabled={busy !== null} onUse={() => void run(r.path, () => onSelect(r.path))} />
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const path = typed.trim();
          if (path) void run("typed", async () => {
            await onSelect(path);
            setTyped("");
          });
        }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="…or paste a path, like ~/code/my-site"
          spellCheck={false}
          className="mono flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
          style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}
        />
        <button
          type="submit"
          disabled={busy !== null || !typed.trim()}
          className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] disabled:opacity-50"
          style={{ border: "0.5px solid var(--border)", color: "var(--fg)" }}
        >
          {busy === "typed" ? "Switching…" : "Use path"}
        </button>
      </form>
      {error && <p className="text-[12px] mt-2" style={{ color: "#e5484d" }}>{error}</p>}
    </div>
  );
}

const VERDICT: Record<string, { text: string; color: string }> = {
  approve: { text: "reviewer approved", color: "#3aa676" },
  changes_requested: { text: "reviewer requested changes", color: "#e2a336" },
};

/** One Implementer change, and the user's decision on it. */
function ChangeRow({ change, onDecide }: { change: BobChange; onDecide: (id: string, d: "apply" | "discard") => Promise<void> }) {
  const [busy, setBusy] = useState<"apply" | "discard" | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const review = change.review;
  const verdict = review?.verdict ? VERDICT[review.verdict] : null;
  const minors = review && review.minor ? ` (${review.minor} minor)` : "";

  const decide = async (decision: "apply" | "discard") => {
    setBusy(decision);
    setError(null);
    try {
      await onDecide(change.id, decision);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
    setConfirmDiscard(false);
  };

  return (
    <div className="py-3 flex flex-col gap-1.5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] line-clamp-2" style={{ color: "var(--fg)" }}>{change.task}</div>
          <div className="text-[11.5px] mt-0.5 flex flex-wrap gap-x-2" style={{ color: "var(--muted)" }}>
            <span className="mono">{change.id}</span>
            <span>{change.rounds} round{change.rounds === 1 ? "" : "s"}</span>
            {verdict ? (
              <span style={{ color: verdict.color }}>{verdict.text}{minors}</span>
            ) : (
              change.status === "open" && <span>not reviewed yet</span>
            )}
            {change.status !== "open" && <span>{change.status}</span>}
          </div>
        </div>
        {change.status === "open" && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => void decide("apply")}
              disabled={busy !== null}
              className="rounded-lg px-3 py-1 text-[12px] font-medium disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {busy === "apply" ? "Applying…" : "Apply to my files"}
            </button>
            <button
              onClick={() => (confirmDiscard ? void decide("discard") : setConfirmDiscard(true))}
              onBlur={() => setConfirmDiscard(false)}
              disabled={busy !== null}
              className="rounded-lg px-3 py-1 text-[12px] disabled:opacity-60"
              style={{ border: "0.5px solid var(--border)", color: confirmDiscard ? "#e5484d" : "var(--fg)" }}
            >
              {busy === "discard" ? "Discarding…" : confirmDiscard ? "Discard for good?" : "Discard"}
            </button>
          </div>
        )}
      </div>
      {error && <div className="text-[12px]" style={{ color: "#e5484d" }}>{error}</div>}
    </div>
  );
}

export function Bob({
  active,
  dark,
  providers,
  status,
  error,
  checking,
  onRefresh,
  onSecurity,
  onDecideChange,
  onChooseRepo,
  onSelectRepo,
}: {
  active: ProviderId;
  dark: boolean;
  providers: ProviderId[];
  status: BobStatus | null;
  error: string | null;
  checking: boolean;
  onRefresh: () => void;
  onSecurity: (level: SecurityLevel) => Promise<void>;
  onDecideChange: (id: string, decision: "apply" | "discard") => Promise<void>;
  onChooseRepo: () => Promise<string | null>;
  onSelectRepo: (path: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<SecurityLevel | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [skills, setSkills] = useState<BobSkill[]>(INITIAL_SKILLS);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const toggleSkill = (id: string) =>
    setSkills((s) => s.map((k) => (k.id === id ? { ...k, on: !k.on } : k)));

  const addSkill = (name: string, desc: string, instructions: string) =>
    setSkills((s) => [
      ...s,
      { id: `custom-${s.length}-${Date.now()}`, name, desc, instructions, on: true },
    ]);

  const saveSkill = (id: string, name: string, desc: string, instructions: string) =>
    setSkills((s) => s.map((k) => (k.id === id ? { ...k, name, desc, instructions } : k)));

  const editingSkill = skills.find((k) => k.id === editingId) ?? null;
  const link = linkOf(status, checking);
  const bob = status?.bob;

  const chooseSecurity = async (level: SecurityLevel) => {
    if (!status || level === status.security || pending) return;
    setPending(level);
    setSecurityError(null);
    try {
      await onSecurity(level);
    } catch (e) {
      setSecurityError(e instanceof Error ? e.message : String(e));
    }
    setPending(null);
  };

  return (
    <div className="relative h-full overflow-y-auto p-6">
      <CornerMark active={active} dark={dark} />
      <div className="relative max-w-[880px] mx-auto">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[22px] font-semibold ui" style={{ color: "var(--fg)" }}>Bob</h1>
          <StatusButton link={link} checking={checking} onRefresh={onRefresh} />
        </div>
        <p className="text-[12px] mt-1.5 mb-6 ui" style={{ color: "var(--muted)" }}>
          Bob runs locally on your machine and feeds the orchestrator grounded facts about your repo.
        </p>

        <div className="ui rounded-xl px-4 py-1.5 mb-4" style={{ background: "var(--card)", border: "0.5px solid var(--border)" }}>
          <StatusRow label="Orchestrator server" ok={status ? true : checking ? null : false}>
            {status ? (
              <>
                <span className="mono">{status.server.name} {status.server.version}</span> · {status.tools.length} tools
              </>
            ) : checking ? (
              "Checking…"
            ) : (
              error ?? "Unreachable"
            )}
          </StatusRow>
          <div style={{ borderTop: "0.5px solid var(--border)" }}>
            <StatusRow label="Bob Shell" ok={bob ? bob.installed && bob.keySet : null}>
              {!bob ? (
                "—"
              ) : !bob.installed ? (
                "Not installed — endpoint questions are answered by the source scanner"
              ) : (
                <>
                  <span className="mono">{bob.version ?? "installed"}</span> ·{" "}
                  {bob.keySet ? "BOB_API_KEY set" : "BOB_API_KEY not set — Bob can't answer until it is"}
                </>
              )}
            </StatusRow>
          </div>
          <div style={{ borderTop: "0.5px solid var(--border)" }}>
            <StatusRow label="Roles" ok={status ? status.roles.installed && status.roles.current : null}>
              {!status ? (
                "—"
              ) : status.roles.installed ? (
                <>
                  {status.roles.roles.join(", ")}
                  {!status.roles.current && " · out of date — updates on the next Bob run"}
                  <span className="block text-[11.5px] mt-0.5 mono">{status.roles.path}</span>
                </>
              ) : (
                "Installed automatically once Bob Shell is present"
              )}
            </StatusRow>
          </div>
          <div style={{ borderTop: "0.5px solid var(--border)" }}>
            <StatusRow label="Repository" ok={status ? true : null}>
              {status ? <span className="mono">{status.repos.current.display}</span> : "—"}
              {status && !status.git && " · not under git, so the implementer is off"}
            </StatusRow>
          </div>
        </div>

        {status && <RepoPicker status={status} onChoose={onChooseRepo} onSelect={onSelectRepo} />}

        <div className="ui rounded-xl p-5" style={{ background: "var(--card)", border: "0.5px solid var(--border)" }}>
          <div className="flex flex-col gap-5">
            <Step n={1} title="Install Bob Shell" done={bob?.installed}>
              IBM's installer puts <span className="mono">bob</span> on your PATH. It needs Node 22.15 or newer.
              <Code>{`curl -fsSL https://bob.ibm.com/download/bobshell.sh | bash`}</Code>
            </Step>

            <Step n={2} title="Give it an API key" done={bob?.keySet}>
              Create an <span className="font-medium">Inference</span> key at bob.ibm.com, then add it to{" "}
              <span className="mono">~/.zshrc</span> in your own terminal — never paste it here. Restart the dev
              server and Claude Code afterwards so both inherit it.
              <Code>{`export BOB_API_KEY="…"`}</Code>
            </Step>

            <Step n={3} title="Accept the license once">
              Headless runs can't show IBM's license, so open Bob interactively one time and accept it
              there. <span className="mono">bob --show-license</span> prints the files if you want to read them first.
              <Code>{`bob chat`}</Code>
            </Step>

            <Step n={4} title="Ask about your code" done={link === "connected"}>
              Models connected through ICA lead a team of Bob roles: explorers and a verifier that read your
              code, an implementer that makes changes in its own git worktree, and a reviewer that critiques
              them. Each call shows up in the chat as a trace you can open. Direct Claude, ChatGPT and Gemini
              keys don't call tools yet, but anything Bob already found carries over when you switch. Claude
              Code reaches the same server through <span className="mono">.mcp.json</span>.
            </Step>
          </div>
        </div>

        <div className="ui mt-7 mb-3">
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--fg)" }}>Changes</h2>
          <p className="text-[12.5px] mt-1" style={{ color: "var(--muted)" }}>
            The implementer works in its own git worktree. Nothing reaches your files until you apply it, and then
            only as uncommitted edits for you to review and commit.
          </p>
        </div>
        <div className="ui rounded-xl px-4 py-1" style={{ background: "var(--card)", border: "0.5px solid var(--border)" }}>
          {!status ? (
            <p className="text-[12.5px] py-3" style={{ color: "var(--muted)" }}>—</p>
          ) : !status.git ? (
            <p className="text-[12.5px] py-3" style={{ color: "var(--muted)" }}>
              This repository isn't under git, so there is nowhere for the implementer to work apart from your files.
            </p>
          ) : status.changes.length === 0 ? (
            <p className="text-[12.5px] py-3" style={{ color: "var(--muted)" }}>
              No changes yet. Ask the orchestrator for one in the chat.
            </p>
          ) : (
            // Open ones first; a few settled ones for the record.
            [...status.changes.filter((c) => c.status === "open"), ...status.changes.filter((c) => c.status !== "open").slice(0, 5)].map(
              (c, i) => (
                <div key={c.id} style={i ? { borderTop: "0.5px solid var(--border)" } : undefined}>
                  <ChangeRow change={c} onDecide={onDecideChange} />
                </div>
              ),
            )
          )}
        </div>

        <div className="ui mt-7 mb-3">
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--fg)" }}>Security level</h2>
          <p className="text-[12.5px] mt-1" style={{ color: "var(--muted)" }}>
            Choose how aggressively repo context is filtered before it reaches an external model.
          </p>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {SECURITY_LEVELS.map((lvl) => (
            <SecurityCard
              key={lvl.id}
              level={lvl}
              selected={(pending ?? status?.security) === lvl.id}
              disabled={!status || pending !== null}
              onSelect={() => void chooseSecurity(lvl.id)}
            />
          ))}
        </div>
        {(securityError || (!status && !checking)) && (
          <p className="ui text-[12px] mt-2" style={{ color: securityError ? "#e5484d" : "var(--muted)" }}>
            {securityError
              ? `Couldn't change the level: ${securityError}`
              : "The level lives in the orchestrator server — start the dev server to change it."}
          </p>
        )}

        <div className="ui mt-7 mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold flex items-center gap-2" style={{ color: "var(--fg)" }}>
              Bob skills
              <span className="text-[10.5px] font-medium rounded-full px-2 py-0.5" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                Preview
              </span>
            </h2>
            <p className="text-[12.5px] mt-1" style={{ color: "var(--muted)" }}>
              Toggle the capabilities Bob can use when answering repo queries.
            </p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="ui shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            Add skill
          </button>
        </div>
        <div className="ui rounded-xl px-4" style={{ background: "var(--card)", border: "0.5px solid var(--border)" }}>
          {skills.map((skill, i) => (
            <div key={skill.id} style={{ borderTop: i === 0 ? undefined : "0.5px solid var(--border)" }}>
              <SkillRow
                skill={skill}
                onToggle={() => toggleSkill(skill.id)}
                onEdit={() => setEditingId(skill.id)}
              />
            </div>
          ))}
        </div>

        <div
          className="ui mt-4 rounded-xl p-4 flex items-start gap-3 text-[12.5px]"
          style={{ background: "var(--surface)", color: "var(--muted)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
          <p>
            Every tool result passes through the security filter inside the orchestrator server before any
            model sees it — in this app and in Claude Code alike, since both read the same setting from{" "}
            <span className="mono">mcp/settings.local.json</span>.
          </p>
        </div>
      </div>

      {addOpen && (
        <AddSkillModal
          providers={providers}
          onClose={() => setAddOpen(false)}
          onAdd={(name, desc, instructions) => {
            addSkill(name, desc, instructions);
            setAddOpen(false);
          }}
        />
      )}

      {editingSkill && (
        <AddSkillModal
          providers={providers}
          initial={{
            name: editingSkill.name,
            desc: editingSkill.desc,
            instructions: editingSkill.instructions,
          }}
          onClose={() => setEditingId(null)}
          onAdd={(name, desc, instructions) => {
            saveSkill(editingSkill.id, name, desc, instructions);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}
