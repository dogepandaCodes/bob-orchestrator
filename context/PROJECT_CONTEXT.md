# Orchestrator App — Project Context

_Snapshot saved 2026-09-16._

## What this is

A desktop web dev tool where a developer chats with a high-capability AI model
(Claude / ChatGPT / Gemini) that consults a local coding agent named **Bob** for
grounded facts about the user's codebase. The entire app **restyles itself** to
match whichever AI provider is active — three full themes, not accent swaps.

## Stack

- React 19 + Vite 8 + TypeScript 5.7
- Tailwind CSS v4 via `@tailwindcss/vite`
- Runs inside Figma Make (dev server already running on `$PORT`)
- Fonts via Google Fonts `@import` in `src/index.css`: Inter (UI/sans),
  Lora (serif conversation text — Claude only), JetBrains Mono (Bob traces)

## Theming architecture

- Active provider + dark mode resolve to a `ThemeVars` object applied as inline
  CSS custom properties (`--bg`, `--fg`, `--card`, `--surface`, `--border`,
  `--muted`, `--accent`, `--accent-fg`, `--user-bubble`, `--user-bubble-fg`,
  `--font-body`) on the app root.
- `src/lib/themes.ts` — `PROVIDERS` record (claude/chatgpt/gemini), `resolveVars`,
  `varsToStyle`, `MODELS`, `PROVIDER_ORDER`. Claude uses a warm serif light theme;
  ChatGPT black/white; Gemini dark-only with a radial glow.
- Theme transitions: fade thread out (300ms), show incoming 72px provider badge,
  swap theme underneath, fade back; 250ms min hold; progress bar only after 400ms;
  respects `prefers-reduced-motion`.
- Provider logos: original geometric SVG marks for Claude/Gemini; user-supplied
  images for ChatGPT and Bob (avoids reproducing trademarked marks).

## Navigation & routing

State-based routing in `src/App.tsx` (no react-router). A 64px icon sidebar
(`src/components/Sidebar.tsx`) with pages: `dashboard`, `home`, `context`, `bob`,
plus login/logout and dark-mode toggle at the bottom.

## Pages

- **Dashboard** (`src/pages/Dashboard.tsx`) — connected-provider usage cards.
- **Home** (`src/pages/Home.tsx`) — the chat surface; per-message provider avatars
  (theme stays on most-recent provider); composer with account dial + model selector.
- **Context** (`src/pages/Context.tsx`) — session history; rows resume into Home.
- **Bob** (`src/pages/Bob.tsx`) — local agent setup + config (see below).

## Bob page details

- Status button: Connected (green) / Not connected (pulsing amber).
- VM setup steps with code blocks + privacy note.
- **Security level** — three selectable cards (single-select, default Restricted):
  - **None** (Full access): no guardrails.
  - **Restricted mode** (Recommended): implemented through a skill that redacts
    secrets, credentials, and ignored files before context leaves the machine.
  - **Private mode** (Strictest): Restricted plus a two-stage static pass on every
    outbound payload — an AST strips function bodies from code, then secret scanning
    checks the result, diffs, and traces. Anything flagged is blocked.
- **Bob skills** — toggleable list of skills, each with a toggle and an edit
  (pencil) button. An **Add skill** button opens `AddSkillModal`.

## AddSkillModal

`src/components/AddSkillModal.tsx` — create or edit a Bob skill.
- Name field.
- **Edit manually**: skill description + specific-instructions section.
- **Draft with AI**: pick from connected providers, prompt them to draft a
  description (editable). Hidden when editing an existing skill.

## Key files

- `src/App.tsx` — state orchestration + theme transitions + modal wiring.
- `src/lib/themes.ts` — provider themes and models.
- `src/lib/data.ts` — connections, sessions, threads, `Msg` type.
- `src/components/` — Sidebar, Logos, CornerMark, AccountDial, ModelSelector,
  ConnectModal, LoginModal, SignOutModal, AddSkillModal.
- `src/pages/` — Dashboard, Home, Context, Bob.

## Conventions

- ES-module image imports (never string paths) for Vite production builds.
- Default exports for components; double quotes for strings with apostrophes.
- Shared layout width: `max-w-[880px] mx-auto` across pages.
- Verify with `npx tsc --noEmit` after changes.
