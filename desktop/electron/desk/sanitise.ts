// DESK — the filename sanitiser and the instruction-shape tripwire.
//
// A filename is written by whoever made the file. It is third-party text on a
// machine we do not control, and it is the ONLY attacker-chosen string in this
// whole feature. Two separate jobs live here and they must not be confused:
//
//   sanitise()             — makes a name safe to DISPLAY and safe to SHIP.
//                            Strips the characters that make a card lie (bidi
//                            overrides, zero-width joiners, control characters)
//                            and escapes the characters that would break out of
//                            the <untrusted_filenames> envelope. (G-I2, PATH-3)
//
//   looksLikeInstruction() — decides a name is not shippable at ALL. The name is
//                            withheld from the model, counted, and surfaced to
//                            King instead. A regex is not a decision about
//                            filing; it is a decision about whether a string is
//                            allowed to reach a language model. (G-I3, INJ-1)
//
// Pure. No fs, no network, no state. Exported for tests.
//
// Every class below is written with explicit \u escapes on purpose: a literal
// U+202E in this source file would be invisible to the next person reading it.
//
// Owning stream: DESK/S1.

/** Per-name budget. Longer names are middle-ellipsised, never end-ellipsised. (G-I5) */
export const MAX_DISPLAY = 96;

/** C0 and C1 control characters. */
const C0_C1 = new RegExp("[\u0000-\u001f\u007f-\u009f]", "g");
/** LRE RLE PDF LRO RLO, the isolates LRI RLI FSI PDI, and LRM RLM ALM. */
const BIDI = new RegExp("[\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]", "g");
/** ZWSP ZWNJ ZWJ, word joiner, invisible operators, BOM, Mongolian vowel sep. */
const ZERO_WIDTH = new RegExp("[\u200b-\u200d\u2060-\u2064\ufeff\u180e]", "g");
/** Tag characters — an entire invisible ASCII alphabet that renders as nothing. */
const TAG_CHARS = /[\u{e0000}-\u{e007f}]/gu;
const WS_RUN = /\s+/g;

/**
 * Characters that would let a filename break out of the envelope it is quoted
 * inside, or forge a structural marker in the card.
 *
 * The envelope renderScan emits is
 *
 *     <untrusted_filenames root="…" shown="…" note="…">  …rows…  </untrusted_filenames>
 *
 * so the structural set is exactly: `<` and `>`, which open and close the tag;
 * and `"`, which closes an attribute. The DOUBLE QUOTE WAS MISSING — a name (or
 * a model-authored root string, which is what `renderScan` interpolates when
 * the requested root is not on the census) containing one could close `root="`
 * and write its own attributes, or close the header tag early. There is no
 * entity decoding anywhere on this path, so `&` is not structural and is left
 * alone; `'` is not structural either, and escaping it would maul every
 * "Bob's invoice.pdf" on his disk for nothing.
 *
 * `\` is escaped because a name containing one reads as a path to a human eye.
 * `·` is escaped because the card and the log use it as a field separator.
 *
 * Newline never reaches this map: WS_RUN has already collapsed every whitespace
 * run to a single space, and C0_C1 removed the control characters outright.
 */
const ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  '"': "\\u0022",
  "\\": "\\u005c",
  "·": "\\u00b7",
};

export interface SanitisedName {
  /** Safe to render, safe to ship. */
  display: string;
  /** True when `display` differs from the input. Drives the card's warning badge. */
  altered: boolean;
  /** Escaped-codepoint form of the ORIGINAL, for the card's SEE IT RAW panel. */
  raw: string;
}

/**
 * G-I2. NFC -> strip C0/C1 -> strip bidi -> strip zero-width -> strip tag chars
 * -> collapse whitespace -> escape structural characters -> middle-ellipsise.
 *
 * Order matters: the strips run BEFORE the escapes so an invisible character
 * cannot be used to split an escape sequence.
 */
