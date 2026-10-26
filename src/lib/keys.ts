import type { ProviderId } from "./themes";
import type { Credential } from "./providers";

export type KeyMap = Partial<Record<ProviderId, Credential>>;

const STORAGE_KEY = "orchestrator.keys.v1";

/**
 * Keys live in localStorage, which means any script on this origin can read
 * them. That is acceptable for a local dev tool driving the user's own keys;
 * it would not be for a hosted multi-tenant app, where the browser should hold
 * a session token and the keys should sit server-side.
 */
export function loadKeys(): KeyMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    // v1 stored a bare key string per provider; keep those working.
    const out: KeyMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        if (value) out[id as ProviderId] = { key: value };
      } else if (value && typeof value === "object" && typeof (value as Credential).key === "string") {
        const cred = value as Credential;
        // ICA connections made before the gateway became selectable used a
        // fixed /ica proxy that no longer exists; that path always meant Global.
        if (cred.baseUrl === "/ica/v1/chat-models") {
          cred.baseUrl = `/ica-gw/${encodeURIComponent("https://api.servicesessentials.ibm.com/v1")}/chat-models`;
        }
        out[id as ProviderId] = cred;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveKeys(keys: KeyMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Private windows and blocked site data both throw — the app still works
    // for the current session, the keys just will not persist.
  }
}

export function maskKey(key: string): string {
  if (key.length <= 10) return "•".repeat(Math.max(key.length, 4));
  return `${key.slice(0, 6)}${"•".repeat(12)}${key.slice(-4)}`;
}
