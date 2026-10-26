import type { ProviderId } from "../lib/themes";
import chatgptLogo from "../imports/5D20DB55-C86E-420F-825C-6635CA307A8C_4_5005_c-1.jpeg";

interface MarkProps {
  size?: number;
  className?: string;
}

// Anthropic / Claude — radial burst mark
export function ClaudeMark({ size = 24, className }: MarkProps) {
  const spokes = Array.from({ length: 12 });
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {spokes.map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const inner = 2.2;
        const outer = 10.6;
        const x1 = 12 + Math.cos(a) * inner;
        const y1 = 12 + Math.sin(a) * inner;
        const x2 = 12 + Math.cos(a) * outer;
        const y2 = 12 + Math.sin(a) * outer;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth={2.1}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

// OpenAI / ChatGPT — user-provided logo asset. The source PNG carries padding,
// so we scale it up inside a clipped box to crop the surrounding whitespace.
export function ChatGPTMark({ size = 24, className }: MarkProps) {
  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        display: "inline-block",
        overflow: "hidden",
      }}
    >
      <img
        src={chatgptLogo}
        alt="ChatGPT"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
    </span>
  );
}

// Gemini — four-point spark mark
export function GeminiMark({ size = 24, className }: MarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="gem-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8ab4f8" />
          <stop offset="55%" stopColor="#679df6" />
          <stop offset="100%" stopColor="#c77dff" />
        </linearGradient>
      </defs>
      <path
        d="M12 1.5c.7 5.4 4.6 9.3 10 10-5.4.7-9.3 4.6-10 10-.7-5.4-4.6-9.3-10-10 5.4-.7 9.3-4.6 10-10Z"
        fill="url(#gem-grad)"
      />
    </svg>
  );
}

export function ProviderMark({
  id,
  size,
  className,
}: {
  id: ProviderId;
  size?: number;
  className?: string;
}) {
  if (id === "claude") return <ClaudeMark size={size} className={className} />;
  if (id === "chatgpt") return <ChatGPTMark size={size} className={className} />;
  return <GeminiMark size={size} className={className} />;
}

// Circular badge wrapping a provider mark, tinted per provider.
export function ProviderBadge({
  id,
  size = 36,
  active = false,
  ring = false,
  faded = false,
}: {
  id: ProviderId;
  size?: number;
  active?: boolean;
  ring?: boolean;
  faded?: boolean;
}) {
  const bg: Record<ProviderId, string> = {
    claude: "#c96442",
    chatgpt: "#ffffff",
    gemini: "#1e1f20",
  };
  const fg: Record<ProviderId, string> = {
    claude: "#F7EDE4",
    chatgpt: "#0d0d0d",
    gemini: "#ffffff",
  };
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: id === "gemini" ? "#131314" : bg[id],
        color: fg[id],
        opacity: faded ? 0.55 : 1,
        boxShadow: ring
          ? `0 0 0 1.5px var(--accent)`
          : active
            ? `0 0 0 2px var(--accent)`
            : undefined,
        border:
          id === "gemini"
            ? "0.5px solid rgba(255,255,255,0.14)"
            : id === "chatgpt"
              ? "0.5px solid rgba(13,13,13,0.12)"
              : undefined,
        overflow: "hidden",
      }}
    >
      <ProviderMark id={id} size={Math.round(size * (id === "chatgpt" ? 0.82 : 0.58))} />
    </span>
  );
}
