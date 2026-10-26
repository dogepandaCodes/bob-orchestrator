import { useState } from "react";
import { CornerMark } from "../components/CornerMark";
import { AddSkillModal } from "../components/AddSkillModal";
import type { ProviderId } from "../lib/themes";

export type SecurityLevel = "none" | "restricted" | "private";

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
    desc: "Bob answers any repo query and passes context straight through to the orchestrator. Fastest, but nothing is filtered.",
    impl: "No guardrails applied",
    accent: "#8b8b8b",
  },
  {
    id: "restricted",
    title: "Restricted mode",
    tag: "Recommended",
    desc: "Bob runs every request through a security skill that redacts secrets, credentials, and files matching your ignore rules before context leaves the machine.",
    impl: "Implemented through a skill",
    accent: "#e2a336",
  },
  {
    id: "private",
    title: "Private mode",
    tag: "Strictest",
    desc: "Everything from Restricted mode plus a two-stage static pass on every outbound payload: an AST strips function bodies from code, then secret scanning checks the result, diffs, and traces. Anything flagged is blocked.",
    impl: "Implemented through skills + AST static pass",
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
  onSelect,
}: {
  level: (typeof SECURITY_LEVELS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className="ui text-left rounded-xl p-4 transition-colors flex flex-col"
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

function StatusButton({
  connected,
  onToggle,
}: {
  connected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="ui inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors"
      style={{
        background: connected
          ? "color-mix(in srgb, #3aa676 18%, transparent)"
          : "var(--surface)",
        color: connected ? "#3aa676" : "var(--muted)",
        border: "0.5px solid var(--border)",
      }}
      aria-pressed={connected}
    >
      <span
        className="w-2 h-2 rounded-full inline-block"
        style={{
          background: connected ? "#3aa676" : "#e2a336",
          animation: connected ? undefined : "pulse-bar 1.4s ease-in-out infinite",
        }}
      />
      {connected ? "Connected" : "Not connected"}
    </button>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div
        className="ui shrink-0 w-6 h-6 rounded-full inline-flex items-center justify-center text-[12px] font-semibold"
        style={{ background: "var(--surface)", color: "var(--fg)" }}
      >
        {n}
      </div>
      <div>
        <div className="text-[14px] font-medium" style={{ color: "var(--fg)" }}>{title}</div>
        <div className="text-[13px] mt-0.5 leading-relaxed" style={{ color: "var(--muted)" }}>{children}</div>
      </div>
    </div>
  );
}

export function Bob({
  active,
  dark,
  connected,
  providers,
  security,
  onSecurity,
  onToggle,
}: {
  active: ProviderId;
  dark: boolean;
  connected: boolean;
  providers: ProviderId[];
  /** Owned by App: it also drives the config snippet on the Connect page. */
  security: SecurityLevel;
  onSecurity: (level: SecurityLevel) => void;
  onToggle: () => void;
}) {
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
  return (
    <div className="relative h-full overflow-y-auto p-6">
      <CornerMark active={active} dark={dark} />
      <div className="relative max-w-[880px] mx-auto">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[22px] font-semibold ui" style={{ color: "var(--fg)" }}>Bob</h1>
          <StatusButton connected={connected} onToggle={onToggle} />
        </div>
        <p className="text-[12px] mt-1.5 mb-6 ui" style={{ color: "var(--muted)" }}>
          Bob runs locally on your machine and feeds the orchestrator grounded facts about your repo.
        </p>

        <div className="ui rounded-xl p-5" style={{ background: "var(--card)", border: "0.5px solid var(--border)" }}>
          <div className="flex flex-col gap-5">
            <Step n={1} title="Install Bob beside the repo">
              Bob runs on the machine where the repo and your git credentials already live. The
              orchestrator server invokes it as a process — Bob itself never needs a server mode.
            </Step>

            <Step n={2} title="Put bob on PATH, or name it explicitly">
              The server looks for <span className="mono">bob</span> on <span className="mono">PATH</span>. If it
              lives elsewhere, add <span className="mono">BOB_BIN</span> to the server's{" "}
              <span className="mono">env</span> in <span className="mono">.mcp.json</span>.
              <pre className="mono text-[12px] mt-2 rounded-lg p-3 overflow-x-auto whitespace-pre" style={{ background: "var(--surface)", color: "var(--fg)" }}>{`"env": { "BOB_BIN": "/usr/local/bin/bob" }`}</pre>
            </Step>

            <Step n={3} title="Without Bob, the scanner answers">
              Until Bob is installed, the same four tools answer from a source scanner — routes, callers and
              definition sites read straight from the code. Bob adds deeper answers; nothing breaks without it.
            </Step>
          </div>
        </div>

        <div className="ui mt-7 mb-3">
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--fg)" }}>Security level</h2>
          <p className="text-[12.5px] mt-1" style={{ color: "var(--muted)" }}>
            Choose how aggressively Bob filters your repo before context reaches an external model.
          </p>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {SECURITY_LEVELS.map((lvl) => (
            <SecurityCard
              key={lvl.id}
              level={lvl}
              selected={security === lvl.id}
              onSelect={() => onSecurity(lvl.id)}
            />
          ))}
        </div>

        <div className="ui mt-7 mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--fg)" }}>Bob skills</h2>
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
          Bob summarizes and filters context before anything leaves for an external model. Nothing from
          your repo reaches a provider until it passes through Bob.
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
