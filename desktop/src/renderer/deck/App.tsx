// APP — the deck window's composition root. Owning stream: S2.
//
// Everything stateful lives here: the hooks, the resolved presence mode, the
// confirm union, and the two S3 surfaces that sit above the deck (ConfirmLayer
// and the wardrobe panel). Deck.tsx below is pure presentation, which is what
// lets a shot scenario render the whole board from a fixture.
//
// Lives in deck/ rather than renderer/ so the frozen S3/S4 import paths
// ("../confirm/ConfirmLayer", "../voice/events") resolve exactly as specified.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConfigView, PendingConfirm } from "@shared/contract";
import { voiceEvents } from "../voice/events";
import { useChat } from "../hooks/useChat";
import { useEveState } from "../hooks/useEveState";
import { useVitalsStrip } from "../hooks/useVitalsStrip";
import { useWardrobe } from "../hooks/useWardrobe";
import Deck from "./Deck";
import { ConfirmLayer, WardrobePanel } from "./s3-contracts";
import { NAV_BY_KEY, isTypingTarget } from "./NavStrip";
import { bootSession, readPlateMode } from "./format";
import type { CorePrefill, DeckView, EveMode } from "./types";

// Law 2: no canned personality lines. The session greeting is a HIDDEN system
// seed through the normal pipe — she writes the sentence, we only ask.
const GREETING_SEED = "[King just opened the desktop deck. Greet him and give a short read on the moment.]";
const GREET_GUARD = "eve.desktop.greeted";

