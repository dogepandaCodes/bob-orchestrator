# CLAUDE.md

Guidance for Claude Code working in this repository.

_Last updated 2026-09-24._

> **Relaunched (2026-09-24).** The multi-provider chat app is live again, now
> able to connect through IBM's **ICA** company gateway — company-paid access
> removes the API-credit problem that retired it. See [ICA gateway](#ica-gateway).
> The MCP server (`mcp/`) is unaffected and still serves Claude Code/Desktop.
> The MCP control surface is archived in `archive/control-surface-2026-09-24/`.
>
> **Direction change (2026-09-22).** The product is becoming an **MCP server**
> that Claude and ChatGPT connect to, rather than a chat app that calls provider
> APIs. See [Pivot to MCP](#pivot-to-mcp). The web app survives as a control
> surface; the chat surface and the provider-switching theme system do not.

---

## What this is

A desktop web dev tool. A developer chats with a high-capability orchestrator
model (Claude / ChatGPT / Gemini) which consults **Bob** — IBM's coding agent,
running locally against the user's repo — for grounded facts about the
codebase. Bob filters and summarizes before anything leaves the machine, so the
orchestrator plans against real contracts instead of guesses.

Origin case: the AI Tools 3.0 UI migration, where API endpoint mismatches had
to be found by hand through browser inspection. A repo-aware layer removes that
guess-and-check loop.

The app **restyles itself** to match whichever provider is active — three full
themes, not accent swaps.

---

## Stack

- React 19 + Vite 8 + TypeScript 5.7
- Tailwind CSS v4 via `@tailwindcss/vite`
- Runs inside Figma Make (dev server already on `$PORT`)
- Fonts via Google Fonts `@import` in `src/index.css`: **Inter** (UI/sans),
  **Lora** (serif conversation text, Claude theme only), **JetBrains Mono**
  (Bob traces)

Planned for the real chat runtime: **assistant-ui** (MIT, React). Headless
primitives; its CLI copies UI source into the repo so everything stays
editable. Not yet wired in — the current chat surface is hand-built.

---

## Live API layer

The chat surface talks to provider APIs **directly from the browser** — there
is no backend. Verified: all three pass a CORS preflight from the dev origin.

| Provider | Endpoint | Auth | Browser note |
|---|---|---|---|
| Anthropic | `POST /v1/messages` | `x-api-key` (+ `anthropic-workspace-id`) | **Requires `anthropic-dangerous-direct-browser-access: true`** — without it no `access-control-allow-origin` comes back and the browser blocks the read |
| OpenAI | `POST /v1/chat/completions` | `Authorization: Bearer` | Preflight allows POST; the 401 path omits the ACAO header, so auth failures can surface as a CORS-shaped error |
| Gemini | `POST /v1beta/models/{id}:streamGenerateContent?alt=sse` | `x-goog-api-key` | Echoes the request origin |

- **Anthropic keys come in two scopes.** A key bound to one workspace works as
  is. An **organization-scoped** key (personal or service-account, not bound to
  a workspace) additionally needs `anthropic-workspace-id: wrkspc_…` or every
  call 400s. Keys bound to the Default Workspace are the
  first kind, so most connections need no header at all — `ConnectModal`
  therefore keeps the Workspace ID field hidden, revealing it when the API asks
  *or* when the user clicks "Using an organization-scoped key?", so someone who
  already knows can skip the failed round-trip. The header passes CORS; the
  Admin API that lists workspaces does **not** (preflight 400, no
  `access-control-allow-origin`), so the id cannot be discovered from the
  browser and has to be pasted once.
- **Credentials are objects, not strings** (`Credential` in
  `providers/types.ts`) precisely because of the above — `loadKeys` migrates
  the old bare-string shape on read.
- **Token usage is read off every response**, not computed. Each adapter
  reports into a shared `Usage` ({`input`, `output`, `cacheRead`}) via
  `onUsage`, and `useChat` merges the fields as they land — they arrive at
  different points per provider and a later partial must not erase a total:
  - Anthropic: `input` at `message_start`, final `output` at `message_delta`
  - Gemini: `usageMetadata` repeats on every chunk with running totals
  - OpenAI: one final chunk carrying no choices, and **only if the request
    sets `stream_options: {include_usage: true}`** — otherwise usage is silently
    omitted from streamed responses
- **Keys are verified before they are stored.** `ConnectModal` calls
  `listModels` as the probe — a cheap authenticated GET that all three
  providers reject outright for a bad key (Anthropic 401, OpenAI 401, Gemini
  400 `API_KEY_INVALID`). A key that fails never reaches `localStorage`, so an
  invalid key cannot surface as a red bubble mid-conversation.
- **Model ids are fetched live** per key (`listModels`). The adapters' static
  `fallbackModels` only stand in until that resolves — a hardcoded id goes
  stale the moment a vendor ships a new one.
- **Catalogs are filtered to what we can actually call.** No provider exposes a
  lifecycle field, so membership comes from observable facts only:
  - Gemini accepts a model listing **either** `generateContent` or
    `streamGenerateContent`. Only the former is documented as a value —
    the streaming variant is a transport of it and is not listed, so filtering
    on `streamGenerateContent` alone matches *nothing*. Accepting either still
    drops embedding, imagen, veo and tts models without a family allowlist.
  - Every narrowing step goes through `narrow()`, which returns the input
    untouched when a filter would empty a non-empty list. A filter matching
    nothing is a bug in the filter, not a fact about the catalog. Two separate
    outages here came from skipping that guard.
  - OpenAI drops dated snapshots (`-2024-08-06`, `-0125`), which duplicate the
    rolling alias they pin and outlive it.
  - `RETIRED_TEXT` is matched against `displayName` only, never `description`.
    A current model whose blurb says "replaces the deprecated X" would
    otherwise be hidden — and a hidden good model is worse than a listed dead
    one, which fails with a clear "pick another" error.
  - `byNewest` sorts newest-first so stragglers sink and the default pick is
    current. Recency decides *ordering*, never membership.
- **Gemini probes what the key can actually call.** Metadata is not enough:
  `models.list` advertises models that 404 on use — *"no longer available to
  new users"* — because availability is per-project and no lifecycle field
  exists. `listModels` therefore countTokens-probes each candidate (free,
  non-generative, 6 at a time). **It removes a model only when the body says
  the model is retired** — Google returns 404 for two unrelated reasons, and
  *"is not supported for countTokens"* means the probe does not apply to that
  model, not that it is dead. Matching that phrase once emptied the entire
  catalog. A 429 or dropped connection never removes a model either.
- **If the probe rejects everything, the probe is wrong, not the catalog.**
  `listModels` returns the unfiltered list in that case — an empty selector is
  never the right answer, and a real refusal at send time retires models one at
  a time anyway.
- **Resolved catalogs are cached** in `localStorage` for an hour, keyed by a
  fingerprint of the key, so the probe is not re-run on every reload. Key
  verification primes it, so connecting pays that cost once.
- **A model rejected at send time is retired.** The probe cannot be perfect, so
  `dropModel` removes it from the catalog and the cache on first refusal rather
  than offering it again.
- **One SSE reader** in `providers/types.ts` serves all three; each adapter only
  supplies the per-vendor event shape.
- **`apiError` / `networkError`** name the likely cause. A browser CORS block
  arrives as a bare `TypeError: Failed to fetch`, which tells a user nothing.
- **Keys live in `localStorage`**, readable by any script on the origin. Fine
  for a local dev tool driving the user's own keys; a hosted build must move
  them server-side and give the browser a session token instead.

### Custom endpoints (`compatible`)

A fourth provider accepts **any OpenAI-compatible host** — OpenRouter, Groq,
Together, Mistral, a local Ollama. All verified to pass a browser preflight
with `access-control-allow-origin: *`.

- One implementation serves it and OpenAI both: `openAICompatible()` in
  `providers/openai.ts` differs only by endpoint. `Credential.baseUrl`
  overrides it.
- It has its own **neutral theme and a link glyph**, deliberately. Reusing the
  OpenAI slot would have been less code, but the badge would then claim Groq is
  ChatGPT.
- Model filtering relaxes for it: a third-party host serves its own catalog
  under its own naming, so only plainly-not-chat families are stripped rather
  than allowlisting `gpt|o\d`.
- The key field accepts one character here — a local Ollama takes any bearer
  token — but the endpoint must parse as `http(s)://`.

This is the answer for a user with no API credit: every listed preset runs a
free tier, and Ollama costs nothing at all.

**Subscription OAuth is not an option.** Reaching first-party endpoints with a
provider's own OAuth `client_id` (what Claude Code and Codex CLI do, and what
OmniRoute's "Tier 1" exploits) circumvents access control on a paid service,
breaks whenever the flow rotates, and would expose *users'* subscriptions to
suspension. Google offers real OAuth for the Gemini API, but its scope is
`generative-language.retriever` and it bills a Cloud project — not a consumer
Gemini Advanced subscription — so there is no symmetric path even if the other
two were built.

**Subscriptions are not API access.** Claude Max, ChatGPT Plus/Pro and Gemini
Advanced do not include API credit — keys come from the provider consoles and
are billed separately. Google AI Studio has a free tier; the other two do not.

### Effort

The composer has an effort picker beside the model picker, remembered per
provider. Rules and learning live in `src/lib/providers/effort.ts`.

| Provider | Native setting | Levels |
|---|---|---|
| Claude | `output_config.effort` | low → max on Opus 5 / 4.8 / 4.7 and Sonnet 5; no `xhigh` on 4.6; **Haiku rejects it** (no picker) |
| ChatGPT | `reasoning_effort` | model-dependent subset of none → max; **no published per-model table**; non-reasoning models (gpt-4o, 4.1) get no picker |
| Gemini | `thinkingConfig.thinkingLevel` | per model: minimal → high on 3.6 Flash and 3.5 Flash-Lite; low → high on 3.8/3.7 Flash, 3.1 Pro, 2.5 |

- **Medium is preselected** — no "Default" option, which read as ambiguous since
  each model's own default differs. If a model has refused Medium, the middle of
  its remaining levels is used instead (`defaultEffort`). Note Medium is lighter
  than the native default on Claude and Gemini 3.1 Pro (both `high`) and heavier
  than Gemini 3.5 Flash-Lite's (`minimal`). Models with no effort setting get no
  picker and send nothing.
- **Through ICA everything goes out as `reasoning_effort`** (OpenAI format), and
  ICA must translate it for Claude and Gemini. ICA's spec does not list the
  field, but it is **honored** (2026-09-25): the same prompt thought markedly
  longer at Extra high than at lower levels, and Extra high was accepted rather
  than refused.
- **A refused level never costs the reply.** On a 400 that names the effort
  setting, the chat resends without it, notes it under the reply, and records
  the refusal: exactly the levels the error lists as supported, when it lists
  them (OpenAI's usually do), else minus the one that failed. Learned per model
  in `localStorage`.
- **Effort errors are checked before model errors.** The "model is gone" test
  matches `is not supported`, which is also OpenAI's effort wording — unchecked,
  an unsupported level would have removed the whole model from the catalog.

### ICA gateway

IBM Consulting Advantage's developer API (spec: `context/ica-openapi.yaml`).
**Connect via ICA** (Dashboard, and Home's empty state) takes **one ICA API
key** — ICA → Settings → API Keys → ICA APIs — and connects Claude, ChatGPT and
Gemini at once, replacing their direct connections. Logic in `src/lib/ica.ts`.

- **The gateway depends on the ICA server**, so the prompt asks for the Base
  API URL — no presets; the URL identifies the server. Known servers
  (`ICA_SERVERS`) are only used to name a connection: **Global**
  `https://api.servicesessentials.ibm.com/v1` and **Global beta**
  `https://api.nextgen-beta.ica.ibm.com/ica/v1`, both verified to serve the same
  API; any other `*.ibm.com` server is named by its host. A pasted URL may end in `/chat-models`; it is
  normalized. Dashboard cards name the server ("Connected via ICA · Global beta").
- **One key, one endpoint per server.** `Authorization: Bearer sk-…` against
  `<gateway>/chat-models` — OpenAI-compatible
  `/models` and `/chat/completions`, SSE ending in `[DONE]`. All three providers
  use it in OpenAI format, Claude included. Model display names carry the
  serving region, e.g. `[global]`.
- **Coding-agent keys were tried and dropped (2026-09-24).** The per-agent keys
  on ICA's *Coding Agents* page (claude-code, codex, cline…) work at the gateway
  root — a LiteLLM proxy serving `/v1/messages` and `/v1/chat/completions` — and
  reached Claude in native Anthropic format. In a side-by-side test they offered
  the **same models** as the ICA API key with no visible difference, while
  borrowing another tool's identity and sharing its one-active-key slot. The ICA
  API key is the credential ICA issues for apps. The root rejects an ICA key and
  `/chat-models` rejects agent keys (`Unknown icaKey`) — the likeliest wrong
  paste, so that error now says which key to use.
- **CORS blocks the browser** on every ICA server: preflights return 200 but no
  `access-control-allow-origin` for localhost. A static `server.proxy` can't
  follow a gateway chosen in the page, so `icaGatewayProxy()` in
  `vite.config.ts` forwards `/ica-gw/<encoded gateway>/<path>`, streaming the
  response (SSE intact) and aborting upstream when the page aborts.
  **It forwards only to `https://*.ibm.com`** — the dev server listens on every
  interface, and an open forwarder would relay anything for anyone on the
  network. Tested against plain http, lookalike and suffix domains, and the
  `https://ibm-host@evil` userinfo trick. `vite dev` only — not `vite preview`,
  not a deployed build. Connections saved under the old fixed `/ica` path are
  migrated to Global in `loadKeys`.
- **Error bodies don't match the spec.** It documents `{detail}`; the live API
  returns `{error: "Unknown icaKey"}` with a *string* `error`. `apiError`
  accepts every shape.
- **Models are sorted by id and name, never vendor metadata.** `owned_by` is
  always `"ica"`, and tags are ignored because one plausibly reading
  `openai-compatible` would mis-badge a watsonx model. The result screen reports
  the key's total model count and any models outside the three providers.
- **`stream_options` is not sent to ICA.** Its spec does not list it, and a
  strict validator would 400 the whole chat over a cosmetic field, so token
  counts appear only if ICA sends them unasked.
- **Wire format is per credential, not per provider.** `Credential.wire` picks
  the adapter (`adapterFor`), `Credential.baseUrl` the endpoint, which is how
  Claude and Gemini run over ICA's OpenAI-format endpoint while still theming as
  themselves. The OpenAI adapter skips its `gpt|o\d` allowlist when `baseUrl` is
  set, or it would strip the Claude and Gemini models before they are sorted.
- **Verified before overwrite.** The key is checked against ICA first; a provider
  it offers no model for keeps its existing connection, and the modal says so.
- **Credit usage is not readable with an API key (2026-09-25).** ICA's Settings →
  Usage page reads `GET https://servicesessentials.ibm.com/services/integrations/team/{teamId}/budget`
  — max/soft/spent Advantage Credits for the user and the team, reset time,
  `blocked`, and the `freeModels` list. Everything under `/services/integrations/`
  sits behind one auth gate (even nonexistent paths return 401), and a **valid**
  ICA API key is refused as both `Authorization: Bearer` and `X-ICA-API-Key` — it
  trusts only the signed-in web session. Not worked around: a session token
  expires and carries the user's full ICA identity; estimating credits locally
  would need ICA's per-model prices and would miss usage from other tools.
  ICA-connected Dashboard cards link to Settings → Usage instead, **derived from
  the connection's base URL** (`icaUsageLink`), never looked up: web host = API
  host without `api.`, web path = whatever the API path has before `/v1`, plus
  `/settings/usage`. Global → `servicesessentials.ibm.com/settings/usage`
  (confirmed from the address bar); Global beta →
  `nextgen-beta.ica.ibm.com/ica/settings/usage` (same rule — beta's `/ica` API
  prefix is also its web prefix). A probe cannot confirm a tab: everything under
  `/settings` answers with the sign-in redirect, even nonexistent paths. Direct
  connections keep their placeholder bars.
- **Ten ICA instances exist** (`GET /services/users/navigation`): Global, Global
  ICA 2.0 [Beta], Australia, Canada, India, Japan, REMEA, Singapore, UKI, USA.
  Only Global and beta have their API at `api.<web host>`; the regional ones
  don't (`api.canada.ica.ibm.com` is NXDOMAIN, and every Canada path bounces to
  `/ica/launchpad`). Their API URLs are unknown — any `*.ibm.com` base still
  connects, named by its host.
- **No workaround via LiteLLM (checked 2026-09-25).** `GET /services/users/profile`
  (also session-only) confirms the gateway is LiteLLM (`LiteLLMModelGatewayImpl`)
  and that the budget's team id is the team's `model-gateway` teamId — so the
  credit budget is a **LiteLLM team budget**. LiteLLM's self-service spend routes
  (`/key/info`, `/team/info`, `/user/info`, `/spend/logs`…) would expose it, but
  the edge proxy forwards only `/v1/*` to LiteLLM (bare `404 page not found` from
  the edge vs LiteLLM's `{"detail":"Not Found"}`), so they are unreachable. The
  profile's `teams[].id` is where the web app gets the team id.
- **Planned when the budget endpoint accepts API keys:** every ICA card shows the
  same two bars — `userAdvantageCredits`/`userMaxAdvantageCredits` and
  `advantageCredits`/`maxAdvantageCredits` — yellow from `softAdvantageCredits`,
  red at the cap or when `blocked`, with `resetInSeconds`; and `freeModels`
  marked free in the model selector. Needs a way to find the team id, or a
  key-scoped endpoint that needs none.
- **What answered, not just what was asked for (2026-10-26).** ICA lists
  models a user may not be approved for, and LiteLLM can fall back to another
  model on its own. Each reply's footer shows the model its response names:
  `✓` when it matches the selected one (dated, vendor-prefixed and Bedrock
  spellings count as a match), amber `asked for X · answered by Y` when it
  doesn't, `unconfirmed` when the response names none. The dev server also
  logs every chat request as `[ica] asked X · status · answered Y` plus any
  `x-litellm-*` model, fallback and api-base headers. A gateway can echo the
  requested name, so `✓` is ICA's word, not proof; a mismatch is the signal.

### Bob in the chat

**ICA only, for now.** Models connected through ICA are offered the MCP tools
as OpenAI-wire `tools`; direct Claude, ChatGPT and Gemini keys are not (their
wires would each need their own tool encoding). Chain:

```
Home ─> useChat tool loop ─> /bob-api (dev server) ─> mcp/server.mjs ─> scanner | bob run
```

- **The loop** (`src/lib/useChat.ts`): stream; if the model stops to call
  tools, run **all of that turn's calls together** through `/bob-api/call` —
  that is the fan-out; the server queues Bob runs past three — append the
  round (`assistant` with `tool_calls`, then one `tool` message per call) and
  stream again. Capped at 6 rounds and 16 tool calls per reply. Usage sums
  across rounds. Stop aborts every in-flight call, which kills the Bob runs.
- **The model leads a team of Bob roles** — explorer, verifier, implementer,
  reviewer; see "Orchestrating Bob" below. The playbook is the server's MCP
  `instructions`, and the chat puts the same text in `system`, so the chat and
  Claude Code orchestrate the same way.
- **Rounds live only inside one reply.** What survives is `Turn.facts` — the
  verbatim tool results, i.e. `groundedFacts[]`. Every later request carries
  them in `system` (`groundingPrompt` in `src/lib/bob.ts`), deduped by tool +
  args, **whatever the provider** — so a switch mid-thread keeps what Bob found
  without translating any vendor's tool messages.
- **The Bob intro** (which repo, "use the tools rather than guess", the
  playbook) goes in `system` only when tools are actually offered. Facts over
  12k characters — a diff, a long report — are clipped on replay.
- **A model the gateway refuses tools for** (400/422 naming tools or
  function calling) is retried once without them, with a note, and remembered
  in `localStorage["orchestrator.noTools.v1"]` — checked *before* the
  unsupported-model rule, which would otherwise drop it from the catalog.
- **Traces** render inline as tool calls (`BobTrace` in `Home.tsx`): the role
  (`Bob · explorer`) or tool, its task, the outcome — citations checked, the
  reviewer's verdict, the diff's size — who answered and how long; open for
  arguments, the exact result the model saw, security level, redactions, Bob's
  cost and task id. Each sits where the call happened (`Fact.at`). A change's
  latest trace carries **Apply to my files** and **Discard**.
- **Security is shared.** One level, in `mcp/settings.local.json`, governs both
  server copies (the dev server's and Claude Code's). Vite's watcher ignores
  that file — watching it reloaded the page on every change.

Verified with a scripted model in headless Chrome against the real server:
tools offered, tool call streamed and reassembled, scanner answered, result
replayed, fact carried into the next turn's `system`; refusal retried without
tools and remembered. With real Bob (2026-10-26): explorer and verifier in
parallel, implementer, reviewer, Apply — all from the page. **Not yet
verified: a real ICA model's tool calls** — see Open items.

### Orchestrating Bob

The orchestrator plans, splits, reconciles and answers; Bob roles read and
change the code. Four universal roles (`mcp/roles/custom_modes.yaml`),
installed as a Bob plugin and differing by stance and permission, not topic:

| Role | May | Returns |
|---|---|---|
| explorer | read | findings, each with `file:line` + quote |
| verifier | read | per claim: confirmed / refuted / unclear, with evidence |
| implementer | read, edit — in its own git worktree | summary, decisions, open questions; the server adds the diff |
| reviewer | read — in that worktree | approve / changes_requested, issues as blocker / major / minor |

- **The model decides the fan-out**, guided by the playbook: independent
  questions as parallel `delegate` calls; a verifier when a finding decides the
  next step or two answers disagree; `implement_change` → `review_change` →
  revise with the blocker and major issues, at most three rounds.
- **Citations are checked, not trusted.** The server checks every `file:line`
  against the code and marks the ones that fail; the trace says how many held.
- **Follow-ups resume the same agent** (`bob run --resume`), so a second
  question or a revision round doesn't re-read the repo.
- **Only the user applies a change.** Applying is a server method reached by
  the page's buttons, not a tool. It lands as uncommitted edits.

Mechanics — flags, worktrees, shadowed modes, git hooks — are in
`mcp/README.md`.

### Planned: hosted auth and key storage

Users will sign in with **Google or Apple**, and keys will live in **Supabase**
rather than `localStorage`. `LoginModal`'s provider buttons are the placeholder
for that flow.

One fork to settle before building it — Supabase solves *sync and auth*, not
*exposure*:

- **Keys fetched down to the browser.** Supabase becomes a synced vault and the
  adapters stay exactly as they are. But the key still sits in the page at call
  time, readable by any script on the origin — no better than today on that axis.
- **Keys never leave the server.** Provider calls move behind a Supabase Edge
  Function. Real isolation, and it drops the CORS constraints that shaped the
  adapters (`anthropic-dangerous-direct-browser-access` stops being needed, and
  the Admin API becomes reachable, so workspace ids could be discovered instead
  of pasted). The cost is owning a streaming proxy: SSE has to be relayed rather
  than read directly, and the per-vendor quirks move server-side with it.

Only the second actually protects the key. Whichever is chosen, the keys table
needs row-level security scoped to the owner — a vault with permissive RLS is
worse than `localStorage`, because one policy mistake leaks every user's keys at
once rather than one user's.

---

## Layout & conventions

- **State-based routing** in `src/App.tsx`. No react-router.
- **ES-module image imports**, never string paths — required for Vite
  production builds.
- **Default exports** for components.
- **Double quotes** for strings containing apostrophes.
- Shared layout width: `max-w-[880px] mx-auto` across pages.
- Run `npx tsc --noEmit` after changes.

### Key files

| Path | Role |
|---|---|
| `mcp/server.mjs` | MCP stdio server — protocol, version negotiation, dispatch |
| `mcp/repo.mjs` | Tool surface, source scanner, the role tools and the playbook |
| `mcp/bob.mjs` | Bob Shell runs: flags, parallel queue, resume, shadowed-mode check |
| `mcp/roles.mjs` + `mcp/roles/custom_modes.yaml` | The four roles, their install as a Bob plugin, report parsing and citation checks |
| `mcp/changes.mjs` | The implementer's worktrees, and applying or discarding a change |
| `mcp/workspace.mjs` | Which repo the server works in: switching, validation, recents, the native folder dialog |
| `mcp/redact.mjs` | Outbound redaction and forbidden paths, per security level |
| `mcp/settings.mjs` | The shared security level (`mcp/settings.local.json`) |
| `.mcp.json` | Registers the server with Claude Code for this repo |
| `vite.config.ts` | Dev-server plugins, including the `/ica-gw` forwarder and the `/bob-api` bridge |
| `src/lib/bob.ts` | The page's client for `/bob-api`, facts, grounding prompt, `useBob()` |
| `src/App.tsx` | Control surface shell |
| `src/pages/` | Home (Connect Claude), Context (session history), Bob (setup, security, skills) |
| `src/lib/themes.ts` | Theme tokens — one fixed theme now, the rest kept but unused |
| `archive/chat-app-2026-09-22/` | The retired multi-provider chat app, complete and buildable |

---

## Theming

Active provider + dark mode resolve to a `ThemeVars` object applied as inline
CSS custom properties on the app root:

`--bg` `--fg` `--card` `--surface` `--border` `--muted` `--accent`
`--accent-fg` `--user-bubble` `--user-bubble-fg` `--font-body`

| | Claude | ChatGPT | Gemini |
|---|---|---|---|
| Base | warm serif light | black / white | dark only, radial glow |
| Body type | Lora (serif) | Inter | Inter |

**Controls stay sans-serif in every theme**, Claude included. Serif is for
conversation text only — it reads mushy at control sizes.

### Constant across themes (app identity — do not let a theme move these)

Sidebar and its divider, dashboard layout, account dial, model selector, Bob's
trace treatment.

### Transition

1. Thread fades out (300ms)
2. Incoming provider's 72px badge fades in, centered
3. Theme swaps underneath while covered
4. Thread fades back in (300ms)

- **250ms minimum hold** — a floor, not a fixed duration
- **Progress bar only after 400ms.** If it appears immediately every switch
  looks slow. Bar uses the *incoming* theme's accent.
- Respects `prefers-reduced-motion`

**Do not unmount the runtime provider during a swap.** Once assistant-ui is
wired in, `<AssistantRuntimeProvider>` must sit at layout level above the theme
boundary, or thread state and in-flight streams are lost.

The hold is deliberate pacing for a manual dial switch — thread state is
already in memory. For a **session resume** the load is real and the bar is
honest. Unless persistence reports real progress, ease to ~80% and snap to
100%.

This stays true only while the handoff summary is precomputed. Summarize at
switch time instead and the bar stops being pacing and becomes a real wait —
see Provider handoff.

---

## Pages

### Dashboard (`src/pages/Dashboard.tsx`)

Connected-provider usage cards. `Active account` selector left, `Connect AI`
right. Faded corner mark, top right, rotates clockwise on account switch.

**Usage limits differ per provider:** Claude = 5h + monthly. ChatGPT = 5h +
weekly. Bar color by consumption: green `<60%`, yellow `60–85%`, red `>85%`.
Clicking a row reveals its reset time. Clicking a card opens edit-key / delete.

### Home (`src/pages/Home.tsx`)

The chat surface — **live**. Streams from the active provider, per-message
avatars, Enter to send, Shift+Enter for a newline, stop button mid-stream.
Composer carries the **account dial** (bottom left — connected providers as
icon circles, plus a dotted `+` circle; hold and swipe to switch) and the
**model selector** (bottom right, the active provider's live catalog only).

An assistant turn with no text yet renders a **thinking indicator**. This is
not decoration: with adaptive thinking on by default, a model can be silent for
seconds before the first token, and an empty bubble reads as a hang.

Errors render as a red bubble carrying the provider's own message — never a
silent failure.

`navigator.vibrate()` is mobile-only. Desktop needs a visual or audio
substitute for the tick.

Two states: nothing connected → connect prompt; connected → chat. **Bob is not
required to chat** — the orchestrator works standalone and Bob layers on later.

Bob calls render inline as collapsible **trace rows**, same look in every
theme — see "Bob in the chat". The thinking dots show only while waiting on
the model, not while a Bob call's own spinner is running.

Switching provider with an active thread opens a **pre-switch confirm**, and
the dial is **locked while a reply is streaming** — see Provider handoff.

### Context (`src/pages/Context.tsx`)

Session history. Each row: title, summary, timestamp, message count, Bob usage
(calls + tokens). Provider badges right, **oldest → most recent, no arrows** —
earlier providers at 55% opacity, resume target larger with an accent ring.
Rows resume into Home **on the session's last-used provider**, firing the theme
transition automatically when it differs from the active one.

Needs a **pending state** for sessions closed but not yet summarized (first
user message as stand-in title).

### Bob (`src/pages/Bob.tsx`)

Live status and config, from `useBob()` (`src/lib/bob.ts`), which re-checks on
window focus — installing Bob or exporting a key happens in another window.

- **Status button** — a fact about the machine, so clicking re-checks rather
  than toggles: **Connected** (Bob installed and keyed) / **Scanner only**
  (server up, Bob not ready — the endpoint tools still answer) / **Not
  connected** (bridge unreachable, e.g. a build without the dev server)
- **Status rows** — orchestrator server version and tool count, Bob Shell
  version and whether `BOB_API_KEY` is set, the roles plugin, the repo Bob reads
- **Repository picker** — **Choose folder…** (the OS's own dialog, opened by
  the server), recent folders, or a pasted path; switches without a restart.
  The chat composer shows the current repo and links here. Mechanics and the
  refused folders are in `mcp/README.md`
- **Changes** — the implementer's open changes for this repo, with Apply and
  Discard
- **Setup steps**, ticked as they complete: install Bob Shell; create an
  Inference key and export it in `~/.zshrc` (never pasted into the app);
  `bob chat` once for the license; then ask
- **Security level** — single-select cards, default Restricted, written to the
  server (`POST /bob-api/security`). Copy describes what `mcp/redact.mjs`
  actually does:
  - **None** — results pass straight through
  - **Restricted** (recommended) — keys, tokens, JWTs, private keys and
    `KEY=value` secrets redacted, enforced by the server
  - **Private** (strictest) — a result that needed any redaction is withheld
    whole. The AST pass is planned, and the card says so
- **Bob skills** — marked Preview; still mock. Toggleable list with edit;
  `Add skill` opens `AddSkillModal`

### AddSkillModal (`src/components/AddSkillModal.tsx`)

Name field. **Edit manually** (description + specific instructions) or **Draft
with AI** (pick a connected provider, prompt for a draft description, editable).
Draft-with-AI is hidden when editing an existing skill.

---

## Pivot to MCP

> The chat app was archived on 2026-09-22 and **relaunched on 2026-09-24**, so
> the Live API layer, Provider handoff, Dashboard and Home sections below again
> describe live code.

### Why

API keys work — Gemini proved the app end to end. The problem was never
technical: it is that a user must buy API credit **on top of** a subscription
they already pay for, and no sanctioned path exists to spend the subscription
instead. Anthropic closed that door explicitly on 2026-02-20 (see Decisions).

Running **inside** the first-party client inverts the problem. The model's
inference bills to the user's own Plus/Pro/Max plan, because the client is
Claude or ChatGPT itself. No API keys, no second bill, no terms problem.

This is a smaller move than it looks: the orchestrator was always designed as
an MCP client talking to our MCP server. **We delete the client half and ship
the server** — the part that was never built.

### Communication chain (was)

```
User
  └─> Orchestrator model (Claude / GPT / Gemini)   [MCP client — OUR chat app]
        └─> Wrapper service                        [MCP server]
              └─> Bob, headless CLI
```

### Communication chain (now)

```
Claude Code / Claude Desktop / ChatGPT            [MCP client — THEIRS]
  └─> Orchestrator MCP server                     [stdio local, or HTTPS remote]
        └─> Bob, headless CLI                     [NOT MCP — process invocation]
              └─> the user's repo
```

### The constraint that shapes deployment

**ChatGPT connects only to *remote* MCP servers over HTTPS** — no local stdio.
Claude Desktop and Claude Code support both. Bob must run locally, beside the
repo and the git credentials, so reaching it from ChatGPT needs a hosted HTTPS
endpoint tunnelling down to the local agent.

That is precisely the outbound-only deployment already on record below, chosen
for security reasons. It turns out to be the same shape ChatGPT requires —
build stdio first (fastest loop, no tunnel), add HTTPS second.

### What survives, and what does not

| Survives | Does not |
|---|---|
| Bob gateway and the repo tool surface | The chat surface (`Home`) |
| Security levels — now genuinely load-bearing, since payloads leave for someone else's model | Three-theme system and the provider dial |
| Bob skills config | Mid-thread provider switching |
| Web app as dashboard / history / settings | Theme transition |

Losing the theme system is the real cost: without an active provider in a
thread there is nothing for a theme to follow. That work does not transfer.

### Multi-provider is not lost, only mid-thread switching

Every MCP client speaks the same protocol, so one server serves Claude Code,
Claude Desktop, ChatGPT and Gemini CLI alike. The interesting half of the
handoff design survives too: expose the provider-neutral task record as
`save_task` / `resume_task` tools and a user who exhausts one client can resume
in another — the verbatim-tail-plus-summarized-head design, working across
clients we do not control.

### Hard constraints

- **Bob is an MCP client, not an MCP server.** Config lives in
  `.bob/mcp.json` (project) or global settings, standard `mcpServers` shape.
  Transports: STDIO, Streamable HTTP (preferred for remote), SSE (legacy).
  Bob Shell does have one server mode — `bob acp`, the Agent Client Protocol —
  the structured fallback if `bob run` proves too loose.
- **The "Bob gateway" is custom code**, not a Bob feature — an MCP server we
  write that shells out to Bob Shell's `bob run --format json` (prompt on
  stdin, read-only flags) and returns `last_message` as the tool result. Bob
  Shell needs `BOB_API_KEY` (an Inference key from bob.ibm.com) in its
  environment and fails fast without one. Details in `mcp/README.md`.
- **Headless Bob pre-approves every tool.** What a run may do is therefore
  imposed by flags: execute, mcp, mode, subtask, subagent and workflow are
  always disabled, and edit too except for the implementer, which only ever
  runs in its own worktree. The role's mode is the ceiling; the flags are the
  boundary.
- **The wrapper→Bob hop has no protocol guarantees.** Every other leg is real
  MCP; this one is process invocation. Expect iteration.

### Repo MCP server tool surface

`list_endpoints()` · `get_endpoint_contract(route)` · `search_endpoints(keyword)`
· `diff_route(old, new)` · `delegate(role, task, follow_up?)` ·
`implement_change(task, change_id?)` · `review_change(change_id, focus?)`

The listing tools answer from the source scanner even with Bob present —
exhaustive, instant, free. `get_endpoint_contract` returns the scanner's facts
and then an explorer's reading of the contract. The Bob tools are listed only
when Bob is installed, and the change tools only when the repo is under git.

### Deployment for public launch

Outbound-only, agent-on-user-machine. **Never inbound SSH from the hosted app** —
a central service holding SSH keys to many user VMs turns one breach into a
breach of every connected user's infrastructure.

1. User installs a local agent (wrapper + headless Bob) where the repo and
   git/SSH credentials already live
2. That agent opens a persistent **outbound** connection to the hosted app,
   authenticated by a per-user token
3. The hosted dashboard reaches the agent through that tunnel
4. Browser is control surface only — login, keys, usage, skills

Same pattern as Tailscale / Cloudflare Tunnel / self-hosted CI runners.

### Session summaries

Generated server-side on session close.

**Tab close cannot generate the summary directly** — the browser tears the page
down before a model call completes, and `beforeunload`/`unload` are unreliable
(mobile Safari and Chrome skip them when the OS kills a backgrounded tab).

1. Client listens for `visibilitychange → hidden` and `pagehide` (**not**
   `beforeunload`), fires `navigator.sendBeacon()` with just the session ID
2. Server summarizes asynchronously from persisted thread data

Edge cases: beacons get missed (sleep, crash, force-quit) — add a server-side
sweep for idle sessions. `visibilitychange` fires on every tab switch — make
the endpoint idempotent or burn a model call each time someone tabs away.

---

## Provider handoff (context continuity)

Switching provider mid-conversation is the app's signature gesture, and it is
where thread state is most at risk. Two things cross a switch: what the new
model is **told**, and what the user is **shown**.

### Verbatim tail, summarized head

The thread replays **exactly as it was from the last user prompt onward**.
Everything before that is folded into a structured summary.

- The tail is usually plain text, so it needs little or no cross-vendor
  translation — which is the expensive part (see Decisions).
- The head becomes a provider-neutral record: prose and string arrays, no
  vendor message objects, so there is nothing to convert.

Boundary rule: the verbatim window opens at the most recent `role: "user"`
message and runs to the end of the thread. Switch immediately after sending a
prompt and that single message is the whole tail.

### The handoff record

Provider-neutral by construction — no tool-call blocks, no system prompts, no
reasoning blocks:

| Field | Holds |
|---|---|
| `summary` | Dense prose of the folded head |
| `keyDecisions[]` | Decisions already made |
| `taskProgress` | Done / pending / next steps |
| `groundedFacts[]` | **Bob trace results** — endpoint contracts, callers, diffs |
| `activeEntities[]` | Files and symbols in play |
| `fromProvider` | Provider the thread is leaving |
| `messageCount` | Messages folded into the summary |
| `generatedAt` / `expiresAt` | Freshness window |

`groundedFacts` is ours, not borrowed. Bob's trace results are the product —
they must survive a switch intact rather than be paraphrased into the summary,
where "expects a `token` field" softens into "discussed the login contract."

### Keep the summary rolling; do not generate it on switch

The boundary moves every turn and a dial switch can land at any moment, so
maintain the summary **incrementally as turns settle** — fold each newly
completed turn into the existing summary rather than re-summarizing from
scratch. The handoff is then already warm when the dial moves.

Debounce it, and make generation idempotent. Same failure mode as the
session-summary beacon below: no guard, and every turn burns a model call.

### Injection point is vendor-specific

The record is neutral; where it lands is not. Getting this wrong is a hard API
error, not a soft degradation:

| Target | Where the handoff goes |
|---|---|
| Anthropic Messages | **Top-level `system` parameter**, appended after any existing prompt. A `role: "system"` entry at `messages[0]` is *rejected* |
| OpenAI Responses | Prepended into `instructions` |
| OpenAI chat completions | Unshifted as `role: "system"` at index 0 |

Wrap the payload in a tagged envelope rather than loose prose, and escape the
values.

### Confirm before switching

**A switch is lossy, so it is consented to — not announced.** The user chose to
switch; silently degrading their thread is a regression they did not ask for,
and a notice that arrives *after* the fold is too late to act on.

`SwitchConfirmModal` — same treatment as `SignOutModal` (dimmed backdrop,
`var(--card)`, 0.5px border, 200ms fade). It fires **before** the theme
transition, so it renders in the **outgoing** theme; the incoming provider
appears only as its badge.

State the trade in the user's terms, not the system's:

> **Switch to Gemini?**
> The last 3 messages carry over word for word. The 18 before them are
> summarized, and some detail may be lost.
>
> `Cancel` · `Switch`

Rules:

- **Only when there is something to lose.** An empty or single-turn thread
  switches straight through — do not nag on a fresh conversation.
- **Resuming a session from Context is not a switch.** It opens a thread on its
  own last-used provider; no context is being abandoned, so no confirm.
- Cancelling leaves the dial where it was and fires no transition.
- Repeat switching is a real workflow — offer `Don't ask again this session`,
  scoped to the session only. Never persist it: the next session is new context
  to lose, and consent to one fold is not consent to all of them.

### No switching mid-reply

**The dial is locked while an assistant reply is streaming.** A switch fired
mid-turn either strands a half-finished message in the thread or drops it, and
neither is worth supporting when the wait is seconds.

While streaming:

- Provider badges are **disabled** and dimmed, `aria-disabled`, pointer events
  off, with the reason on hover — "Wait for the reply to finish."
- The **active** badge stays lit and takes a slow `pulse-bar` — the same
  in-progress vocabulary as Bob's amber status dot and Context's pending rows.
  It should read as busy, not broken.
- Under `prefers-reduced-motion` `index.css` suppresses the pulse globally, so
  the dim and the cursor carry the signal alone. **Do not rely on motion to
  communicate the lock.**
- The dotted `+` circle stays **enabled** — connecting another provider does
  not change the active one.

Block the drag, not just the click. `AccountDial`'s hold-and-swipe sets preview
state in `onPointerDown`, so the guard belongs there too, or the dial still
tracks under the finger while locked.

The lock releases when the turn closes; the confirm above takes it from there.

---

## Decisions on record

**Protocol: MCP, not A2A.** A2A (Linux Foundation, v1.0 April 2026) is
agent-to-agent where MCP is agent-to-tool, and the orchestrator→Bob link is
philosophically agent-to-agent. But the model APIs accept remote MCP servers
natively (Anthropic's `mcp_servers` parameter) and have no A2A equivalent —
adopting A2A means building an agent runtime, not swapping a layer. Bob speaks
MCP and not A2A. Revisit if third-party agents ever participate, or for signed
Agent Cards as a local-agent identity mechanism at public launch.

**Mid-task provider switching: own the task record, don't adopt A2A for it.**
The expensive part isn't transport, it's translating between vendors'
representations of tool calls, system prompts, and reasoning blocks — A2A
standardizes the container, not the conversion. Keep a provider-neutral task
record in persistence; shape it so an A2A adapter could sit on top later.

**Confirmed against prior art.**
[OmniRoute](https://github.com/diegosouzapw/OmniRoute) (MIT, © 2026
diegosouzapw) is a multi-provider gateway that hits this same problem on
automatic failover, and lands on the approach above. It does **not** replay
history across vendors — it generates a structured summary
(`summary` / `keyDecisions` / `taskProgress` / `activeEntities`) and seeds the
new provider with it, precomputed at 85% quota so the switch is never blocked
on a model call. Its `open-sse/translator/` tree (87 files) is a good inventory
of the tax we avoid by not replaying: Anthropic requires each `tool_result` to
immediately follow its matching `tool_use`; system-message hoisting must return
an identical array reference when nothing changes or it breaks prompt-cache
prefixes; Gemini has no tool-call IDs to pair.

We diverge on one point, and it drives the design above. Their trigger is quota
death — total loss is the alternative, so a lossy summary always wins and needs
no disclosure. **Ours is a user gesture**, which is why we keep a verbatim tail
and mark the switch in the thread.

**Ship as an MCP server, not a chat client (2026-09-22).** The blocker was
cost of adoption, not capability: users must buy API credit on top of a
subscription. Running inside Claude or ChatGPT moves inference onto the plan
they already pay for. It costs the chat surface and the theme system, and
returns Bob — the thing with actual unique value — to the centre of the
product. Multi-provider survives as "any MCP client connects"; only mid-thread
switching is given up.

**Privacy filtering is a boundary, not a policy.** A prompted skill (Restricted
mode) is a policy — LLMs are unreliable filters of themselves, and code leaks
through explanations, traces, and variable names. Private mode's AST pass plus
secret scanning is the actual boundary. Note the split: AST is *structural*
(reliably separates bodies from signatures) and cannot itself recognize that a
string is an API key — that's entropy and pattern matching (gitleaks,
trufflehog, detect-secrets). Diffs and traces have no AST; only the scanning
stage covers them. **Fail closed** on scanner error or timeout.

**Bob in the chat: ICA first, facts in `system` (2026-09-29).** Tools go only to
ICA-connected models — one wire (OpenAI) to encode, and the connection the
user actually works through. Tool rounds are never replayed across providers;
their results are, as verbatim facts in `system`, which every wire accepts
unchanged. That keeps the canonical thread text-only (see Provider handoff) and
still lets a switch carry what Bob found. One security level is shared by every
server copy, so the page cannot say Private while Claude Code runs None.

**Orchestrating Bob: four roles, model-led, user applies (2026-10-26).** The
orchestrator fans work out to Bob roles rather than asking one generic Bob.
Roles are Bob custom modes, so a role's permissions are enforced by Bob and not
just requested; they ship with the app as a Bob plugin and are universal —
stance and permission, not topic. An implementer exists, but its work is always
critiqued by a separate reviewer, and it works in a git worktree so the user's
checkout is never written by Bob. The model performs the fan-out (one owner of
orchestration — Bob's own subagents stay disabled); applying a change is the
user's decision alone, so it is not a tool.

**Choosing a repo: the agent on that machine picks, never the browser or SSH
(2026-10-27).** Bob needs a real path, which only a process on the machine
holding the code can see — a browser folder picker yields a handle, not a path.
So the folder dialog is the OS's own, opened by the local server; the page only
asks. Generalised for launch: one agent per machine (laptop or VM), each
serving only folders its own user added there; the app chooses among them,
never adds one. A VM gets its own agent; the hosted app never SSHes anywhere
(see Deployment). SSH is acceptable only from the user's machine with their own
keys, to bootstrap that agent — the VS Code Remote-SSH pattern. One repo per
conversation: facts carry the repo they came from and replay only there.

**Token savings are cost-shifting, not efficiency.** Total tokens across all
systems likely *increase* — Bob does more work, including summarizing on the
orchestrator's behalf. What drops is spend on the metered frontier model,
mainly by not loading raw files into context and by killing guess-and-check
failure loops. Watch two regressions: lossy summaries causing extra round
trips, and small single-file tasks where routing through Bob costs more than a
direct read. No measured numbers yet — get them by running representative
migration tasks with and without Bob and comparing orchestrator tokens per
completed task.

---

## Open items

- [x] ICA wired from the OpenAPI spec, with the dev-server proxy
- [x] ICA: real connect confirmed — same models as the coding-agent keys
- [ ] ICA: check whether streamed responses carry usage; enable
      `stream_options` if ICA accepts it
- [x] ICA: single ICA API key; coding-agent keys compared and dropped
- [ ] ICA in a deployed build needs a real server-side proxy, not Vite's
- [x] Effort via ICA: `reasoning_effort` is honored — Extra high thinks longer
- [ ] ICA budget endpoint for API keys — requested from the ICA team; wire the
      credit bars and free-model tags when it lands
- [x] MCP server: stdio transport, tested against Claude Code
- [ ] MCP server: Streamable HTTP + outbound tunnel, which is what unlocks ChatGPT
- [ ] `save_task` / `resume_task` as MCP tools, carrying the handoff record
- [x] Chat surface archived to `archive/chat-app-2026-09-22/`; the live app is
      now the control surface (Connect Claude, Context, Bob)
- [ ] Confirm Bob headless auth works with the IDE fully closed
- [ ] Wire assistant-ui runtime
- [x] Bob traces render as **tool calls** — hand-built `BobTrace`, inline at
      the point of the call
- [x] **Real Bob run** (2026-09-29, Bob Shell 2.0.5) — read-only flags
      accepted, no `--trust` needed, license accepted by the user in `bob
      chat`. `ask_bob` ~12 s, Bob-backed `get_endpoint_contract` ~27 s. Asked
      to write a file and run `touch`, Bob refused and neither happened; its
      toolset was read_file, list_files, glob, grep, office_read, use_skill
      and IBM docs search. Dropping the request kills the `bob run` child
- [ ] Claude Code's server copy needs VS Code fully relaunched to inherit
      `BOB_API_KEY` — the extension host's env is fixed at app launch
- [ ] Optional per-call cap via `bob run --max-cost` — the unit of
      `session_costs` is undocumented in `--help`; find it before picking a
      default
- [x] **Bob roles** (2026-10-26) — explorer, verifier, implementer, reviewer as
      a Bob plugin; parallel `delegate`; implement → review → revise → apply,
      verified end to end with real Bob from the page
- [x] **Repo picker** (2026-10-27) — native folder dialog, recents, pasted
      path, runtime switch, per-repo fact replay; validation verified
- [ ] The native dialog itself, clicked by a person (macOS `osascript`;
      zenity and PowerShell paths untested)
- [ ] For launch: an agent per machine (laptop or VM) serving only folders
      added there; **Clone from URL** into the agent's workspace folder; the
      Remote-SSH bootstrap of a VM agent from the user's machine
- [ ] Threads bound to a repo once threads persist — today facts carry their
      repo, but the thread itself doesn't
- [ ] Server-run checks: the implementer can't run commands, so run a
      configured build/test command in the worktree after each round and hand
      the result to the reviewer
- [ ] Live progress per role from `bob run --format stream-json`
- [ ] **ICA tool passthrough** — confirm real ICA models return
      `tool_calls`, per vendor (Claude, Gemini behind ICA may differ); the
      refusal fallback is built but unexercised against the real gateway
- [ ] Bob honors `.gitignore`, `.bobignore` and always `.env`, but not the
      scanner's other forbidden paths (`*.pem`, `.ssh/`…) unless the repo
      ignores them. Mirroring the list means writing a `.bobignore` into the
      user's repo (worktrees get one free) — decide before doing it
- [ ] Tools for direct keys: Anthropic `tool_use`/`tool_result` and Gemini
      `functionCall`/`functionResponse` encodings, behind the same loop
- [ ] Provider-neutral task record in persistence — schema in Provider handoff
- [ ] Rolling summary: incremental fold, debounce, idempotency guard
- [x] `groundedFacts` capture — tool results kept verbatim on `Turn.facts` at
      emit time and replayed in `system`, so the fold cannot paraphrase them
      away. Persisting them is part of the task-record item
- [x] `SwitchConfirmModal` — session-scoped "don't ask again", renders in the
      outgoing theme. Copy describes today's behavior (full history carries
      verbatim); revise it when the fold lands
- [ ] Per-vendor injection adapters (Anthropic top-level `system`, Responses
      `instructions`, chat `messages[0]`)
- [x] Dial streaming lock — disabled badges, active-badge pulse, drag guard in
      `onPointerDown`, `+` circle stays live
- [ ] **The fold is not built.** Every switch replays the whole thread verbatim
      — correct and lossless for short threads, but it will hit context limits.
      Implement verbatim-tail + summarized-head per Provider handoff.
- [ ] Decide the Supabase key-storage fork (browser-fetched vs Edge Function
      proxy) before wiring Google/Apple sign-in — it decides whether the
      adapters stay client-side
- [ ] Re-validate stored keys on load — verification happens at connect time,
      so a key revoked or drained afterwards still fails at prompt time
- [ ] Live usage/quota on Dashboard — figures there are still placeholder
- [ ] Persist threads; Context is still mock history, and resume only switches
      provider rather than loading a conversation
- [ ] Private mode: AST pass + secret scanner, fail-closed
- [ ] Define the "Bob tokens" metric precisely — Bob's own model consumption
      (billed by IBM) vs. tokens Bob's output adds to the orchestrator's
      context (billed against the user's quota). The second is the useful one
      given the dashboard's quota orientation.
      Bob Shell 2.0.5 reports neither: its stats are `session_costs`,
      `max_cost`, `tool_calls` and `duration_ms`, which is what traces show.
      The second is the tool result's size in the orchestrator's input.
- [ ] Desktop substitute for the haptic tick
- [ ] Pending-summary row state in Context
- [ ] **Brand review before public launch.** Provider marks are trademarked,
      and the theme system is a close visual imitation of three products —
      trade dress, not just logos. Current build uses original geometric SVGs
      for Claude/Gemini and user-supplied images for ChatGPT/Bob; the supplied
      images need clearing against each vendor's brand guidelines, or replacing
      with original marks, before this ships publicly.