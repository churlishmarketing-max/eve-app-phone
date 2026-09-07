// TALK column (560px) — owning stream: S2. Artboard A centre column: the spine
// of the deck.
//
// Chat behaviour is the phone's, ported: instant pin-to-bottom (never smooth —
// at streaming rates a smooth scroll never lands before the next token restarts
// it), a 120px stick threshold so dragging the thread up disarms the pin, an
// empty EVE bubble that shows typing dots while she thinks, and a mono red
// `LINK:` line when the turn fails (law 9: failure never reads as her silence).

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import ConfirmCard from "../confirm/ConfirmCard";
import MicButton from "../voice/MicButton";
import { mdLite } from "./mdLite";
import type { ChatLock } from "@shared/contract";
import type { DeckMsg, EveMode } from "./types";

// EveApp.tsx:59 verbatim. The .chipv6 class uppercases them for display; the
// message that goes to the brain is the sentence-case string.
const CHIPS = ["Run my day", "What's on the board?", "Who's gone quiet?", "What's slipping?"];

const STICK_PX = 120;

export interface TalkColumnProps {
  messages: DeckMsg[];
  streamingId: string | null;
  mode: EveMode;
  errNote: string | null;
  online: boolean;
  busy: boolean;
  onSend: (text: string) => void;
  onConfirmResolved: (id: string) => void;
  /**
   * W2 — THE CONVERSATION IS LOCKED. Set by the brain's `locked` frame, which
   * is raised by the refusal itself in brain code. THE DESKTOP OWNS THE
   * AFFORDANCE: the button below appears because this prop is non-null, never
   * because she remembered to offer a way out. Optional so the shots and the
   * older screens still typecheck.
   */
  lock?: ChatLock | null;
  /**
   * Start a fresh conversation and hand back THE LAST THING HE TYPED, verbatim,
   * for the composer. The string comes from the renderer's own record of his
   * keystrokes — never from the brain, never from her, never from the mail —
   * and it lands in the box UNSENT so he can read and edit it first. Nothing
   * sends itself.
   */
  onReset?: () => string;
  /**
   * F4 — HOW MANY SIGNATURE REQUESTS ARE STILL WAITING, deck-wide. The union
   * of the cards that arrived on this thread's frames and the ones the poll
   * reports (core/jobs.ts pendingConfirmsOf, the same union App.tsx builds).
   *
   * The panel used to say the thread was closed for actions while a card
   * queued in that same poisoned thread sat there, still approvable. The card
   * is the true half — a card is a request for a signature, not an action, and
   * only his tap moves it — so the panel counts it out loud instead of
   * pretending the reset takes it away. Absent reads as none.
   */
  pendingCount?: number;
}

