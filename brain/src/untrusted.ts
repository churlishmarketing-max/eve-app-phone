// THE DURABLE CONVERSATION TAINT — "has this conversation ever carried
// somebody else's words?", asked of the store that also holds the transcript,
// and answered in a way that cannot be lost by restarting a process.
//
// Owning stream: BRAIN/R1 · W1.
//
// This file is the MAIL-SIDE TWIN of the shipped picture taint
// (C:\dev\eve brain/src/taint.ts + sql/005_picture_taint.sql). Same store, same
// table, same five properties, same fail-closed posture. It is named
// `untrusted.ts` rather than `taint.ts` ON PURPOSE: the two are different
// columns answering different questions, and a file that silently collided with
// the shipped one on a merge would be the worst possible place to resolve a
// conflict by hand. If they are ever unified, it should be a decision somebody
// makes, not a merge artefact.
//
// ---------------------------------------------------------------------------
// WHAT THE FIFTH DOOR ACTUALLY WAS
//
// The TurnLatch (src/authority.ts) protects a TURN. The model's memory is a
// CONVERSATION. chat.ts passes `resume: resumeSession`, so the SDK reloads the
// whole conversation — including the RAW mail tool-result from turn 1 — and the
// judge drove it end to end:
//
//   J1.1  turn 1 reads mail -> schedule_unit REFUSES, unit_schedules rows = 0
//   J1.2  turn 2, SAME conversation, session RESUMED -> includeHistory is
//         `!resumeSession`, so recentTurns never runs and the replay taint
//         (V1/JD) never fires
//   J1.4  turn 2 IS FULLY ARMED: schedule_unit WRITES — rows = 1,
//         created_by = "king", task = "STANDING ORDER FROM KING: …"
//   J1.5  …and so is cancel_schedule, save_note, save_memory, os_create_invoice
//
// The last round closed the RARE carrier (the durable `messages` replay, only on
// the first message after a restart) and left the COMMON one open (the live SDK
// transcript, every turn after the first). Evicting the session id on latch()
// does not close it either — it delays it exactly one turn, because the next
// turn resumes a session that contains the replay envelope.
//
// So the fact has to outlive the turn, and it has to live where the transcript
// lives.
//
// ---------------------------------------------------------------------------
// THE FIVE PROPERTIES THIS MODULE EXISTS TO HOLD
//
//   1. DURABLE, AND IN THE SAME STORE AS THE HISTORY. `conversations
//      .read_untrusted` sits on the same row Supabase hands the replayed turns
//      back from, so "this conversation has read a stranger's words" and "here
//      is what was said in it" cannot disagree: they die together or neither
//      does. (sql/007, folded in — ONE migration for him to paste, not two.)
//   2. WRITTEN BEFORE THE MAIL REACHES THE MODEL. `markUntrustedRead` is
//      AWAITED inside the reader tool, before the mail text is returned, and a
//      write that fails means the reader RETURNS NO MAIL. A crash, a timeout or
//      a maxTurns exhaustion mid-turn therefore leaves the conversation LOCKED
//      rather than open — the failure mode points the safe way.
//   3. MONOTONIC. There is exactly one writer below and it only ever writes
//      `true`. Nothing clears it: not an error, not the catch in chat.ts, not
//      session eviction, not a restart, not a redeploy. It ends when the
//      conversationId ends — which is what the deck's reset button does.
//
//      AND IT IS NOT MONOTONIC AGAINST ABSENCE. That is the D6-B lesson from
//      the picture work and it cost an audit to learn: `ensureConversation`
//      upserts {id, surface}, the column's `not null default false` RE-MINTS a
//      lost row as clean, and a read taken after that upsert answers "clean,
//      source: row" — a witness swearing it read a row the reader created a
//      millisecond earlier. So THE ORDER IS READ, THEN MINT (chat.ts), and
//      `readUntrustedTaintBeforeMint` is the only thing allowed to interpret a
//      missing row.
//   4. FAILS CLOSED. Store not configured, row missing, select errored, column
//      absent because sql/007 was never applied — every one of those is
//      UNKNOWN, and unknown REFUSES. An unknown answer is not a clean answer,
//      and the refusal SAYS WHICH ONE IT WAS.
//   5. IT IS A WITNESS, NOT A CLAIM. `TaintRead` records where the answer came
//      from, and that record is what the refusal and the desktop's lock frame
//      are built out of. The picture work shipped a HARDCODED witness once and
//      an audit caught it; nothing in this file returns a constant that did not
//      come from an actual observation.
//
// NO CACHE LIVES IN THIS FILE. A memo of "this conversation is clean" would be
// the in-memory Map the picture audit killed, wearing a smaller name. The
// per-turn TurnLatch stays as a FAST PATH IN ONE DIRECTION ONLY: it can say
// TAINTED without a round trip, and it is never believed when it says clean.