export function sanitise(name: string): SanitisedName {
  const original = name;
  let s = name.normalize("NFC");
  s = s.replace(C0_C1, "");
  s = s.replace(BIDI, "");
  s = s.replace(ZERO_WIDTH, "");
  s = s.replace(TAG_CHARS, "");
  s = s.replace(WS_RUN, " ").trim();
  s = s.replace(/["<>\\·]/g, (c) => ESCAPES[c] ?? c);
  s = middleEllipsise(s, MAX_DISPLAY);
  if (s === "") s = "(unnamed)";
  return { display: s, altered: s !== original, raw: escapeCodepoints(original) };
}

/**
 * Middle, never end: the extension is the single most load-bearing part of a
 * filename on a card that asks him to approve a move. An end-ellipsis hides it.
 */
export function middleEllipsise(s: string, max: number): string {
  const cps = [...s];
  if (cps.length <= max) return s;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return `${cps.slice(0, head).join("")}…${cps.slice(cps.length - tail).join("")}`;
}

/** Every non-printable-ASCII codepoint rendered as \u{XXXX}, for SEE IT RAW. */
export function escapeCodepoints(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    out += cp >= 0x20 && cp <= 0x7e ? ch : `\\u{${cp.toString(16)}}`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// G-I3 / INJ-1 — THE INSTRUCTION-SHAPE TRIPWIRE
//
// A name that trips this wire never reaches the model at all. It is counted,
// and it is surfaced to KING instead — he is told a number and told to go look.
//
// The shipped version was a list of ten phrases the spec named. An auditor
// wrote twelve evasions of it and eleven shipped. The corpus in
// verify/fixtures/injection-corpus.mjs holds fifty-nine, and the shipped wire
// caught ZERO of them. A phrase list is the wrong shape of object: the attacker
// picks the string, reads the list, and writes the sixtieth thing.
//
// So this is not a phrase list. It is three normalised views of the name plus a
// weighted score, built around what an attacker actually does:
//
//   NORMALISE   NFKC (fullwidth and mathematical alphabets fold to ASCII),
//               confusable homoglyphs mapped to ASCII, invisibles both DELETED
//               and SUBSTITUTED, then three views —
//                 loose    lowercase, separators intact  (tool tokens, hosts)
//                 fold     separators collapsed to spaces (word patterns)
//                 squeeze  fold with every space removed  (spaced-out letters,
//                          camelCase, dots-for-spaces, underscores)
//   DECODE      base64, percent-encoding and \uXXXX literals are decoded one
//               level and re-tested, so a payload cannot ride in as ciphertext.
//   SCORE       role impersonation, tool names, authority attribution,
//               confirmation-negation, urgency, please-plus-verb, absolute-rule
//               adverbs, second-person modals, procedure enumeration, sentence
//               shape. A few signals are decisive alone; most are not.
//
// THE TRADEOFF IS THE POINT. A withheld name vanishes from her index entirely,
// and he is told a COUNT, never which file — so a tripwire tuned to catch
// everything makes the feature useless in a way he cannot see. "Invoice -
// please pay by Friday.pdf" must survive, and so must "Setup Instructions.pdf",
// "URGENT CARE receipt.pdf", "Do Not Delete - archive keys.txt" and "Ignore
// list for the linter.txt". The operating point is a threshold of 3 on the soft
// score; verify/desk-injection-harness.mjs prints the resulting rates.
//
// AND IT IS ONE LAYER. Below it: she names a source by index id and cannot type
// a path (G-P1), the name she is shown is wrapped as untrusted data (G-I4), and
// nothing moves without his approval on a card showing every from -> to pair.
// A miss here is not a breach. Crippling the feature to avoid one would be.
// ---------------------------------------------------------------------------

/**
 * Confusable codepoints that render as a Latin letter: Cyrillic and Greek
 * lookalikes, the dotless i, and the punctuation an attacker substitutes.
 * Explicit \u escapes — a literal U+0430 here would be invisible to the next
 * reader, which is the whole attack.
 */
const CONFUSABLES: Record<string, string> = {
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c",
  "\u0445": "x", "\u0455": "s", "\u0456": "i", "\u0458": "j", "\u04bb": "h",
  "\u0443": "y", "\u043a": "k", "\u043c": "m", "\u043d": "h", "\u0442": "t",
  "\u0432": "b", "\u0410": "A", "\u0412": "B", "\u0415": "E", "\u041a": "K",
  "\u041c": "M", "\u041d": "H", "\u041e": "O", "\u0420": "P", "\u0421": "C",
  "\u0422": "T", "\u0425": "X", "\u0405": "S", "\u0406": "I", "\u0408": "J",
  "\u0391": "A", "\u0392": "B", "\u0395": "E", "\u0396": "Z", "\u0397": "H",
  "\u0399": "I", "\u039a": "K", "\u039c": "M", "\u039d": "N", "\u039f": "O",
  "\u03a1": "P", "\u03a4": "T", "\u03a5": "Y", "\u03a7": "X", "\u03bf": "o",
  "\u03b1": "a", "\u03b5": "e", "\u03c1": "p", "\u03c4": "t", "\u03bd": "v",
  "\u0131": "i", "\u0269": "i", "\u01c0": "l", "\u2044": "/", "\u2215": "/",
  "\uff0e": ".", "\u3002": ".", "\u2024": ".", "\u02d0": ":", "\uff1a": ":",
};

const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join("")}]`, "g");

function deConfuse(s: string): string {
  return s.replace(CONFUSABLE_RE, (c) => CONFUSABLES[c] ?? c);
}

/** Everything a filename can use as a word separator. */
const SEPARATORS = new RegExp("[\\s\\-_.+=~,;:!?()\\[\\]{}'\"`/\\\\|@#*&$%^<>\u2010-\u2015\u2018-\u201f]+", "g");

/** A run of base64 long enough to hold a sentence. */
const B64_RUN = /[A-Za-z0-9+/]{16,}={0,2}/g;
const PCT_RUN = /(?:%[0-9a-fA-F]{2}){4,}/g;
const UESC_RUN = /(?:\\u\{?[0-9a-fA-F]{4,6}\}?)+/g;

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64 -> ASCII, by hand. No Buffer and no atob: this module runs in the
 * desktop main process, under plain Node in the harness, and its twin lives in
 * the brain. A decoder with no host dependency behaves identically in all
 * three. Non-printable bytes become spaces — what we hunt for here is English.
 */
function fromBase64(s: string): string {
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64_ALPHABET.indexOf(ch);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      const byte = (acc >> bits) & 0xff;
      out += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : " ";
    }
  }
  return out;
}

