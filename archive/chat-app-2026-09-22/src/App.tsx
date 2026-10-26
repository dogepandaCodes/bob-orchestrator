import { useCallback, useMemo, useState } from "react";
import {
  PROVIDERS,
  resolveVars,
  varsToStyle,
  type ProviderId,
} from "./lib/themes";
import { Sidebar, type Page } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Home } from "./pages/Home";
import { Context } from "./pages/Context";
import { Bob } from "./pages/Bob";
import { ConnectModal } from "./components/ConnectModal";
import { LoginModal } from "./components/LoginModal";
import { SignOutModal } from "./components/SignOutModal";
import { SwitchConfirmModal } from "./components/SwitchConfirmModal";
import { ProviderBadge } from "./components/Logos";
import { ADAPTERS } from "./lib/providers";
import { type Credential } from "./lib/providers";
import { loadKeys, saveKeys, type KeyMap } from "./lib/keys";
import { useChat, useModels } from "./lib/useChat";

const PROGRESS_THRESHOLD = 400;
const MIN_HOLD = 250;

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [keys, setKeys] = useState<KeyMap>(() => loadKeys());
  const connected = useMemo(
    () => (Object.keys(keys) as ProviderId[]).filter((id) => !!keys[id]?.key),
    [keys],
  );

  // Null until something is connected — seeding a provider here would show a
  // selection the user never made, and would defeat the `?? id` in connect().
  const [active, setActive] = useState<ProviderId | null>(() => {
    const stored = loadKeys();
    return (Object.keys(stored) as ProviderId[]).find((id) => !!stored[id]?.key) ?? null;
  });
  const [dark, setDark] = useState(false);
  const [bobLinked, setBobLinked] = useState(false);
  const [loggedIn, setLoggedIn] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const { catalog, dropModel } = useModels(keys);
  const { turns, streaming, send, stop } = useChat(keys, dropModel);

  // Model is tracked per provider — a single value would leak the previous
  // provider's model into the selector after a switch.
  const [modelByProvider, setModelByProvider] = useState<Partial<Record<ProviderId, string>>>({});

  const modelsFor = useCallback(
    (id: ProviderId) => {
      const live = catalog[id];
      return live && live.length > 0 ? live : ADAPTERS[id].fallbackModels;
    },
    [catalog],
  );

  const resolveModel = useCallback(
    (id: ProviderId) => {
      const chosen = modelByProvider[id];
      const list = modelsFor(id);
      if (chosen && list.some((m) => m.id === chosen)) return chosen;
      // Prefer the adapter's headline model when the live catalog carries it.
      const preferred = ADAPTERS[id].fallbackModels[0]?.id;
      if (preferred && list.some((m) => m.id === preferred)) return preferred;
      return list[0]?.id ?? "";
    },
    [modelByProvider, modelsFor],
  );

  // Theme transition state
  const [transitioning, setTransitioning] = useState(false);
  const [incoming, setIncoming] = useState<ProviderId | null>(null);
  const [showProgress, setShowProgress] = useState(false);

  // Switch confirm state
  const [pendingSwitch, setPendingSwitch] = useState<ProviderId | null>(null);
  const [skipConfirm, setSkipConfirm] = useState(false);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** A concrete provider for styling — the app always renders some theme. */
  const theme: ProviderId = active ?? "claude";

  const switchTo = useCallback(
    (id: ProviderId) => {
      if (id === active) return;
      if (reduceMotion) {
        setActive(id);
        if (!PROVIDERS[id].supportsLight) setDark(true);
        return;
      }
      setIncoming(id);
      setTransitioning(true);
      setShowProgress(false);

      const progressTimer = window.setTimeout(() => setShowProgress(true), PROGRESS_THRESHOLD);

      const swapTimer = window.setTimeout(() => {
        setActive(id);
        if (!PROVIDERS[id].supportsLight) setDark(true);
      }, 300);

      window.setTimeout(() => {
        window.clearTimeout(progressTimer);
        window.clearTimeout(swapTimer);
        setTransitioning(false);
        setShowProgress(false);
        setIncoming(null);
      }, 300 + MIN_HOLD + 300);
    },
    [active, reduceMotion],
  );

  /** Gate every switch: locked while streaming, confirmed when context exists. */
  const requestSwitch = useCallback(
    (id: ProviderId) => {
      if (id === active || streaming) return;
      if (turns.length > 0 && !skipConfirm) {
        setPendingSwitch(id);
        return;
      }
      switchTo(id);
    },
    [active, streaming, turns.length, skipConfirm, switchTo],
  );

  const connect = useCallback(
    (id: ProviderId, cred: Credential) => {
      const next = { ...keys, [id]: cred };
      saveKeys(next);
      setKeys(next);
      // First connection becomes active; later ones do not steal the selection.
      setActive((cur) => cur ?? id);
      setConnectOpen(false);
    },
    [keys],
  );

  const disconnect = useCallback(
    (id: ProviderId) => {
      const next = { ...keys };
      delete next[id];
      saveKeys(next);
      setKeys(next);
      // Dropping the active provider falls back to another, or to no selection.
      setActive((cur) =>
        cur === id
          ? ((Object.keys(next) as ProviderId[]).find((k) => !!next[k]?.key) ?? null)
          : cur,
      );
    },
    [keys],
  );

  const vars = resolveVars(theme, dark);
  const darkDisabled = !PROVIDERS[theme].supportsLight;

  return (
    <div
      className="app-surface h-screen w-screen flex overflow-hidden"
      style={{ ...varsToStyle(vars), background: vars.bg }}
    >
      <Sidebar
        page={page}
        onNavigate={setPage}
        dark={dark || darkDisabled}
        onToggleDark={() => setDark((d) => !d)}
        darkDisabled={darkDisabled}
        loggedIn={loggedIn}
        onToggleAuth={() => (loggedIn ? setSignOutOpen(true) : setLoginOpen(true))}
      />

      <main className="flex-1 min-w-0 h-full relative">
        <div style={{ opacity: transitioning ? 0 : 1, transition: "opacity 300ms ease", height: "100%" }}>
          {page === "dashboard" && (
            <Dashboard
              active={active}
              theme={theme}
              connected={connected}
              keys={keys}
              dark={dark || darkDisabled}
              onSetActive={requestSwitch}
              onConnect={() => setConnectOpen(true)}
              onDisconnect={disconnect}
            />
          )}
          {page === "home" && (
            <Home
              active={active}
              theme={theme}
              connected={connected}
              dark={dark || darkDisabled}
              turns={turns}
              streaming={streaming}
              models={modelsFor(theme)}
              model={resolveModel(theme)}
              onModelChange={(id) => active && setModelByProvider((m) => ({ ...m, [active]: id }))}
              onSend={(text) => active && send(text, active, resolveModel(active))}
              onStop={stop}
              onSwitch={requestSwitch}
              onConnect={() => setConnectOpen(true)}
            />
          )}
          {page === "context" && (
            <Context
              active={theme}
              dark={dark || darkDisabled}
              onResume={(s) => {
                setPage("home");
                const target = s.trail[s.trail.length - 1];
                if (target !== active && connected.includes(target)) switchTo(target);
              }}
            />
          )}
          {page === "bob" && (
            <Bob
              active={theme}
              dark={dark || darkDisabled}
              connected={bobLinked}
              providers={connected}
              onToggle={() => setBobLinked((v) => !v)}
            />
          )}
        </div>

        {/* Theme transition overlay */}
        {transitioning && incoming && (
          <div
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4"
            style={{ background: resolveVars(incoming, dark || !PROVIDERS[incoming].supportsLight).bg }}
          >
            <div style={{ animation: "fade-in 200ms ease" }}>
              <ProviderBadge id={incoming} size={72} />
            </div>
            {showProgress && (
              <div className="flex flex-col items-center gap-1.5" style={{ animation: "fade-in 160ms ease" }}>
                <div className="w-[140px] h-[3px] rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--muted) 40%, transparent)" }}>
                  <div style={{ height: "100%", width: "80%", background: resolveVars(incoming, true).accent, borderRadius: 999, transition: "width 600ms ease" }} />
                </div>
                <span className="text-[11px] ui" style={{ color: resolveVars(incoming, true).muted }}>Restoring conversation</span>
              </div>
            )}
          </div>
        )}
      </main>

      {pendingSwitch && active && (
        <SwitchConfirmModal
          from={active}
          to={pendingSwitch}
          messageCount={turns.length}
          onCancel={() => setPendingSwitch(null)}
          onConfirm={() => {
            switchTo(pendingSwitch);
            setPendingSwitch(null);
          }}
          onDontAsk={() => {
            setSkipConfirm(true);
            switchTo(pendingSwitch);
            setPendingSwitch(null);
          }}
        />
      )}

      {loginOpen && (
        <LoginModal onClose={() => setLoginOpen(false)} onLogin={() => { setLoggedIn(true); setLoginOpen(false); }} />
      )}

      {signOutOpen && (
        <SignOutModal onClose={() => setSignOutOpen(false)} onConfirm={() => { setLoggedIn(false); setSignOutOpen(false); }} />
      )}

      {connectOpen && (
        <ConnectModal connected={connected} onClose={() => setConnectOpen(false)} onConnect={connect} />
      )}
    </div>
  );
}
