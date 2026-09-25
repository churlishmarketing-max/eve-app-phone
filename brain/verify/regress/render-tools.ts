
// RENDER EACH DESK TOOL DESCRIPTION EXACTLY AS THE MODEL RECEIVES IT with the
// door shut: the literal concatenation from connectors.ts, evaluated with the
// SHIPPED pic() bound. Then ask whether it still promises picture behaviour.
process.env.EVE_PICTURE_INTAKE = "off";
import { readFileSync } from "node:fs";
const { pic, pictureIntake } = await import("../../src/intake.js");
const src = readFileSync("C:/dev/eve/brain/src/connectors.ts", "utf8");
const names = ["desk_scan","desk_where","desk_file_plan","desk_handoff","desk_undo"];
const RX = /(screenshot|screengrab|picture|image)/i;
console.log("intake =", pictureIntake());
for (const n of names) {
  const start = src.indexOf('"' + n + '",');
  if (start < 0) { console.log(n, "ABSENT"); continue; }
  const after = src.slice(start + n.length + 3);
  const end = after.search(/\n\s{8}\{/);
  const expr = after.slice(0, end);
  let rendered: string;
  try { rendered = eval("(" + expr.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "") + ")"); }
  catch (e) { console.log(n, "eval failed:", String(e).slice(0,100)); continue; }
  const lines = rendered.split("\n").filter((l) => RX.test(l));
  console.log("\n================ " + n + "  (" + rendered.length + " chars rendered, door shut)");
  if (!lines.length) console.log("   no picture-shaped line — clean");
  for (const l of lines) console.log("   >> " + l.trim().slice(0, 230));
}
process.exit(0);