function fromPercent(s: string): string {
  let out = "";
  for (const m of s.matchAll(/%([0-9a-fA-F]{2})/g)) {
    const byte = parseInt(m[1] as string, 16);
    out += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : " ";
  }
  return out;
}

function fromUEscapes(s: string): string {
  let out = "";
  for (const m of s.matchAll(/\\u\{?([0-9a-fA-F]{4,6})\}?/g)) {
    const cp = parseInt(m[1] as string, 16);
    if (cp > 0 && cp <= 0x10ffff) {
      try {
        out += String.fromCodePoint(cp);
      } catch {
        /* a lone surrogate; nothing readable to add */
      }
    }
  }
  return out;
}

/**
 * Everything one name decodes to, one level deep. Empty for almost every name.
 *
 * Each encoded run is substituted IN PLACE rather than extracted, because the
 * payload is usually only PARTLY encoded: the corpus's `ignore all
 * previous.txt` encodes exactly one letter, and pulling that escape out on its
 * own yields the string "i" while throwing away the sentence it was hiding in.
 *
 * And it runs on the CASE-PRESERVED name. Base64 is case-sensitive, so decoding
 * the lowercased view produces noise — which is a silent way for this entire
 * layer to do nothing at all while still looking like it is there.
 */
function decodedLayers(raw: string): string[] {
  const out: string[] = [];
  const add = (s: string): void => {
    if (s && s !== raw) out.push(s);
  };
  add(raw.replace(UESC_RUN, (m) => fromUEscapes(m)));
  add(raw.replace(PCT_RUN, (m) => fromPercent(m)));
  add(
    raw.replace(B64_RUN, (m) => {
      const t = fromBase64(m);
      // Substitute only when the decode looks like language rather than noise.
      return /[a-z]{3}/i.test(t) ? ` ${t} ` : m;
    }),
  );
  return out;
}

