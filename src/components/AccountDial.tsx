import { useRef, useState } from "react";
import type { ProviderId } from "../lib/themes";
import { ProviderBadge } from "./Logos";

// Account dial: connected providers as circular badges. Hold a circle and
// swipe left/right to move the selection; releasing commits and fires the
// theme transition. Desktop gets a visual "tick" pulse in place of haptics.
//
// `locked` holds the dial while an assistant reply is streaming — see
// "No switching mid-reply" in context/CLAUDE.md.
export function AccountDial({
  connected,
  active,
  locked = false,
  onSwitch,
  onAdd,
}: {
  connected: ProviderId[];
  active: ProviderId;
  locked?: boolean;
  onSwitch: (id: ProviderId) => void;
  onAdd: () => void;
}) {
  const startX = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ProviderId | null>(null);
  const [tick, setTick] = useState<ProviderId | null>(null);

  const idx = connected.indexOf(active);

  function move(clientX: number) {
    if (locked || startX.current === null) return;
    const step = 44;
    const delta = Math.round((clientX - startX.current) / step);
    let next = idx + delta;
    next = Math.max(0, Math.min(connected.length - 1, next));
    const target = connected[next];
    if (target !== preview) {
      setPreview(target);
      setTick(target);
      setTimeout(() => setTick(null), 180);
    }
  }

  // Commit happens here for both a click and a drag — a separate onClick would
  // double-fire with this on a plain click, scheduling two transitions.
  function end() {
    if (!locked && preview && preview !== active) onSwitch(preview);
    startX.current = null;
    setDragging(false);
    setPreview(null);
  }

  return (
    <div className="flex items-center gap-2.5 ui select-none">
      {connected.map((id) => {
        const isActive = id === (preview ?? active);
        const isBusy = locked && id === active;
        return (
          <button
            key={id}
            aria-label={locked ? `Locked while replying — ${id}` : `Switch to ${id}`}
            aria-disabled={locked}
            title={locked ? "Wait for the reply to finish" : undefined}
            onKeyDown={(e) => {
              if (locked) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (id !== active) onSwitch(id);
              }
            }}
            onPointerDown={(e) => {
              if (locked) return;
              startX.current = e.clientX;
              setDragging(true);
              setPreview(id);
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => dragging && move(e.clientX)}
            onPointerUp={end}
            // Sized to the badge and laid out as flex: left to inline layout, the
            // button took its height from the text line, and ChatGPT's image mark
            // sits on that line differently from the SVG marks — its button came
            // out 34x37, so the drag ring drawn around it was an oval.
            className="relative w-[34px] h-[34px] shrink-0 inline-flex items-center justify-center rounded-full transition-all"
            style={{
              transform: dragging && isActive && !locked ? "scale(1.12)" : "scale(1)",
              opacity: locked && !isBusy ? 0.35 : 1,
              cursor: locked ? "not-allowed" : "pointer",
              pointerEvents: locked ? "none" : undefined,
            }}
          >
            <span
              className="flex rounded-full"
              style={{
                background: isActive ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent",
                boxShadow: isActive ? "0 0 0 2px var(--accent)" : "0 0 0 0.5px var(--border)",
                borderRadius: 999,
                // Reduced motion suppresses this globally, so the dim and the
                // cursor have to carry the lock on their own.
                animation: isBusy ? "pulse-bar 1.4s ease-in-out infinite" : undefined,
              }}
            >
              <ProviderBadge id={id} size={34} />
            </span>
            {tick === id && !locked && (
              <span
                className="absolute -inset-1 rounded-full pointer-events-none"
                style={{ boxShadow: "0 0 0 2px var(--accent)", opacity: 0.5, animation: "fade-in 120ms ease" }}
              />
            )}
          </button>
        );
      })}

      {/* Stays live while locked — connecting a provider does not switch to it. */}
      <button
        onClick={onAdd}
        aria-label="Connect another AI"
        className="w-[34px] h-[34px] rounded-full inline-flex items-center justify-center transition-colors hover:opacity-80"
        style={{ border: "1.5px dashed var(--border)", color: "var(--muted)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  );
}
