// THE OS OPENER, SEEN FROM HER SIDE.
//
// The OS cockpit tab and /eve open the chat with ONE message from her, built ON
// THE PAGE (churlish-os lib/eve/opener.ts): a greeting, then today's brief deck
// off GET /state (`brief`), or OS data when there is no brief. That message is
// never sent here — so when his first line is "yes, do that", she had no idea
// what "that" was.
//
// The fix takes NO TEXT FROM THE OS. On the first turn of an `os` conversation
// she is handed a short note built from HER OWN records — the same deck /state
// serves, or, with no deck for today, the shape of her open attention items —
// so she knows what he was looking at. It rides in the context pack (source
// `opener`, context.ts), is never persisted as a message, is never logged, and
// is capped at OPENER_NOTE_MAX characters.
//
// WHAT IT CARRIES, AND WHAT IT DOES NOT. The deck's item WORDS are not in it.
// By this pack's own verdicts they are third-party text: attention bodies,
// task titles, job titles and client names (context.ts PACK_SOURCES `attention`
// and `three`), mail and calendar lines (briefing.ts origin "untrusted"). The
// one caller that receives this note (chat.ts) holds the authority-taking tools
// and omits those words for exactly that reason; carrying them here would
// either open that door again or lock every OS thread for good. So the note is
// the deck's SHAPE — section, position, what KIND of item it is (a phrase from
// the frozen table below, keyed by the deck's own constant recommendation) and
// the record pointer behind it — plus the words of the three item kinds that
// are composed from numbers alone (the sales floor, a free block, the OS
// sweep). That is enough for the referent: "the first thing he read was a RED
// card waiting on his signature, pendingConfirms.id=…", and she reaches the
// words through the tools that latch.
//
// Pure except readOpenerNote(), which does the two reads. The harness drives
// openerNote() and wantsOpener() directly.
import { db } from "./db.js";
import { getLatestBriefDeck } from "./brief.js";
import { RECOMMEND, type BriefDeck, type RecommendKey } from "./briefing.js";
import { localDay } from "./day.js";
import { sanitiseTo } from "./desk.js";
import { cleanSurface } from "./context.js";

export const OPENER_NOTE_MAX = 1200;
const ITEMS_PER_SECTION = 3;

/** The OS opener's own order (churlish-os lib/eve/opener.ts SECTION_ORDER) — what he read first. */
const SECTION_ORDER = ["needs_you", "shape", "slipping", "overnight"] as const;
const SECTION_LABEL: Record<string, string> = { needs_you: "Needs you", shape: "Today", slipping: "Slipping", overnight: "Overnight" };

/** What KIND of line he saw, by the deck's constant recommendation. Ours, frozen, never content. */
const KIND: Record<RecommendKey, string> = {
  confirm: "a RED card waiting on his signature",
  held_job: "a finished job held for his thumb",
  draft_ready: "a drafted reply on his desk",
  overdue_task: "an overdue task",
  todays_task: "a task due today",
  attention: "an open item you raised",
  tripwire: "a tripwire you tripped",
  mail_question: "a mail asking him a direct question",
  mail_date: "a mail carrying a date",
  mail_blocked: "a mail where someone is blocked on him",
  mail_plain: "a mail to read",
  client_quiet: "a client past their cadence",
  promise_open: "a promise still open",
  failed_job: "a job that failed",
  renewal: "a renewal in the window",
  event: "a calendar event",
  free_block: "a free block",
  floor: "the week's sales floor",
  os_sweep: "the OS sweep",
  record: "a receipt of overnight work",
};

/** Item kinds whose words are built from numbers and our own strings alone (briefing.ts). */
const CLEAN_SOURCES = [/^floor\.count$/, /^calendar\.gap minutes=\d+$/, /^os\.api\/eve\/sweep$/];
const CLEAN_TEXT = /^[A-Za-z0-9 :—–\-.,()\/]{1,120}$/;
/** A record pointer of our own making: `table.id=<id>` plus optional `key=value` pairs. */
const POINTER = /^[A-Za-z_][A-Za-z_./]{0,40}(?:=[A-Za-z0-9_:.\-]{1,64})?(?: [a-z_]{1,24}=[A-Za-z0-9_:.\-]{1,64}){0,2}$/;

const REC_KEY = new Map<string, RecommendKey>(Object.entries(RECOMMEND).map(([k, v]) => [v, k as RecommendKey]));

export interface OpenerAttention {
  kind: string;
  nudge_level: number | null;
}