interface Views {
  /** lowercase, homoglyph-folded, separators INTACT */
  loose: string;
  /** separators collapsed to single spaces */
  fold: string;
  /** fold with every space removed */
  squeeze: string;
  /** true when homoglyph folding actually changed something */
  confused: boolean;
}

function views(name: string): Views {
  // NFKC, not NFC: it is NFKC that folds fullwidth ＩＭＰＯＲＴＡＮＴ and the
  // mathematical-bold alphabet down to ASCII. The DISPLAY path above still uses
  // NFC — this normalisation exists only to decide, never to render.
  const nfkc = String(name ?? "").normalize("NFKC");
  const folded = deConfuse(nfkc);
  const loose = folded.toLowerCase();
  const fold = loose.replace(SEPARATORS, " ").trim();
  return { loose, fold, squeeze: fold.replace(/ /g, ""), confused: folded !== nfkc };
}

/**
 * The ten patterns the SPEC names. These are law, and the hardening is strictly
 * additive: nothing below can stop one of these from firing. Run on the NFC
 * form with invisibles both deleted and substituted, and on the homoglyph-
 * folded form, so "ѕystem:" and "IMPORTANТ" trip the same wire as the
 * plain string.
 */
const SPEC_SHAPE = new RegExp(
  [
    "ignore\\s+(all\\s+)?previous",
    "system\\s*:",
    "assistant\\s*:",
    "standing\\s+rule",
    "King\\s+(said|added|asked|wants)",
    "do\\s+not\\s+ask",
    "IMPORTANT",
    "instructions?\\s*:",
    "</?(context_pack|untrusted_filenames)>",
    "https?://",
  ].join("|"),
  "i",
);

/**
 * Decisive on the SQUEEZED view — every separator gone, so "Ignore.all.previous",
 * "ignore_all_previous", "IgnoreAllPrevious" and "i g n o r e  a l l  p r e v i
 * o u s" are one string by the time they arrive. Nothing in here may be a
 * pattern a real filename produces by accident: there is no second signal.
 */
const HARD_SQUEEZE = new RegExp(
  [
    "ignore(all|the|any|every)?(previous|prior|above|earlier|foregoing|instruction)",
    "disregard(the|all|any|every)?(previous|prior|above|earlier|instruction|rule)",
    "forget(the|all|any|every)?(previous|prior|above|earlier|instruction|rule|everything)",
    "override(the|all|any|every)?(previous|prior|above|earlier|instruction|rule|guidance|enabled)",
    "standingrule|systemprompt|systemmessage|systemoverride|systemnote|beginsystem",
    "endof(filelist|untrusteddata|thelist|input|context|data)",
    "contextpack|untrustedfilenames",
    "deskfileplan|evehands",
    "noconfirmation|noneedtoconfirm|noneedtoask|noapprovalneeded|withoutasking",
    "withoutconfirmation|withoutapproval|skiptheapproval|skipapproval|autoapprov",
    "donotask|dontask|neverask",
    "approvedbyking|approvedbybrandon|kingapproved|brandonapproved",
    "king(said|says|added|asked|wants|authorised|authorized|approved|confirmed)",
    "brandon(said|says|added|asked|wants|authorised|authorized|approved|confirmed)",
    "healready(said|approved|agreed|confirmed)|hesaidyes|hesaiditsfine",
    "yesdoit|yesgoahead|goahead(and)?(move|file|stage|delete|sort|do)",
  ].join("|"),
  "i",
);

