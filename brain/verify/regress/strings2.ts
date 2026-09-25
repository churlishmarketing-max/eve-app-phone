// TOOL DESCRIPTIONS AS THE MODEL RECEIVES THEM, both servers, intake OFF.
process.env.EVE_PICTURE_INTAKE = "off";
const t = await import("../../src/tools.js");
const cn = await import("../../src/connectors.js");
const found: { tool: string; desc: string }[] = [];
function harvest(server: any, label: string) {
  const seen = new Set<any>();
  const walk = (o: any, d = 0) => {
    if (!o || d > 6 || seen.has(o)) return; seen.add(o);
    if (typeof o === "object") {
      if (typeof o.name === "string" && typeof o.description === "string") found.push({ tool: `${label}:${o.name}`, desc: o.description });
      for (const v of Object.values(o)) walk(v, d + 1);
      if (Array.isArray(o)) for (const v of o) walk(v, d + 1);
    }
  };
  walk(server);
}
try { harvest(t.buildMemoryServer({} as any), "memory"); } catch (e) { console.log("memory server build:", String(e).slice(0,120)); }
try { harvest(cn.buildConnectorServer({} as any), "connector"); } catch (e) { console.log("connector server build:", String(e).slice(0,120)); }
console.log(`tools harvested: ${found.length}`);
const RX = /\b(screenshot|screengrab|picture|image|photo|paste|attached)\b/i;
let n = 0;
for (const f of found) for (const line of f.desc.split(/\n/)) if (RX.test(line)) { n++; console.log(`\n[${f.tool}]\n  ${line.trim().slice(0,360)}`); }
console.log(`\n--- ${n} picture-shaped lines across ${found.length} tool descriptions ---`);
console.log("TOOLS:", found.map(f=>f.tool).join(" "));
process.exit(0);
