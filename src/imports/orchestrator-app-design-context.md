# Orchestrator App — Design & Architecture Context

Working document capturing everything decided so far. Source of truth for the
first UI demo.

---

## 1. What the product is

A hosted app that lets a user drive a high-capability "orchestrator" model
(Claude / ChatGPT / Gemini) which, in turn, consults **Bob** — IBM's coding
agent running locally against the user's repo. Bob supplies grounded,
filtered context about the codebase so the orchestrator plans against facts
instead of guesses.

Origin case: the AI Tools 3.0 UI migration, where API endpoint mismatches had
to be found by hand through browser inspection. A repo-aware MCP layer removes
that guess-and-check loop.

---

## 2. Architecture

### Communication chain

```
User
  └─> Orchestrator model (Claude / GPT / Gemini)   [MCP client]
        └─> Wrapper service                        [MCP server]
              └─> Bob, headless CLI                [NOT MCP — process invocation]
                    └─> Repo MCP server            [MCP server]
```

### Key constraints discovered

- **Bob is MCP client only.** It has no native server mode. Configuration
  lives in `.bob/mcp.json` (project) or global settings, using the standard
  `mcpServers` JSON shape. Transports: STDIO, Streamable HTTP (recommended for
  remote), SSE (legacy).
- **The "Bob gateway" is custom code**, not a Bob feature. It is an MCP server
  you write that shells out to Bob's headless mode (`bob run <prompt>`) and
  returns output as MCP tool results.
- **The wrapper→Bob hop has no protocol guarantees.** Every other leg is real
  MCP; this one is process invocation. Expect iteration here.

### Deployment model (public launch)

Outbound-only, agent-on-user-machine. Never inbound SSH from the hosted app.

1. User installs a local agent (wrapper + headless Bob) on the machine where
   the repo and git/SSH credentials already live.
2. That agent opens a persistent **outbound** connection (WebSocket or
   equivalent) to the hosted app, authenticated by a per-user token.
3. The hosted dashboard reaches the agent through that tunnel.
4. Browser is the control surface only — login, API keys, usage, skills.

Rationale: a central service holding inbound SSH keys to thousands of user VMs
turns one breach into a breach of every connected user's infrastructure. Same
pattern as Tailscale / Cloudflare Tunnel / self-hosted CI runners.

### Privacy boundary

Bob applies summarization and filtering before anything leaves for an external
model. **A prompted skill is a policy, not a boundary.** Ship with the prompted
skill, but track a deterministic filter (AST pass stripping function bodies,
keeping signatures/docstrings; or a hard allow-list on what gateway tools can
return) as a known follow-up before real IP flows through it.

### Repo MCP server tool surface (draft)

- `list_endpoints()` — routes, methods, calling components
- `get_endpoint_contract(route)` — request/response shape, auth, error codes
- `search_endpoints(keyword)`
- `diff_route(old, new)` — contract differences during migration

---

## 3. Tech stack

**assistant-ui** (MIT, React). Headless primitives + runtime; CLI copies UI
source into the repo so everything is editable.

- Runtime owns thread state, streaming, tool calls, approval, branching.
- Bob's trace output **is tool-call rendering** — not custom message
  components. Significantly smaller build than hand-rolling.
- Provider switching lives in the adapter/transport layer, not the UI.
- Ships ChatGPT, Claude, Gemini, Grok, and Perplexity clone examples.

---

## 4. Visual system

### Theming: full clone swap

Each provider theme is a full restyle, not an accent color.

| | Claude | ChatGPT | Gemini |
|---|---|---|---|
| Light bg | `#F0ECE0` | `#ffffff` | — |
| Dark bg | `#2b2a27` | `#000000` | `#131314` |
| Composer surface | borderless | `#212121` | single-row pill |
| Type | serif | sans | sans |
| Assistant avatars | none | yes | none |
| Signature | minimal chrome, no shadows | centered welcome composer, always-visible action bar | blurred radial glow behind centered greeting |

### Constant across all themes (app identity)

- Sidebar, with a clear divider against the page
- Dashboard page
- Account dial (bottom left)
- Provider-filtered model selector (bottom right)
- Bob's centered trace lane

### Clone-owned

Background/surface colors, typography, bubble treatment, composer shape,
assistant avatar presence.

### Resolved conflicts

1. **Avatars** — Claude and Gemini clones are avatar-free; app spec wants a
   profile picture per message. Resolution: keep avatars, accept mild
   deviation.
2. **Composer** — Gemini's pill has a built-in model picker. Strip it; the
   app's dial + filtered selector is the single control row.
3. **Bob's lane** — same structure everywhere, per-clone tokens (serif/cream
   for Claude, mono/dark for GPT).
4. **Controls stay sans-serif** even in the Claude theme. Serif on small UI
   chrome reads mushy.

### Logos

All mockups use plain letter badges (C / G / Ge). Real provider marks are
trademarked; usage rights must be confirmed against each vendor's brand
guidelines before shipping. The clone themes themselves are close visual
imitations — trade dress is worth checking before public launch.

