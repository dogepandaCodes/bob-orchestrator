import { useEffect, useRef, useState } from "react";
import type { ModelOption } from "../lib/providers";

// Model selector — only ever lists the active provider's models.
export function ModelSelector({
  models,
  value,
  onChange,
  disabled = false,
}: {
  models: ModelOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const current = models.find((m) => m.id === value);

  return (
    <div className="relative ui" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-40"
        style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}
      >
        {current?.label ?? value ?? "Select model"}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0.6 }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div
          className="absolute bottom-full right-0 mb-1.5 min-w-[200px] max-h-[280px] overflow-y-auto rounded-lg p-1 z-20"
          style={{ background: "var(--card)", border: "0.5px solid var(--border)", boxShadow: "0 8px 30px rgba(0,0,0,0.18)", animation: "fade-in 140ms ease" }}
        >
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className="w-full text-left rounded-md px-2.5 py-1.5 text-[12.5px] flex items-center justify-between gap-3 transition-colors hover:opacity-80"
              style={{ color: "var(--fg)", background: m.id === value ? "var(--surface)" : "transparent" }}
            >
              <span className="truncate">{m.label}</span>
              {m.id === value && (
                <svg className="shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
