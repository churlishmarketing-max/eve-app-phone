
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
const roots = ["C:/dev/eve/brain/src","C:/dev/eve/desktop/src","C:/dev/eve/desktop/electron","C:/dev/eve/brain/prompts"];
const files: string[] = [];
const walk = (d: string) => { for (const e of readdirSync(d)) { const p = path.join(d, e); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|md)$/.test(e)) files.push(p); } };
for (const r of roots) { try { walk(path.resolve(r)); } catch {} }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const RX = /(screenshot|screengrab|read (the )?names off|look at (the )?(picture|image|photo)|paste (a|the|it)|send (me )?(a )?(picture|screenshot|image))/i;
let n = 0;
for (const f of files) {
  const raw = readFileSync(f, "utf8");
  const isMd = /\.md$/.test(f);
  const src = isMd ? raw : strip(raw);
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!RX.test(line)) continue;
    if (!isMd && !/["'`]/.test(line)) continue;
    n++;
    const ctx = lines.slice(Math.max(0, i - 6), i + 2).join("\n");
    const inPic = /\bpic\(/.test(ctx) || /pictureIntakeOn\(\)/.test(ctx);
    const rel = path.relative("C:/dev/eve", f).split(path.sep).join("/");
    console.log(rel + ":" + (i + 1) + (inPic ? "  [switch-guarded]" : "  [UNGUARDED]"));
    console.log("    " + line.trim().slice(0, 190));
  }
}
console.log("\n--- " + n + " picture-shaped shipped strings across " + files.length + " files ---");
process.exit(0);