export default function TalkColumn(p: TalkColumnProps) {
  const [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const stick = useRef(true);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pinToBottom = useCallback((force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (force) stick.current = true;
    if (!stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const onConvScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
  }, []);

  useEffect(() => {
    pinToBottom();
  }, [p.messages, p.errNote, pinToBottom]);

  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    [],
  );

  const flash = useCallback((text: string) => {
    setNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 3000);
  }, []);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    stick.current = true;
    p.onSend(t);
  };

  const sendDraft = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    // setDraft fires no onChange, so a grown box would keep its height.
    if (inputRef.current) inputRef.current.style.height = "auto";
    send(t);
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(124, Math.max(42, el.scrollHeight))}px`;
  };

  const chipsOff = p.mode !== "idle" || !p.online || p.busy;

  // W2 — WHAT THE WITNESS WORD MEANS, in his language. The brain's `source` is
  // an enum of six values (untrusted.ts TaintSource) and it is shown RAW as
  // well as glossed: the raw token is the evidence, the gloss is so he does not
  // have to know the codebase to read his own deck. Keyed on a closed set — a
  // value nobody has glossed renders as the token alone, never as a guess.
  const WITNESS: Record<string, string> = {
    row: "my own durable record of this thread",
    memory: "something read in this very turn",
    offline: "my store was unreachable",
    error: "my store would not answer",
    orphan: "the record is gone but the transcript is not",
    "no-row": "there is no record of this thread at all",
    "not-consulted": "nothing asked the store",
  };

  // ---- W2 · THE ONE-CLICK RESET -------------------------------------------
  // One action: drop the conversation id, empty the thread, and put HIS OWN
  // last instruction back in the composer. It is not sent — he reads it, edits
  // it if he wants, and presses send himself.
  const resetToFreshThread = () => {
    const seed = p.onReset ? p.onReset() : "";
    setDraft(seed);
    stick.current = true;
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      autoGrow(el);
    });
    flash(seed ? "NEW THREAD — YOUR WORDS CAME WITH YOU, NOTHING ELSE DID." : "NEW THREAD — NOTHING TO CARRY. TYPE IT AGAIN.");
  };

  // ---- drag-TEXT capture (v1 law: text only, never a file) ----------------
  const hasText = (dt: DataTransfer | null): boolean =>
    !!dt && Array.from(dt.types).some((t) => t === "text/plain" || t === "text" || t === "text/uri-list");

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const text = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text");
    if (!text.trim()) {
      flash("TEXT ONLY IN V1.");
      return;
    }
    void window.eve
      .capture(text)
      .then((r) => flash(r?.ok ? "FILED." : `CAPTURE FAILED — ${r?.error ?? "no reason given"}`))
      .catch(() => flash("CAPTURE FAILED — THE BRIDGE IS DOWN"));
  };

  return (
    <div
      className="col"
      onDragOver={(e) => {
        if (!hasText(e.dataTransfer)) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={onDrop}
    >
      <span className="fbr tl" />
      <span className="fbr tr" />
      <span className="fbr bl" />
      <span className="fbr br" />

      <div
        style={{
          height: 40,
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--mono)",
          fontSize: 8.5,
          letterSpacing: ".3em",
          color: "rgba(240,237,232,.45)",
          borderBottom: "1px solid var(--hair)",
        }}
      >
        EVE // EXECUTIVE VOICE ENGINE
      </div>

      <div className="conv" ref={scrollRef} onScroll={onConvScroll}>
        {p.messages.length === 0 ? (
          <div className="convhint">say the word — or CTRL+SPACE from anywhere</div>
        ) : null}

        {p.messages.map((m) =>
          m.role === "eve" ? (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignSelf: "flex-start", maxWidth: "70%", gap: 8 }}>
              <div className="bub eve" style={{ maxWidth: "100%" }}>
                <div className="bname eve">EVE</div>
                {m.text ? (
                  <div className="btext">
                    <span dangerouslySetInnerHTML={{ __html: mdLite(m.text) }} />
                    {p.streamingId === m.id ? <span className="cur">▌</span> : null}
                  </div>
                ) : p.mode === "thinking" ? (
                  <div className="typing">
                    <i />
                    <i />
                    <i />
                  </div>
                ) : (
                  <div className="btext" />
                )}
              </div>
              {(m.confirms ?? []).map((c) => (
                <ConfirmCard key={c.id} confirm={c} variant="inline" onResolved={p.onConfirmResolved} />
              ))}
            </div>
          ) : (
            <div className="bub you" key={m.id}>
              <div className="bname you">YOU</div>
              <div className="btext">{m.text}</div>
            </div>
          ),
        )}

        {p.errNote ? <div className="errline">LINK: {p.errNote}</div> : null}
      </div>

      {p.lock ? (
        <div className="lockpanel">
          <div className="lockhd">THIS THREAD IS CLOSED FOR ACTIONS</div>
          <div className="lockwhy">
            {p.lock.status === "tainted"
              ? "I’ve read someone else’s words in this conversation, so I can’t act in it any more."
              : "I can’t tell you this conversation is clean, so I won’t act in it."}{" "}
            {p.lock.why ? p.lock.why.charAt(0).toUpperCase() + p.lock.why.slice(1) + "." : ""}
          </div>
          <div className="lockmeta">
            REFUSED: {p.lock.tools.length ? p.lock.tools.join(" · ") : "—"} // WITNESS:{" "}
            {p.lock.source ? `${p.lock.source}${WITNESS[p.lock.source] ? ` — ${WITNESS[p.lock.source]}` : ""}` : "—"}
          </div>
          <button type="button" className="lockbtn" onClick={resetToFreshThread}>
            START A FRESH THREAD
          </button>
          <div className="locknote">
            If you typed your last turn, it comes with you exactly as you typed it, into an empty box you can
            edit. If you spoke it, the box comes up empty and you say it again — a greeting she seeded or a line
            she spoke is not your instruction and will never be handed back to you as one. Nothing of hers and
            nothing out of the mail travels.
          </div>
          {p.pendingCount ? (
            <div className="lockcards">
              {p.pendingCount === 1 ? "1 REQUEST IS" : `${p.pendingCount} REQUESTS ARE`} STILL WAITING FOR YOUR
              SIGNATURE, AND WILL STILL BE WAITING AFTER THIS. A card is a request for a signature, not an
              action — it cannot send itself, and a fresh thread does not answer it. Read the card, not this
              thread.
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ flex: "none", display: "flex", gap: 8, padding: "0 16px 12px", flexWrap: "wrap" }}>
        {CHIPS.map((c) => (
          <button
            type="button"
            className="chipv6"
            key={c}
            disabled={chipsOff}
            onClick={() => send(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div style={{ flex: "none", display: "flex", gap: 10, alignItems: "flex-start", padding: "0 16px 6px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <MicButton disabled={!p.online} />
          <span style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: ".14em", color: "rgba(240,237,232,.35)" }}>
            CTRL+SPACE
          </span>
        </div>
        <textarea
          ref={inputRef}
          className="cmdinput"
          rows={1}
          placeholder="talk to her…"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendDraft();
            }
          }}
        />
        <button type="button" className="sendb" onClick={sendDraft} title="Send">
          ➤
        </button>
      </div>

      <div style={{ flex: "none", textAlign: "center", padding: "4px 0 10px" }}>
        {note ? <span className="tnote">{note}</span> : <span className="footline">push-to-talk only. she never listens uninvited.</span>}
      </div>

      {dragging ? <div className="dropzone">DROP TEXT — SHE FILES IT</div> : null}
    </div>
  );
}