export default function App() {
  const { state, fetchedAt, ready, refresh } = useEveState();
  const chat = useChat();
  const wardrobe = useWardrobe();
  const vitals = useVitalsStrip(state.online);

  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState<DeckView>("deck");
  const [closetOpen, setCloset] = useState(false);
  const [preview, setPreview] = useState<EveMode | null>(null);
  const [voiceMode, setVoiceMode] = useState<EveMode | null>(null);
  const [transientNote, setTransientNote] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);
  // v0.2 — what the FLEET tab's DISPATCH button put in THE CORE's command bar.
  const [corePrefill, setCorePrefill] = useState<CorePrefill | null>(null);
  const prefillSeq = useRef(0);

  // The counter cannot advance until main has told us whether a harness is
  // driving this launch, so the first paint shows the stored total (a read,
  // never a write) and the count lands the moment config answers.
  const [sessionNo, setSessionNo] = useState(() => bootSession(true));
  const plateMode = useMemo(() => readPlateMode(), []);

  // useChat returns a fresh object every render; its callbacks are the stable
  // things, so effects depend on those and never on the bag.
  const { appendYou, sendMessage, pruneConfirm, frameConfirms } = chat;

  // ---- the clock -----------------------------------------------------------
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- config: SILENT AT THE DESK + the quiet-hours window ----------------
  // Re-read on a slow beat because `quietHours` is computed main-side at call
  // time — a deck left open across 21:30 must notice.
  useEffect(() => {
    let dead = false;
    const read = () => {
      void window.eve.config
        .get()
        .then((c) => {
          if (!dead) setConfig(c);
        })
        .catch(() => undefined);
    };
    read();
    const t = setInterval(read, 60_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  // ---- the session count: his launches only -------------------------------
  // Sixty smoke/shots boots polluted the tally before he ever opened the app,
  // so a harness launch reads the number and leaves it alone (format.ts also
  // zeroes it once, on the first launch that is NOT a harness).
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current || !config) return;
    counted.current = true;
    if (!config.harness) setSessionNo(bootSession(false));
  }, [config]);

  // ---- her voice's name — never baked in ----------------------------------
  useEffect(() => {
    if (!state.online || voiceName) return;
    let dead = false;
    void window.eve
      .voices()
      .then((v) => {
        const first = v?.voices?.[0]?.name;
        if (!dead && first) setVoiceName(first);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [state.online, voiceName]);

  // ---- S4's voice bus ------------------------------------------------------
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const unsub = voiceEvents.on((e) => {
      if (e.type === "mode") {
        setVoiceMode(e.mode === "idle" ? null : e.mode);
        return;
      }
      if (e.type === "transient-note") {
        setTransientNote(e.text);
        timers.push(setTimeout(() => setTransientNote(null), Math.max(0, e.ttlMs)));
        return;
      }
      // Forward-compat: S4 emits this right before starting a voice turn so his
      // spoken line appears before her first token. Read defensively — the
      // union in voice/events.ts does not carry it yet.
      const any = e as { type: string; text?: unknown };
      if (any.type === "user-turn" && typeof any.text === "string" && any.text.trim()) {
        appendYou(any.text);
      }
      // Anything else: ignore silently.
    });
    return () => {
      unsub();
      timers.forEach(clearTimeout);
    };
  }, [appendYou]);

  // ---- the session greeting -----------------------------------------------
  // Mirrors the session-counter gate above: wait for config to answer before
  // deciding anything, mark the ref once either way, and only actually seed
  // the hidden chat turn when this launch is NOT a harness (smoke / shots /
  // shot-url / tray-dump). A live probe boot (EVE_SHOT_URL against the real
  // brain) must stay silent — no greeting, no bubble, no /chat call.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !ready || !state.online || !config) return;
    seeded.current = true;
    if (config.harness) return;
    try {
      if (sessionStorage.getItem(GREET_GUARD)) return;
      sessionStorage.setItem(GREET_GUARD, "1");
    } catch {
      /* no sessionStorage: fall through to the ref guard alone */
    }
    void sendMessage(GREETING_SEED, { hidden: true });
  }, [ready, state.online, sendMessage, config]);

  // ---- __RENDER_DONE: after the first state answer AND the fonts -----------
  const painted = useRef(false);
  useEffect(() => {
    const mark = () => {
      if (painted.current) return;
      painted.current = true;
      window.__RENDER_DONE = true;
    };
    // A ceiling so a hung bridge can never hold the harness hostage.
    const ceiling = setTimeout(mark, 3000);
    if (ready) {
      void document.fonts.ready
        .catch(() => undefined)
        .then(() => requestAnimationFrame(() => requestAnimationFrame(mark)));
    }
    return () => clearTimeout(ceiling);
  }, [ready]);

  // ---- the confirm union ---------------------------------------------------
  const confirms = useMemo(() => {
    const out: PendingConfirm[] = [];
    const seen = new Set<string>(resolvedIds);
    for (const c of [...frameConfirms, ...(state.pendingConfirms ?? [])]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out;
  }, [frameConfirms, state.pendingConfirms, resolvedIds]);

  const onConfirmResolved = useCallback(
    (id: string) => {
      setResolvedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
      pruneConfirm(id);
      void refresh();
    },
    [pruneConfirm, refresh],
  );

  // ---- the resolved presence mode -----------------------------------------
  // Preview (his wardrobe hover) beats everything for its 3.6s; a live voice
  // mode beats the chat-derived one; a RED queue with nothing else happening
  // is ALERT.
  const mode: EveMode =
    preview ??
    voiceMode ??
    (chat.mode !== "idle" ? chat.mode : confirms.length > 0 ? "alert" : "idle");

  const onToggleSilent = useCallback(() => {
    const next = !(config?.silentAtDesk ?? false);
    setConfig((c) => (c ? { ...c, silentAtDesk: next } : c));
    void window.eve.config
      .set({ silentAtDesk: next })
      .then((r) => {
        if (r?.config) setConfig(r.config);
      })
      .catch(() => undefined);
  }, [config]);

  const closeCloset = useCallback(() => {
    setCloset(false);
    setPreview(null);
    void wardrobe.refresh();
  }, [wardrobe]);

  const openCloset = useCallback(() => setCloset(true), []);

  // ---- FLEET → CORE: a row's DISPATCH button --------------------------------
  // Jumps to THE CORE with "dispatch <key>: " in the command bar and the box
  // focused. NOTHING is sent: he finishes the sentence, it goes to her as a
  // turn on the existing chat path, and she routes it (D-DISPATCH §7.4).
  const onDispatchUnit = useCallback(
    (key: string) => {
      prefillSeq.current += 1;
      setCorePrefill({ text: `dispatch ${key}: `, seq: prefillSeq.current });
      if (closetOpen) closeCloset();
      setView("core");
    },
    [closetOpen, closeCloset],
  );

  // ---- ESC: the exit chain -------------------------------------------------
  // Order, and why each rung is where it is:
  //   1. a RED confirm consumes it first. ConfirmCard focuses its own card on
  //      mount and handles Escape as a React onKeyDown, so the real DOM
  //      stopPropagation keeps the keystroke off `window` entirely. That is
  //      airtight only while focus is still ON the card — nothing traps it, and
  //      this stream just added four Tab-reachable nav buttons behind the
  //      scrim. So this handler ALSO bails outright while a confirm is
  //      pending: even with focus tabbed away, Esc can no longer navigate out
  //      from under a card he has not answered.
  //   2. the wardrobe closes (it is the overlay, it is on top).
  //   3. otherwise a non-deck view returns to the deck.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirms.length > 0) return;
      if (closetOpen) {
        closeCloset();
        return;
      }
      setView("deck");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closetOpen, closeCloset, confirms.length]);

  // ---- the numbered destinations: 1 DECK · 2 BODY · 3 CLOSET · 4 WIRE ------
  // The same digits drawn as keycaps on the nav strip, read from the one list
  // in NavStrip.tsx so the chrome and the keyboard cannot drift. Bare digits,
  // so three things must be true before one navigates: no modifier is down, he
  // is not in a text field (the composer, a settings input, the habit-name
  // draft), and no RED card is on screen — a pending confirm owns the keyboard
  // until he answers it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (confirms.length > 0) return;
      if (isTypingTarget(e.target)) return;
      const dest = NAV_BY_KEY[e.key];
      if (!dest) return;
      e.preventDefault();
      if (dest === "closet") {
        if (closetOpen) closeCloset();
        else openCloset();
        return;
      }
      if (closetOpen) closeCloset();
      setView(dest);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closetOpen, closeCloset, openCloset, confirms.length]);

  return (
    <>
      <Deck
        now={now}
        sessionNo={sessionNo}
        state={state}
        fetchedAt={fetchedAt}
        refresh={refresh}
        chat={chat}
        mode={mode}
        transientNote={transientNote}
        wardrobe={wardrobe}
        plateMode={plateMode}
        voiceName={voiceName}
        silentAtDesk={config?.silentAtDesk ?? false}
        quietHours={config?.quietHours ?? false}
        view={view}
        closetOpen={closetOpen}
        // W1 — THE NUMBER, not a claim about it. This is the SAME `confirms`
        // union ConfirmLayer renders below, so the counter beside the
        // conversation and the cards on his screen cannot disagree: one list,
        // one length, printed whether it is three or zero.
        waitingCards={confirms.length}
        vitals={vitals}
        // THE HANDOFF — what she matched through desk_scan and handed over,
        // already resolved by MAIN against this machine's own index. The talk
        // column turns it into ONE button that opens a fresh conversation with
        // those filenames as CHIPS BESIDE AN EMPTY COMPOSER, for him to direct.
        handoff={chat.handoff}
        picture={chat.picture}
        onFreshThread={chat.startFreshThread}
        onDismissHandoff={chat.dismissHandoff}
        onSend={(t, image, names) =>
          void sendMessage(t, {
            ...(image ? { image } : {}),
            // THE CARRIED NAMES RIDE THEIR OWN FIELD, never `message` (audit 5,
            // B2). See @shared/handoff and brain/src/carried.ts.
            ...(names && names.length > 0 ? { names } : {}),
          })
        }
        onConfirmResolved={onConfirmResolved}
        onToggleSilent={onToggleSilent}
        onOpenWardrobe={openCloset}
        onCloseWardrobe={closeCloset}
        onView={setView}
        corePrefill={corePrefill}
        onDispatchUnit={onDispatchUnit}
      />
      <WardrobePanel
        open={closetOpen}
        onClose={closeCloset}
        busy={chat.busy}
        onPreviewState={setPreview}
      />
      <ConfirmLayer confirms={confirms} onResolved={onConfirmResolved} />
    </>
  );
}
