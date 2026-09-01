// owner: stream V (her voice)
//
// HER VOICE, PICKED BY HIM — and the truth about whether the pick took.
//
// Mount it anywhere in settings: `import VoicePicker from "./VoicePicker"` and
// render <VoicePicker onClose={...} />. It is self-contained (no new CSS file,
// no props but the optional close) and styles itself from the law classes in
// src/styles/eve-desktop.css plus var() tokens, so a theme swap carries it.
//
// THAT CLAIM USED TO BE FALSE. Eight inline styles below spelled TERMINAL
// literals — rgba(240,237,232,…), rgba(201,165,74,…), rgba(28,185,200,…) —
// so under PAPER (where the ink channel inverts to near-black) they rendered
// near-white on cream and measured 1.01:1: the GOLD headline "THIS BRAIN CANNOT
// CHANGE VOICE YET" survived while the sentences UNDER it explaining what will
// actually happen disappeared. That is the honesty law inverted — the claim
// legible, the caveat gone. Every literal is now a channel token, and the
// alphas that carry sentences are lifted to what PAPER needs (.72 -> 5.9:1
// on this card, measured; the dark worlds gain contrast and lose nothing).
//
// THREE LAWS IT KEEPS
//
// 1. It never claims a change it cannot prove. A per-utterance `voiceId` is
//    only honoured by a brain that also reports `configuredVoiceId` on
//    GET /voice/voices. When that field is absent — an older deployment — this
//    card says so in words and disables auditions and picks, instead of sending
//    an id an old brain silently drops and calling the result a preview.
// 2. It never writes her dialogue. An audition replays the last line the BRAIN
//    generated and she actually spoke (playback.ts remembers it). With no line
//    on file yet it says only the candidate voice's own name — a label, not a
//    sentence put in her mouth — and tells him that is what it will do.
// 3. It is honest about scope. A pick here is the desktop's override, sent with
//    every line she speaks from this machine. The brain's own default (the
//    phone, the morning brief) is ELEVENLABS_VOICE_ID and still needs a redeploy.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auditionLine, preview } from "../voice/playback";
import { checkBuild, type BuildCheck } from "../voice/buildCheck";
import { runSpeakerTest, type SpeakerTestResult } from "../voice/speakerTest";
import { useVoiceIdentity, type VoiceOption } from "../voice/useVoiceIdentity";

export interface VoicePickerProps {
  onClose?: () => void;
}

const MONO = {
  fontFamily: "var(--mono)",
  fontSize: 9,
  letterSpacing: ".14em",
} as const;

/**
 * The one alarm style in this card. Used for facts, never for emphasis.
 *
 * GOLD, NOT RED, and that is a law rather than a taste. --red / --rgbRed are
 * the RED confirm tier and the live mic, in all four worlds, and nothing else
 * (eve-desktop.css:20-23) — the moment a warning borrows them, the one colour
 * that is supposed to mean "this is about to be irreversible" starts also
 * meaning "your build is stale" and stops meaning anything. Gold is this
 * system's hot-state channel. A build skew is a hot state.
 */
const ALARM = {
  border: "1px solid rgba(var(--rgbGold),.5)",
  background: "rgba(var(--rgbGold),.07)",
  borderRadius: 8,
  padding: "9px 11px",
  display: "flex",
  flexDirection: "column",
  gap: 5,
} as const;

