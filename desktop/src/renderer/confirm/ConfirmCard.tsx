// owner: stream S3
//
// FROZEN interface — S2 (deck inline slot), S3 (modal) and S4 (summon) all
// compile against this exact shape. Keep ConfirmCardProps and the default
// export's signature exact or the other streams break (verified against
// deck/TalkColumn.tsx and deck/s3-contracts.ts, which already import this
// exact path and shape).
//
// Anatomy: design-reference/C-confirm.html + .confirmv6 (eve-desktop.css).
// Resolution flow ported from the phone (app/src/EveApp.tsx :498-529,
// :1053-1072) with ONE deliberate deviation the desktop spec calls for: the
// phone reads its note off a string prefix
// (`confirmNote[c.id].startsWith("SENT")`); here `Resolution` is a typed
// discriminated union, never a string match.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ConfirmResolution, PendingConfirm } from "@shared/contract";
// FILING HANDS (DESK/S3). A file batch is a different card, not a different
// body: approval does not END it, it starts a job on his disk that reports
// progress, ends in a partial or total outcome, and holds an UNDO for a minute
// afterwards. Delegating wholesale keeps this file's state machine — the one
// every shipped kind runs through — completely untouched.
import FileBatchCard from "../desk/FileBatchCard";
import { readFileBatchPayload } from "../desk/payload";
import "./confirm.css";

export interface ConfirmCardProps {
  confirm: PendingConfirm;
  variant: "inline" | "modal" | "summon";
  onResolved: (id: string) => void;
}

type Resolution =
  | { status: "pending" }
  | { status: "sent"; detail?: string }
  | { status: "cancelled" }
  | { status: "failed"; error?: string };

const RESOLVE_HOLD_MS = 5000;
const EXPIRY_TICK_MS = 15_000;

function humanizeKind(kind: string): string {
  const h = kind.replace(/_/g, " ").trim().toUpperCase();
  return h || "ACTION";
}

function clamp240(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 240 ? `${s.slice(0, 240)}…` : s;
}

function fmtHM(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toResolution(r: ConfirmResolution): Resolution {
  // DESK/S3 — deskJobId is checked FIRST, before `executed`. `resolveConfirm`
  // returns `{ok:true, executed:false}` for every client-executed confirm
  // ("nothing has left the brain", which is true), and the old first line
  // collapsed that to the word CANCELLED. On a file batch that is the app
  // telling him nothing happened while his disk changes under him — the exact
  // bug an unmodified filing build ships with (§7.4 / CARD-6).
  //
  // A file_batch normally never reaches this function at all: it is rendered by
  // FileBatchCard, which owns its own lifecycle. This line is the belt to that
  // braces — if a payload is ever unreadable and something falls back here, it
  // still cannot print CANCELLED over a running job.
  if (r.ok && r.deskJobId) return { status: "sent", detail: `RUNNING — job ${r.deskJobId.slice(0, 8)}` };
  if (r.ok && r.deskRefusal) return { status: "failed", error: r.deskRefusal };
  if (r.ok && r.executed) return { status: "sent", detail: r.detail };
  if (r.ok) return { status: "cancelled" };
  return { status: "failed", error: r.error };
}

/**
 * DESK/S3 — the dispatcher. The default export's SIGNATURE is unchanged (S2's
 * inline slot and S4's summon overlay compile against it verbatim); only what
 * it renders for one new kind is different.
 *
 * The split has to happen ABOVE the hooks, not inside the body: a file batch
 * needs a different set of hooks, and a conditional hook is a crash waiting for
 * the day a gmail_send confirm replaces a file_batch in the same slot. Two
 * sibling components, keyed by id, cannot have that bug.
 */
export default function ConfirmCard({ confirm, variant, onResolved }: ConfirmCardProps) {
  const batch = useMemo(
    () => (confirm.kind === "file_batch" ? readFileBatchPayload(confirm.payload) : null),
    [confirm.kind, confirm.payload],
  );

  if (confirm.kind === "file_batch") {
    // A file_batch whose payload will not parse is REFUSED, never degraded to
    // the generic body below. That body has no bidi isolation, no scroll gate,
    // and an Enter key that approves — rendering an unreadable file plan
    // through it would hand him the three defences at once.
    if (!batch) {
      return (
        <UnreadableBatchCard key={confirm.id} confirm={confirm} variant={variant} onResolved={onResolved} />
      );
    }
    return (
      <FileBatchCard
        key={confirm.id}
        confirm={confirm}
        payload={batch}
        variant={variant}
        onResolved={onResolved}
      />
    );
  }

  return <GenericConfirmCard key={confirm.id} confirm={confirm} variant={variant} onResolved={onResolved} />;
}

/**
 * The card for a `file_batch` this renderer cannot read. It offers no APPROVE
 * at all — not a disabled one — and it says why in the same voice as every
 * other refusal in the app.
 */
function UnreadableBatchCard({ confirm, onResolved }: ConfirmCardProps) {
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await window.eve.confirm(confirm.id, confirm.hash, false);
    } catch {
      /* the refusal stands either way — nothing was approved */
    }
    onResolved(confirm.id);
  };
  return (
    <div className="confirmv6">
      <div className="hd">▲ NEEDS YOU · FILE BATCH — REFUSED BEFORE IT WAS DRAWN</div>
      <div className="sum">
        This plan did not arrive in a shape I can show you file by file, so I will not show it at all.
      </div>
      <div className="field">
        <b>WHY</b>
        Approving a file plan means approving every from → to pair on it. I could not read those pairs
        out of this payload, so there is nothing here you could have read either. Nothing has moved.
      </div>
      <div className="cexpires">expires {fmtHM(confirm.expiresAt)}</div>
      <div className="crow">
        <p className="clocked">NO APPROVE ON THIS CARD — ASK HER TO RAISE IT AGAIN</p>
        <button className="cbtn gh" type="button" disabled={busy} onClick={() => void cancel()}>
          CANCEL
        </button>
      </div>
    </div>
  );
}

