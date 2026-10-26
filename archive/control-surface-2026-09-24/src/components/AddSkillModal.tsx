import { useState } from "react";
import { PROVIDERS, type ProviderId } from "../lib/themes";
import { ProviderBadge } from "./Logos";

type Mode = "edit" | "prompt";

// Lightweight stand-in for a real generation call: derives a description from
// the user's prompt so the demo shows an AI-authored skill.
function draftFromPrompt(prompt: string): string {
  const p = prompt.trim().replace(/\.$/, "");
  if (!p) return "";
  return `Bob will ${p[0].toLowerCase()}${p.slice(1)}, returning grounded results from your repo.`;
}

export function AddSkillModal({
  providers = [],
  initial,
  onClose,
  onAdd,
}: {
  providers?: ProviderId[];
  initial?: { name: string; desc: string; instructions?: string };
  onClose: () => void;
  onAdd: (name: string, desc: string, instructions: string) => void;
}) {
  const editing = !!initial;
  const [mode, setMode] = useState<Mode>("edit");
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.desc ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<ProviderId>(providers[0] ?? "claude");
  const [drafting, setDrafting] = useState(false);

  const canAdd = name.trim().length > 1 && desc.trim().length > 1;

  const generate = () => {
    setDrafting(true);
    // Simulate the round-trip to the selected provider.
    window.setTimeout(() => {
      setDesc(draftFromPrompt(prompt));
      if (!name.trim()) {
        const words = prompt.trim().split(/\s+/).slice(0, 2).join(" ");
        setName(words ? words[0].toUpperCase() + words.slice(1) + " skill" : "New skill");
      }
      setDrafting(false);
    }, 700);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="ui rounded-xl p-6 w-[380px] relative"
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--border)",
          animation: "fade-in 200ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-7 h-7 rounded-full inline-flex items-center justify-center transition-colors"
          style={{ background: "var(--surface)", color: "var(--muted)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <h2 className="text-[17px] font-semibold" style={{ color: "var(--fg)" }}>
          {editing ? "Edit Bob skill" : "Add a Bob skill"}
        </h2>
        <p className="text-[12px] mt-1 mb-4" style={{ color: "var(--muted)" }}>
          {editing
            ? "Update the skill name, description, and instructions."
            : "Name the skill, then write it yourself or draft it with a connected AI."}
        </p>

        <label className="text-[11px] font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
          Skill name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Dependency auditor"
          className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
          style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}
        />

        {/* Mode switch */}
        {!editing && (
        <div className="flex gap-1 mt-4 p-1 rounded-lg" style={{ background: "var(--surface)" }}>
          {(["edit", "prompt"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex-1 rounded-md py-1.5 text-[12px] font-medium transition-colors"
              style={{
                background: mode === m ? "var(--card)" : "transparent",
                color: mode === m ? "var(--fg)" : "var(--muted)",
                border: mode === m ? "0.5px solid var(--border)" : "0.5px solid transparent",
              }}
            >
              {m === "edit" ? "Edit manually" : "Draft with AI"}
            </button>
          ))}
        </div>
        )}

        {(editing || mode === "edit") && (
          <>
            <label className="text-[11px] font-medium block mb-1.5 mt-4" style={{ color: "var(--muted)" }}>
              Skill description
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="What Bob does when this skill runs…"
              className="w-full rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
              style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}
            />
            <label className="text-[11px] font-medium block mb-1.5 mt-4" style={{ color: "var(--muted)" }}>
              Specific instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              placeholder="Step-by-step guidance for how Bob should carry out this skill — tools to call, files to read, formats to return…"
              className="w-full rounded-lg px-3 py-2 text-[13px] outline-none resize-none mono"
              style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}
            />
          </>
        )}

        {!editing && mode === "prompt" && (
          <div className="mt-4">
            <label className="text-[11px] font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
              Provider
            </label>
            {providers.length === 0 ? (
              <div className="text-[12px] rounded-lg px-3 py-2" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                Connect an AI provider first to draft skills.
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-3">
                {providers.map((id) => (
                  <button
                    key={id}
                    aria-label={PROVIDERS[id].name}
                    aria-pressed={provider === id}
                    onClick={() => setProvider(id)}
                    className="rounded-full transition-transform"
                    style={{
                      transform: provider === id ? "scale(1.05)" : "scale(1)",
                      opacity: provider === id ? 1 : 0.45,
                      outline: provider === id ? "2px solid var(--accent)" : "none",
                      outlineOffset: 2,
                      borderRadius: 999,
                      height: 32,
                    }}
                  >
                    <ProviderBadge id={id} size={32} />
                  </button>
                ))}
              </div>
            )}
            <label className="text-[11px] font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
              What should this skill do?
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="Scan package.json for outdated or vulnerable dependencies"
              className="w-full rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
              style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}
            />
            <button
              onClick={generate}
              disabled={providers.length === 0 || prompt.trim().length < 3 || drafting}
              className="mt-2 w-full rounded-lg py-2 text-[12.5px] font-medium transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {drafting ? "Drafting…" : `Draft with ${PROVIDERS[provider].name}`}
            </button>

            {desc && (
              <>
                <label className="text-[11px] font-medium block mb-1.5 mt-4" style={{ color: "var(--muted)" }}>
                  Drafted description
                </label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
                  style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}
                />
              </>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors"
            style={{ background: "var(--surface)", color: "var(--fg)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => onAdd(name.trim(), desc.trim(), instructions.trim())}
            disabled={!canAdd}
            className="flex-1 rounded-lg py-2 text-[13px] font-medium transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {editing ? "Save changes" : "Add skill"}
          </button>
        </div>
      </div>
    </div>
  );
}
