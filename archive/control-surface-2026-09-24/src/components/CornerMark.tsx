import type { ProviderId } from "../lib/themes";
import { ProviderMark } from "./Logos";

// Large, faded provider glyph cropped by the top-right viewport edge.
// Rotates 360° clockwise when the active account changes (keyed on `active`).
export function CornerMark({
  active,
  dark,
}: {
  active: ProviderId;
  dark: boolean;
}) {
  return (
    <div
      key={active}
      className="pointer-events-none absolute top-0 right-0 -translate-y-8 translate-x-8 z-0"
      style={{
        opacity: 0.15,
        color: "var(--accent)",
        animation: "spin-slow 60s linear infinite",
        filter: active === "chatgpt" && dark ? "invert(1)" : undefined,
      }}
    >
      <ProviderMark id={active} size={150} />
    </div>
  );
}
