import { useEffect, useRef, useState } from "react";
import { PROVIDERS, PROVIDER_ORDER, type ProviderId } from "../lib/themes";
import { ADAPTERS, type Credential } from "../lib/providers";
import { primeModelCache } from "../lib/useChat";
import { ProviderBadge } from "./Logos";

/**
 * Turns an adapter error into something a user can act on. The raw message
 * carries the provider's JSON, which is noise at the point of entry.
 */
/** The key is fine — it just does not name a workspace yet. */
export function isWorkspaceScopeError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /anthropic-workspace-id|not scoped to a workspace/i.test(msg);
}

function describeKeyError(e: unknown, label: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/anthropic-workspace-id header must be a valid workspace/i.test(msg)) {
    return "That workspace ID was not accepted. It should look like wrkspc_ followed by a long identifier.";
  }
  if (isWorkspaceScopeError(e)) {
    return `This key works across your whole organization, so ${label} needs to know which workspace to bill and run against.`;
  }
  if (/could not reach the API/i.test(msg)) {
    return `Could not reach ${label}. Check your connection — the key was not saved.`;
  }
  if (
    /\b(401|403)\b/.test(msg) ||
    /incorrect api key|api key (is )?(not )?(valid|invalid)|unregistered callers/i.test(msg)
  ) {
    return `${label} rejected that key. Check it was copied in full and that the account has credit.`;
  }
  if (/\b429\b/.test(msg)) {
    return `${label} is rate limiting this key right now. Try again in a moment.`;
  }
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}

