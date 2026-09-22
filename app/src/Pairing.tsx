import { useRef, useState } from "react";
import { CSS } from "./eveStyles";
import { EveEntity } from "./EveApp";
import { BRAIN_URL } from "./config";
import { verifyBrainToken } from "./eveApi";
import type { PairCheck } from "./eveApi";
import { saveToken } from "./tokenStore";
import { APP_VERSION } from "./version";

// THE PAIRING SCREEN (P1, 2026-09-06).
//
// The first thing he will ever see on a fresh install, and the ONLY thing:
// she cannot do a single useful thing without her brain, so there is no deck
// behind this and no modal over one. A greyed-out dashboard with a login on
// top would be a screen full of numbers she never measured.
//
// WHY IT IS FOUR REASONS AND NOT ONE. The same screen appears for four
// different causes and he is owed the difference:
//
//   first      a clean install. Nothing has happened; she just needs the key.
//   upgraded   MIGRATION (P5). His 0.8.0 works today because the token was
//              BAKED INTO THAT BUNDLE — a string literal inside index-*.js.
//              It was never written to the device, so there is nothing on the
//              phone to carry forward: the update replaces the bundle and the
//              only copy that existed goes with it. Carrying it forward is not
//              a design choice we declined, it is not physically available.
//              So the honest landing is this screen — and, because being
//              silently logged out is exactly the failure the brief forbids,
//              it says in words what happened, why, and that it happens once.
//              Detected by evidence a previous install left behind
//              (tokenStore.hasPriorInstall), not by a version guess.
//   signedout  he pressed SIGN OUT. The value is already erased.
//   rotate     he pressed RE-PAIR. THE OLD TOKEN IS STILL STORED and still
//              working; nothing is overwritten until a new one answers 200.
//              That is why this reason — and only this one — has a way back.

export type PairReason = "first" | "upgraded" | "signedout" | "rotate";

const HEAD: Record<PairReason, string> = {
  first: "Hand her the key.",
  upgraded: "One paste, once.",
  signedout: "Signed out.",
  rotate: "New key.",
};

const LEDE: Record<PairReason, string> = {
  first:
    "She's a thin client on her brain — without its token she can't measure a single thing, so there's nothing to show you until this is done.",
  upgraded:
    "This update pulled her token out of the app file itself, where it was sitting in plain text. Paste it here once and it lives on this phone from now on — you won't be asked again.",
  signedout:
    "Her token is erased from this phone. She's disconnected until you paste one in — nothing else was touched.",
  rotate:
    "The token you're using still works. Paste a new one and it takes over the moment her brain accepts it; nothing is replaced before that.",
};

export default function Pairing({
  reason,
  onPaired,
  onCancel,
}: {
  reason: PairReason;
  onPaired: () => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<Extract<PairCheck, { ok: false }> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pair = async () => {
    if (busy) return;
    setFail(null);
    setBusy(true);
    // THE CANDIDATE GOES STRAIGHT TO HER BRAIN AND NOWHERE ELSE. Not to the
    // store first, not to a log, not into the URL — an Authorization header on
    // one GET, and it is dropped on the floor if that GET doesn't come back 200.
    const check = await verifyBrainToken(value);
    if (check.ok) {
      await saveToken(value.trim());
      setValue("");
      setBusy(false);
      onPaired();
      return;
    }
    setFail(check);
    setBusy(false);
    inputRef.current?.focus();
  };

  const chars = value.trim().length;

  return (
    <div className="eve-root">
      <style>{CSS}</style>
      <div className="eve-frame">
        <div className="aura" />
        <div className="scan" />
        <div className="vig" />

        <div className="pairscr">
          <EveEntity mode="idle" />
          <div className="pairwm disp">EVE</div>
          <div className="pairws mono">EXECUTIVE VOICE ENGINE · CHURLISH MEDIA</div>

          <div className="pairbox">
            <div className="eyeb mono">
              <span>▸ PAIR THIS PHONE</span>
              <span className="r">v{APP_VERSION}</span>
            </div>
            <h1 className="pairh disp">{HEAD[reason]}</h1>
            <p className="pairlede">{LEDE[reason]}</p>

            {reason === "upgraded" && (
              <div className="pairmig mono">
                ▲ THE OLD BUILD CARRIED HER TOKEN INSIDE IT — THAT IS THE BUG THIS ONE FIXES.
                THERE IS NOTHING ON THE PHONE TO CARRY OVER.
              </div>
            )}

            <div className="pairlab mono">HER BRAIN</div>
            <div className="pairurl mono">{BRAIN_URL}</div>

            <div className="pairlab mono" style={{ marginTop: 14 }}>
              BRAIN TOKEN
            </div>
            {/* type=password, always. It is never rendered back, not here and
                not on the settings card — the char count is the confirmation
                that the paste landed. */}
            <input
              ref={inputRef}
              className="pairin mono"
              type="password"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="paste it here"
              aria-label="Brain token"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (fail) setFail(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void pair();
                }
              }}
            />
            <div className="pairchars mono">
              {chars ? `${chars} CHARS PASTED — HIDDEN` : "NOTHING PASTED YET"}
            </div>

            {fail && (
              <div className="pairerr mono" role="alert">
                <span className="k">
                  {fail.kind === "unauthorized"
                    ? "REFUSED"
                    : fail.kind === "unreachable"
                      ? "NO ANSWER"
                      : "HER END"}
                </span>
                <span className="s">{fail.say}</span>
                <span className="d">{fail.detail}</span>
              </div>
            )}

            <button className="pairbtn hit44" onClick={() => void pair()} disabled={busy || !chars}>
              {busy ? "ASKING HER BRAIN…" : "[ PAIR ]"}
            </button>

            {reason === "rotate" && onCancel && (
              <button className="pairback mono hit44" onClick={onCancel}>
                KEEP THE ONE I HAVE
              </button>
            )}

            <div className="pairfoot mono">
              it is checked against her brain before it is kept. it never leaves this phone
              except in her Authorization header.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
