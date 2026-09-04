// THE DURABLE PICTURE TAINT — "has this conversation ever carried a picture?",
// asked of the store that also holds the transcript, and answered in a way that
// cannot be lost by restarting a process.
//
// Owning stream: BRAIN/S2.
//
// ---------------------------------------------------------------------------
// WHAT B1 ACTUALLY WAS
//
// The taint lived in an in-memory Map (image-ledger.ts) that dies with the
// process. The desktop keeps ONE conversationId in localStorage forever. Audit
// 5 drove it live: picture on turn 1 refused, turn 2 refused, brain restarted,
// turn 3 of the SAME conversation raised A REAL CARD stamped
// `{sawImage:false, imageTurnsAgo:null}` — which the card contract defines as
// I LOOKED AND THERE WAS NO PICTURE. The witness could not tell "no picture
// ever" from "the row is gone".
//
// Three ordinary triggers reach that state, none of them exotic:
//   · ANY BRAIN RESTART — a Railway redeploy is one.
//   · ANY FAILED TURN — chat.ts called endSession/clearImageTaint on a
//     non-success SDK result and again in the catch, and maxTurns is 16, which
//     a picture with a dozen names can push a turn past.
//   · LEDGER_CAP EVICTION — 500 other threads.
//
// And the durable message history rehydrated on EXACTLY the turn the memory row
// was missing (`buildContextPack(..., !resumeSession, ...)`), replaying ten
// messages at 280 chars — her own reply quoting the picture's note among them.
// The gate and the replay keyed on the same missing row in OPPOSITE directions.
//
// ---------------------------------------------------------------------------
// THE FIVE PROPERTIES THIS MODULE EXISTS TO HOLD
//
//   1. DURABLE, AND IN THE SAME STORE AS THE HISTORY. `conversations.saw_image`
//      sits on the same row Supabase hands back the replayed turns from, so
//      "this conversation carried a picture" and "here is what was said in it"
//      cannot disagree: they die together or neither does. (sql/005.)
//   2. WRITTEN BEFORE THE MODEL EVER SEES THE IMAGE. `markPictureSeen` is
//      awaited in chat.ts BEFORE the query is built. A crash, a timeout or a
//      maxTurns exhaustion mid-turn therefore leaves the conversation TAINTED
//      rather than clean — the failure mode points the safe way.
//   3. MONOTONIC. There is exactly one writer below and it only ever writes
//      `true`. Nothing clears it: not endSession, not the catch, not eviction,
//      not a restart, not a redeploy. It ends when the conversationId ends,
//      which is what the fresh-thread button on his deck actually does.
//
//      AUDIT 6 (D6-B) FALSIFIED THE SENTENCE THAT USED TO SIT HERE, and the
//      correction is worth reading rather than skimming. Nothing WRITES false —
//      that is still true — but the row could be LOST, and `ensureConversation`
//      then RE-MINTED it at sql/005's `not null default false` before this
//      module was asked. chat.ts awaited that upsert first, so the very next
//      select read `clean` with `source:"row"`. Monotonic against every writer,
//      and not monotonic against absence. The order is now READ, THEN MINT, and
//      `readPictureTaintBeforeMint` is the only thing allowed to interpret a
//      missing row.
//   4. FAILS CLOSED. Store not configured, row missing, select errored, column
//      absent because sql/005 was never applied — every one of those is
//      UNKNOWN, and unknown REFUSES filing. An unknown answer is not a clean
//      answer, and the refusal says which one it was.
//
//      THE ONE MISSING-ROW CASE THAT ANSWERS CLEAN answers `source:"new"`, never
//      `source:"row"`, and only after checking that no transcript of that
//      conversation survives either. It is turn 1 of a thread that has never
//      existed — the shape the deck's fresh-thread button creates, which is this
//      design's only exit and has to file.
//   6. IT IS NOT THE ONLY GATE ANY MORE (audit 6, X1). This bit answered ONE
//      question for ONE tool: may `desk_file_plan` build a plan. The judge found
//      the object was wrong — what needs gating is anything DURABLE that
//      outlives the conversation, because a picture that cannot supply a
//      destination in its own thread can still write one into the memory spine
//      and be recalled as fact into a fresh one. src/durable.ts is that door;
//      this module is the question it asks.
//   5. IT IS A WITNESS, NOT A CLAIM. `TaintRead` records where the answer came
//      from, and that record is stamped into the confirm payload. A card can
//      then carry evidence that the gate ran, instead of the hardcoded
//      `{sawImage:false}` constant audit 5 found — which was worth nothing,
//      because it read identically on a clean turn and on a turn whose row had
//      been evicted.
//
// NO CACHE LIVES IN THIS FILE. A memo of "this conversation is clean" would be
// the in-memory Map that caused B1, wearing a smaller name. The in-memory
// ledger stays as a FAST PATH for the opposite direction only — it can say
// TAINTED without a round trip, and it is never believed when it says clean.

