/**
 * Outbound redaction — the boundary, not the policy.
 *
 * Everything a tool returns leaves this machine for someone else's model, so
 * this runs on every result regardless of which tool produced it. Per the
 * security-level design: Restricted redacts, Private additionally blocks.
 * Fail closed — if a pattern matches we redact, we never "probably it's fine".
 */

const PATTERNS = [
  [/\bsk-ant-[A-Za-z0-9_\-]{8,}/g, "sk-ant-«redacted»"],
  [/\bsk-proj-[A-Za-z0-9_\-]{8,}/g, "sk-proj-«redacted»"],
  [/\bsk-[A-Za-z0-9]{20,}/g, "sk-«redacted»"],
  [/\bAIza[A-Za-z0-9_\-]{20,}/g, "AIza«redacted»"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "gh«redacted»"],
  [/\bxox[abprs]-[A-Za-z0-9\-]{10,}/g, "xox«redacted»"],
  [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._\-+/=]{16,}/g, "Bearer «redacted»"],
  [/\bey[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, "«redacted-jwt»"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "«redacted-private-key»"],
  // KEY=value / "secret": "value" style assignments
  [
    /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CREDENTIAL)[A-Z0-9_]*)\s*[:=]\s*["']?([^\s"',;]{6,})/gi,
    (_m, name) => `${name}=«redacted»`,
  ],
];

/** True when a path should never be read at all, at any security level. */
export function isForbiddenPath(relPath) {
  // Two separate rules: path segments must sit on a boundary, extensions must
  // not — anchoring `.pem` to a slash missed `certs/server.pem` entirely.
  const segment = /(^|\/)(\.env(\.|$)|\.git\/|node_modules\/|\.ssh\/|id_rsa|id_ed25519|id_ecdsa)/i;
  const extension = /\.(pem|p12|pfx|key|keystore|jks|asc|gpg)$/i;
  return segment.test(relPath) || extension.test(relPath);
}

export function redact(text) {
  let out = String(text ?? "");
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Private mode: anything still matching after redaction blocks the payload. */
const RESIDUAL = /«redacted/;

export function applySecurity(text, level) {
  if (level === "none") return { text: String(text ?? ""), blocked: false };
  const cleaned = redact(text);
  if (level === "private" && RESIDUAL.test(cleaned)) {
    return {
      text:
        "Blocked by Private mode: this result contained credential-shaped data. " +
        "Lower the security level or narrow the query.",
      blocked: true,
    };
  }
  return { text: cleaned, blocked: false };
}
