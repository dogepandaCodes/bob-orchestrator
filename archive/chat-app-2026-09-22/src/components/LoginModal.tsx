// Sign-in dialog with social providers. Icons are simple original marks.
function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.3 17.7 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-3.9 6.8-9.7 6.8-17.4Z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C1 16.3 0 20 0 24s1 7.7 2.6 10.8l7.9-6.1Z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.3-5.7c-2 1.4-4.6 2.2-7.9 2.2-6.3 0-11.6-3.8-13.5-9.3l-7.9 6.1C6.5 42.6 14.6 48 24 48Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.1-2.9.9-3.6.9s-1.9-.9-3.1-.8c-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.3 1.2 0 1.6-.8 3.1-.8s1.8.8 3.1.8 2.1-1.1 2.9-2.2c.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.7ZM14 5.4c.7-.8 1.1-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

const PROVIDERS = [
  { id: "google", label: "Continue with Google", icon: <GoogleIcon /> },
  { id: "apple", label: "Continue with Apple", icon: <AppleIcon /> },
  { id: "email", label: "Continue with email", icon: <MailIcon /> },
];

export function LoginModal({
  onClose,
  onLogin,
}: {
  onClose: () => void;
  onLogin: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="ui rounded-xl p-6 w-[340px] relative text-center"
        style={{ background: "var(--card)", border: "0.5px solid var(--border)", animation: "fade-in 200ms ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-7 h-7 rounded-full inline-flex items-center justify-center"
          style={{ background: "var(--surface)", color: "var(--muted)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <h2 className="text-[18px] font-semibold" style={{ color: "var(--fg)" }}>Sign in to Orchestrator</h2>
        <p className="text-[12px] mt-1 mb-6" style={{ color: "var(--muted)" }}>
          Your API keys and sessions stay tied to your account.
        </p>

        <div className="flex flex-col gap-2.5">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={onLogin}
              className="flex items-center justify-center gap-2.5 rounded-lg py-2.5 text-[13px] font-medium transition-colors hover:opacity-90"
              style={{ background: "var(--surface)", color: "var(--fg)", border: "0.5px solid var(--border)" }}
            >
              {p.icon}
              {p.label}
            </button>
          ))}
        </div>

        <p className="text-[10.5px] mt-5" style={{ color: "var(--muted)" }}>
          By continuing you agree to the Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
