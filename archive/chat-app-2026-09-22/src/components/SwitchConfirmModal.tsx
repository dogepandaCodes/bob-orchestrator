import { PROVIDERS, type ProviderId } from "../lib/themes";
import { ProviderBadge } from "./Logos";

/**
 * Consent before a provider switch. Fires *before* the theme transition, so it
 * renders in the outgoing theme — the incoming provider appears only as its
 * badge. See "Confirm before switching" in context/CLAUDE.md.
 */
export function SwitchConfirmModal({
  from,
  to,
  messageCount,
  onCancel,
  onConfirm,
  onDontAsk,
}: {
  from: ProviderId;
  to: ProviderId;
  messageCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  onDontAsk: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="ui rounded-xl p-6 w-[360px] relative"
        style={{ background: "var(--card)", border: "0.5px solid var(--border)", animation: "fade-in 200ms ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <ProviderBadge id={from} size={34} faded />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          <ProviderBadge id={to} size={38} ring />
        </div>

        <h2 className="text-[17px] font-semibold text-center" style={{ color: "var(--fg)" }}>
          Switch to {PROVIDERS[to].name}?
        </h2>
        <p className="text-[13px] mt-2 leading-relaxed text-center" style={{ color: "var(--muted)" }}>
          All {messageCount} {messageCount === 1 ? "message" : "messages"} carry over word for word.
          But {PROVIDERS[to].name} reads the thread fresh — it does not inherit{" "}
          {PROVIDERS[from].name}&rsquo;s reasoning, and long threads may not fit its context window.
        </p>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors"
            style={{ background: "var(--surface)", color: "var(--fg)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg py-2 text-[13px] font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Switch
          </button>
        </div>

        <button
          onClick={onDontAsk}
          className="w-full mt-3 text-[11.5px] transition-opacity hover:opacity-70"
          style={{ color: "var(--muted)" }}
        >
          Switch and don&rsquo;t ask again this session
        </button>
      </div>
    </div>
  );
}
