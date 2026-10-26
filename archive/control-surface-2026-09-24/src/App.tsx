import { useState } from "react";
import { PROVIDERS, resolveVars, varsToStyle, type ProviderId } from "./lib/themes";
import { Sidebar, type Page } from "./components/Sidebar";
import { Home } from "./pages/Home";
import { Context } from "./pages/Context";
import { Bob, type SecurityLevel } from "./pages/Bob";
import { LoginModal } from "./components/LoginModal";
import { SignOutModal } from "./components/SignOutModal";

// The app no longer follows an active provider — Claude does the talking, this
// is the control surface. One fixed theme; the per-provider themes remain in
// themes.ts but nothing switches between them.
const THEME: ProviderId = "claude";

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [dark, setDark] = useState(false);
  const [bobLinked, setBobLinked] = useState(false);
  const [security, setSecurity] = useState<SecurityLevel>("restricted");
  const [loggedIn, setLoggedIn] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const vars = resolveVars(THEME, dark);
  const darkDisabled = !PROVIDERS[THEME].supportsLight;

  return (
    <div className="app-surface h-screen w-screen flex overflow-hidden" style={{ ...varsToStyle(vars), background: vars.bg }}>
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
        {page === "home" && (
          <Home active={THEME} dark={dark} security={security} onOpenBob={() => setPage("bob")} />
        )}
        {page === "context" && (
          <Context active={THEME} dark={dark} onResume={() => setPage("home")} />
        )}
        {page === "bob" && (
          <Bob
            active={THEME}
            dark={dark}
            connected={bobLinked}
            providers={[THEME]}
            security={security}
            onSecurity={setSecurity}
            onToggle={() => setBobLinked((v) => !v)}
          />
        )}
      </main>

      {loginOpen && (
        <LoginModal onClose={() => setLoginOpen(false)} onLogin={() => { setLoggedIn(true); setLoginOpen(false); }} />
      )}
      {signOutOpen && (
        <SignOutModal onClose={() => setSignOutOpen(false)} onConfirm={() => { setLoggedIn(false); setSignOutOpen(false); }} />
      )}
    </div>
  );
}
