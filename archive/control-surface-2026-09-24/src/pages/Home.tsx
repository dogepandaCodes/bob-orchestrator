import { useState } from "react";
import type { ProviderId } from "../lib/themes";
import type { SecurityLevel } from "./Bob";
import { CornerMark } from "../components/CornerMark";

// Mirrors the tool surface in mcp/repo.mjs — keep the two in step.
const TOOLS = [
  { name: "list_endpoints", desc: "Every route, its methods, where it is defined and who calls it." },
  { name: "get_endpoint_contract", desc: "One route's methods, definition sites and callers." },
  { name: "search_endpoints", desc: "Routes matching a keyword in their path or filename." },
  { name: "diff_route", desc: "Old route vs its replacement, and who still calls the old one." },
];

const LEVEL_NOTE: Record<SecurityLevel, string> = {
  none: "Results leave unfiltered.",
  restricted: "Keys, tokens and secret assignments are redacted from every result.",
  private: "Redacted, and anything still credential-shaped is blocked outright.",
};

function config(security: SecurityLevel): string {
  return JSON.stringify(
    {
      mcpServers: {
        "orchestrator-bob": {
          command: "node",
          args: ["mcp/server.mjs"],
          env: { ORCHESTRATOR_REPO: ".", ORCHESTRATOR_SECURITY: security },
        },
      },
    },
    null,
    2,
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
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium" style={{ color: "var(--fg)" }}>{title}</div>
        <div className="text-[13px] mt-0.5 leading-relaxed" style={{ color: "var(--muted)" }}>{children}</div>
      </div>
    </div>
  );
}

export function Home({
  active,
  dark,
  security,
  onOpenBob,
}: {
  active: ProviderId;
  dark: boolean;
  security: SecurityLevel;
  onOpenBob: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const snippet = config(security);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked by the browser; the snippet is selectable anyway.
    }
  }

  return (
    <div className="relative h-full overflow-y-auto p-6">
      <CornerMark active={active} dark={dark} />
      <div className="relative max-w-[880px] mx-auto ui">
        <h1 className="text-[22px] font-semibold" style={{ color: "var(--fg)" }}>Connect Claude</h1>
        <p className="text-[13px] mt-1.5 mb-6 max-w-[620px] leading-relaxed" style={{ color: "var(--muted)" }}>
          Claude runs the model on your own plan — no API key, no second bill. This server gives it
          grounded facts about your repo, so it plans against real contracts instead of guessing.
        </p>

        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "0.5px solid var(--border)" }}>
          <div className="flex flex-col gap-5">
            <Step n={1} title="Add the server to your repo">
              Save this as <span className="mono">.mcp.json</span> in the repo root.
              <div className="relative mt-2">
                <pre
                  className="mono text-[12px] rounded-lg p-3 pr-20 overflow-x-auto whitespace-pre"
                  style={{ background: "var(--surface)", color: "var(--fg)" }}
                >
                  {snippet}
                </pre>
                <button
                  onClick={copy}
                  className="absolute top-2 right-2 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-opacity hover:opacity-85"
                  style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="text-[12px] mt-2">
                Security: <span className="mono" style={{ color: "var(--fg)" }}>{security}</span> —{" "}
                {LEVEL_NOTE[security]}{" "}
                <button onClick={onOpenBob} className="underline" style={{ color: "var(--accent)" }}>
                  Change
                </button>
              </div>
            </Step>

            <Step n={2} title="Restart Claude Code in that directory">
              Servers connect at session start. Approve <span className="mono">orchestrator-bob</span> when
              prompted, then run <span className="mono">/mcp</span> — it should list four tools.
            </Step>

            <Step n={3} title="Ask about your code">
              Try <em>"which endpoints does this repo call, and who calls each one?"</em> Claude reaches for
              the tools on its own when a question needs them.
            </Step>
          </div>
        </div>

        <h2 className="text-[15px] font-semibold mt-7 mb-3" style={{ color: "var(--fg)" }}>Tools</h2>
        <div className="rounded-xl px-4" style={{ background: "var(--card)", border: "0.5px solid var(--border)" }}>
          {TOOLS.map((t, i) => (
            <div
              key={t.name}
              className="py-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
              style={{ borderTop: i === 0 ? undefined : "0.5px solid var(--border)" }}
            >
              <span className="mono text-[12.5px] font-medium" style={{ color: "var(--accent)" }}>{t.name}</span>
              <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>{t.desc}</span>
            </div>
          ))}
        </div>

        <p className="text-[12px] mt-4 leading-relaxed" style={{ color: "var(--muted)" }}>
          ChatGPT support needs a hosted HTTPS endpoint — it does not run local servers — and is not built yet.
        </p>
      </div>
    </div>
  );
}
