// Build a Windows .ico from her existing PNG icon (PNG-payload ICO, Vista+).
import { readFileSync, writeFileSync } from "node:fs";
const src = process.argv[2], out = process.argv[3], size = Number(process.argv[4] || 192);
const png = readFileSync(src);
const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(1, 4);
const ent = Buffer.alloc(16);
ent.writeUInt8(size >= 256 ? 0 : size, 0);
ent.writeUInt8(size >= 256 ? 0 : size, 1);
ent.writeUInt8(0, 2); ent.writeUInt8(0, 3);
ent.writeUInt16LE(1, 4); ent.writeUInt16LE(32, 6);
ent.writeUInt32LE(png.length, 8); ent.writeUInt32LE(22, 12);
writeFileSync(out, Buffer.concat([dir, ent, png]));
console.log(`ICO: ${out} ${22 + png.length} bytes (from ${size}px png)`);