function GenericConfirmCard({ confirm, variant, onResolved }: ConfirmCardProps) {
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const resolvingRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const isSendSms = confirm.kind === "send_sms";
  const expiresAtMs = new Date(confirm.expiresAt).getTime();
  const expired = !Number.isNaN(expiresAtMs) && now >= expiresAtMs;

  // A desktop modal can sit open for the full ~35-minute window (the phone's
  // round-trip is seconds, so it never needed this) — keep the expiry check
  // honest for a card left on screen.
  useEffect(() => {
    if (resolution) return;
    const id = setInterval(() => setNow(Date.now()), EXPIRY_TICK_MS);
    return () => clearInterval(id);
  }, [resolution]);

  useEffect(
    () => () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    },
    [],
  );

  // "This is the ONE place desktop may steal focus" (handoff, Artboard C law).
  // Focusing the card on mount is what makes the keyboard handler below real:
  // a React onKeyDown only fires for events whose target is this subtree, so
  // stopPropagation here is the genuine DOM stopPropagation — it keeps a
  // sibling Esc-navigation handler from ever seeing the keystroke, which a
  // second independent window-level listener could not guarantee.
  useEffect(() => {
    if (variant === "inline") return;
    cardRef.current?.focus();
  }, [variant]);

  const decide = useCallback(
    async (approve: boolean) => {
      if (resolvingRef.current) return; // dedupe: ignore clicks while resolving
      resolvingRef.current = true;
      setResolution({ status: "pending" });
      try {
        const r = await window.eve.confirm(confirm.id, confirm.hash, approve);
        setResolution(toResolution(r));
      } catch (err) {
        setResolution({ status: "failed", error: err instanceof Error ? err.message : "unknown" });
      }
      holdTimerRef.current = setTimeout(() => onResolved(confirm.id), RESOLVE_HOLD_MS);
    },
    [confirm.id, confirm.hash, onResolved],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (variant === "inline" || resolution || expired) return;
      if (e.key === "Enter") {
        e.stopPropagation();
        if (!isSendSms) void decide(true);
      } else if (e.key === "Escape") {
        e.stopPropagation();
        void decide(false);
      }
    },
    [variant, resolution, expired, isSendSms, decide],
  );

  const headerLine = `▲ RED TIER · ${humanizeKind(confirm.kind)} — NOTHING SENDS WITHOUT YOU`;
  const approveLabel = variant === "modal" ? "APPROVE — SEND IT" : "APPROVE";
  const payloadEntries = Object.entries(confirm.payload ?? {});

  // THE PLATE IS NOT INLINE ANY MORE. This used to hardcode
  //   background: linear-gradient(180deg, rgba(196,30,58,.12), #0C1417 40%)
  // — the TERMINAL panel hex, baked in. Every word ON the card is tokenised, so
  // under PAPER (where --cream inverts to near-black #1C1712) near-black type
  // landed on a near-black plate: measured summary 1.95:1, payload value
  // 1.08:1, label 1.16:1, CANCEL 1.02:1, keycaps 1.02:1 — while APPROVE
  // survived at 14.19:1 because paper.css overrides .cbtn.ok. A card where only
  // APPROVE is legible is not a styling nit, it is the confirm tier failing at
  // the one job it has. The plate now comes from .confirmv6's own tokenised
  // gradient plus the var(--panel) backing in confirm.css, which is exactly
  // what the inline variant has always used.
  // ...AND NEITHER IS THE DROP SHADOW, NOW. It was `rgba(0,0,0,.6)` — the same
  // class of baked-in literal as the plate above, and it survived the plate fix
  // because a shadow is not a colour anybody thinks to theme. Under PAPER an
  // 80px black smear fell out of the bottom of the card and landed exactly on
  // "+N MORE WAITING", dragging that line's ground from cream (242,234,216)
  // down to (122,116,102) and the line itself to 2.77:1. No ink colour can
  // rescue text sitting on a black smudge — even solid --cream on that ground
  // is 3.82:1 — so the smudge is what had to go. rgba(var(--rgbVoid),.6) is
  // "the dark behind the frame, at 60%": byte-identical in TERMINAL (3,5,6),
  // NEON (8,8,8) and AMBER (6,5,4), and in PAPER it becomes the warm desk
  // tone (201,191,168) the world actually owns.
  const rootStyle =
    variant === "modal"
      ? {
          boxShadow: "0 30px 80px rgba(var(--rgbVoid),.6)",
          padding: "16px 18px",
        }
      : undefined;

  return (
    <div
      className="confirmv6"
      style={rootStyle}
      ref={cardRef}
      tabIndex={variant === "inline" ? undefined : -1}
      onKeyDown={variant === "inline" ? undefined : onKeyDown}
    >
      <div className="hd">{headerLine}</div>
      <div className="sum">{confirm.summary}</div>
      {payloadEntries.map(([k, v]) => (
        <div className="field" key={k}>
          <b>{k.toUpperCase()}</b>
          {clamp240(v)}
        </div>
      ))}
      <div className="cexpires">expires {fmtHM(confirm.expiresAt)}</div>

      {resolution ? (
        <div className={`cnote ${resolution.status}`}>
          {resolution.status === "pending" && "…"}
          {resolution.status === "sent" && `SENT — ${resolution.detail || "logged to the thread"}`}
          {resolution.status === "cancelled" && "CANCELLED"}
          {resolution.status === "failed" && `FAILED — ${resolution.error || "unknown"}`}
        </div>
      ) : expired ? (
        <div className="cexpired">EXPIRED — SHE'LL RE-RAISE IT IF IT STILL MATTERS</div>
      ) : (
        <div className="crow">
          {isSendSms ? (
            // NOT A BUTTON ANY MORE. This sentence is the entire answer to "so
            // what do I do?" on the one RED card the desktop cannot approve —
            // and it shipped as <button disabled>, which handed it app.css's
            // `button.cbtn:disabled{opacity:.4}` on top of an already-dimmed
            // colour. Measured: 2.07 / 1.78 / 1.85 / 2.01 across the four
            // worlds — the faintest text in the app, sitting beside a CANCEL at
            // ~15:1. WCAG exempts disabled CONTROLS; this was never a control.
            // It offers no action, cannot be pressed, and as a <p> it is also
            // no longer a thing a screen reader skips as an inert button.
            <p className="clocked">APPROVE ON YOUR PHONE — THIS ONE SENDS FROM YOUR SIM</p>
          ) : (
            <button className="cbtn ok" type="button" onClick={() => void decide(true)}>
              {approveLabel}
            </button>
          )}
          <button className="cbtn gh" type="button" onClick={() => void decide(false)}>
            CANCEL
          </button>
          {variant !== "inline" && (
            <span className="ckbd">
              <span className="kbd">⏎</span>
              <span className="kbd">ESC</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
