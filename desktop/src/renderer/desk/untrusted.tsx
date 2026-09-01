// owner: stream S3 (DESK/UI) — UNTRUSTED TEXT RENDERING.
//
// PATH-3, HIGH: "bidi overrides and homoglyphs defeat the card's one visual
// guarantee." `Invoice-2026-08‮fdp.exe` renders in almost every UI as
// `Invoice-2026-08exe.pdf`. The card shows him a PDF; the disk holds an
// executable. Add a Cyrillic `с` to a folder name and two visually identical
// destinations diverge on disk.
//
// Everything in this file exists so that a filename CANNOT lie about itself on
// the confirm card. Three independent defences, because any one of them alone
// has a hole:
//
//   1. STRIP.   The display form has every bidi control, zero-width joiner,
//               C0/C1 control and Unicode tag character removed before it is
//               ever put in the DOM. A character that is not in the string
//               cannot reorder it.
//   2. ISOLATE. What survives is rendered inside a <bdi dir="ltr"> carrying
//               `unicode-bidi: isolate-override`, so even a control character
//               this file failed to anticipate cannot reach outside its own
//               span, and cannot reorder the span's own contents either.
//   3. BADGE.   Any name whose display form differs from its raw bytes, or
//               which mixes ASCII with confusable non-ASCII letters, is badged
//               on the row and its raw codepoints are one click away.
//
// The desktop's own sanitiser (electron/desk/sanitise.ts, G-I2) already ran on
// these names before they left the machine. This file does NOT trust that. The
// payload arrives back over the wire from the brain; the renderer re-derives
// the display form from the bytes it is holding and badges any disagreement.
// A guarantee you only check once is a guarantee you check on the wrong shore.
import { useState } from "react";
import "./desk.css";

// ---------------------------------------------------------------------------
// The strip set
// ---------------------------------------------------------------------------

/** C0 + DEL + C1. Newline and tab included on purpose — a filename has none. */
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;
/** Bidi: LRE RLE PDF LRO RLO, LRI RLI FSI PDI, LRM RLM, ALM. */
const BIDI = /[\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/g;
/** Zero-width space/non-joiner/joiner, word joiner, BOM, invisible operators. */
const ZERO_WIDTH = /[\u200b-\u200d\u2060-\u2064\ufeff]/g;
/** Unicode tag characters — an entire invisible ASCII alphabet (U+E0000 block). */
const TAGS = /[\u{e0000}-\u{e007f}]/gu;
/** Interlinear annotation + object replacement + line/paragraph separators. */
const ODDBALLS = /[\ufff9-\ufffb\ufffc\u2028\u2029]/g;

/** Longest display form of one name. Beyond this it is middle-ellipsised. */
export const NAME_CAP = 96;

/**
 * Confusables that matter for a Windows path: characters that render as a Latin
 * letter in this app's faces but are a different codepoint on disk. This list is
 * deliberately short and specific rather than a full UTS-39 table — every entry
 * is a letter that has actually been used to impersonate a folder name (Cyrillic
 * and Greek lookalikes, Turkish dotless i, fullwidth Latin, Cherokee).
 *
 * It is a DETECTOR, not a decision: nothing here refuses anything. It decides
 * whether a row gets badged so King can look at the raw bytes himself. The
 * destination script policy that actually refuses lives in the guard.
 */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c",
  "у": "y", "х": "x", "і": "i", "ѕ": "s", "ј": "j",
  "һ": "h", "ԁ": "d", "ԛ": "q", "А": "A", "В": "B",
  "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
  "Р": "P", "С": "C", "Т": "T", "Х": "X", "Ѕ": "S",
  "І": "I", "Ј": "J",
  // Greek
  "α": "a", "ο": "o", "ν": "v", "ρ": "p", "σ": "o",
  "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H",
  "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O",
  "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
  // Turkish / Latin extended
  "ı": "i", "İ": "I", "ł": "l", "ǀ": "l",
  // Cherokee
  "Ꭰ": "D", "Ꭱ": "R", "Ꮐ": "G", "Ꮩ": "V",
  // Armenian
  "օ": "o", "հ": "h", "ռ": "n",
};

const HAS_ASCII_LETTER = /[A-Za-z]/;

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

function stripInvisible(s: string): string {
  return s
    .replace(CONTROLS, "")
    .replace(BIDI, "")
    .replace(ZERO_WIDTH, "")
    .replace(TAGS, "")
    .replace(ODDBALLS, "");
}

/**
 * Middle-ellipsise, NEVER end-ellipsise. The extension is the single most
 * load-bearing part of a filename on this card, so the tail is what survives.
 * (INJ-5 also: truncation must never be able to hide the thing that matters.)
 */
export function middleEllipsis(s: string, cap = NAME_CAP): string {
  if (s.length <= cap) return s;
  const tail = Math.min(28, Math.floor(cap / 3));
  const head = cap - tail - 1;
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
}

