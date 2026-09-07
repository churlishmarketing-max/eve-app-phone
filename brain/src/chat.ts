import { query } from "@anthropic-ai/claude-agent-sdk";
import { staticSystemPrompt } from "./persona.js";
import { buildContextPack } from "./context.js";
import { ensureConversation, appendMessage } from "./memory.js";
import { buildMemoryServer } from "./tools.js";
import { buildConnectorServer, connectorToolNames } from "./connectors.js";
import type { PendingConfirm } from "./confirm.js";
import type { DeskPack, DeskRefusal } from "./desk.js";
import type { JobFrame } from "./dispatch.js";
import { newTurnLatch, type DurableTaint, type LockNotice } from "./authority.js";
import {
  latchesThisTurn,
  locksThisConversation,
  markUntrustedRead,
  readUntrustedTaintBeforeMint,
  type PackCarriers,
  type TaintRead,
} from "./untrusted.js";

const MODEL = process.env.EVE_MODEL || "claude-sonnet-5";

// conversationId (app-side) -> Agent SDK session id, so an app restart on the
// phone can resume the thread. In-memory; durable history lives in Supabase.
const sessions = new Map<string, string>();

export interface ChatEvents {
  onState: (state: "thinking" | "speaking" | "idle") => void;
  onToken: (text: string) => void;
  onTool: (name: string) => void;
  // RED-tier tool queued an external send — app renders the confirm card (02 §6).
  onConfirm?: (confirm: PendingConfirm) => void;
  // A dispatched job changed status this turn — the hub row moves within a
  // second instead of on the next /state poll (D-DISPATCH §1.4). Best-effort:
  // transitions after the stream ends reach him through /state only.
  onJob?: (job: JobFrame) => void;
  // W1/W2 — THE CONVERSATION IS LOCKED and a tool said so. Emitted ONCE per
  // turn, BECAUSE A REFUSAL HAPPENED IN CODE — never because the model decided
  // to mention it. The desktop renders the one-click reset off this frame, and
  // the frame carries NO SEED TEXT: the button seeds his composer from the
  // desktop's own record of what HE typed. See authority.ts LockNotice.
  onLock?: (lock: LockNotice) => void;
  onDone: (info: { conversationId: string; fullText: string }) => void;
  onError: (message: string) => void;
}

