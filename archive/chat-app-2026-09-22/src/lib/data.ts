import type { ProviderId } from "./themes";

export interface UsageLimit {
  label: string;
  used: number;
  total: number;
  reset: string;
}

export interface Connection {
  id: ProviderId;
  plan: string;
  keyMask: string;
  limits: UsageLimit[];
}

export const CONNECTIONS: Connection[] = [
  {
    id: "claude",
    plan: "Max 20×",
    keyMask: "sk-ant-•••••••••••••••4c1a",
    limits: [
      { label: "5h limit", used: 34, total: 100, reset: "Resets in 2h 14m" },
      { label: "Monthly", used: 61, total: 100, reset: "Resets Oct 1" },
    ],
  },
  {
    id: "chatgpt",
    plan: "Pro",
    keyMask: "sk-•••••••••••••••••9f02",
    limits: [
      { label: "5h limit", used: 78, total: 100, reset: "Resets in 41m" },
      { label: "Weekly", used: 92, total: 100, reset: "Resets Mon 12:00 AM" },
    ],
  },
];

// Fallback usage profile for providers connected at runtime that don't ship
// with preset dashboard data (e.g. a freshly connected Gemini).
const DEFAULT_LIMITS: Record<ProviderId, UsageLimit[]> = {
  claude: [
    { label: "5h limit", used: 0, total: 100, reset: "Resets in 5h" },
    { label: "Monthly", used: 0, total: 100, reset: "Resets Oct 1" },
  ],
  chatgpt: [
    { label: "5h limit", used: 0, total: 100, reset: "Resets in 5h" },
    { label: "Weekly", used: 0, total: 100, reset: "Resets Mon 12:00 AM" },
  ],
  gemini: [
    { label: "5h limit", used: 0, total: 100, reset: "Resets in 5h" },
    { label: "Daily", used: 0, total: 100, reset: "Resets at midnight" },
  ],
};

const PLAN_DEFAULT: Record<ProviderId, string> = {
  claude: "Free",
  chatgpt: "Free",
  gemini: "Free",
};

export function getConnection(id: ProviderId): Connection {
  const preset = CONNECTIONS.find((c) => c.id === id);
  if (preset) return preset;
  return {
    id,
    plan: PLAN_DEFAULT[id],
    keyMask: "••••••••••••••••",
    limits: DEFAULT_LIMITS[id],
  };
}

export function barColor(pct: number): string {
  if (pct >= 85) return "#e5484d";
  if (pct >= 60) return "#e2a336";
  return "#3aa676";
}

export interface Session {
  id: string;
  title: string;
  summary: string;
  when: string;
  messages: number;
  bobCalls: number;
  bobTokens: string;
  trail: ProviderId[]; // oldest -> most recent
  pending?: boolean;
}

export const SESSIONS: Session[] = [
  {
    id: "s1",
    title: "Migrate /api/login contract to v3",
    summary:
      "Traced the old login endpoint through Bob, diffed the request shape, and rewrote the AI Tools 3.0 form to send the new token field. Confirmed error codes match.",
    when: "12m ago",
    messages: 24,
    bobCalls: 6,
    bobTokens: "4.2k",
    trail: ["chatgpt", "claude"],
  },
  {
    id: "s2",
    title: "Audit unused endpoints before launch",
    summary:
      "Listed every route with list_endpoints, cross-checked calling components, and flagged three dead handlers safe to remove.",
    when: "3h ago",
    messages: 41,
    bobCalls: 11,
    bobTokens: "9.8k",
    trail: ["claude", "gemini", "claude"],
  },
  {
    id: "s3",
    title: "Why is /checkout returning 419?",
    summary:
      "Bob pulled the endpoint contract; the CSRF token header was renamed upstream. Patched the interceptor and verified.",
    when: "Yesterday",
    messages: 12,
    bobCalls: 3,
    bobTokens: "1.9k",
    trail: ["gemini"],
  },
  {
    id: "s4",
    title: "Where does the settings drawer state live?",
    summary: "",
    when: "2d ago",
    messages: 5,
    bobCalls: 2,
    bobTokens: "0.8k",
    trail: ["claude"],
    pending: true,
  },
];

export interface Trace {
  tool: string;
  result: string;
}

export interface Msg {
  role: "user" | "assistant";
  text: string;
  trace?: Trace; // Bob trace shown before an assistant reply
  // Provider that produced this assistant message. Only the avatar icon
  // reflects it — the theme stays on the session's most recent provider.
  provider?: ProviderId;
}

// Per-session conversations, keyed by session id. Falls back to the default
// working thread when a session has no stored transcript yet.
export function getSessionThread(s: Session): Msg[] {
  return SESSION_THREADS[s.id] ?? THREAD;
}

const SESSION_THREADS: Record<string, Msg[]> = {
  s2: [
    { role: "user", text: "Before launch, which endpoints are dead? I don't want to ship handlers nothing calls." },
    {
      role: "assistant",
      provider: "gemini",
      text: "Let me have Bob enumerate every route and its callers.",
      trace: { tool: "Bob · list_endpoints()", result: "38 routes · 3 with zero callers" },
    },
    {
      role: "assistant",
      provider: "claude",
      text: "Three handlers have no callers: `GET /legacy/ping`, `POST /v1/export`, and `GET /debug/state`. All safe to remove — none are referenced by any component or test.",
    },
  ],
  s3: [
    { role: "user", text: "/checkout is returning 419 in prod but works locally. What changed?" },
    {
      role: "assistant",
      text: "419 is usually a stale CSRF token. Let me pull the contract.",
      trace: { tool: "Bob · get_endpoint_contract(/checkout)", result: "requires header X-CSRF-Token (renamed from X-XSRF)" },
    },
    {
      role: "assistant",
      text: "The header was renamed upstream from `X-XSRF` to `X-CSRF-Token`. Your interceptor is still sending the old name, so the server rejects it. Update the header key and the 419 clears.",
    },
  ],
};

export const THREAD: Msg[] = [
  {
    role: "user",
    text: "The login form on AI Tools 3.0 keeps 400ing. What does /api/login actually expect now?",
  },
  {
    role: "assistant",
    text: "Let me ask Bob for the current contract instead of guessing at the shape.",
    trace: {
      tool: "Bob · get_endpoint_contract(/api/login)",
      result:
        "POST → { email: string, token: string } · 200 { session } · 401 invalid · 419 stale_csrf",
    },
  },
  {
    role: "assistant",
    text: "The endpoint no longer accepts `password` directly — it expects a short-lived `token` field, and it will 400 on the legacy `password` key. Your form is still posting the old shape. Swap the field name and it should clear.",
  },
  {
    role: "user",
    text: "Got it. Are there other callers still on the old shape?",
  },
  {
    role: "assistant",
    text: "Checking every component that calls this route.",
    trace: {
      tool: "Bob · search_endpoints(login)",
      result: "3 callers · LoginForm.tsx · authClient.ts · e2e/login.spec.ts",
    },
  },
  {
    role: "assistant",
    text: "Three: `LoginForm.tsx`, `authClient.ts`, and the `e2e/login.spec.ts` fixture. The client helper is the safe one to fix first — both UI and tests flow through it.",
  },
];