export interface SafeText {
  /** What goes in the DOM. Invisibles stripped, NFC-normalised, capped. */
  display: string;
  /** The bytes as they arrived. Never rendered except through rawEscape(). */
  raw: string;
  /** display !== the normalised raw — something was removed or shortened. */
  altered: boolean;
  /** An invisible/reordering character was present. The dangerous half of `altered`. */
  hadInvisible: boolean;
  /** ASCII letters mixed with confusable non-ASCII letters. */
  mixedScript: boolean;
  /** The confusable characters actually found, for the raw disclosure. */
  confusables: { ch: string; looksLike: string; code: string }[];
}

/**
 * The one place a raw name becomes something renderable. Every caller in this
 * stream goes through it; nothing interpolates a payload string into JSX.
 */
export function safeText(raw: unknown): SafeText {
  const src = typeof raw === "string" ? raw : String(raw ?? "");
  let normalised = src;
  try {
    normalised = src.normalize("NFC");
  } catch {
    /* a lone surrogate can throw; the un-normalised string is still safe to strip */
  }
  const stripped = stripInvisible(normalised).replace(/\s{2,}/g, " ");
  const hadInvisible = stripped !== normalised;
  const display = middleEllipsis(stripped);

  const confusables: SafeText["confusables"] = [];
  for (const ch of stripped) {
    const looksLike = CONFUSABLES[ch];
    if (looksLike) confusables.push({ ch, looksLike, code: codeOf(ch) });
  }
  const mixedScript = confusables.length > 0 && HAS_ASCII_LETTER.test(stripped);

  return {
    display,
    raw: src,
    altered: display !== src,
    hadInvisible,
    mixedScript,
    confusables,
  };
}

/**
 * The SKELETON of a name: what it LOOKS like, not what it is. Every confusable
 * is folded to the Latin letter it impersonates, separators are normalised, and
 * the result is case-folded.
 *
 * This is how two destinations that print identically get found. Comparing the
 * DISPLAY forms cannot do it — `Acme` and `Аcme` are different strings and
 * always will be; that IS the attack. Two names with the same skeleton and
 * different bytes are two folders that one pair of eyes cannot separate.
 *
 * DETECTOR ONLY. Nothing is refused, resolved or rewritten by it: the card
 * names the pair and sends him to the raw bytes. A skeleton match is a reason
 * to read, never a reason to act.
 */
export function skeleton(s: string): string {
  let out = "";
  for (const ch of stripInvisible(s)) out += CONFUSABLES[ch] ?? ch;
  return out.replace(/\//g, "\\").toLowerCase();
}

function codeOf(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * The SEE IT RAW form: every character that is not plain printable ASCII is
 * spelled out as its codepoint. This is the only rendering of a filename in the
 * app that is guaranteed to contain no character that can move another one.
 */
export function rawEscape(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x20 && cp <= 0x7e) out += ch;
    else if (cp > 0xffff) out += `\\u{${cp.toString(16).toUpperCase()}}`;
    else out += `\\u${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}

/** The extension as the FILE SYSTEM sees it — derived from raw bytes, never
 *  from the display form, so a bidi override cannot hide `.exe` behind `.pdf`. */
export function rawExtension(rel: string): string {
  const base = rel.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot).toLowerCase();
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

export interface UntrustedProps {
  /** The raw string off the payload. */
  value: string;
  /** Extra class on the <bdi>. */
  className?: string;
  /** Render the ⚠ badge + SEE IT RAW disclosure inline after the name. */
  disclose?: boolean;
}

/**
 * ONE filename, rendered so it cannot impersonate another one.
 *
 * <bdi> is the element whose entire job is "this text came from somewhere else
 * and its directionality must not leak"; dir="ltr" pins the base direction so a
 * name that is legitimately Hebrew or Arabic still cannot flip the row's layout;
 * and `unicode-bidi: isolate-override` in desk.css forces every character into
 * the base direction, which is what neutralises RLO for anything the strip pass
 * missed.
 */
export function Untrusted({ value, className, disclose = false }: UntrustedProps) {
  const t = safeText(value);
  const [showRaw, setShowRaw] = useState(false);
  const flagged = t.hadInvisible || t.mixedScript;

  return (
    <>
      <bdi dir="ltr" className={`uname${className ? ` ${className}` : ""}`} title={rawEscape(t.raw)}>
        {t.display}
      </bdi>
      {disclose && flagged && (
        <>
          {" "}
          <span className="unamewarn">
            {t.hadInvisible ? "⚠ NAME WAS ALTERED" : "⚠ LOOKALIKE LETTERS"}
          </span>{" "}
          <button type="button" className="unameraw" onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? "HIDE RAW" : "SEE IT RAW"}
          </button>
          {showRaw && (
            <div className="unamerawbox">
              <div className="unamerawline">{rawEscape(t.raw)}</div>
              {t.confusables.length > 0 && (
                <div className="unamerawnote">
                  {t.confusables
                    .map((c) => `${c.code} looks like "${c.looksLike}"`)
                    .join(" · ")}
                </div>
              )}
              {t.hadInvisible && (
                <div className="unamerawnote">
                  invisible or direction-changing characters were removed from the line above the
                  box. the escaped form is what is on disk.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default Untrusted;