---

## 5. Pages

### 5.1 Dashboard

- Header: `Active account` selector on the **left**, `Connect AI` button on the
  **right**.
- Faded provider mark, top right, rotating clockwise on account switch.
- Provider cards: rounded corners, provider icon left, plan name, usage bars.
- **Usage limits differ per provider:**
  - Claude — 5-hour limit + monthly
  - ChatGPT — 5-hour limit + weekly
- Bar color by consumption: green `<60%`, yellow `60–85%`, red `>85%`.
- Clicking a bar reveals its reset time ("Resets in 2h 14m", "Resets Oct 1").
- Clicking a card opens edit-API-key / delete-connection.

### 5.2 Connect AI popup

- Icons only, no provider names. `aria-label` on each for screen readers.
- Three providers at launch: Claude, ChatGPT, Gemini.
- Close (X) button, top right.
- Selecting a provider advances to its API key entry step.

### 5.3 Home (prompt page)

Three states:

1. No AI connected → prompt to connect (reuses Connect AI popup)
2. AI connected, Bob not linked → Bob MCP setup instructions
3. Fully set up → the chat interface

**Chat layout:**
- **Left** — orchestrator messages, avatar = provider icon
- **Right** — user prompts, avatar = user
- **Center** — Bob's tool traces, as system-style interjections between
  divider rules. Keeps left/right strictly "AI vs. you."
- **Bottom left** — account dial: connected providers as icon circles, plus a
  dotted circle with `+` when nothing is connected. Hold and swipe left/right
  to switch; device ticks on landing; theme transition fires.
- **Bottom right** — model selector, filtered to the active provider's models
  only (Claude selected → Astra unavailable).

Note: `navigator.vibrate()` is mobile-only. Desktop needs a visual or audio
substitute for the tick.

### 5.4 Context (session history)

- Session rows: title, short summary, timestamp, message count, Bob usage
  (calls + tokens).
- Provider icons on the right, **oldest → most recent**, no arrows. Earlier
  providers at 55% opacity; the resume target is larger, full-strength, and
  ringed.
- Search field in the header.
- Clicking resumes the session **on its last-used provider**, firing the theme
  transition automatically when that differs from the active one.

**Open labeling question:** "Bob tokens" is ambiguous between Bob's own model
consumption (billed by IBM) and the tokens Bob's output adds to the
orchestrator's context (billed against the user's provider quota). The second
is more useful given the dashboard's quota orientation. Label explicitly.

---

## 6. Theme transition

assistant-ui has no transition solution — it's a headless library, so this is
entirely custom.

**Sequence:**
1. Thread fades out (300ms)
2. Provider badge for the *incoming* account fades in, centered
3. Theme swaps underneath while covered
4. Thread fades back in with new theme (300ms)

**Timing:**
- **250ms minimum hold** — a floor, not a fixed duration. Prevents fast
  switches from flashing.
- **400ms threshold** before a progress bar appears. If the bar shows
  immediately, every switch looks slow. Only real waits surface it.
- Bar inherits the **incoming** theme's accent, so it already signals
  destination.
- Respect `prefers-reduced-motion` — swap instantly.

**Critical:** do not unmount `<AssistantRuntimeProvider>` during the swap.
Keep it at layout level, above the clone component, or thread state and any
in-flight stream are lost.

**Honesty note:** for a manual dial switch, thread state is already in memory —
the hold is deliberate pacing, not covered latency. For a session *resume*, the
load is real and the bar is truthful. Unless persistence reports real progress,
the fill is an estimate (ease to ~80%, snap to 100%).

---

## 7. Session summaries

Generated on session close, server-side.

**Tab close cannot generate the summary directly** — the browser tears the page
down before a model call completes, and `beforeunload`/`unload` are unreliable
(mobile Safari and Chrome skip them when the OS kills a backgrounded tab).

**Working pattern:**
1. Client listens for `visibilitychange → hidden` and `pagehide` (not
   `beforeunload`), fires `navigator.sendBeacon()` with **just the session ID**.
2. Server generates the summary asynchronously from persisted thread data.

**Edge cases:**
- Beacons get missed (sleep, crash, force-quit, network drop). Add a
  server-side sweep for sessions idle past a threshold.
- `visibilitychange` fires on every tab switch. Make the endpoint idempotent —
  skip if a summary exists and no new messages since — or burn a model call
  every time someone tabs away.
- Closed-but-unsummarized sessions need a placeholder row in Context (first
  user message as stand-in title, subtle pending state).

---

## 8. Open items

- [ ] Confirm Bob headless auth works with the IDE fully closed
- [ ] Deterministic privacy filter (AST) to replace prompted-skill-only
- [ ] Provider brand guideline check before using real logos
- [ ] Trade dress review on the clone themes before public launch
- [ ] Define the "Bob tokens" metric precisely
- [ ] Desktop substitute for the haptic tick
- [ ] Decide whether the provider trail shows models or providers only
      (currently providers; models could live in hover titles)