/**
 * Decisive on the LOOSE view, where underscores survive. Tool names and the
 * chat-template markers. `desk_scan` is matched WITH its underscore on purpose:
 * a scanned document genuinely called "desk scan.jpg" is a real filename and
 * must not vanish off his disk.
 */
const HARD_LOOSE = new RegExp(
  ["desk_scan", "desk_file_plan", "save_memory", "mcp__", "eve_hands", "<\\|", "\\|>"].join("|"),
  "i",
);

/** One soft signal: what it is, how much it is worth, and which view it reads. */
interface Signal {
  id: string;
  weight: number;
  view: "loose" | "fold";
  re: RegExp;
}

const SIGNALS: Signal[] = [
  // Role or vendor impersonation: a role word standing next to an instruction
  // noun. "system-report-2026.log" does not match; "SYSTEM MESSAGE" does.
  {
    id: "role-adjacent",
    weight: 3,
    view: "fold",
    re: /\b(system|assistant|user|developer|human|operator|model|agent|anthropic|openai|claude|eve)\b[^a-z0-9]{0,3}\b(message|prompt|note|notice|override|instruction|instructions|directive|mode|rule|rules|policy|update)\b/,
  },
  // A role word wearing brackets — [assistant], <<SYS>>, [[sys]].
  {
    id: "role-bracketed",
    weight: 3,
    view: "loose",
    re: /[[\]<>{}|]{1,2}\s*(sys|system|assistant|user|developer|human|inst)\s*[[\]<>{}|]{1,2}/,
  },
  // A structural marker borrowed from a prompt format.
  { id: "structural-marker", weight: 2, view: "loose", re: /(^|[\s\-_])#{2,}\s|\[\[|\]\]|<<|>>/ },
  // The word instruction/directive/prompt, without the colon the spec matched.
  { id: "instruction-word", weight: 1, view: "fold", re: /\b(instruction|instructions|directive|directives|prompt)\b/ },
  // One imperative verb, counted ONCE however many appear.
  {
    id: "imperative",
    weight: 1,
    view: "fold",
    re: /\b(ignore|disregard|forget|override|stop|delete|remove|move|copy|stage|send|upload|download|run|call|execute|open|reply|approve|confirm|skip|bypass|empty|clear|purge|sort|file|do|drop|read)\b/,
  },
  // A directive that only ever appears inside a conversation.
  { id: "strong-directive", weight: 2, view: "fold", re: /\b(proceed|go ahead|carry on|do the following|as follows|do it)\b/ },
  // Second person at all.
  { id: "second-person", weight: 1, view: "fold", re: /\b(you|your|youre|yours|eve)\b/ },
  // Second person with a modal — this is a sentence addressed to a reader.
  {
    id: "second-person-modal",
    weight: 3,
    view: "fold",
    re: /\byou (are|will|must|should|can|may|have|need|do|dont)\b|\byour (job|task|instructions|rules|new|orders)\b/,
  },
  // The negation of his approval, which is the whole prize.
  {
    id: "confirmation-negation",
    weight: 3,
    view: "fold",
    re: /\bno (need|confirmation|approval)\b|\bwithout (asking|confirmation|approval|him|his)\b|\bdon ?t ask\b|\bskip the (approval|confirmation|card|check)\b|\bauto ?approv/,
  },
  // Words put in King's mouth.
  {
    id: "authority-attribution",
    weight: 3,
    view: "fold",
    re: /\b(king|brandon|he|she|the owner|the user|management)\s+(said|says|added|asked|wants|approved|authorised|authorized|confirmed|agreed|already)\b|\bapproved by\b|\bfrom (king|brandon)\b|\b(king|brandon) (yes|ok|okay|go|approved|confirmed)\b|\bmessage from\b/,
  },
  // Urgency. One point each, capped — a pile of adjectives is not an attack.
  {
    id: "urgency",
    weight: 1,
    view: "fold",
    re: /\b(urgent|critical|attention|asap|immediately|action required|time sensitive|do not delay)\b/,
  },
  // "before you sort" — a directive pinned to the thing she is about to do.
  {
    id: "temporal-directive",
    weight: 1,
    view: "fold",
    re: /\bbefore (you |any |the |we )?(sort|sorting|filing|file|moving|move|approving|approval|running|run|proceeding|proceed)\b/,
  },
  // please + a verb that touches his files. "please pay by Friday" is not this.
  {
    id: "please-directive",
    weight: 3,
    view: "fold",
    re: /\bplease\s+(do|send|move|copy|file|delete|stage|approve|confirm|ignore|forward|upload|run|sort|empty|clear)\b/,
  },
  // A filename asserting a rule.
  {
    id: "rule-assertion",
    weight: 2,
    view: "fold",
    re: /\b(new|updated|revised|amended)\s+(rule|rules|policy|policies|procedure|directive|instruction|instructions)\b|\bpolicy update\b/,
  },
  // always/never plus a file verb — the grammar of a standing order.
  {
    id: "absolute-rule",
    weight: 2,
    view: "fold",
    re: /\b(always|never)\s+(do|move|file|stage|delete|empty|clear|ask|confirm|approve|sort|send|upload|open|run)\b/,
  },
  // An enumerated procedure.
  { id: "procedure", weight: 2, view: "fold", re: /\bstep ?\d\b[\s\S]*\bstep ?\d\b/ },
  // A host that never wrote a scheme — the spec matched https:// and nothing else.
  {
    id: "suspicious-host",
    weight: 3,
    view: "loose",
    re: /\bhxxps?\b|\b[a-z0-9-]{2,}\.(tld|xyz|top|ru|zip|click|link|onion|gq|cf|tk)\b|\bdot\s+(tld|com|net|org|ru|xyz)\b|\b(dot|slash)\s+\w+\s+(dot|slash)\b/,
  },
  { id: "www", weight: 1, view: "loose", re: /\bwww\./ },
  // A vendor or model name. On its own, worth very little — he downloads
  // receipts from these companies.
  { id: "vendor", weight: 1, view: "fold", re: /\b(anthropic|openai|claude|chatgpt|gemini|gpt)\b/ },
];

/** Signals that stack rather than fire once, and where they stop stacking. */
const CAPPED = new Map<string, number>([["urgency", 2]]);

/** The operating point. See the tradeoff note above before changing it. */
const THRESHOLD = 3;

export interface InstructionVerdict {
  /** True when the name must never reach the model. */
  hit: boolean;
  /** Which layer decided: spec, decoded, hard, score, or "" for a clean name. */
  rule: string;
  score: number;
  signals: string[];
}

/** Word count with a trailing extension dropped — a name is not a sentence. */
function wordCount(fold: string): number {
  const words = fold.split(" ").filter(Boolean);
  if (words.length > 1 && /^[a-z0-9]{1,5}$/.test(words[words.length - 1] as string)) words.pop();
  return words.length;
}

function scoreViews(v: Views): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;
  for (const s of SIGNALS) {
    const subject = s.view === "loose" ? v.loose : v.fold;
    const cap = CAPPED.get(s.id);
    if (cap !== undefined) {
      const n = Math.min(cap, (subject.match(new RegExp(s.re.source, "g")) ?? []).length);
      if (n > 0) {
        score += n * s.weight;
        signals.push(`${s.id}x${n}`);
      }
      continue;
    }
    if (s.re.test(subject)) {
      score += s.weight;
      signals.push(s.id);
    }
  }
  // A name long enough to be a paragraph is not a name.
  if (v.fold.length >= 90) {
    score += 1;
    signals.push("very-long");
  }
  // Sentence shape: it takes a lot of words AND someone to address or something
  // to command. Nine words of date and camera model is still a filename.
  if (
    wordCount(v.fold) >= 8 &&
    (/\b(you|your|eve)\b/.test(v.fold) ||
      /\b(ignore|disregard|forget|override|delete|move|copy|stage|send|upload|run|open|approve|confirm|sort|file|clear|empty)\b/.test(v.fold))
  ) {
    score += 2;
    signals.push("sentence-shape");
  }
  // Mixed-script substitution happened. Never decisive alone: a legitimately
  // Cyrillic-named file is his business, not an attack.
  if (v.confused) {
    score += 2;
    signals.push("homoglyph-folded");
  }
  return { score, signals };
}