import { db } from "./db.js";
// Read ONLY to choose which consequence the boot log states — see
// `taintConsequence` at the bottom of this file. Nothing in the taint READ or
// WRITE path consults the switch: a positive taint is a positive taint in both
// states, and this module's job is to record and report a fact, never to decide
// what the fact costs.
import { pictureIntakeOn } from "./intake.js";

/**
 * WHAT THE DURABLE STORE SAID.
 *
 * There are three answers and no fourth. `unknown` is not a soft `clean`: every
 * caller treats it as a refusal.
 */
export type TaintStatus = "clean" | "tainted" | "unknown";

/** Where the answer came from. This is the evidence half — it goes on the card. */
export type TaintSource =
  /** The row was read and the column answered. */
  | "row"
  /** No conversation row exists in the store. Unknown: nothing to read. */
  | "no-row"
  /** Supabase is not configured on this brain at all. */
  | "offline"
  /** The select failed — network, permissions, or sql/005 never applied. */
  | "error"
  /** The in-memory ledger already knows there is a picture; no read was needed. */
  | "memory"
  /**
   * NO ROW, AND NOTHING DERIVED FROM THIS CONVERSATION SURVIVES EITHER — not one
   * message, so there is no transcript to replay and nothing to launder. This is
   * the first turn of a genuinely new conversation, and it is CLEAN because that
   * was CHECKED, not because an upsert defaulted a column. (audit 6, X3 / D6-B.)
   */
  | "new"
  /**
   * NO ROW, BUT ITS TRANSCRIPT IS STILL THERE. The record of whether a picture
   * was in this conversation is gone while the thing a picture would have
   * poisoned is not. That is UNKNOWN and it refuses. (audit 6, X3 / D6-B.)
   */
  | "orphan";

export interface TaintRead {
  status: TaintStatus;
  source: TaintSource;
  /** One plain sentence, for her refusal. "" unless `status` is "unknown". */
  why: string;
}

const CLEAN: TaintRead = { status: "clean", source: "row", why: "" };

/**
 * RECORD THAT THIS CONVERSATION HAS CARRIED A PICTURE, DURABLY, BEFORE THE
 * PIXELS GO ANYWHERE NEAR THE MODEL.
 *
 * One upsert, and it writes `saw_image: true` and nothing else that could ever
 * be false. `surface` rides along because the column is NOT NULL and this may
 * be the first statement that ever touches the row — a picture on turn 1 of a
 * brand-new conversation must not fail on a missing surface and then be
 * described as clean on turn 2.
 *
 * RETURNS ok:false RATHER THAN THROWING, and the caller's answer to that is not
 * "carry on": chat.ts DROPS THE PICTURE. A picture we cannot record is a
 * picture we do not look at, because the alternative is a conversation the
 * model has seen a screenshot in and the store says is clean.
 */
export async function markPictureSeen(
  conversationId: string,
  surface: string,
): Promise<{ ok: boolean; why: string }> {
  const c = db();
  if (!c) {
    return {
      ok: false,
      why: "I could not write down that this conversation has a picture in it — my durable store is not reachable — so I did not look at the picture at all.",
    };
  }
  try {
    const { error } = await c
      .from("conversations")
      .upsert({ id: conversationId, surface, saw_image: true }, { onConflict: "id" });
    if (error) {
      return {
        ok: false,
        why: `I could not write down that this conversation has a picture in it (${error.message}), so I did not look at the picture at all.`,
      };
    }
    return { ok: true, why: "" };
  } catch (e) {
    return {
      ok: false,
      why: `I could not write down that this conversation has a picture in it (${e instanceof Error ? e.message : String(e)}), so I did not look at the picture at all.`,
    };
  }
}

/**
 * HAS THIS CONVERSATION EVER CARRIED A PICTURE?
 *
 * `memorySeen` is the in-memory ledger's answer for this conversation. It is a
 * FAST PATH IN ONE DIRECTION ONLY: when it says yes, the answer is yes and no
 * round trip is needed, because nothing in this system can make an in-process
 * "there was a picture" wrong. When it says no it is IGNORED — that is exactly
 * the claim B1 proved worthless, since the row dies with the process while the
 * conversation and its durable history do not.
 *
 * A DISAGREEMENT RESOLVES TO TAINTED, always, in both directions.
 */