export async function runChat(
  conversationId: string,
  userMessage: string,
  surface: string,
  events: ChatEvents,
  abort?: AbortController,
  // Filing hands. The pack rides in on THIS turn's request or it does not exist
  // — there is no store, no cache, and no way for a filing plan to be caused by
  // anything other than a message he sent just now. That is G-I6, and it is why
  // the two desk tools gate on the pack rather than on a flag.
  opts?: { desk?: DeskPack | null; deskRefusal?: DeskRefusal | null },
): Promise<void> {
  const desk = opts?.desk ?? null;
  // WHY there is no pack, when the desktop said so. Gates nothing; it only
  // decides which true sentence the filing tools return. Null means the desktop
  // told us nothing, and "nothing" is its own honest answer — not a licence to
  // guess which surface he is standing at.
  const deskRefusal = desk ? null : opts?.deskRefusal ?? null;
  const resumeSession = sessions.get(conversationId);
  let fullText = "";
  let speaking = false;
  let timedOut = false;

  // The SDK retries a 5xx up to CLAUDE_CODE_MAX_RETRIES times with backoff —
  // during an Anthropic outage that reads as a silent hang for minutes. Fail
  // honestly instead: abort and say what happened.
  const ac = abort ?? new AbortController();
  const deadline = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, 100_000);

  events.onState("thinking");

  try {
    // Persist the user turn + assemble context (parallel; both tolerate an
    // offline spine). History rehydrates from the durable store only when
    // there's no live SDK session to resume — a brain restart must not wipe
    // continuity (review C7), and a resumed session already has the turns.
    //
    // H1 — THE PACK IS A DOOR. This is the ONE caller that holds authority-
    // taking tools (schedule / cancel / dispatch), so it takes the untrusted
    // half of the pack OFF: the calendar is not fetched, not rendered, and not
    // present in her briefing this turn. She reaches it through calendar_view
    // instead, which latches on the call like every other reader. Cost, said
    // plainly: "what's on today" now costs one tool call and disarms authority
    // for the rest of that turn, which is the trade R1 asks for. Benefit: on an
    // ORDINARY day the pack carries nothing third-party, so "run Starfire every
    // Monday at 9" still works — a latch that fired on every meeting he has
    // would be a worse bug than the one it closes.
    //
    // `carried.thirdParty` is the safety net, not the mechanism: if this call
    // ever goes back to carrying, the connector server below is built already
    // latched instead of silently re-opening the hole.
    //
    // W1 · AND THE TURN IS NOT THE UNIT ANY MORE. The latch below protects a
    // TURN; `resume` above reloads a CONVERSATION, raw mail tool-result and all.
    // So the durable question — has this THREAD ever read someone else's words —
    // is asked FIRST, of the same store that holds the transcript, and the
    // answer is handed to the latch as its authority (src/untrusted.ts).
    //
    // READ, THEN MINT. Not the other way round, and not in the same
    // Promise.all: `ensureConversation` upserts the row, and sql/007's `not null
    // default false` would RE-MINT a LOST row as clean — a read taken after it
    // answers "clean, source: row" about a row this process created a
    // millisecond earlier. That is the D6-B failure the picture work was audited
    // for, and it is one line of ordering to avoid.
    const conversationRead = await readUntrustedTaintBeforeMint(conversationId);

    // F1 · TWO CARRIERS, TWO SCOPES. THEY ARE NOT THE SAME FACT AND THE LAST
    // PASS CONFLATED THEM.
    //
    //   carried.thirdParty — SOMEBODY ELSE WROTE WORDS THAT ARE NOW IN HER
    //     CONTEXT (calendar titles, attention bodies, Today's Three titles).
    //     untrusted.ts locksThisConversation() is the only thing that answers
    //     yes to the durable write, and it answers to this flag alone.
    //     Scope: THE CONVERSATION, durably. The SDK resumes the thread, so
    //     those words come back on every later turn; the lock must too.
    //
    //   carried.replay (latch only, never a row) — WE REPLAYED OUR OWN TRANSCRIPT
    //     (context.ts recentTurns, when includeHistory is on). Scope: THIS TURN
    //     ONLY. It is still a latch — the transcript may quote mail read on an
    //     earlier turn, and asking which is a classifier — but it MUST NOT be
    //     written down. `includeHistory = !resumeSession`, and `sessions` is an
    //     in-memory Map that a redeploy, a cold start, an SDK terminal error,
    //     the 100s timeout, or closing the window mid-answer all evict. Writing
    //     the durable lock here locked ORDINARY threads — two rows of "morning"
    //     / "Morning. Coffee's on." — for good: schedule_unit rows=0 forever,
    //     and distill.ts quarantining his own words nightly. The accepted trade
    //     is the per-turn one: he says it again and it works.
    //
    // A conversation that ACTUALLY READ MAIL is still locked for good — by the
    // READER's own durable write (turnLatch.record() -> markUntrustedRead),
    // which is untouched below. Do not re-conflate these two.
    //
    // NOTE FOR THE NEXT READER (JL): on THIS path `untrusted: "omit"` makes the
    // calendar and attention fire-sites unreachable, so today
    // carried.thirdParty is always false here. It is wired anyway, and kept
    // separate, so that a future caller which does carry genuine third-party
    // pack content gets the durable lock and a replay does not.
    const carried: PackCarriers = { thirdParty: false, replay: false };
    const [contextPack] = await Promise.all([
      buildContextPack(surface, userMessage, conversationId, !resumeSession, desk, deskRefusal, {
        untrusted: "omit",
        onUntrusted: () => {
          carried.thirdParty = true;
        },
        onReplay: () => {
          carried.replay = true;
        },
      }),
      ensureConversation(conversationId, surface),
    ]);
    void appendMessage(conversationId, "user", userMessage);

    // THE PACK'S HALF, WRITTEN DOWN BEFORE THE PACK IS SENT. If the briefing we
    // just built carried anybody else's prose, this conversation has read a
    // stranger's words as surely as if a tool had fetched them — so it is
    // recorded here, awaited, BEFORE query() is called. A write we cannot make
    // ENDS THE TURN: the alternative is a model that has read the pack and a
    // store that will call this thread clean tomorrow.
    let durableRead: TaintRead = conversationRead;
    if (locksThisConversation(carried)) {
      const wrote = await markUntrustedRead(conversationId, surface);
      if (!wrote.ok) {
        events.onError(wrote.why);
        return;
      }
      durableRead = {
        status: "tainted",
        source: "memory",
        why: "this turn's own briefing carried someone else's words, and I have written that down against this conversation",
      };
    }

    // THE DURABLE HALF THE LATCH RUNS ON. `record` is what every reader tool
    // awaits instead of latching: it writes the taint, and on success it also
    // updates the witness THIS turn is speaking from — so the second tool call
    // in a mail-reading turn already hears "fresh THREAD", which is the sentence
    // that is actually true, instead of "fresh message", which stopped being
    // true the moment the SDK started resuming the session.
    const durable: DurableTaint = {
      read: durableRead,
      record: async () => {
        const r = await markUntrustedRead(conversationId, surface);
        if (r.ok) {
          durable.read = {
            status: "tainted",
            source: "memory",
            why: "someone else's words were read into this conversation earlier in this same turn, and I wrote that down against the thread",
          };
        }
        return r;
      },
    };

    // R1 · ONE LATCH PER TURN, SHARED BY EVERY SERVER ON THIS QUERY.
    // Built AFTER the pack on purpose: the turn starts latched if the briefing
    // it was handed carried anybody else's words (H1, and now V1 — a replayed
    // summary of hostile mail counts as anybody else's words).
    //
    // It is passed to BOTH servers because the previous sweep enumerated one
    // file and eve_memory's save_memory / log_touch wrote straight through a
    // tainted turn (V3). Anything mounted below must take this object too.
    // BOTH carriers seed the TURN latch; only the third-party one wrote a row.
    // The two predicates are untrusted.ts's, named and driven there, so the
    // scopes cannot be re-conflated by editing one line in this file.
    const turnLatch = newTurnLatch(latchesThisTurn(carried), durable);
    // ONE FRAME PER TURN, and it is caused by the refusal rather than by her.
    // Fired on the success path AND on the terminal-error path, because a turn
    // that refused and then fell over still refused and he still needs the way
    // out. Nothing composed travels on it — see authority.ts LockNotice.
    const emitLock = () => {
      const tools = turnLatch.lockNotices();
      if (!tools.length) return;
      const read = turnLatch.conversation();
      events.onLock?.({
        conversationId,
        status: read.status === "tainted" ? "tainted" : "unknown",
        source: read.source,
        why: read.why,
        tools: [...tools],
      });
    };
    const memoryServer = buildMemoryServer(() => conversationId, desk, turnLatch);
    const connectorServer = buildConnectorServer(
      (c) => events.onConfirm?.(c),
      desk,
      deskRefusal,
      surface,
      { emitJob: (j) => events.onJob?.(j), conversationId },
      latchesThisTurn(carried),
      turnLatch,
    );

    const q = query({
      // Volatile context rides in the user turn; system prompt stays static
      // (prompt-cache friendly).
      prompt: `${contextPack}\n\n${userMessage}`,
      options: {
        model: MODEL,
        systemPrompt: staticSystemPrompt,
        // Re-passed on every call including resumes — in-process MCP servers
        // don't persist with the session transcript.
        mcpServers: { eve_memory: memoryServer, eve_hands: connectorServer },
        // Memory + connector tools are pre-approved at the SDK layer. RED-tier
        // enforcement lives INSIDE the send tools (confirm.ts): they queue a
        // pending confirm and return — they cannot send. Live web (search +
        // fetch) is on: reads only, nothing external can be sent through it.
        // File/shell tools stay off — her body is the phone and his desk, never
        // this box. Filing hands do NOT change that line: desk_file_plan queues
        // a card and the DESKTOP moves the file locally; nothing in this
        // container ever touches a filesystem on her behalf.
        //
        // H4 · WebSearch / WebFetch, DECIDED — NOT LEFT UNDECIDED.
        // (Also named in src/authority.ts as UNLATCHABLE_SDK_TOOLS, which the
        // authority harness asserts stays non-empty, so this cannot be dropped
        // from one place and forgotten in the other.)
        // Both are SDK-native. They are not defined in connectors.ts, they hold
        // no reference to that turn's latch(), and their results reach her with
        // no <untrusted_*> envelope at all. So the honest statement is: they are
        // the ONE door in this brain that third-party text still comes through
        // un-latched, and this pass does not close it.
        // WHY NOT CLOSED HERE: the only in-process mechanism that could latch an
        // SDK-native tool is a PreToolUse hook / canUseTool callback on this
        // query(). Wiring one is a real change whose behaviour cannot be
        // observed without a live model turn against the API, and an unverified
        // gate is worse than a named hole — it reads as protection that was
        // never watched fire. It is written down here instead, with the two
        // real options for whoever closes it: (a) a PreToolUse hook that flips
        // the same latch, verified against a live turn, or (b) drop both names
        // from this list, which is a genuine capability cut and King's call.
        // WHAT LIMITS IT TODAY: a web result cannot schedule, cancel or dispatch
        // by itself — it still has to persuade the model to call a tool, and
        // every RED tool ends at his confirm card. That is mitigation, not the
        // R1 guarantee, and it is stated that way on purpose.
        allowedTools: [
          "mcp__eve_memory__search_memory",
          "mcp__eve_memory__save_memory",
          "mcp__eve_memory__log_touch",
          ...connectorToolNames,
          "WebSearch",
          "WebFetch",
        ],
        disallowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
        // Web hops + OS round-trips stack up fast in one answer. A filing turn
        // is scan + two narrowings + memory + plan + emit — six tool turns
        // before she has said a word — so 12 died mid-plan on any turn that
        // also checked his mail.
        maxTurns: 16,
        includePartialMessages: true,
        // A disconnected phone must not keep the loop burning tokens (C18);
        // the same controller carries the outage deadline.
        abortController: ac,
        ...(resumeSession ? { resume: resumeSession } : {}),
      },
    });

    for await (const message of q) {
      if (message.type === "system" && message.subtype === "init") {
        sessions.set(conversationId, message.session_id);
      } else if (message.type === "stream_event") {
        const event = message.event;
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          if (!speaking) {
            speaking = true;
            events.onState("speaking");
          }
          fullText += event.delta.text;
          events.onToken(event.delta.text);
        } else if (
          event.type === "content_block_start" &&
          event.content_block.type === "tool_use"
        ) {
          events.onTool(event.content_block.name);
        }
      } else if (message.type === "result") {
        if (message.subtype !== "success") {
          // Terminal error yield from the SDK. Stop here — falling through to
          // onState/onDone would double-fire onto an already-ended response
          // (review finding: ERR_STREAM_WRITE_AFTER_END on every agent error).
          // Evict the session id too: a poisoned resume must not permanently
          // break this conversation (review C27) — next turn rebuilds from
          // the durable store.
          sessions.delete(conversationId);
          emitLock();
          events.onError(`agent result: ${message.subtype}`);
          return;
        }
      }
    }

    emitLock();
    if (fullText.trim()) void appendMessage(conversationId, "eve", fullText);
    events.onState("idle");
    events.onDone({ conversationId, fullText });
  } catch (err) {
    sessions.delete(conversationId);
    events.onError(
      timedOut
        ? "the Anthropic API isn't answering right now (overloaded or down) — not your connection. Try again in a minute."
        : err instanceof Error
          ? err.message
          : String(err),
    );
  } finally {
    clearTimeout(deadline);
  }
}
