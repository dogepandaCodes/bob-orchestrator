import type { ProviderId } from "./themes";

// Placeholder session history for the Context page. Real sessions will come
// from the MCP server once it records them.
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