/**
 * The full verdict — exported so the harness can print WHY rather than a bare
 * boolean, and so a future settings panel can show him what tripped.
 */
export function instructionVerdict(name: string): InstructionVerdict {
  const raw = String(name ?? "");

  // 1. The spec's own ten. Law.
  const nfc = raw.normalize("NFC");
  const del = nfc.replace(C0_C1, "").replace(BIDI, "").replace(ZERO_WIDTH, "").replace(TAG_CHARS, "");
  // Deleting is not enough: "Ignore<ZWSP>all previous" DELETES to
  // "Ignoreall previous", which `ignore\s+(all\s+)?previous` does not match,
  // while a language model reads it as the instruction anyway. So the invisible
  // run is also SUBSTITUTED with a space, restoring the boundary the attacker
  // removed, and both forms are tested.
  const sub = nfc
    .replace(C0_C1, " ")
    .replace(BIDI, " ")
    .replace(ZERO_WIDTH, " ")
    .replace(TAG_CHARS, " ")
    .replace(/\s+/g, " ");
  if (SPEC_SHAPE.test(del) || SPEC_SHAPE.test(sub) || SPEC_SHAPE.test(deConfuse(raw.normalize("NFKC")))) {
    return { hit: true, rule: "spec", score: 100, signals: ["spec-shape"] };
  }

  const candidates = [views(del), views(sub)];

  // 2. One level of decoding. A payload cannot ride in as ciphertext.
  for (const layer of [...decodedLayers(del), ...decodedLayers(sub)]) {
    if (SPEC_SHAPE.test(layer)) return { hit: true, rule: "decoded", score: 100, signals: ["decoded-payload"] };
    const lv = views(layer);
    if (HARD_SQUEEZE.test(lv.squeeze) || HARD_LOOSE.test(lv.loose)) {
      return { hit: true, rule: "decoded", score: 100, signals: ["decoded-payload"] };
    }
  }

  // 3. The decisive patterns.
  for (const v of candidates) {
    if (HARD_SQUEEZE.test(v.squeeze)) return { hit: true, rule: "hard", score: 100, signals: ["hard-squeeze"] };
    if (HARD_LOOSE.test(v.loose)) return { hit: true, rule: "hard", score: 100, signals: ["hard-loose"] };
  }

  // 4. The score.
  let best = { score: 0, signals: [] as string[] };
  for (const v of candidates) {
    const r = scoreViews(v);
    if (r.score > best.score) best = r;
  }
  const hit = best.score >= THRESHOLD;
  return { hit, rule: hit ? "score" : "", score: best.score, signals: best.signals };
}

