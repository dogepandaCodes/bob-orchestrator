import type { ProviderId } from "./themes";
import { adapterForWire, modelsFor, type Credential, type ModelOption } from "./providers";
import type { KeyMap } from "./keys";

/**
 * IBM Consulting Advantage developer API — `context/ica-openapi.yaml`.
 *
 * One ICA API key (ICA → Settings → API Keys → ICA APIs) reaches every model
 * through `/v1/chat-models`, OpenAI-compatible: `/models` and
 * `/chat/completions`, SSE ending in `[DONE]`. All three providers go through
 * it in OpenAI format, Claude included.
 *
 * The per-agent coding keys (claude-code, codex…) were tried against the gateway
 * root and offered the same catalog with no added capability, so they are not
 * used. See "ICA gateway" in context/CLAUDE.md.
 *
 * The base URL depends on the ICA server a user is on, so it is entered as-is;
 * the server is recognised from the URL. ICA sends access-control-allow-origin
 * only to IBM domains, so requests go through the dev server's `/ica-gw`
 * forwarder (vite.config.ts), which accepts only https://*.ibm.com — `vite dev`
 * only.
 */
/**
 * Known servers — used only to name a connection. Links are never looked up
 * here; they are derived from the base URL (see icaUsageLink).
 *
 * ICA lists eight more instances (Australia, Canada, India, Japan, REMEA,
 * Singapore, UKI, USA — /services/users/navigation) whose API base URLs are
 * not yet known; any *.ibm.com base connects and is named by its host.
 */
export const ICA_SERVERS = [
  { label: "Global", url: "https://api.servicesessentials.ibm.com/v1" },
  { label: "Global beta", url: "https://api.nextgen-beta.ica.ibm.com/ica/v1" },
];

/**
 * Accepts the base as ICA shows it, or with `/chat-models` already appended —
 * both are natural things to paste. A bare known host
 * (https://api.servicesessentials.ibm.com) gets that server's API path; the
 * host root itself 404s.
 */
export function normalizeGateway(url: string): string {
  const base = url.trim().replace(/\/+$/, "").replace(/\/chat-models(\/models)?$/, "");
  return ICA_SERVERS.find((s) => new URL(s.url).origin === base)?.url ?? base;
}

/** Mirrors the dev proxy's rule, so a bad URL fails here with a clear reason. */
export function gatewayProblem(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(normalizeGateway(url));
  } catch {
    return "Enter a full URL, e.g. https://api.servicesessentials.ibm.com/v1";
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:") return "The gateway must use https://.";
  if (!(host === "ibm.com" || host.endsWith(".ibm.com"))) return "Only ICA gateways under ibm.com are supported.";
  return null;
}

/** The same-origin path the browser actually calls for a given gateway. */
export function proxiedBase(gateway: string): string {
  return `/ica-gw/${encodeURIComponent(normalizeGateway(gateway))}/chat-models`;
}

/**
 * The ICA Settings → Usage page for a stored credential, derived from its base
 * URL: the web host is the API host without `api.`, and the web path carries
 * whatever the API path has before `/v1`.
 *
 *   https://api.servicesessentials.ibm.com/v1
 *     → https://servicesessentials.ibm.com/settings/usage      (confirmed)
 *   https://api.nextgen-beta.ica.ibm.com/ica/v1
 *     → https://nextgen-beta.ica.ibm.com/ica/settings/usage    (same rule)
 */
export function icaUsageLink(baseUrl?: string): string | null {
  const m = baseUrl?.match(/^\/ica-gw\/([^/]+)/);
  if (!m) return null;
  try {
    const api = new URL(decodeURIComponent(m[1]));
    const host = api.hostname.replace(/^api\./, "");
    const prefix = api.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
    return `https://${host}${prefix}/settings/usage`;
  } catch {
    return null;
  }
}

/** Which server a stored ICA credential points at, for display. */
export function icaServerOf(baseUrl?: string): string | null {
  const m = baseUrl?.match(/^\/ica-gw\/([^/]+)/);
  if (!m) return null;
  const url = decodeURIComponent(m[1]);
  return ICA_SERVERS.find((s) => s.url === url)?.label ?? new URL(url).host;
}

const SERVED: ProviderId[] = ["claude", "chatgpt", "gemini"];

export interface IcaConnection {
  keys: KeyMap;
  catalogs: Partial<Record<ProviderId, ModelOption[]>>;
  /** Providers the key offers no model for; their existing connection is kept. */
  missing: ProviderId[];
  /** Everything the key can see, sorted into a provider or not. */
  total: number;
  gateway: string;
  unsorted: string[];
}

/**
 * Verifies the key against ICA's catalog, then connects every provider it has
 * models for. A provider with none is reported, not connected empty, so it
 * cannot overwrite a working direct key with nothing to select.
 */
export async function connectViaIca(
  icaKey: string,
  gateway: string,
  signal?: AbortSignal,
): Promise<IcaConnection> {
  const problem = gatewayProblem(gateway);
  if (problem) throw new Error(problem);
  const cred: Credential = { key: icaKey.trim(), baseUrl: proxiedBase(gateway), wire: "openai", via: "ica" };

  let catalog: ModelOption[];
  try {
    catalog = await adapterForWire("openai").listModels(cred, signal);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    const msg = (e instanceof Error ? e.message : String(e)).replace(/^OpenAI\b/, "ICA");
    if (/\b404\b/.test(msg)) {
      throw new Error(
        "Nothing found at that gateway. It should end in /v1 (Global) or /ica/v1 (Global beta) — and the app must be running under the dev server, which does the forwarding.",
      );
    }
    // Coding-agent keys are the likeliest wrong paste; they fail with this.
    if (/Unknown icaKey/i.test(msg)) {
      throw new Error(`${msg} Use the key from ICA → Settings → API Keys → ICA APIs, not a Coding Agents key.`);
    }
    throw new Error(msg);
  }

  const result: IcaConnection = {
    keys: {},
    catalogs: {},
    missing: [],
    total: catalog.length,
    unsorted: [],
    gateway: normalizeGateway(gateway),
  };
  const sorted = new Set<string>();
  for (const provider of SERVED) {
    const models = modelsFor(provider, catalog);
    models.forEach((m) => sorted.add(m.id));
    if (models.length === 0) {
      result.missing.push(provider);
      continue;
    }
    result.keys[provider] = cred;
    result.catalogs[provider] = models;
  }
  result.unsorted = catalog.filter((m) => !sorted.has(m.id)).map((m) => m.id);

  if (Object.keys(result.keys).length === 0) {
    const sample = catalog.slice(0, 6).map((m) => m.id).join(", ");
    throw new Error(
      `ICA accepted the key, but none of its ${catalog.length} models look like Claude, ChatGPT or Gemini` +
        (sample ? ` (e.g. ${sample}).` : "."),
    );
  }
  return result;
}
