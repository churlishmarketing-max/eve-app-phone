// STRING HUNT — graded off what the MODEL is actually handed with intake off,
// not off my reading of the source. Renders the real system prompt and the real
// tool descriptions, then greps them for promises of picture behaviour.
process.env.EVE_PICTURE_INTAKE = "off";
const persona = await import("../../src/persona.js");
const tools = await import("../../src/tools.js");
const parts: { name: string; text: string }[] = [];
for (const k of Object.keys(persona)) {
  const v: any = (persona as any)[k];
  try { if (typeof v === "function" && v.length === 0) { const r = v(); if (typeof r === "string") parts.push({ name: `persona.${k}()`, text: r }); } } catch {}
  if (typeof v === "string") parts.push({ name: `persona.${k}`, text: v });
}
for (const k of Object.keys(tools)) {
  const v: any = (tools as any)[k];
  const list = typeof v === "function" && v.length === 0 ? (() => { try { return v(); } catch { return null; } })() : v;
  if (Array.isArray(list)) for (const t of list) if (t && typeof t === "object" && "description" in t)
    parts.push({ name: `tool:${(t as any).name}`, text: String((t as any).description) });
}
const RX = /\b(screenshot|screengrab|picture|image|photo|attach(ed|ment)?|paste[sd]? (in|a)|look at (it|the)|read the names off|see in the)\b/i;
let hits = 0;
for (const p of parts) {
  for (const line of p.text.split(/\n|(?<=\.)\s(?=[A-Z])/)) {
    if (RX.test(line) && line.trim().length > 12) { hits++; console.log(`\n[${p.name}]\n  ${line.trim().slice(0, 400)}`); }
  }
}
console.log(`\n--- ${parts.length} rendered strings scanned, ${hits} picture-shaped lines ---`);
process.exit(0);
