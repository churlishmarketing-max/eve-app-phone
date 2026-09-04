// A PICTURE ON A TURN — the renderer half. Owning stream: S2.
//
// He drops a Premiere screenshot on the talk column, or pastes one from the
// clipboard (which is how a screenshot usually arrives), and says "sort these
// into GE Outdoors". This file turns a File or a Blob into the exact shape the
// bridge takes, and refuses — out loud, on his screen — everything else.
//
// THE ONE LAW THAT MATTERS HERE, and it is not enforced in this file:
// text inside an image was written by whoever made the image. It is UNTRUSTED,
// exactly like a filename, and the brain wraps the pixels in the same
// `<untrusted_…>` envelope discipline the filename path already uses. Nothing
// on this side may ever read words out of a picture and act on them, and
// nothing on this side does: the desktop never decodes the image, never OCRs
// it, and never looks at it. It measures it and hands it over.
//
// WHY THE MIME COMES FROM THE BYTES AND NOT FROM THE FILE.
// `File.type` is derived from the extension on Windows, so a .png that is
// really a JPEG arrives labelled image/png, and the brain — which checks the
// magic against the label — refuses the whole picture with a sentence about a
// mislabel he did not commit. So the sniff happens HERE, at attach time, where
// the chip can show him what it actually is before he presses send.
//
// Nothing here is stored. The base64 lives in one piece of React state, rides
// one turn, and is cleared. There is no cache, no temp file, and no disk write.

import type { ChatImageAttachment, ChatImageMime } from "@shared/contract";

/** The brain's ceiling on the DECODED bytes (brain/src/image.ts MAX_IMAGE_BYTES). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** What we will attach. GIF is refused by the brain, so it is refused here. */
const SUPPORTED: ChatImageMime[] = ["image/png", "image/jpeg", "image/webp"];

export function isSupportedMime(m: string): m is ChatImageMime {
  return (SUPPORTED as string[]).includes(m);
}

/**
 * THE MAGIC BYTES. Local, 16 bytes, and they never leave this function —
 * exactly the discipline index-store.sniffClass already keeps on his disk.
 * Returns null for anything that is not one of the three.
 */
export function sniffImageMime(bytes: Uint8Array): ChatImageMime | null {
  if (bytes.length < 12) return null;
  const b = bytes;
  // 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a) {
    return "image/png";
  }
  // FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // "RIFF" .... "WEBP"
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Raw base64, no `data:` prefix, no newlines. The brain refuses both. */
export function toBase64(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000; // one apply() over 5 MB blows the call stack
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export type AttachResult =
  | { ok: true; image: ChatImageAttachment }
  | { ok: false; why: string };

/**
 * One Blob or File -> one attachment, or one sentence saying why not.
 *
 * Every refusal is a SENTENCE, never a silent drop. A screenshot that vanishes
 * when he lets go of the mouse is the app telling him nothing happened, which
 * is not what happened.
 */
export async function attachmentFrom(blob: Blob, name = ""): Promise<AttachResult> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await blob.arrayBuffer());
  } catch {
    return { ok: false, why: "I COULDN'T READ THAT FILE." };
  }
  if (bytes.length === 0) return { ok: false, why: "THAT FILE IS EMPTY." };
  // Measured BEFORE the base64, so a 40 MB screenshot is refused rather than
  // expanded by a third and then refused.
  if (bytes.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      why: `THAT PICTURE IS ${fmtKb(bytes.length)} — THE CEILING IS 5 MB. SCREENSHOT A SMALLER REGION.`,
    };
  }
  const mime = sniffImageMime(bytes);
  if (!mime) {
    return { ok: false, why: "THAT ISN'T A PNG, JPEG OR WEBP — I DIDN'T ATTACH IT." };
  }
  return {
    ok: true,
    image: { mime, data: toBase64(bytes), name: name.slice(0, 120), bytes: bytes.length },
  };
}

/** The first image on a DataTransfer, or null. Files first, then the item list. */
export function pickImage(dt: DataTransfer | null): { blob: Blob; name: string } | null {
  if (!dt) return null;
  for (const f of Array.from(dt.files ?? [])) {
    if (f.type.startsWith("image/")) return { blob: f, name: f.name };
  }
  for (const it of Array.from(dt.items ?? [])) {
    if (it.kind !== "file" || !it.type.startsWith("image/")) continue;
    const f = it.getAsFile();
    // A clipboard screenshot has no filename. "" is the honest value and the
    // chip says CLIPBOARD rather than inventing one.
    if (f) return { blob: f, name: f.name === "image.png" ? "" : f.name };
  }
  return null;
}

export function fmtKb(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
