// mdLite — owning stream: S2. Copied from the shipped phone client
// (app/src/EveApp.tsx:86-93) so her prose renders identically on both surfaces.
//
// She writes markdown emphasis by instinct; raw asterisks on screen read as a
// glitch. Render the inline set (bold/italic/code, header lines as bold) and
// nothing heavier — ESCAPE FIRST so nothing she says can inject markup. The
// order is load-bearing: escape, then transform.

export function mdLite(s: string): string {
  let h = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  h = h.replace(/\*([^*\s][^*\n]*)\*/g, "<i>$1</i>");
  h = h.replace(/^#{1,4}\s+(.+)$/gm, "<b>$1</b>");
  return h;
}
