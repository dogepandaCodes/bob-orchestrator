import { useState } from "react";
import { PROVIDERS, type ProviderId } from "../lib/themes";
import { getConnection, barColor, type Connection } from "../lib/data";
import { maskKey, type KeyMap } from "../lib/keys";
import { ProviderBadge } from "../components/Logos";
import { CornerMark } from "../components/CornerMark";

function UsageRow({ limit }: { limit: Connection["limits"][number] }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round((limit.used / limit.total) * 100);
  return (
    <button
      className="w-full text-left ui"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px]" style={{ color: "var(--muted)" }}>{limit.label}</span>
        <span className="text-[11px] mono tabular-nums" style={{ color: "var(--muted)" }}>{limit.used} / {limit.total}</span>
      </div>
      <div className="h-[3.5px] rounded-full overflow-hidden" style={{ background: "var(--surface)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor(pct) }} />
      </div>
      {open && (
        <div className="text-[10.5px] mt-1.5" style={{ color: "var(--muted)", animation: "fade-in 140ms ease" }}>{limit.reset}</div>
      )}
    </button>
  );
}

function ProviderCard({ conn, onEdit }: { conn: Connection; onEdit: () => void }) {
  const p = PROVIDERS[conn.id];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onEdit();
      }}
      className="text-left rounded-xl p-4 transition-colors hover:opacity-95 cursor-pointer"
      style={{ background: "var(--card)", border: "0.5px solid var(--border)" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <ProviderBadge id={conn.id} size={36} />
        <div>
          <div className="text-[14px] font-medium ui" style={{ color: "var(--fg)" }}>{p.name}</div>
          <div className="text-[12px] ui" style={{ color: "var(--muted)" }}>Connected</div>
        </div>
      </div>
      <div className="space-y-3">
        {conn.limits.map((l) => (
          <UsageRow key={l.label} limit={l} />
        ))}
      </div>
    </div>
  );
}

function EditModal({
  conn,
  apiKey,
  onClose,
  onDisconnect,
}: {
  conn: Connection;
  apiKey: string;
  onClose: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="ui rounded-xl p-6 w-[340px] relative" style={{ background: "var(--card)", border: "0.5px solid var(--border)", animation: "fade-in 200ms ease" }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 w-7 h-7 rounded-full inline-flex items-center justify-center" style={{ background: "var(--surface)", color: "var(--muted)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="flex items-center gap-3 mb-5">
          <ProviderBadge id={conn.id} size={36} />
          <div>
            <div className="text-[15px] font-semibold" style={{ color: "var(--fg)" }}>{PROVIDERS[conn.id].name}</div>
            <div className="text-[12px]" style={{ color: "var(--muted)" }}>Connected</div>
          </div>
        </div>
        <label className="text-[11px] font-medium block mb-1.5" style={{ color: "var(--muted)" }}>API key</label>
        <div className="w-full rounded-lg px-3 py-2 text-[13px] mono" style={{ background: "var(--surface)", color: "var(--muted)", border: "0.5px solid var(--border)" }}>
          {maskKey(apiKey)}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onDisconnect} className="rounded-lg px-3 py-2 text-[13px] font-medium transition-colors" style={{ color: "#e5484d", border: "0.5px solid var(--border)" }}>Disconnect</button>
          <button onClick={onClose} className="flex-1 rounded-lg py-2 text-[13px] font-medium" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>Done</button>
        </div>
      </div>
    </div>
  );
}

export function Dashboard({
  active,
  theme,
  connected,
  keys,
  dark,
  onSetActive,
  onConnect,
  onDisconnect,
}: {
  /** Null until the user connects something — nothing is preselected. */
  active: ProviderId | null;
  /** Concrete provider used for styling only. */
  theme: ProviderId;
  connected: ProviderId[];
  keys: KeyMap;
  dark: boolean;
  onSetActive: (id: ProviderId) => void;
  onConnect: () => void;
  onDisconnect: (id: ProviderId) => void;
}) {
  const [editing, setEditing] = useState<Connection | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const conns = connected.map((id) => getConnection(id));

  return (
    <div className="relative h-full overflow-y-auto">
      <CornerMark active={theme} dark={dark} />

      <div className="relative p-6 max-w-[880px] mx-auto w-full">
        <h1 className="text-[22px] font-semibold ui" style={{ color: "var(--fg)" }}>Dashboard</h1>

        <div className="flex items-center justify-between mt-4 mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-2 ui">
            <span className="text-[12px]" style={{ color: "var(--muted)" }}>Active account</span>
            <div className="relative">
              <button
                onClick={() => setAccountOpen((o) => !o)}
                disabled={connected.length === 0}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium disabled:opacity-40"
                style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}
              >
                {active ? (
                  <>
                    <ProviderBadge id={active} size={20} />
                    {PROVIDERS[active].name}
                  </>
                ) : (
                  <>
                    <span
                      className="w-5 h-5 rounded-full inline-block shrink-0"
                      style={{ border: "1.5px dashed var(--border)" }}
                    />
                    <span style={{ color: "var(--muted)" }}>None selected</span>
                  </>
                )}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0.6 }}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {accountOpen && (
                <div className="absolute top-full left-0 mt-1.5 min-w-[180px] rounded-lg p-1 z-20" style={{ background: "var(--card)", border: "0.5px solid var(--border)", boxShadow: "0 8px 30px rgba(0,0,0,0.18)" }}>
                  {connected.map((id) => (
                    <button key={id} onClick={() => { onSetActive(id); setAccountOpen(false); }} className="w-full text-left rounded-md px-2.5 py-1.5 text-[13px] flex items-center gap-2 hover:opacity-80" style={{ color: "var(--fg)", background: id === active ? "var(--surface)" : "transparent" }}>
                      <ProviderBadge id={id} size={20} />
                      {PROVIDERS[id].name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button onClick={onConnect} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium ui" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Connect AI
          </button>
        </div>

        {conns.length === 0 ? (
          <div className="text-center py-20 ui">
            <p className="text-[13px]" style={{ color: "var(--muted)" }}>No providers connected yet.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {conns.map((c) => (
                <ProviderCard key={c.id} conn={c} onEdit={() => setEditing(c)} />
              ))}
            </div>
            <p className="text-[11px] mt-4 ui" style={{ color: "var(--muted)" }}>
              Connections are live. Usage figures are placeholder data — no provider
              exposes a quota endpoint we read yet.
            </p>
          </>
        )}
      </div>

      {editing && (
        <EditModal
          conn={editing}
          apiKey={keys[editing.id]?.key ?? ""}
          onClose={() => setEditing(null)}
          onDisconnect={() => {
            onDisconnect(editing.id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
