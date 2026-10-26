import { useEffect, useRef, useState } from "react";
import { PROVIDERS, type ProviderId } from "../lib/themes";
import type { KeyMap } from "../lib/keys";
import { connectViaIca, gatewayProblem, icaServerOf, proxiedBase, type IcaConnection } from "../lib/ica";
import { primeModelCache } from "../lib/useChat";
import { ProviderBadge } from "./Logos";

const ALL: ProviderId[] = ["claude", "chatgpt", "gemini"];

/**
 * Connects every provider through ICA with one ICA API key, replacing any
 * direct API-key connections. The key is verified before anything is stored,
 * and the outcome is always shown — which providers connected, with how many
 * models, and anything the key offers that fits none of them.
 */
export function IcaConnectModal({
  keys,
  onClose,
  onConnect,
}: {
  keys: KeyMap;
  onClose: () => void;
  onConnect: (result: IcaConnection) => void;
}) {
  const [icaKey, setIcaKey] = useState("");
  const [gateway, setGateway] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<IcaConnection | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Direct connections this will replace — named up front, not after the fact.
  const replaced = ALL.filter((id) => keys[id]?.key && keys[id]?.via !== "ica");
  const problem = gatewayProblem(gateway);
  const canSubmit = !verifying && !problem && icaKey.trim().length >= 8;

  async function connect() {
    if (!canSubmit) return;
    setVerifying(true);
    setError(null);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const result = await connectViaIca(icaKey, gateway, ctl.signal);
      for (const id of Object.keys(result.catalogs) as ProviderId[]) {
        const cred = result.keys[id];
        const models = result.catalogs[id];
        if (cred && models) primeModelCache(id, cred.key, models);
      }
      onConnect(result);
      setDone(result);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.length > 280 ? `${msg.slice(0, 280)}…` : msg);
    } finally {
      setVerifying(false);
      abortRef.current = null;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={verifying ? undefined : onClose}
    >
      <div
        className="ui rounded-xl p-6 w-[390px] relative"
        style={{ background: "var(--card)", border: "0.5px solid var(--border)", animation: "fade-in 200ms ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={verifying}
          aria-label="Close"
          className="absolute top-4 right-4 w-7 h-7 rounded-full inline-flex items-center justify-center disabled:opacity-30"
          style={{ background: "var(--surface)", color: "var(--muted)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        {done ? (
          <>
            <h2 className="text-[17px] font-semibold" style={{ color: "var(--fg)" }}>Connected via ICA</h2>
            <p className="text-[11.5px] mt-1 mono" style={{ color: "var(--muted)" }}>
              {icaServerOf(proxiedBase(done.gateway))} · {done.gateway.replace(/^https:\/\//, "")}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {(Object.keys(done.catalogs) as ProviderId[]).map((id) => (
                <div key={id} className="flex items-center gap-2.5 text-[12.5px]" style={{ color: "var(--fg)" }}>
                  <ProviderBadge id={id} size={22} />
                  <span className="font-medium">{PROVIDERS[id].name}</span>
                  <span style={{ color: "var(--muted)" }}>· {done.catalogs[id]?.length ?? 0} models</span>
                </div>
              ))}
            </div>
            <p className="text-[11.5px] mt-3 leading-relaxed" style={{ color: "var(--muted)" }}>
              Your key can see {done.total} models
              {done.unsorted.length > 0 &&
                ` — ${done.unsorted.length} outside Claude, ChatGPT and Gemini aren't shown (${done.unsorted.slice(0, 4).join(", ")}${done.unsorted.length > 4 ? ", …" : ""})`}
              .
            </p>
            {done.missing.length > 0 && (
              <p className="text-[12px] mt-3 leading-relaxed" style={{ color: "var(--muted)" }}>
                Your key has no {done.missing.map((id) => PROVIDERS[id].name).join(" or ")} model, so{" "}
                {done.missing.length === 1 ? "that provider keeps" : "those providers keep"} whatever connection{" "}
                {done.missing.length === 1 ? "it" : "they"} already had.
              </p>
            )}
            <button
              onClick={onClose}
              className="w-full mt-5 rounded-lg py-2 text-[13px] font-medium"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              Done
            </button>
          </>
        ) : (
          <>
            <h2 className="text-[17px] font-semibold" style={{ color: "var(--fg)" }}>Connect via ICA</h2>
            <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>
              Connects Claude, ChatGPT and Gemini at once through your company's ICA gateway.
            </p>
            <div className="flex items-center gap-2 mt-3">
              {ALL.map((id) => <ProviderBadge key={id} id={id} size={30} />)}
            </div>
            <div className="mt-4">
              <label className="text-[11px] font-medium block mb-1.5" style={{ color: "var(--muted)" }}>Base API URL</label>
              <input
                value={gateway}
                disabled={verifying}
                onChange={(e) => {
                  setGateway(e.target.value);
                  if (error) setError(null);
                }}
                spellCheck={false}
                placeholder="https://api.servicesessentials.ibm.com/v1"
                className="w-full rounded-lg px-3 py-2 text-[12.5px] mono outline-none disabled:opacity-50"
                style={{
                  background: "var(--surface)",
                  color: "var(--fg)",
                  border: problem && gateway.trim() ? "0.5px solid #e5484d" : "0.5px solid var(--border)",
                }}
              />
              <p className="text-[10.5px] mt-1" style={{ color: problem && gateway.trim() ? "#e5484d" : "var(--muted)" }}>
                {problem && gateway.trim() ? problem : "The Base API URL ICA shows for your server."}
              </p>
            </div>

            <div className="mt-4">
              <label className="text-[11px] font-medium block mb-1.5" style={{ color: "var(--muted)" }}>ICA API key</label>
              <input
                autoFocus
                type="password"
                value={icaKey}
                disabled={verifying}
                onChange={(e) => {
                  setIcaKey(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") connect();
                }}
                placeholder="sk-…"
                className="w-full rounded-lg px-3 py-2 text-[13px] mono outline-none disabled:opacity-50"
                style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}
              />
              <p className="text-[10.5px] mt-1" style={{ color: "var(--muted)" }}>
                ICA → Settings → API Keys → ICA APIs. One key covers every provider.
              </p>
            </div>

            {replaced.length > 0 && (
              <p className="text-[11.5px] mt-3 leading-relaxed" style={{ color: "var(--fg)" }}>
                Replaces your direct {replaced.map((id) => PROVIDERS[id].name).join(", ")}{" "}
                {replaced.length === 1 ? "connection" : "connections"}.
              </p>
            )}

            {error && (
              <div
                className="text-[11.5px] mt-3 rounded-lg px-2.5 py-2 leading-relaxed"
                style={{ background: "color-mix(in srgb, #e5484d 12%, transparent)", color: "#e5484d", animation: "fade-in 160ms ease" }}
              >
                {error}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg py-2 text-[13px] font-medium"
                style={{ background: "var(--surface)", color: "var(--fg)" }}
              >
                Cancel
              </button>
              <button
                onClick={connect}
                disabled={!canSubmit}
                className="flex-1 rounded-lg py-2 text-[13px] font-medium transition-opacity disabled:opacity-40 inline-flex items-center justify-center gap-2"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                {verifying && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin-slow 0.7s linear infinite" }}>
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