export async function readPictureTaint(
  conversationId: string,
  memorySeen = false,
): Promise<TaintRead> {
  if (memorySeen) return { status: "tainted", source: "memory", why: "" };
  const c = db();
  if (!c) {
    return {
      status: "unknown",
      source: "offline",
      why: "my durable store is not reachable from this brain, so I cannot tell you whether a picture has been in this conversation",
    };
  }
  try {
    const { data, error } = await c
      .from("conversations")
      .select("saw_image")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) {
      return {
        status: "unknown",
        source: "error",
        why: `my durable store would not answer whether a picture has been in this conversation (${error.message})`,
      };
    }
    if (!data) {
      // NOTHING HAS MINTED THIS ROW YET. Since audit 6 (X3) this read runs
      // BEFORE ensureConversation rather than after it, so "no row" is a real
      // observation instead of the impossible-by-construction case the old
      // comment here claimed — and it is exactly the observation D6-B showed
      // being destroyed: the upsert re-minted the row at the column's
      // `not null default false` and the very next select read it back as
      // clean/source:"row", which is a lie with a witness attached.
      //
      // This function does not decide WHICH kind of no-row it is. It answers
      // UNKNOWN, which refuses, and readPictureTaintBeforeMint below is the one
      // place allowed to look at what else survives and turn that into "new"
      // or "orphan".
      return {
        status: "unknown",
        source: "no-row",
        why: "there is no durable record of this conversation at all, so I cannot tell you whether a picture has been in it",
      };
    }
    return (data as { saw_image?: unknown }).saw_image === true
      ? { status: "tainted", source: "row", why: "" }
      : CLEAN;
  } catch (e) {
    return {
      status: "unknown",
      source: "error",
      why: `my durable store would not answer whether a picture has been in this conversation (${e instanceof Error ? e.message : String(e)})`,
    };
  }
}

/**
 * THE READ THAT RUNS BEFORE THE ROW IS MINTED (audit 6, X3 — D6-B).
 *
 * WHAT D6-B WAS. `ensureConversation` upserts `{id, surface}` with
 * `ignoreDuplicates:true`, sql/005 declares `saw_image boolean not null default
 * false`, and chat.ts AWAITED that upsert before reading the column. So a
 * conversation whose row had been lost was silently re-minted at the default
 * and read back as `clean` with `source:"row"` — the witness said "I read this
 * conversation's own durable row" about a row the reader itself had created a
 * millisecond earlier. The history replay unblocked on the same bit.
 * "MONOTONIC, nothing clears it, fails closed" was false.
 *
 * THE ORDER IS NOW READ, THEN MINT. That turns "no row" back into a real
 * observation — and immediately raises the question a naive reordering cannot
 * answer, because TURN 1 OF EVERY NEW CONVERSATION ALSO HAS NO ROW. Refusing
 * there would kill the one exit this whole design has: the deck's button opens
 * a FRESH thread and he files on its very first turn.
 *
 * THE TWO CASES ARE DISTINGUISHABLE, AND NOT BY GUESSING. A conversation that
 * has never existed has no transcript either. A conversation whose row was lost
 * has one — and that transcript is precisely what a picture would have written
 * into (chat.ts appends her reply, context.ts replays ten of them under "trust
 * these over guesses", distill.ts lifts them into permanent memory). So:
 *
 *   no row + zero messages   -> CLEAN,   source "new"    — checked, not defaulted
 *   no row + any messages    -> UNKNOWN, source "orphan" — refuses
 *   the count cannot be read -> UNKNOWN, source "error"  — refuses
 *
 * The witness on the card then says WHICH, so `source:"new"` can never be
 * mistaken for `source:"row"` on his screen. That distinction is the whole of
 * the evidence D6-B found missing.
 *
 * ONE INTERACTION WITH X1, WRITTEN DOWN BECAUSE IT IS EASY TO MISS AND SOUNDS
 * WORSE THAN IT IS. The orphan test asks the transcript — and X1 stopped writing
 * a transcript for tainted conversations. So a conversation whose FIRST turn
 * carried a picture, and which therefore has zero `messages` rows, would read
 * CLEAN/"new" if its `conversations` row were ever lost.
 *
 * THAT IS THE RIGHT ANSWER, and the reason is that there is nothing left to
 * launder. Everything a picture could have written is gated at the door above
 * it: no transcript, no memory entry, no touch. The SDK resume id and the
 * in-memory taint memo live on THE SAME ledger row (image-ledger.ts, D2), so
 * they die together — a process that has lost the memo cannot resume the session
 * carrying the pixels either. The conversation is not "clean despite having had
 * a picture"; it is a conversation that left NO TRACE OF ANY KIND, which is what
 * a never-existed conversation also is.
 *
 * The case D6-B actually drove is untouched, and it is the common one: a
 * conversation that ran clean for a while (writing turns), THEN took a picture,
 * then lost its row. Its transcript survives, so it reads orphan and refuses.
 *
 * Callers must still run `ensureConversation` after this. This function writes
 * nothing.
 */