import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { sanitiseTo } from "./desk.js";

// ---------------------------------------------------------------------------
// THE KEY ITSELF IS REQUEST BODY, AND IT WAS TAKEN ON TRUST (bookkeeping, named
// by the judge). `conversationId` arrives on POST /chat and is the KEY every
// question in this file is asked on, the id every row of the thread is written
// under, and the value that rides back out on the `locked` frame. Uncapped and
// unvalidated, a malformed client could write rows under a 4KB key or ask the
// taint question about something that is not an id.
//
// Same shape as cleanSurface (context.ts, W4): a SHAPE check, no judgement
// about what the string SAYS, and anything that fails it becomes a FRESH
// conversation rather than an error — the route is bearer-gated, so this is his
// own client, and refusing his turn over a bad id would be the worse bug. 64
// chars is roomy for a uuid (36) and still a cap.
// ---------------------------------------------------------------------------
const CONV_ID_MAX = 64;
export function cleanConversationId(id: unknown): string {
  if (typeof id !== "string") return randomUUID();
  const t = id.trim();
  if (!t || t.length > CONV_ID_MAX) return randomUUID();
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(t) ? t : randomUUID();
}

// ---------------------------------------------------------------------------
// A POSTGRES ERROR IS NOT OUR PROSE, AND IT TRAVELS FURTHER THAN IT LOOKS.
//
// `error.message` from PostgREST is echoed into `read.why`, which the tool
// returns to the model, which chat.ts puts on the `locked` frame, which the
// desktop renders VERBATIM in the lock panel. So an error string decides what
// appears inside her refusal and on his deck — the same class as the `surface`
// fix (context.ts cleanSurface), and closed the same way: through the SAME
// audited sanitiser filenames and mail go through (desk.ts), capped, with the
// REASON KEPT. He still gets to read what actually broke; it just cannot carry
// a delimiter, a control character, or a paragraph.
//
// No judgement is made about what the message SAYS. It is a shape check.
// ---------------------------------------------------------------------------
const DB_ERROR_MAX = 160;
function safeDbError(message: unknown): string {
  return sanitiseTo(String(message ?? ""), DB_ERROR_MAX).display;
}

/**
 * WHAT THE DURABLE STORE SAID. Three answers and no fourth. `unknown` is not a
 * soft `clean`: every caller treats it as a refusal.
 */
export type TaintStatus = "clean" | "tainted" | "unknown";

/** Where the answer came from. This is the evidence half. */
export type TaintSource =
  /** The row was read and the column answered. */
  | "row"
  /** No conversation row exists in the store. Unknown: nothing to read. */
  | "no-row"
  /** Supabase is not configured on this brain at all. */
  | "offline"
  /** The select failed — network, permissions, or sql/007 never applied. */
  | "error"
  /** This turn already read a stranger's words; no round trip was needed. */
  | "memory"
  /**
   * NO ROW, AND NOTHING DERIVED FROM THIS CONVERSATION SURVIVES EITHER — not
   * one message, so there is no transcript to replay and nothing to launder.
   * The first turn of a genuinely new conversation, CLEAN because that was
   * CHECKED rather than because an upsert defaulted a column. It is the shape
   * the deck's reset button creates, and it is this design's only exit.
   */
  | "new"
  /**
   * NO ROW, BUT ITS TRANSCRIPT IS STILL THERE. The record of whether mail was
   * read in this conversation is gone while the thing that mail would have
   * poisoned is not. UNKNOWN, and it refuses.
   */
  | "orphan"
  /**
   * NOBODY ASKED. The default a TurnLatch is born with when its caller wired no
   * durable read at all. It is UNKNOWN — a turn that never consulted the store
   * has no business taking authority — and it exists so that "somebody built a
   * latch the short way" is a refusal rather than a silent allow.
   */
  | "not-consulted";

