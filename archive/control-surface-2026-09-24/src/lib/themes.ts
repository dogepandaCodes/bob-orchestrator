export type ProviderId = "claude" | "chatgpt" | "gemini";

export interface ThemeVars {
  bg: string;
  fg: string;
  card: string;
  surface: string; // tinted surface
  border: string;
  muted: string;
  accent: string;
  accentFg: string;
  userBubble: string;
  userBubbleFg: string;
  bodyFont: string; // conversation font
  glow?: string; // optional radial glow (Gemini)
}

interface ProviderTheme {
  id: ProviderId;
  name: string;
  short: string;
  supportsLight: boolean;
  light: ThemeVars;
  dark: ThemeVars;
}

const SANS = "var(--font-sans)";
const SERIF = "var(--font-serif)";

export const PROVIDERS: Record<ProviderId, ProviderTheme> = {
  claude: {
    id: "claude",
    name: "Claude",
    short: "Anthropic",
    supportsLight: true,
    light: {
      bg: "#F0ECE0",
      fg: "#2b2a27",
      card: "#F7F4EC",
      surface: "#E4D5C7",
      border: "rgba(43,42,39,0.12)",
      muted: "#6f675b",
      accent: "#c96442",
      accentFg: "#ffffff",
      userBubble: "#E4D5C7",
      userBubbleFg: "#2b2a27",
      bodyFont: SERIF,
    },
    dark: {
      bg: "#2b2a27",
      fg: "#f0ece0",
      card: "#33312d",
      surface: "#3d3a34",
      border: "rgba(240,236,224,0.12)",
      muted: "#a49b8c",
      accent: "#d97757",
      accentFg: "#2b2a27",
      userBubble: "#3d3a34",
      userBubbleFg: "#f0ece0",
      bodyFont: SERIF,
    },
  },
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    short: "OpenAI",
    supportsLight: true,
    light: {
      bg: "#ffffff",
      fg: "#0d0d0d",
      card: "#f9f9f9",
      surface: "#f4f4f4",
      border: "rgba(13,13,13,0.10)",
      muted: "#676767",
      accent: "#0d8f6f",
      accentFg: "#ffffff",
      userBubble: "#f4f4f4",
      userBubbleFg: "#0d0d0d",
      bodyFont: SANS,
    },
    dark: {
      bg: "#000000",
      fg: "#ececec",
      card: "#171717",
      surface: "#212121",
      border: "rgba(236,236,236,0.12)",
      muted: "#9b9b9b",
      accent: "#19c37d",
      accentFg: "#0d0d0d",
      userBubble: "#2f2f2f",
      userBubbleFg: "#ececec",
      bodyFont: SANS,
    },
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    short: "Google",
    supportsLight: false,
    light: {
      // Gemini is dark-only; mirror dark for safety
      bg: "#131314",
      fg: "#e3e3e3",
      card: "#1e1f20",
      surface: "#282a2c",
      border: "rgba(227,227,227,0.10)",
      muted: "#9aa0a6",
      accent: "#8ab4f8",
      accentFg: "#131314",
      userBubble: "#333537",
      userBubbleFg: "#e3e3e3",
      bodyFont: SANS,
      glow: "radial-gradient(circle at 50% 42%, rgba(138,180,248,0.22), rgba(199,125,255,0.10) 30%, transparent 62%)",
    },
    dark: {
      bg: "#131314",
      fg: "#e3e3e3",
      card: "#1e1f20",
      surface: "#282a2c",
      border: "rgba(227,227,227,0.10)",
      muted: "#9aa0a6",
      accent: "#8ab4f8",
      accentFg: "#131314",
      userBubble: "#333537",
      userBubbleFg: "#e3e3e3",
      bodyFont: SANS,
      glow: "radial-gradient(circle at 50% 42%, rgba(138,180,248,0.22), rgba(199,125,255,0.10) 30%, transparent 62%)",
    },
  },
};

export const PROVIDER_ORDER: ProviderId[] = ["claude", "chatgpt", "gemini"];

export function resolveVars(id: ProviderId, dark: boolean): ThemeVars {
  const p = PROVIDERS[id];
  return dark || !p.supportsLight ? p.dark : p.light;
}

export function varsToStyle(v: ThemeVars): React.CSSProperties {
  return {
    // @ts-expect-error custom props
    "--bg": v.bg,
    "--fg": v.fg,
    "--card": v.card,
    "--surface": v.surface,
    "--border": v.border,
    "--muted": v.muted,
    "--accent": v.accent,
    "--accent-fg": v.accentFg,
    "--user-bubble": v.userBubble,
    "--user-bubble-fg": v.userBubbleFg,
    "--font-body": v.bodyFont,
  };
}
