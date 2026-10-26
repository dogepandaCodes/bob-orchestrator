// Confirmation dialog before signing out.
export function SignOutModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="ui rounded-xl p-6 w-[320px] relative text-center"
        style={{ background: "var(--card)", border: "0.5px solid var(--border)", animation: "fade-in 200ms ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[17px] font-semibold" style={{ color: "var(--fg)" }}>
          Sign out?
        </h2>
        <p className="text-[13px] mt-1.5 mb-6" style={{ color: "var(--muted)" }}>
          Are you sure you want to sign out? Your sessions stay saved to your account.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors"
            style={{ background: "var(--surface)", color: "var(--fg)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "#e5484d" }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