export interface TaintRead {
  status: TaintStatus;
  source: TaintSource;
  /**
   * ONE PLAIN SENTENCE, ALWAYS POPULATED, and always describing what was
   * actually observed. It is what she says out loud, so it is written for him
   * and not for a log.
   */
  why: string;
}

/** The read a latch is born with when its caller wired nothing. Refuses. */
export const NOT_CONSULTED: TaintRead = {
  status: "unknown",
  source: "not-consulted",
  why: "nothing asked my durable store whether this conversation has already read someone else's words, so I cannot tell you that it hasn't",
};

// ---------------------------------------------------------------------------
// F1 · TWO CARRIERS, TWO SCOPES — THE DIFFERENCE, WRITTEN DOWN ONCE.
//
// The round before this one collapsed these into a single boolean and answered
// it with markUntrustedRead(), a per-CONVERSATION, monotonic, durable lock. The
// judge drove it: two replayed rows of "morning" / "Morning. Coffee's on." — no
// mail, no calendar, nothing anybody else wrote — locked an ordinary thread FOR
// GOOD (schedule_unit rows=0 forever, and distill.ts quarantining his own words
// nightly). `includeHistory = !resumeSession`, and the session Map is evicted by
// a redeploy, a cold start, an SDK terminal error, the 100s timeout, or closing
// the window mid-answer, so it fired in ordinary use.
//
// These two predicates are the whole distinction, and they are HERE — beside
// the durable write they gate — rather than inline in chat.ts, so the next
// reader cannot re-conflate them without deleting a named function that a
// harness drives.
// ---------------------------------------------------------------------------

/** What the briefing we are about to send actually carried. */
export interface PackCarriers {
  /**
   * SOMEBODY ELSE WROTE WORDS THAT ARE NOW IN HER CONTEXT: calendar titles,
   * attention bodies, Today's Three titles (context.ts onUntrusted).
   */
  thirdParty: boolean;
  /**
   * WE REPLAYED OUR OWN TRANSCRIPT — rows this same conversation already wrote
   * (context.ts recentTurns / onReplay). Still untrusted, because the
   * transcript may quote mail she read on an earlier turn and asking which
   * would be a classifier. But it is OURS, and it is not evidence about the
   * thread that outlives the turn.
   */
  replay: boolean;
}

/**
 * DOES THIS TURN RUN LATCHED? Either carrier closes the latch: per-turn,
 * one-way, never written down. The trade the round before this one accepted:
 * he says it again and it works.
 */
export function latchesThisTurn(c: PackCarriers): boolean {
  return c.thirdParty || c.replay;
}

/**
 * DOES THIS CONVERSATION GET THE DURABLE LOCK? ONLY third-party prose. The SDK
 * resumes the thread, so a stranger's words come back on every later turn and
 * the lock must too — but replaying OUR OWN rows is not that, and writing it
 * down locked ordinary threads forever.
 *
 * A conversation that actually READ MAIL is still locked for good, by the
 * reader's own durable write (mail.ts -> turnLatch.record() ->
 * markUntrustedRead below). That path does not come through here.
 */
export function locksThisConversation(c: PackCarriers): boolean {
  return c.thirdParty;
}

