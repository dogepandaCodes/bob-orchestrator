Figma Design Brief — AI Orchestrator App

Paste into Figma AI / Figma Make, or hand to a designer as a written brief.

The product

A desktop web app where a developer talks to a high-capability AI model (Claude, ChatGPT, or Gemini) that consults a local coding agent called Bob for grounded facts about their codebase. Three pages behind a narrow icon sidebar. The entire app restyles itself to match whichever AI provider is active.

Tone: professional developer tool. Calm, dense but not cramped, no decorative flourish. Think of a well-made IDE panel rather than a consumer chat app.

Global shell

Sidebar — 64px wide, fixed left, full height. Three icon-only buttons stacked at the top with 8px gaps: dashboard (grid icon), home (house icon), context (history/clock icon). Each 40x40px with 8px corner radius. The active button gets a tinted background in the current theme's accent; inactive ones are transparent with muted icon color. A clear 0.5px divider separates the sidebar from the page content on every page.

Page content — 1.5rem padding, fills remaining width.

Corner mark — a large, faded provider glyph in the top right of the dashboard and home pages. ~150px, 15% opacity, partially cropped by the viewport edge. Rotates 360° clockwise when the active account changes.

Theme system — three full restyles

Not accent-color swaps. Each theme restyles background, typography, and surface treatment. Design all three.

Claude theme

Background 
#F0ECE0 (light) / 
#2b2a27 (dark)
Serif body type for conversation text
Accent 
#c96442, tinted surfaces around 
#E4D5C7
Minimal chrome: no shadows, no assistant avatars in the source clone
Borderless composer

ChatGPT theme

Background 
#ffffff (light) / 
#000000 (dark)
Composer surface 
#212121
Sans type, high-contrast user bubbles
Circular composer controls with tooltips
Always-visible action bar under assistant messages

Gemini theme

Background 
#131314
Sans type, avatar-free full-width assistant replies
User turns in rounded grey bubbles
Single-row pill composer
Soft blurred radial glow behind the empty state

Important: UI controls (dial, selectors, avatars, buttons) stay sans-serif in all three themes, including Claude. Serif is for conversation text only — it reads mushy at control sizes.

Constant across all themes: sidebar, dashboard layout, account dial, model selector, Bob's centered trace lane. These are the app's identity and must not move between themes.

Icons

Use plain letter badges as provider marks: C (Claude), G (ChatGPT), Ge (Gemini). Circular, centered, medium weight. Real provider logos are trademarked and not cleared for use — do not substitute them.

Page 1 — Dashboard

Header row

Dashboard heading
Below it, a split row: Active account label + dropdown on the left; Connect AI button (with + icon) on the right

Provider cards — responsive grid, min 220px, 12px gaps

Rounded corners (12px), 0.5px border, subtle surface fill, ~1rem padding
Top row: 36px circular provider badge, then stacked provider name (14px, medium) and plan name (12px, secondary color)
Below: usage rows, one per limit. Limits differ per provider:
Claude → "5h limit" + "Monthly"
ChatGPT → "5h limit" + "Weekly"
Each usage row: label left, used / total right (both 11px muted), with a 3–4px rounded progress bar beneath
Bar color by consumption: green under 60%, yellow 60–85%, red above 85%
Clicking a row expands to reveal reset timing ("Resets in 2h 14m", "Resets Oct 1", "Resets Mon 12:00 AM")

Design a second state: clicking a card opens a modal to edit the API key or delete the connection.

Page 2 — Connect AI modal
Centered over a dimmed backdrop (~45% black)
320px wide card, 12px radius, 1.5rem padding
Close (X) button top right, 28px circular, subtle
Heading Connect an AI, one line of secondary text beneath
Three provider badges in a horizontal row, icons only, no text labels. 56px circles, 16px gaps, centered
Design the follow-on state: selecting a provider slides to an API key entry form
Page 3 — Home (chat)

Design three states.

State A — nothing connected: empty state prompting the user to connect an AI. Reuses the Connect AI modal.

State B — AI connected, Bob not linked: setup instructions for pointing Bob at the MCP server.

State C — fully set up: the working chat. This is the primary screen.

Chat thread layout
Left-aligned — orchestrator (AI) messages. 28px circular avatar showing the provider badge, then the message. Max 78–82% width.
Right-aligned — user prompts. Message bubble, then 28px user avatar. Max 78% width.
Center — Bob's tool traces. Styled as system interjections, not conversation: a thin horizontal rule running left and right of a short monospace label (e.g. Bob · get_endpoint_contract(/api/login)), with the result centered beneath in small muted monospace. These sit between the user's message and the AI's reply.
14–16px gaps between messages
Composer area

Separated from the thread by a 0.5px top border.

Full-width text input, placeholder "Message the orchestrator"
Below it, a split control row:
Bottom left — the account dial. Connected providers as 34px circular icon badges in a row, 10px gaps. The active one has a 2px accent border and tinted fill; inactive ones are 0.5px border, neutral fill. Always ends with a dotted-border circle containing a + for connecting another AI. If nothing is connected, only the dotted + circle shows.
Bottom right — model selector. Dropdown listing only the active provider's models. Claude selected → only Claude models. Never show another provider's models.

Dial interaction (specify in prototype notes): press and hold a circle, swipe left or right, and the selection moves between icons. Device gives a haptic tick on landing. Releasing commits and fires the theme transition.

Page 4 — Context (session history)

Header — Context heading left, search field right (~180px, placeholder "Search sessions"). Beneath: one line of 12px muted helper text — "Providers shown oldest to most recent · resumes on the last one used".

Session rows — stacked, 10px gaps, same card treatment as the dashboard (12px radius, 0.5px border, ~14px padding)

Each row is a two-column split:

Left column (flexible):

Session title, 14px medium
Summary, 13px secondary, 1–2 lines, 1.5 line-height
Metadata row, 11px muted: relative timestamp · message count · Bob usage (shown with a small branch icon, e.g. "Bob 6 calls · 4.2k tokens")

Right column (fixed):

Provider badges in a horizontal row, oldest to most recent, left to right, with no arrows or connectors between them
Earlier providers: 26px, 55% opacity
The most recent (resume target): 30px, full opacity, 1.5px accent ring
Single-provider sessions show one badge only

Design a pending state for sessions closed but not yet summarized: the first user message stands in for the title, with a subtle loading treatment where the summary would sit.

Theme transition (prototype spec)

When the active account changes — by dial swipe, or by resuming a session that used a different provider:

Thread fades to 0 opacity over 300ms
A 72px circular badge for the incoming provider fades in, centered over the page
Theme swaps underneath while covered
Thread fades back in over 300ms with the new theme applied

Timing rules:

250ms minimum badge hold — a floor, not a fixed duration
If the switch takes longer than 400ms, a small progress bar fades in beneath the badge: 140px wide, 3px tall, rounded, with an 11px caption ("Restoring conversation") beneath. The bar must not appear before that threshold — showing it immediately makes every switch feel slow
The bar uses the incoming theme's accent, so it signals destination while it waits
Honor prefers-reduced-motion with an instant swap
Deliverables
All three themes across all four screens
Empty states: no AI connected, no sessions yet, Bob not linked
Modal states: Connect AI, provider API key entry, edit/delete connection
Pending-summary row state in Context
Prototype wiring for the dial swipe and theme transition