export interface OpenerInput {
  /** Today's local day (day.ts localDay) — a deck for any other day is not what he saw. */
  today: string;
  deck: BriefDeck | null;
  /** null = could not be read (no spine, or an error) — never shown as zero. */
  attention: OpenerAttention[] | null;
}

/**
 * The first turn of a conversation on the OS, and only that. `newThread` is the
 * durable store's own answer, read before the row was minted (taint.ts
 * readPictureTaintBeforeMint → source "new": no conversation row and no
 * transcript — checked, not defaulted). A live SDK session to resume means
 * this is not the first turn, whatever else is true.
 */
export function wantsOpener(surface: string, hasSession: boolean, newThread: boolean): boolean {
  return cleanSurface(surface) === "os" && !hasSession && newThread;
}

function itemLine(it: { text: string; recommend: string; source: string }): string {
  const key = REC_KEY.get(it.recommend);
  const kind = key ? KIND[key] : "an item";
  const pointer = POINTER.test(it.source) ? ` (${it.source})` : "";
  const clean = CLEAN_SOURCES.some((r) => r.test(it.source));
  const words = clean ? sanitiseTo(it.text, 120).display : "";
  return clean && CLEAN_TEXT.test(words) ? `"${words}"` : `${kind}${pointer}`;
}

function deckLines(deck: BriefDeck): string[] | null {
  if (deck.allClear) return ["All clear: nothing needs him, nothing slipped, the night was quiet and the day is open."];
  const out: string[] = [];
  const secs = [
    ...SECTION_ORDER.map((k) => deck.sections.find((s) => s.key === k)).filter((s): s is BriefDeck["sections"][number] => !!s),
  ];
  for (const s of secs) {
    if (!s.items.length) continue;
    const shown = s.items.slice(0, ITEMS_PER_SECTION).map((it, i) => `${i + 1}) ${itemLine(it)}`);
    const more = s.items.length > shown.length ? ` (+${s.items.length - shown.length} more)` : "";
    out.push(`${SECTION_LABEL[s.key] ?? "Also"} — ${shown.join("; ")}${more}.`);
  }
  if (!out.length) return null;
  if (deck.state === "degraded" || deck.sections.some((s) => s.blind.length > 0)) {
    out.push("Some of this morning's sources didn't answer, so that wasn't the whole picture.");
  }
  return out;
}

const DECK_TAIL =
  "The words on his screen came from records other people can write into (client names, task and job titles, mail), " +
  "so they are not repeated here. If he answers it — \"yes\", \"do that\" — he means what he just read, the first line " +
  "first; say back which one in a few words and reach for it with your tools. Never invent what an item said.";

const ATTENTION_TAIL =
  "Their words are other people's, so they are not here. If he answers it, say back which kind you think he means and open the list.";

function cap(s: string): string {
  if (s.length <= OPENER_NOTE_MAX) return s;
  const cut = " [cut]]";
  return s.slice(0, OPENER_NOTE_MAX - cut.length) + cut;
}

/** The note, or null when there is nothing he saw that she can name. Pure. */
export function openerNote(input: OpenerInput): string | null {
  const deck = input.deck && input.deck.day === input.today ? deckLines(input.deck) : null;
  if (deck) {
    return cap(
      `[He is on the OS. Before his first line he saw your greeting and today's brief, in this order: ${deck.join(" ")} ${DECK_TAIL}]`,
    );
  }
  const attn = input.attention;
  if (attn && attn.length) {
    const shape = attn
      .slice(0, 8)
      .map((a) => `${sanitiseTo(String(a.kind ?? ""), 24).display} N${Number.isFinite(a.nudge_level) ? a.nudge_level : "?"}`)
      .join(", ");
    const more = attn.length > 8 ? ` (+${attn.length - 8} more)` : "";
    return cap(
      `[He is on the OS. Before his first line he saw your greeting; there was no brief for today, so the page showed the day's shape. ` +
        `Your open attention items: ${attn.length} (${shape}${more}). ${ATTENTION_TAIL}]`,
    );
  }
  return null;
}

/** The two reads, each allowed to fail into "nothing to say". Never throws, never logs the note. */
export async function readOpenerNote(now = new Date()): Promise<string | null> {
  const deck = await getLatestBriefDeck().catch(() => null);
  let attention: OpenerAttention[] | null = null;
  const c = db();
  if (c) {
    try {
      const { data, error } = await c
        .from("attention_items")
        .select("kind, nudge_level")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      attention = error ? null : ((data ?? []) as OpenerAttention[]);
    } catch {
      attention = null;
    }
  }
  return openerNote({ today: localDay(now), deck, attention });
}