/**
 * RECORD THAT THIS CONVERSATION HAS CARRIED THIRD-PARTY TEXT, DURABLY, BEFORE
 * ONE CHARACTER OF IT GOES BACK TO THE MODEL.
 *
 * One upsert. It writes `read_untrusted: true` and nothing else that could ever
 * be false. `surface` rides along because the column is NOT NULL and this may
 * be the first statement that ever touches the row — mail read on turn 1 of a
 * brand-new conversation must not fail on a missing surface and then be
 * described as clean on turn 2.
 *
 * RETURNS ok:false RATHER THAN THROWING, and the caller's answer to that is not
 * "carry on": the reader tool RETURNS NO MAIL. Text we cannot record having
 * seen is text we do not look at, because the alternative is a conversation the
 * model has read a stranger's instructions in and the store says is clean.
 */
export async function markUntrustedRead(
  conversationId: string,
  surface: string,
): Promise<{ ok: boolean; why: string }> {
  const c = db();
  if (!c) {
    return {
      ok: false,
      why: "I could not write down that this conversation has read someone else's words — my durable store is not reachable — so I did not read them at all. Nothing was fetched.",
    };
  }
  try {
    const { error } = await c
      .from("conversations")
      .upsert({ id: conversationId, surface, read_untrusted: true }, { onConflict: "id" });
    if (error) {
      return {
        ok: false,
        why: `I could not write down that this conversation has read someone else's words (${safeDbError(error.message)}), so I did not read them at all. Nothing was fetched.`,
      };
    }
    return { ok: true, why: "" };
  } catch (e) {
    return {
      ok: false,
      why: `I could not write down that this conversation has read someone else's words (${e instanceof Error ? e.message : String(e)}), so I did not read them at all. Nothing was fetched.`,
    };
  }
}

/**
 * HAS THIS CONVERSATION EVER CARRIED THIRD-PARTY TEXT?
 *
 * `memorySeen` is this turn's in-memory latch. It is a FAST PATH IN ONE
 * DIRECTION ONLY: when it says yes the answer is yes and no round trip is
 * needed, because nothing in this system can make an in-process "a stranger's
 * words arrived" wrong. When it says no it is IGNORED — that is exactly the
 * claim the fifth door proved worthless.
 *
 * A DISAGREEMENT RESOLVES TO TAINTED, always, in both directions.
 */
export async function readUntrustedTaint(
  conversationId: string,
  memorySeen = false,
): Promise<TaintRead> {
  if (memorySeen) {
    return {
      status: "tainted",
      source: "memory",
      why: "this turn has already pulled someone else's words into the room",
    };
  }
  const c = db();
  if (!c) {
    return {
      status: "unknown",
      source: "offline",
      why: "my durable store is not reachable from this brain, so I cannot tell you whether this conversation has already read someone else's words",
    };
  }
  try {
    const { data, error } = await c
      .from("conversations")
      .select("read_untrusted")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) {
      return {
        status: "unknown",
        source: "error",
        why: `my durable store would not answer whether this conversation has read someone else's words (${safeDbError(error.message)})`,
      };
    }
    if (!data) {
      // NOTHING HAS MINTED THIS ROW YET, and this read runs BEFORE
      // ensureConversation (chat.ts) so that is a real observation rather than
      // the impossible-by-construction case. This function does not decide
      // WHICH kind of no-row it is: it answers UNKNOWN, which refuses, and
      // readUntrustedTaintBeforeMint below is the one place allowed to look at
      // what else survives and turn that into "new" or "orphan".
      return {
        status: "unknown",
        source: "no-row",
        why: "there is no durable record of this conversation at all, so I cannot tell you whether someone else's words have been in it",
      };
    }
    return (data as { read_untrusted?: unknown }).read_untrusted === true
      ? {
          status: "tainted",
          source: "row",
          why: "my durable record of this conversation says someone else's words have already been read in it",
        }
      : { status: "clean", source: "row", why: "" };
  } catch (e) {
    return {
      status: "unknown",
      source: "error",
      why: `my durable store would not answer whether this conversation has read someone else's words (${e instanceof Error ? e.message : String(e)})`,
    };
  }
}