export default function VoicePicker({ onClose }: VoicePickerProps) {
  const id = useVoiceIdentity();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [noteRemedy, setNoteRemedy] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildCheck | null>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<SpeakerTestResult | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // THE FIRST QUESTION THIS CARD ASKS, before anything about voices: is the
  // process behind this window even the same build as this window? When it is
  // not, every explanation below it is a guess — see buildCheck.ts for the
  // incident this exists to name.
  useEffect(() => {
    void checkBuild().then((b) => {
      if (alive.current) setBuild(b);
    });
  }, []);

  const speakerTest = useCallback(async () => {
    if (testing) return;
    setTesting(true);
    setTest(null);
    const r = await runSpeakerTest();
    if (!alive.current) return;
    setTest(r);
    setBuild(r.build);
    setTesting(false);
  }, [testing]);

  const { voices, effectiveId, overrideSupported } = id;

  // Current first, then alphabetical — 50 rows need an order, and hers is the
  // one he is comparing everything against.
  const ordered = useMemo(() => {
    const copy = [...voices];
    copy.sort((a, b) => {
      if (a.id === effectiveId) return -1;
      if (b.id === effectiveId) return 1;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [effectiveId, voices]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      q ? ordered.filter((v) => v.name.toLowerCase().includes(q) || v.id.toLowerCase().includes(q)) : ordered,
    [ordered, q],
  );

  const sampleLine = auditionLine();

  const audition = useCallback(
    async (v: VoiceOption) => {
      if (!overrideSupported || busyId) return;
      setNote(null);
      setNoteRemedy(null);
      setBusyId(v.id);
      // Her own last sentence when there is one; otherwise the voice's own name.
      const r = await preview(sampleLine ?? v.name, v.id);
      if (!alive.current) return;
      setBusyId(null);

      // THIS LINE USED TO READ "AUDITION DIDN'T PLAY — NO AUDIO", and that
      // string is what King stared at for a day. "NO AUDIO" is not a
      // diagnosis; it was one swallowed exception wearing four different
      // faults' clothes. Now the sentence comes from the failure itself.
      if (r.played) {
        // Played — but say so if it did not go where he asked it to.
        if (r.notices.length > 0) setNote(r.notices.map((n) => n.toUpperCase()).join(" · "));
        else if (r.receipt) {
          setNote(
            `PLAYED ${r.receipt.reachedSec.toFixed(2)}s ON ${r.receipt.sink.appliedLabel.toUpperCase()}.`,
          );
        }
        return;
      }
      if (r.reason === "stopped") return; // he interrupted it; that is not a fault
      setNote(
        `AUDITION DIDN'T PLAY — ${r.message.toUpperCase()}${r.detail ? ` [${r.detail.toUpperCase()}]` : ""}`,
      );
      setNoteRemedy(r.remedy);
      if (r.buildSkew) void checkBuild().then((b) => alive.current && setBuild(b));
    },
    [busyId, overrideSupported, sampleLine],
  );

  const choose = useCallback(
    (v: VoiceOption) => {
      if (!overrideSupported) return;
      // Picking the brain's own voice clears the override rather than pinning a
      // duplicate of it — one less thing to go stale after a redeploy.
      const isDefault = v.id === id.configuredVoiceId;
      id.select(isDefault ? null : v.id);
      setNoteRemedy(null);
      setNote(
        isDefault
          ? `BACK TO THE BRAIN'S OWN VOICE — ${v.name.toUpperCase()}`
          : `SAVED — SHE SPEAKS AS ${v.name.toUpperCase()} FROM THIS DESKTOP`,
      );
    },
    [id, overrideSupported],
  );

  const headRight = id.loading
    ? "READING HER ACCOUNT"
    : id.error
      ? "UNREACHABLE"
      : q
        ? `${shown.length} OF ${voices.length} VOICES`
        : `${voices.length} VOICE${voices.length === 1 ? "" : "S"}`;

  return (
    <div
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, maxWidth: 640, width: "100%" }}
    >
      <div className="eyeb">
        <span>HER VOICE</span>
        <span className="r">{headRight}</span>
      </div>

      {/* ---- IS THIS WINDOW TALKING TO ITS OWN BUILD? ----------------------
          Printed ABOVE everything about voices on purpose. When main is older
          than this window, nothing below can be trusted: her voice, the
          picker, the filing hands — every channel added since that process
          booted rejects, and each caller invents its own mystery. Name it once,
          at the top, with the remedy attached. */}
      {build?.skewed && build.message ? (
        <div style={ALARM}>
          <span style={{ ...MONO, color: "var(--gold)" }}>EVE IS RUNNING TWO DIFFERENT BUILDS AT ONCE</span>
          <span style={{ ...MONO, fontSize: 8.5, color: "rgba(var(--rgbCream),.78)", lineHeight: 1.6 }}>
            {build.message.toUpperCase()}
          </span>
          {build.remedy ? (
            <span style={{ ...MONO, fontSize: 8.5, color: "var(--gold)", lineHeight: 1.6 }}>
              {build.remedy.toUpperCase()}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ---- what is true right now ---------------------------------------- */}
      {id.error ? (
        <div style={{ ...MONO, color: "var(--gold)" }}>VOICE LIST UNAVAILABLE — {id.error.toUpperCase()}</div>
      ) : id.loading ? (
        <div style={{ ...MONO, color: "rgba(var(--rgbCream),.72)" }}>ASKING THE BRAIN WHICH VOICE IS LIVE…</div>
      ) : (
        <div style={{ ...MONO, color: id.effectiveName ? "var(--tealHi)" : "var(--gold)" }}>
          {id.effectiveName
            ? `SPEAKING AS ${id.effectiveName.toUpperCase()} · ${
                id.usingOverride ? "YOUR PICK" : "THE BRAIN'S OWN VOICE"
              }`
            : "THIS BRAIN WILL NOT SAY WHICH VOICE IS LIVE"}
        </div>
      )}

      {/* ---- the capability truth: detected, never assumed ------------------ */}
      {!id.loading && !id.error && !overrideSupported ? (
        <div
          style={{
            border: "1px solid rgba(var(--rgbGold),.35)",
            background: "rgba(var(--rgbGold),.06)",
            borderRadius: 8,
            padding: "9px 11px",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          <span style={{ ...MONO, color: "var(--gold)" }}>THIS BRAIN CANNOT CHANGE VOICE YET</span>
          <span style={{ ...MONO, fontSize: 8.5, color: "rgba(var(--rgbCream),.72)", lineHeight: 1.6 }}>
            REDEPLOY THE BRAIN BEFORE A NEW VOICE CAN TAKE EFFECT. AUDITION AND PICK STAY OFF UNTIL THEN — A PICK SENT
            NOW WOULD BE DROPPED, AND YOU WOULD HEAR HER CURRENT VOICE BACK.
          </span>
          <span style={{ ...MONO, fontSize: 8.5, color: "rgba(var(--rgbCream),.72)" }}>
            DETECTED: GET /VOICE/VOICES CAME BACK WITHOUT configuredVoiceId
          </span>
        </div>
      ) : null}

      {id.selectedId && !overrideSupported ? (
        <div style={{ ...MONO, fontSize: 8.5, color: "var(--gold)" }}>
          A SAVED PICK IS ON FILE ({id.selectedId}) AND THIS BRAIN IS IGNORING IT.
        </div>
      ) : null}

      {/* ---- search -------------------------------------------------------- */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="FILTER BY NAME OR ID"
          aria-label="Filter her voices"
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--panel2)",
            border: "1px solid var(--hair2)",
            borderRadius: 6,
            color: "var(--cream)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: ".08em",
            padding: "7px 9px",
            outline: "none",
          }}
        />
        {id.selectedId && overrideSupported ? (
          <button type="button" className="cbtn gh" onClick={() => id.select(null)} title="Drop the override">
            [ HER DEFAULT ]
          </button>
        ) : null}
        {/* SPEAKER TEST — one press, the whole real path: bridge -> brain ->
            bytes -> output device -> clock, on her real last line when there
            is one and a plain chrome label otherwise (never a line written
            for her). The receipt names bytes received, the device actually
            used, the play outcome and the duration. When the brain leg sends
            no bytes, a local tone is pushed through the same speaker path so
            "brain" and "speakers" are still told apart. */}
        <button
          type="button"
          className="cbtn gh"
          onClick={() => void speakerTest()}
          disabled={testing}
          title="Speak her last line (or a plain label) through the real path — bridge, brain, bytes, output device — and report what happened"
          style={testing ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
        >
          {testing ? "TESTING…" : "[ SPEAKER TEST ]"}
        </button>
        <button type="button" className="cbtn gh" onClick={id.reload} title="Ask the brain again">
          [ REFRESH ]
        </button>
        {onClose ? (
          <button type="button" className="cbtn gh" onClick={onClose}>
            [ CLOSE ]
          </button>
        ) : null}
      </div>

      {/* ---- the list ------------------------------------------------------ */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxHeight: 300,
          overflowY: "auto",
          paddingRight: 2,
        }}
      >
        {shown.map((v) => {
          const current = v.id === effectiveId;
          const busy = busyId === v.id;
          const locked = !overrideSupported;
          return (
            <div
              key={v.id}
              className="oprow"
              style={
                current
                  ? { borderColor: "rgba(var(--rgbAccent),.45)", background: "rgba(var(--rgbAccent),.05)" }
                  : undefined
              }
            >
              <span className="gl" style={{ color: current ? "var(--tealHi)" : "rgba(var(--rgbCream),.55)" }}>
                {current ? "●" : "○"}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="tt">{v.name}</div>
                <div className="sub">{v.id}</div>
              </div>
              <div className="acts">
                {current ? <span className="stat run">CURRENT</span> : null}
                <button
                  type="button"
                  className="cbtn gh"
                  disabled={locked || !!busyId}
                  onClick={() => void audition(v)}
                  title={
                    locked
                      ? "The brain must be redeployed before it can speak in another voice"
                      : `Hear ${v.name} say her last line`
                  }
                  style={locked || !!busyId ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                >
                  {busy ? "PLAYING…" : "AUDITION"}
                </button>
                {current ? null : (
                  <button
                    type="button"
                    className="cbtn ok"
                    disabled={locked}
                    onClick={() => choose(v)}
                    title={locked ? "Redeploy the brain first" : `Speak as ${v.name} from this desktop`}
                    style={locked ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                  >
                    USE
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {!id.loading && !id.error && shown.length === 0 ? (
          <div style={{ ...MONO, color: "rgba(var(--rgbCream),.72)", padding: "6px 2px" }}>
            {voices.length === 0 ? "HER ACCOUNT RETURNED NO VOICES" : `NO VOICE MATCHES "${query.toUpperCase()}"`}
          </div>
        ) : null}
      </div>

      {/* ---- what an audition will actually say ---------------------------- */}
      <div style={{ ...MONO, fontSize: 8.5, color: "rgba(var(--rgbCream),.72)", lineHeight: 1.6 }}>
        {sampleLine ? (
          <>
            AN AUDITION REPLAYS HER LAST LINE:{" "}
            <span style={{ color: "var(--dim)" }}>&ldquo;{sampleLine}&rdquo;</span>
          </>
        ) : (
          "NOTHING OF HERS TO REPLAY YET — AN AUDITION WILL SAY ONLY THE VOICE'S NAME. THE SHELL NEVER WRITES HER LINES."
        )}
      </div>

      {/* ---- the speaker test receipt --------------------------------------
          Every line is an observation, not a verdict dressed as one: how far
          the clock actually got, which device it went to, which media events
          fired, whether the bridge is present. He can read it, or paste it. */}
      {test ? (
        <div
          style={{
            // Same law as ALARM above: a failed speaker test is a hot
            // state, not a RED confirm. Teal when sound came out, gold when it
            // did not.
            border: `1px solid ${test.played ? "rgba(var(--rgbAccent),.4)" : "rgba(var(--rgbGold),.5)"}`,
            background: test.played ? "rgba(var(--rgbAccent),.05)" : "rgba(var(--rgbGold),.07)",
            borderRadius: 8,
            padding: "9px 11px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span style={{ ...MONO, color: test.played ? "var(--tealHi)" : "var(--gold)" }}>
            SPEAKER TEST — {test.played ? "SOUND CAME OUT" : "NO SOUND"}
          </span>
          {test.lines.map((l, i) => (
            <span
              key={i}
              style={{ ...MONO, fontSize: 8.5, color: "rgba(var(--rgbCream),.78)", lineHeight: 1.6 }}
            >
              {l}
            </span>
          ))}
          <span style={{ ...MONO, fontSize: 8.5, color: "var(--dim)", lineHeight: 1.6 }}>
            THE SAMPLE WENT DOWN THE REAL PATH — BRIDGE, BRAIN, BYTES, OUTPUT DEVICE, CLOCK. A LOCAL TONE IS PUSHED THROUGH THE SAME SPEAKER PATH ONLY WHEN THE BRAIN LEG SENT NO BYTES, SO THE TWO CAN BE TOLD APART.
          </span>
        </div>
      ) : null}

      {note ? <div style={{ ...MONO, color: "var(--ice)" }}>{note}</div> : null}
      {noteRemedy ? (
        <div style={{ ...MONO, fontSize: 8.5, color: "var(--gold)", lineHeight: 1.6 }}>
          {noteRemedy.toUpperCase()}
        </div>
      ) : null}

      <div className="footline">
        a pick here is this desktop&rsquo;s — sent with every line she speaks from this machine. her brain-side default
        (phone, morning brief) is ELEVENLABS_VOICE_ID and still needs a redeploy.
      </div>
    </div>
  );
}
