import type { ReactElement } from "react";
import bobIcon from "../imports/bob.png";

type Page = "home" | "context" | "bob";

const ICONS: Record<Page, ReactElement | null> = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></svg>
  ),
  context: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  bob: null,
};

export function Sidebar({
  page,
  onNavigate,
  dark,
  onToggleDark,
  darkDisabled,
  loggedIn,
  onToggleAuth,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  dark: boolean;
  onToggleDark: () => void;
  darkDisabled: boolean;
  loggedIn: boolean;
  onToggleAuth: () => void;
}) {
  const items: Page[] = ["home", "context", "bob"];
  return (
    <aside
      className="w-16 shrink-0 h-full flex flex-col items-center py-3"
      style={{ background: "var(--card)", borderRight: "0.5px solid var(--border)" }}
    >
      <div className="flex flex-col gap-2">
        {items.map((p) => {
          const activeItem = p === page;
          return (
            <button
              key={p}
              aria-label={p}
              aria-current={activeItem}
              onClick={() => onNavigate(p)}
              className="w-10 h-10 rounded-lg inline-flex items-center justify-center transition-colors ui"
              style={{
                background: activeItem ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "transparent",
                color: activeItem ? "var(--accent)" : "var(--muted)",
                ...(p === "bob"
                  ? {
                      borderStyle: "none",
                      borderWidth: "0px",
                      borderColor: "rgba(0, 0, 0, 0)",
                    }
                  : {}),
              }}
            >
              {p === "bob" ? (
                <img
                  src={bobIcon}
                  alt="Bob"
                  width={26}
                  height={26}
                  className="rounded-md transition-all"
                  style={{
                    objectFit: "contain",
                    filter: activeItem ? "none" : "grayscale(1)",
                    opacity: activeItem ? 1 : 0.6,
                  }}
                />
              ) : (
                ICONS[p]
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={onToggleAuth}
        aria-label={loggedIn ? "Log out" : "Log in"}
        className="mt-auto w-10 h-10 rounded-lg inline-flex items-center justify-center transition-colors"
        style={{ color: "var(--muted)" }}
      >
        {loggedIn ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" /><path d="M14 17l5-5-5-5" /><path d="M19 12H7" /></svg>
        )}
      </button>

      <button
        onClick={onToggleDark}
        disabled={darkDisabled}
        aria-label="Toggle dark mode"
        className="mt-2 w-10 h-10 rounded-lg inline-flex items-center justify-center transition-colors disabled:opacity-30"
        style={{ color: "var(--muted)" }}
      >
        {dark ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
        )}
      </button>
    </aside>
  );
}

export type { Page };