export async function readPictureTaintBeforeMint(
  conversationId: string,
  memorySeen = false,
): Promise<TaintRead> {
  const read = await readPictureTaint(conversationId, memorySeen);
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
        why: `there is no durable record of this conversation and I could not check whether any of it survives elsewhere (${error.message})`,
      };
    }
    const n = count ?? 0;
    if (n > 0) {
      return {
        status: "unknown",
        source: "orphan",
        why:
          `there is no durable record of this conversation, but ${n} turn${n === 1 ? "" : "s"} of it are still ` +
          `in my transcript store — the record of whether a picture was in it is gone and the thing a picture ` +
          `would have written into is not, so I cannot tell you it is clean`,
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
 * THE SAME QUESTION, ASKED OF MANY CONVERSATIONS AT ONCE (audit 6, X2).
 *
 * The READ side needs this. His store already holds rows written before this
 * fix, so "which of these memory entries came out of a conversation a picture
 * was in" has to be answerable about a hundred ids in one round trip.
 *
 * FAILS CLOSED IN EVERY DIRECTION. An id with no row is "unknown", not "clean";
 * an errored select makes EVERY id "unknown"; an unconfigured store makes every
 * id "unknown". Unknown means the caller withholds. That does mean a brain
 * without sql/005 applied recalls nothing that carries a source conversation —
 * the same fail-closed posture filing has had since audit 5, reported in the
 * same place (/health.pictureTaintReady), and strictly better than reading a
 * screenshot's folder name back to him as a remembered fact.
 */
export async function readPictureTaintMany(
  conversationIds: readonly string[],
): Promise<Map<string, TaintStatus>> {
  const out = new Map<string, TaintStatus>();
  const ids = [...new Set(conversationIds.filter((s) => typeof s === "string" && s.length > 0))];
  if (ids.length === 0) return out;
  for (const id of ids) out.set(id, "unknown");
  const c = db();
  if (!c) return out;
  try {
    const { data, error } = await c.from("conversations").select("id, saw_image").in("id", ids);
    if (error || !data) return out;
    for (const row of data as { id?: unknown; saw_image?: unknown }[]) {
      if (typeof row.id !== "string") continue;
      out.set(row.id, row.saw_image === true ? "tainted" : "clean");
    }
    return out;
  } catch {
    return out;
  }
}

/**
 * ONE PROBING SELECT AT BOOT, so a brain running without sql/005 says so on
 * /health instead of refusing every filing turn for a reason nobody can see.
 *
 * It changes NO behaviour — the read above already fails closed. It exists
 * because "filing stopped working" and "a migration was never applied" have to
 * be the same sentence on a dashboard, or the next person will go looking in
 * the desk code.
 *
 * AND THE SENTENCE IT PRINTS DEPENDS ON THE SWITCH (audit 7, S3).
 *
 * "FILING IS REFUSED until then" was true of every build before this one and is
 * NOT true of this one. With picture intake off, `pictureVerdict` is handed
 * `intake:"off"` and P-UNKNOWN stops blocking — an unreadable taint answer is
 * no longer a reason to refuse a filing turn, because there is no picture for
 * the unreadable answer to be hiding. Printing the old line here would send
 * whoever read the boot log hunting for a filing outage that is not happening.
 *
 * So each state states its own consequence. This is the one rule S3 exists for:
 * anything that cannot happen must not be described as if it can.
 */
let taintSchemaReady: boolean | null = null;

/** What an unreadable taint actually costs, in the state we are actually in. */
function taintConsequence(): string {
  return pictureIntakeOn()
    ? "FILING IS REFUSED until then (fail-closed, audit 5 B1)"
    : "filing still runs — picture intake is OFF, so an unreadable taint is not blocking anything (src/intake.ts). This becomes a filing outage the moment intake is switched back on";
}

export async function probePictureTaintSchema(): Promise<boolean> {
  const c = db();
  if (!c) {
    taintSchemaReady = false;
    console.warn(`[taint] durable store offline — ${taintConsequence()}.`);
    return false;
  }
  try {
    const { error } = await c.from("conversations").select("saw_image").limit(1);
    taintSchemaReady = !error;
    if (error) {
      console.warn(
        `[taint] conversations.saw_image is not readable (${error.message}) — apply sql/005_picture_taint.sql. ${taintConsequence()}.`,
      );
    } else {
      console.log("[taint] conversations.saw_image ready — the picture taint is durable.");
    }
    return taintSchemaReady;
  } catch (e) {
    taintSchemaReady = false;
    console.warn(`[taint] probe threw (${e instanceof Error ? e.message : String(e)}) — ${taintConsequence()}.`);
    return false;
  }
}

/** null = never probed. Reported on /health, load-bearing for nothing. */
export function pictureTaintReady(): boolean | null {
  return taintSchemaReady;
}

/** Test seam. verify/audit5-harness.ts resets the probe between fixtures. */
export function _resetTaintProbeForTests(): void {
  taintSchemaReady = null;
}