export function looksLikeInstruction(name: string): boolean {
  return instructionVerdict(name).hit;
}

// ---------------------------------------------------------------------------
// Destination script policy (PATH-3, T12)
// ---------------------------------------------------------------------------

/**
 * A DESTINATION name is written by the model, not by the filesystem, and two
 * visually identical folder names that differ by one Cyrillic character split
 * his invoices across two directories neither of us can tell apart.
 *
 * Basic Latin + Latin-1 Supplement + Latin Extended-A/B + Latin Extended
 * Additional. Sources are never script-restricted — his disk holds what it
 * holds. This applies to destinations only.
 */
const ALLOWED_DEST = new RegExp("^[\u0020-\u007e\u00a0-\u024f\u1e00-\u1eff]*$");

export function destScriptOk(segment: string): boolean {
  return ALLOWED_DEST.test(segment.normalize("NFC"));
}

/** NFC + case-fold. The only correct way to compare two NTFS destinations. (G-D7) */
export function foldPath(p: string): string {
  return p.normalize("NFC").toLowerCase();
}

// ---------------------------------------------------------------------------
// G-V1 — THE NEVER-LIST
//
// This lived in index-store.ts, where it was applied at scan time and nowhere
// else. It moved here — a module with no fs, no state and no callers of its own
// — for one reason: the DESK is the authoritative gate, and the gate has to be
// able to apply the same rule to a path that has already arrived. Two copies of
// this matcher would be two rules that drift; there is one, and the eye and the
// guard both call it.
// ---------------------------------------------------------------------------