export function ConnectModal({
  connected,
  onClose,
  onConnect,
}: {
  connected: ProviderId[];
  onClose: () => void;
  onConnect: (id: ProviderId, cred: Credential) => void;
}) {
  const [selected, setSelected] = useState<ProviderId | null>(null);
  const [key, setKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [needsWorkspace, setNeedsWorkspace] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Never leave a verification request running behind a closed modal.
  useEffect(() => () => abortRef.current?.abort(), []);

  const adapter = selected ? ADAPTERS[selected] : null;
  const canSubmit = key.trim().length >= 8 && !verifying;

  /**
   * Keys are proven before they are stored — listing models is a cheap
   * authenticated GET, so a bad key fails here instead of surfacing as a
   * red bubble halfway through someone's first conversation.
   */
  async function verify() {
    if (!selected || !adapter || !canSubmit) return;
    const cred: Credential = {
      key: key.trim(),
      ...(workspaceId.trim() ? { workspaceId: workspaceId.trim() } : {}),
    };

    setVerifying(true);
    setError(null);
    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      const models = await adapter.listModels(cred, ctl.signal);
      if (models.length === 0) {
        setError(`${adapter.label} accepted the key but offered no usable models.`);
        return;
      }
      // Reuse the catalog this check already resolved — for Gemini that
      // included probing every model, which is not worth doing twice.
      primeModelCache(selected, cred.key, models);
      onConnect(selected, cred);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      // Reveal the workspace field rather than calling a good key bad.
      if (isWorkspaceScopeError(e) && adapter.supportsWorkspace) setNeedsWorkspace(true);
      setError(describeKeyError(e, adapter.label));
    } finally {
      setVerifying(false);
      abortRef.current = null;
    }
  }

  function back() {
    abortRef.current?.abort();
    setSelected(null);
    setKey("");
    setWorkspaceId("");
    setNeedsWorkspace(false);
    setError(null);
    setVerifying(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={verifying ? undefined : onClose}
    >
      <div
        className="ui rounded-xl p-6 w-[340px] relative"
        style={{ background: "var(--card)", border: "0.5px solid var(--border)", animation: "fade-in 200ms ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={verifying}
          aria-label="Close"
          className="absolute top-4 right-4 w-7 h-7 rounded-full inline-flex items-center justify-center transition-colors disabled:opacity-30"
          style={{ background: "var(--surface)", color: "var(--muted)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        {!selected || !adapter ? (
          <>
            <h2 className="text-[17px] font-semibold" style={{ color: "var(--fg)" }}>Connect an AI</h2>
            <p className="text-[12px] mt-1 mb-6" style={{ color: "var(--muted)" }}>
              Choose a provider to orchestrate with. Needs an API key — a Pro or Max
              subscription does not include API access.
            </p>
            <div className="flex items-start justify-center gap-4">
              {PROVIDER_ORDER.map((id) => {
                const already = connected.includes(id);
                return (
                  <button
                    key={id}
                    aria-label={already ? `${PROVIDERS[id].name} already connected` : `Connect ${PROVIDERS[id].name}`}
                    onClick={() => setSelected(id)}
                    className="relative flex flex-col items-center gap-1.5 transition-transform focus:outline-none rounded-full hover:scale-105"
                    style={{ opacity: already ? 0.55 : 1 }}
                  >
                    <ProviderBadge id={id} size={56} />
                    {already && (
                      <span className="text-[10px] font-medium" style={{ color: "var(--muted)" }}>Connected</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-1">
              <ProviderBadge id={selected} size={36} />
              <h2 className="text-[16px] font-semibold" style={{ color: "var(--fg)" }}>{PROVIDERS[selected].name}</h2>
            </div>
            <p className="text-[12px] mt-1 mb-4" style={{ color: "var(--muted)" }}>
              Paste a {adapter.label} API key.{" "}
              <a href={adapter.keyUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent)" }}>
                Get one here
              </a>
              .
            </p>
            <label className="text-[11px] font-medium block mb-1.5" style={{ color: "var(--muted)" }}>API key</label>
            <input
              autoFocus
              type="password"
              value={key}
              disabled={verifying}
              onChange={(e) => {
                setKey(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") verify();
              }}
              placeholder={adapter.keyPlaceholder}
              className="w-full rounded-lg px-3 py-2 text-[13px] mono outline-none disabled:opacity-50"
              style={{
                background: "var(--surface)",
                color: "var(--fg)",
                border: error ? "0.5px solid #e5484d" : "0.5px solid var(--border)",
              }}
            />

            {needsWorkspace && (
              <div style={{ animation: "fade-in 160ms ease" }}>
                <label className="text-[11px] font-medium block mb-1.5 mt-3" style={{ color: "var(--muted)" }}>
                  Workspace ID
                </label>
                <input
                  value={workspaceId}
                  disabled={verifying}
                  onChange={(e) => {
                    setWorkspaceId(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") verify();
                  }}
                  placeholder="wrkspc_…"
                  className="w-full rounded-lg px-3 py-2 text-[13px] mono outline-none disabled:opacity-50"
                  style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}
                />
                <p className="text-[10.5px] mt-1.5 leading-relaxed" style={{ color: "var(--muted)" }}>
                  Find it in{" "}
                  <a
                    href="https://console.anthropic.com/settings/workspaces"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                    style={{ color: "var(--accent)" }}
                  >
                    Console → Workspaces
                  </a>
                  {" "}— open a workspace and copy the <span className="mono">wrkspc_…</span> id from the URL.
                </p>
              </div>
            )}

            {error ? (
              <div
                className="text-[11.5px] mt-2 rounded-lg px-2.5 py-2 leading-relaxed"
                style={{
                  background: "color-mix(in srgb, #e5484d 12%, transparent)",
                  color: "#e5484d",
                  animation: "fade-in 160ms ease",
                }}
              >
                {error}
              </div>
            ) : (
              <p className="text-[10.5px] mt-2 leading-relaxed" style={{ color: "var(--muted)" }}>
                Verified against {adapter.label} before it is saved. Stored in this
                browser and sent directly to them — never through a server of ours.
              </p>
            )}

            {adapter.supportsWorkspace && !needsWorkspace && (
              <button
                onClick={() => setNeedsWorkspace(true)}
                className="text-[10.5px] mt-2 underline transition-opacity hover:opacity-70"
                style={{ color: "var(--muted)" }}
              >
                Using an organization-scoped key?
              </button>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={back}
                className="flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors"
                style={{ background: "var(--surface)", color: "var(--fg)" }}
              >
                Back
              </button>
              <button
                onClick={verify}
                disabled={!canSubmit}
                className="flex-1 rounded-lg py-2 text-[13px] font-medium transition-opacity disabled:opacity-40 inline-flex items-center justify-center gap-2"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                {verifying && (
                  <svg
                    width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ animation: "spin-slow 0.7s linear infinite" }}
                  >
                    <path d="M12 3a9 9 0 1 0 9 9" />
                  </svg>
                )}
                {verifying ? "Verifying…" : "Connect"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
