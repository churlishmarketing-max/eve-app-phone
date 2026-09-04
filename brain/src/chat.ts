import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { staticSystemPrompt } from "./persona.js";
import { buildContextPack } from "./context.js";
import { ensureConversation, appendMessage } from "./memory.js";
import { buildMemoryServer } from "./tools.js";
import { buildConnectorServer, connectorToolNames } from "./connectors.js";
import type { PendingConfirm } from "./confirm.js";
import type { DeskPack, DeskRefusal } from "./desk.js";
import { buildTurnContent, persistedUserText, type ChatImage, type ImageRefusal } from "./image.js";
import { clearImageTaint, noteSession, noteTurn, sessionFor } from "./image-ledger.js";
import { markPictureSeen, readPictureTaint, readPictureTaintBeforeMint, type TaintRead } from "./taint.js";
import { pictureIntake } from "./intake.js";
import { pictureFrame, pictureVerdict, type PictureFrame } from "./picture.js";
import { renderCarriedNames, type CarriedNames } from "./carried.js";
import type { HandoffFrame } from "./handoff.js";
import { turnLedgerLine } from "./honesty.js";
import type { JobFrame } from "./dispatch.js";

const MODEL = process.env.EVE_MODEL || "claude-sonnet-5";

// THERE IS NO `sessions` MAP HERE ANY MORE (audit 4, D2).
//
// conversationId -> Agent SDK session id used to live in this file, in an
// uncapped Map, next to an image ledger that evicted at 500. After 500 other
// threads the stamp for a tainted conversation reported {seen:false,
// turnsAgo:null} — "I looked and there was no picture" — while THIS map still
// held the session id that `resume:` replays those pixels from. Same failure as
// the 25-turn window, different counter.
//
// So the session id moved INTO the ledger row, beside the taint it belongs to
// (image-ledger.ts: `sessionFor`, `noteSession`). One map, one lifetime, one
// eviction. A conversation that can be resumed always has its stamp; a
// conversation that has lost its stamp cannot be resumed. Read the header
// there — the taint is on the SDK SESSION, not on the turn (audit 2,
// b10/b10c) and not on a clock (audit 3).
//
// DROPPING THE IN-PROCESS ROW — the resume id and the fast-path stamp together.
//
// IT DOES NOT END THE TAINT ANY MORE, and audit 5 (B1) is why that sentence had
// to change. This used to be the one place a conversation ended: a FAILED turn
// called it, the next turn found no row, and the next turn FILED — same
// conversation, same destination, while the durable history was replaying her
// own description of the picture back into her context on exactly that turn.
//
// "This conversation has carried a picture" now lives on the conversation row
// itself (src/taint.ts), it is written before the model ever sees the image,
// and NOTHING clears it. All this does is give up the pixels and the fast path.
// The next turn asks the store, and the store still says yes.
function endSession(conversationId: string): void {
  clearImageTaint(conversationId);
}


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
  // THE HANDOFF (handoff.ts). She calls desk_handoff with index ids off a
  // desk_scan; this carries those INTEGERS to his deck, which resolves them
  // against its own index and offers him one button that opens a FRESH
  // conversation with those filenames as CHIPS BESIDE AN EMPTY COMPOSER — the
  // box holds only his keystrokes. No string from the
  // picture is on this frame, because no string is on it at all.
  onHandoff?: (handoff: HandoffFrame) => void;
  // WHETHER FILING IS REFUSED IN THIS CONVERSATION, AND WHY — emitted ONCE PER
  // TURN, before the model runs, off the same durable read the gate uses.
  //
  // Audit 5 found the exit depending on her: the fresh-thread button only
  // appeared when she remembered to call `desk_handoff`, and on a natural
  // picture turn she asked a question instead. With filing OFF it was worse —
  // the refusal pointed him at a button `desk_handoff` cannot create, because
  // with no desk pack that tool refuses too. So the affordance is no longer
  // hers to offer: his deck renders it off THIS frame, whether a tool was
  // called or not and whether filing is on or not.
  onPicture?: (picture: PictureFrame) => void;
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
  // A picture he attached to THIS turn, or the stated reason one didn't make
  // it. Same law as the desk pack and for the same reason: it rides in on this
  // request or it does not exist. No store, no cache, no temp file, nothing on
  // disk in this container — so a screenshot can never influence a turn he did
  // not just send, and there is no second copy of his screen anywhere here.
  opts?: {
    desk?: DeskPack | null;
    deskRefusal?: DeskRefusal | null;
    image?: ChatImage | null;
    imageRefusal?: ImageRefusal | null;
    // THE NAMES HIS DECK CARRIED INTO THIS THREAD (audit 5, B2). Validated at
    // the door by src/carried.ts. They are DATA: they are rendered inside
    // <untrusted_filenames> below and they never join his `message`, which is
    // the one string in this turn that is treated as his own words.
    carried?: CarriedNames | null;
  },
): Promise<void> {
  const desk = opts?.desk ?? null;
  // `let`, because A PICTURE I CANNOT RECORD IS A PICTURE I DO NOT LOOK AT.
  // See the write-then-process block below.
  let image = opts?.image ?? null;
  let imageRefusal = image ? null : opts?.imageRefusal ?? null;
  const carried = opts?.carried ?? null;
  // WHY there is no pack, when the desktop said so. Gates nothing; it only
  // decides which true sentence the filing tools return. Null means the desktop
  // told us nothing, and "nothing" is its own honest answer — not a licence to
  // guess which surface he is standing at.
  const deskRefusal = desk ? null : opts?.deskRefusal ?? null;
  // WHAT THE DURABLE STORE SAID ABOUT THIS CONVERSATION. Filled in inside the
  // try below, before a token is generated. It starts UNKNOWN so that any path
  // which somehow reaches a tool without having asked refuses rather than
  // allows — the whole file fails closed, not just the happy path.
  let taint: TaintRead = {
    status: "unknown",
    source: "no-row",
    why: "this turn did not get far enough to ask my durable store",
  };
  let fullText = "";
  let speaking = false;
  let timedOut = false;
  // THE TURN LEDGER (audit 3, C1 + C3). Two counts kept by this process, about
  // things that either happened or did not: how many FILING cards were actually
  // raised, and how many times the desk refused. They are the only inputs to
  // the end-of-turn honesty audit besides her own words, and neither of them is
  // anything she can say, set, or argue with. Read src/honesty.ts.
  let cardsRaised = 0;
  let deskRefusals = 0;

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
    // ==== THE PICTURE ORDER (audit 5, B1). READ IT AS A SEQUENCE. ==========
    //
    // Every step below happens BEFORE the model is built, and the order is the
    // whole of the fix. It costs up to three sequential round trips on a
    // picture turn and one on an ordinary turn, and that is the price of the
    // fact and the history living in the same place.

    // 1. COUNTED IN PROCESS. `noteTurn` is the in-memory fast path: it can say
    //    TAINTED with no round trip and it is never believed when it says clean
    //    (image-ledger.ts). It touches no store, so it is free to run first.
    const stamp = noteTurn(conversationId, !!image);

    // 2. READ BEFORE YOU MINT (audit 6, X3 — D6-B).
    //
    //    THIS USED TO BE STEP 3, AND `ensureConversation` USED TO BE STEP 1.
    //    That order destroyed the observation it then went on to make: the
    //    upsert re-minted a LOST conversation row at sql/005's `not null
    //    default false`, and the select a millisecond later read it back as
    //    clean with `source:"row"` — a witness swearing it had read this
    //    conversation's own durable record about a row the reader had just
    //    created. The history replay unblocked on the same bit. "MONOTONIC,
    //    nothing clears it, fails closed" was false, and the fix is this
    //    reordering.
    //
    //    `readPictureTaintBeforeMint` is the one place allowed to interpret a
    //    missing row: no row and no surviving transcript is a genuinely NEW
    //    conversation (clean, source "new" — checked, not defaulted), and no
    //    row WITH a surviving transcript is an ORPHAN and refuses. Turn 1 of a
    //    fresh thread still files, which matters because a fresh thread is this
    //    whole design's only exit.
    taint = await readPictureTaintBeforeMint(conversationId, stamp.seen);

    // 3. NOW THE ROW EXISTS. Awaited rather than raced with the context pack,
    //    because the message append below has a foreign key into it.
    await ensureConversation(conversationId, surface);

    // 4. WRITE-THEN-PROCESS. The taint is recorded DURABLY before a single
    //    pixel goes near the model, so a crash, a timeout, an abort or a
    //    maxTurns exhaustion halfway through this turn leaves the conversation
    //    TAINTED rather than clean. The failure mode points the safe way.
    //
    //    AND IF THE WRITE FAILS, THE PICTURE DOES NOT GO IN. There is no third
    //    option: letting the pixels through would put a screenshot in her
    //    context that the store describes as clean on the very next turn, which
    //    is B1 with an extra step. His words still go through, and she is
    //    handed the reason to say out loud.
    //
    //    THE READ ABOVE HAPPENED BEFORE THIS WRITE, so it is re-taken from the
    //    in-process fast path the instant the write lands. Every durable writer
    //    downstream (durable.ts) asks the STORE again at write time anyway, and
    //    by then this row says true — which is what actually stops her reply
    //    about the screenshot from reaching the spine.
    if (image) {
      const written = await markPictureSeen(conversationId, surface);
      if (!written.ok) {
        image = null;
        imageRefusal = { code: "UNRECORDED", why: written.why };
      } else {
        taint = await readPictureTaint(conversationId, true);
      }
    }

    // 5. THE RESUME ID, off the same ledger row (D2). `noteTurn` just
    //    re-inserted this conversation at the tail of the LRU, so the row
    //    backing this resume id is the row backing the stamp — they cannot
    //    disagree.
    const resumeSession = sessionFor(conversationId) ?? undefined;

    // 6. ONE VERDICT FOR THE WHOLE TURN, computed by the same pure function the
    //    tool gate uses, off the same inputs (picture.ts). The gate re-derives
    //    it inside the connector server rather than being handed this object —
    //    two call sites of one total function cannot drift, and a passed-in
    //    verdict could be forgotten by a future caller.
    const verdict = pictureVerdict({
      sawImage: !!image,
      imageSeen: stamp.seen,
      imageTurnsAgo: stamp.turnsAgo,
      imageExpired: stamp.expired,
      durable: taint.status,
      durableWhy: taint.why,
      // THE STATE OF THE DOOR (audit 7). Read ONCE here and put in the bag, so
      // this verdict and the one connectors.ts re-derives from the same bag
      // cannot disagree about it. With the door shut, an unreadable store stops
      // being a picture refusal — see the `intake` field in picture.ts.
      intake: pictureIntake(),
    });
    // 7. AND HIS DECK IS TOLD, BEFORE THE MODEL SAYS ANYTHING. This is what
    //    makes the exit independent of her (F4): the button appears because the
    //    conversation is tainted, not because she remembered a tool.
    events.onPicture?.(pictureFrame(verdict, { status: taint.status, source: taint.source }));

    // 8. THE HISTORY REPLAY HONOURS THE SAME BIT (audit 5, B2's twin, F2).
    //
    //    THIS WAS `!resumeSession` ALONE, and that was the sharpest edge in the
    //    whole build: the durable history rehydrated on EXACTLY the turn the
    //    in-memory row was missing — which was EXACTLY the turn the gate stopped
    //    refusing. Ten messages at 280 chars each, and her own reply quoting the
    //    picture's note is inside that window. The gate and the replay were
    //    keyed on the same missing row IN OPPOSITE DIRECTIONS.
    //
    //    There is now ONE notion of "has this conversation seen a picture", and
    //    both read it. If it ever carried one, or if I cannot tell, the turns
    //    are not replayed — because the thing being replayed is the transcript
    //    the picture is described in.
    const cleanConversation = verdict.blocked === false;
    const replayHistory = !resumeSession && cleanConversation;
    const contextPack = await buildContextPack(
      surface,
      userMessage,
      conversationId,
      replayHistory,
      desk,
      deskRefusal,
      // Why the continuity is missing, when it is. A thread that silently
      // forgets itself is a thread he will think is broken.
      !resumeSession && !cleanConversation ? verdict.where : null,
    );
    // HIS WORDS plus a marker if a picture came with them — never the pixels.
    // The durable store rides back into later context packs as text, and a
    // base64 screenshot in there would be both enormous and permanent.
    //
    // GATED SINCE AUDIT 6 (X1), INSIDE appendMessage. On a conversation a
    // picture has been in, NOTHING from this turn reaches the transcript table —
    // his half or hers. Withholding his half too is deliberate rather than
    // squeamish: the distiller reads a transcript as one document and summarises
    // it, and half a picture conversation is still a picture conversation. The
    // rows cost nothing to lose, because a tainted conversation's history is
    // already never replayed (see step 8).
    void appendMessage(conversationId, "user", persistedUserText(userMessage, image));

    // ---- THERE IS NO READER PASS ANY MORE ---------------------------------
    //
    // A second, tool-less model call used to transcribe the picture here, and
    // its output became an EXCLUSION LIST so `desk_file_plan` could refuse a
    // destination the picture itself named. It is deleted, with src/reader.ts
    // and src/narrow.ts.
    //
    // WHY, in one line: the planner is asked for MEANING and the reader for
    // GLYPHS, so the two can be made to disagree — a line-wrapped folder name,
    // an acronym the planner expands, a 433-line flood past the reader's cap.
    // Every repair was another clause in a race whose words the picture picks.
    //
    // What replaced it is not a better list. It is picture.ts: while a picture
    // is in this conversation, NO PLAN IS BUILT AT ALL, so there is no
    // destination for a picture to have chosen and nothing to exclude it from.
    // One model call per picture turn also went away with it.

    const memoryServer = buildMemoryServer(() => conversationId, desk);
    const connectorServer = buildConnectorServer(
      (c) => {
        // Counted HERE, at the one door every card goes through, and counted by
        // KIND: a Slack send waiting for him is not a file batch waiting for
        // him, and "your files are queued" is a lie on a turn that raised only
        // the former.
        if (c.kind === "file_batch") cardsRaised += 1;
        events.onConfirm?.(c);
      },
      desk,
      deskRefusal,
      surface,
      { emitJob: (j) => events.onJob?.(j), emitHandoff: (h) => events.onHandoff?.(h), conversationId },
      // WHETHER A PICTURE IS IN THE ROOM, decided by the validator in index.ts
      // and the ledger above before the model saw anything, and stamped into
      // every file_batch payload minted on this turn. The prompt tells her what
      // a picture is; THIS tells his card, and the card is the thing an
      // argument cannot talk around.
      //
      // THERE IS NO `typedMessage` AND NO `reader` IN THIS BAG ANY MORE.
      // `typedMessage` fed lexical grounding and then the name-provenance
      // split; `reader` fed the exclusion list. Both graders are deleted, and a
      // field kept "for information" that no longer decides anything is a field
      // the next reader of this file will assume still protects him.
      //
      // These four are all that is left, and they are not a grade — they are
      // WHETHER A PICTURE IS IN THE ROOM, which is now the whole question.
      // desk_file_plan refuses on them outright (picture.ts).
      //
      // `durable` IS THE AUTHORITY (audit 5, B1). The four in-memory fields
      // above it are a fast path that can only ever ADD a picture to the room;
      // this one is the durable bit on the conversation row, and "unknown"
      // refuses rather than allows. `durableWhy` is the sentence she quotes when
      // it does.
      //
      // `witness` IS THE EVIDENCE HALF. It is stamped into every card this turn
      // mints, so a confirm carries proof THE GATE RAN rather than the hardcoded
      // `{sawImage:false}` constant audit 5 found — which read identically on a
      // clean turn and on a turn whose in-memory row had been evicted, and was
      // therefore worth nothing on the only two cards that mattered.
      {
        sawImage: !!image,
        imageSeen: stamp.seen,
        imageTurnsAgo: stamp.turnsAgo,
        imageExpired: stamp.expired,
        durable: taint.status,
        durableWhy: taint.why,
        witness: { status: taint.status, source: taint.source },
        // THE SAME READ AS THE VERDICT ABOVE. The tool gate re-derives its own
        // verdict from this bag rather than being handed one, so the door's
        // state has to travel with the rest of it or the two would split.
        intake: pictureIntake(),
      },

      { noteRefusal: () => { deskRefusals += 1; } },
    );

    // HIS TYPED WORDS, THE PICTURE (IF ANY), AND THE CARRIED NAMES AS DATA.
    //
    // B2: the names his deck carried in are rendered into <untrusted_filenames>
    // — the same envelope every other filename on this system has ridden since
    // G-I4 — and they are placed BEFORE his sentence and outside it. They used
    // to be seeded into his composer, which is `userMessage`, which is the one
    // region of this turn defined as his own words.
    const blocks = buildTurnContent(
      contextPack,
      userMessage,
      image,
      imageRefusal,
      carried ? renderCarriedNames(carried) : "",
    );

    const q = query({
      // Volatile context rides in the user turn; system prompt stays static
      // (prompt-cache friendly).
      //
      // TWO SHAPES, ONE MEANING. With no picture this is the same string it has
      // always been — a plain `prompt`, which is also what makes the SDK treat
      // the turn as single-shot and close stdin the moment the result lands.
      // With a picture it becomes a one-message async iterable carrying the
      // content blocks, because that is the only way an image reaches the model
      // without turning the Read tool back on — and File/shell tools stay off
      // (see disallowedTools below); her body is the phone and his desk, never
      // this box. The iterable yields once and returns: the SDK then waits for
      // the first result and ends input itself, so the turn still terminates.
      prompt: image
        ? (async function* () {
            yield {
              type: "user",
              session_id: "",
              parent_tool_use_id: null,
              message: { role: "user", content: blocks },
            } satisfies SDKUserMessage;
          })()
        : blocks[0].type === "text"
          ? blocks[0].text
          : "",
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
        noteSession(conversationId, message.session_id);
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
          endSession(conversationId);
          events.onError(`agent result: ${message.subtype}`);
          return;
        }
      }
    }

    // ---- THE TURN LEDGER, TO THE LOG AND NOWHERE ELSE (audit 4, W1 + W2) ---
    //
    // What used to be here: `auditTurn(fullText, …)`, which ran two keyword
    // detectors over her prose and APPENDED a correction to the turn. Both
    // detectors are deleted. The claim detector lost 11 out of 11 to ordinary
    // paraphrase, and the fault detector's correction promised coverage
    // ("nothing was found … or missing") that the word list did not have.
    //
    // The replacement for the first is not a longer list, it is GROUND TRUTH ON
    // HIS SCREEN: the deck prints how many cards are waiting beside the
    // conversation, always, including zero, and prints THIS TURN RAISED NO CARD
    // under a finished turn that emitted no confirm frame. A false claim is
    // visibly false without anyone parsing a sentence. The replacement for the
    // second is the refusal text itself, which already says the true reason.
    //
    // The counts this process kept are still worth having, so they are LOGGED.
    // A log line cannot promise more than it counted, and it never reaches his
    // answer, which is the whole difference.
    console.info(turnLedgerLine(conversationId, { cardsRaised, deskRefusals }));

    // HER REPLY. THIS LINE WAS STEP 3 OF THE D6-10 CHAIN: unconditional, on
    // picture turns, on the exact turn picture.ts had instructed her to say what
    // she can see in the screenshot — and distill.ts then lifted it into the
    // permanent spine, from which context.ts read it back into a clean thread
    // under "trust these over guesses". The gate is inside appendMessage now, so
    // it cannot be forgotten by the next caller of it.
    if (fullText.trim()) void appendMessage(conversationId, "eve", fullText);
    events.onState("idle");
    events.onDone({ conversationId, fullText });
  } catch (err) {
    endSession(conversationId);
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