/**
 * A deliberately small matcher: `**` crosses separators, `*` does not, `?` is
 * one character. Patterns are matched against the root-relative path AND
 * against the bare filename, both case-folded, because his list mixes the two
 * shapes (`**​/.ssh/**` and `id_rsa*`).
 */
export function neverListMatcher(patterns: string[]): (rel: string, name: string) => boolean {
  const res: RegExp[] = [];
  for (const raw of patterns) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const p = raw.trim().replace(/\\/g, "/").toLowerCase();
    let out = "";
    for (let i = 0; i < p.length; i += 1) {
      const c = p[i];
      if (c === "*") {
        if (p[i + 1] === "*") {
          out += ".*";
          i += 1;
          if (p[i + 1] === "/") i += 1;
        } else {
          out += "[^/]*";
        }
      } else if (c === "?") out += "[^/]";
      else out += (c as string).replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    try {
      res.push(new RegExp(`^${out}$`));
    } catch {
      /* a pattern that will not compile is dropped, never half-applied */
    }
  }
  return (rel: string, name: string): boolean => {
    const r = rel.replace(/\\/g, "/").toLowerCase();
    const n = name.toLowerCase();
    return res.some((re) => re.test(r) || re.test(n));
  };
}

/** Compiled once per distinct list. The guard asks this on every op. */
let neverCache: { key: string; fn: (rel: string, name: string) => boolean } | null = null;

function matcherFor(patterns: string[]): (rel: string, name: string) => boolean {
  const key = patterns.join("\n");
  if (!neverCache || neverCache.key !== key) neverCache = { key, fn: neverListMatcher(patterns) };
  return neverCache.fn;
}

/**
 * G-V1 applied to ONE root-relative path, ancestors included.
 *
 * The eye tests each entry as it walks, so a never-listed FOLDER is never
 * descended and everything under it is invisible by construction. A path handed
 * to the GUARD has no walk behind it — it arrives whole — so the folder rule has
 * to be re-applied by hand: every ancestor segment is tested as a path AND as a
 * bare name, then the full relative path and the file's own name.
 *
 * Without the ancestor loop a bare pattern like `credentials` would hide the
 * folder from the eye and let `credentials/aws.txt` straight through the desk.
 * (MEDIUM-3)
 */
export function neverHit(neverList: string[] | undefined, rel: string): boolean {
  if (!neverList || neverList.length === 0) return false;
  if (typeof rel !== "string" || rel.length === 0) return false;
  const match = matcherFor(neverList);
  const segs = rel.replace(/\\/g, "/").split("/").filter(Boolean);
  for (let i = 1; i <= segs.length; i += 1) {
    if (match(segs.slice(0, i).join("/"), segs[i - 1] as string)) return true;
  }
  return false;
}