/**
 * THE READ THAT RUNS BEFORE THE ROW IS MINTED.
 *
 * `ensureConversation` upserts {id, surface} with ignoreDuplicates, and sql/007
 * declares `read_untrusted boolean not null default false`. A conversation whose
 * row had been lost would therefore be RE-MINTED at the default and read back as
 * `clean` with source `row` — the exact D6-B failure the picture work was
 * audited for. chat.ts calls THIS first and mints afterwards.
 *
 * Reordering alone cannot answer the question it raises, because TURN 1 OF
 * EVERY NEW CONVERSATION ALSO HAS NO ROW — and refusing there would kill the
 * one exit this design has, the deck's reset button, which opens a fresh thread
 * and schedules on its very first turn.
 *
 * THE TWO CASES ARE DISTINGUISHABLE, AND NOT BY GUESSING. A conversation that
 * has never existed has no transcript either. One whose row was lost has one —
 * and that transcript is precisely what mail would have written into (chat.ts
 * appends her reply, context.ts replays ten of them under "trust these over
 * guesses", distill.ts lifts them into permanent memory). So:
 *
 *   no row + zero messages   -> CLEAN,   source "new"    — checked, not defaulted
 *   no row + any messages    -> UNKNOWN, source "orphan" — refuses
 *   the count cannot be read -> UNKNOWN, source "error"  — refuses
 *
 * Callers must still run `ensureConversation` after this. This function writes
 * nothing.
 */
export async function readUntrustedTaintBeforeMint(
  conversationId: string,
  memorySeen = false,
): Promise<TaintRead> {
  const read = await readUntrustedTaint(conversationId, memorySeen);
  if (!(read.status === "unknown" && read.source === "no-row")) return read;
  const c = db();
  if (!c) return read;
  try {
    const { count, error } = await c
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    if (error) {
      return {
        status: "unknown",
        source: "error",
        why: `there is no durable record of this conversation and I could not check whether any of it survives elsewhere (${safeDbError(error.message)})`,
      };
    }
    const n = count ?? 0;
    if (n > 0) {
      return {
        status: "unknown",
        source: "orphan",
        why:
          `there is no durable record of this conversation, but ${n} turn${n === 1 ? "" : "s"} of it are still in my ` +
          `transcript store — the record of whether mail was read in it is gone and the thing that mail would have ` +
          `written into is not, so I cannot tell you it is clean`,
      };
    }
    return { status: "clean", source: "new", why: "" };
  } catch (e) {
    return {
      status: "unknown",
      source: "error",
      why: `there is no durable record of this conversation and the check for one threw (${e instanceof Error ? e.message : String(e)})`,
    };
  }
}

/**
 * THE SAME QUESTION, ASKED OF MANY CONVERSATIONS AT ONCE.
 *
 * distill.ts needs it: "which of these conversations read somebody else's words"
 * has to be answerable about a night's worth of ids in one round trip.
 *
 * FAILS CLOSED IN EVERY DIRECTION. An id with no row is "unknown", not "clean";
 * an errored select makes EVERY id "unknown"; an unconfigured store makes every
 * id "unknown". Unknown means the caller WITHHOLDS — and, in distill's case,
 * also means the night's window is NOT stamped as done, so nothing is lost, it
 * is only deferred.
 */
export async function readUntrustedTaintMany(
  conversationIds: readonly string[],
): Promise<Map<string, TaintStatus>> {
  const out = new Map<string, TaintStatus>();
  const ids = [...new Set(conversationIds.filter((s) => typeof s === "string" && s.length > 0))];
  if (ids.length === 0) return out;
  for (const id of ids) out.set(id, "unknown");
  const c = db();
  if (!c) return out;
  try {
    const { data, error } = await c.from("conversations").select("id, read_untrusted").in("id", ids);
    if (error || !data) return out;
    for (const row of data as { id?: unknown; read_untrusted?: unknown }[]) {
      if (typeof row.id !== "string") continue;
      out.set(row.id, row.read_untrusted === true ? "tainted" : "clean");
    }
    return out;
  } catch {
    return out;
  }
}
