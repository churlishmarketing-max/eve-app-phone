import { useState, useEffect, useRef, useCallback } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { Sun, Mic, ListChecks, Network, Play, Check, Pause, Send, X } from "lucide-react";
import { CSS } from "./eveStyles";
import { EveCore, type EveMode } from "./EveCore";
import {
  streamChat,
  fetchState,
  resolveConfirm,
  actOnAttention,
  transcribeAudio,
  speakText,
  fetchWardrobe,
  postWear,
  wardrobeImgUrl,
  forwardSms,
  forwardNotification,
  reportSmsSent,
  type EveState,
  type PendingConfirm,
} from "./eveApi";
import { initPush } from "./push";
import {
  smsSupported,
  checkReadSmsPermissions,
  requestReadSmsPermissions,
  onSmsReceived,
  sendSms,
  checkSendSmsPermissions,
  requestSendSmsPermissions,
} from "./native/sms";
import {
  isNotificationAccessEnabled,
  openNotificationAccessSettings,
  onNotificationPosted,
} from "./native/notifications";

/* ============================================================
   EVE — Executive Voice Engine · App shell
   Churlish Media · Ported from the approved v0.5 demo.
   EVE/Talk is wired to the live brain (Phase 1). Today/Ops/Wire
   populate with live data in Phase 2 — marked honestly until then.
   ============================================================ */

// Quick-prompt chips: seed a REAL message to the brain (no scripted replies).
const CHIPS = ["Plan my week", "Draft me an email", "What's slipping?", "Stress-test a decision"];

// "Play the day" is a labelled SCRIPTED PREVIEW of the proactive cadence.
// The real engine (generated pushes) lands in Phase 2/4; this only shows the shape.
const DAY_PINGS = [
  { t: "7:00 AM", tag: "MORNING BRIEF", msg: "Three priorities today. The email you've been avoiding is #1. Calendar's clean until 10:30. Go.", ms: 3600 },
  { t: "11:45 AM", tag: "NUDGE", msg: "One sales conversation held. The floor is three. Tuesday-you promised Thursday-you two more — I keep the receipts.", ms: 4000 },
  { t: "12:30 PM", tag: "CLIENT PULSE", msg: "Acacia's gone 11 days quiet since Sprint 3 shipped. Your update is drafted — recap, one win, next-shoot ask. Send it before they wonder.", ms: 4200 },
  { t: "2:00 PM", tag: "TRIPWIRE", alert: true, msg: "An ad set crossed frequency 3.0. Refresh rule fired — Red Robin's batch is drafted and sitting in your approvals.", ms: 4000 },
  { t: "5:30 PM", tag: "CLOSE-OUT", msg: "Shipped 4 of 5. The funnel pass slipped — it's your first block tomorrow, already on the calendar. Now go be a person.", ms: 4400 },
];

const BASE_LOOKS = [
  { id: "core", name: "CORE", desc: "Her resting form. Never leaves the closet.", g: ["#1CB9C8", "#007A87"], status: "wearing" },
  { id: "ghost", name: "GHOST SIGNAL", desc: "Translucent holo portrait — the Lyla lane.", g: ["#7FE7EF", "#0E8996"], status: "approved" },
  { id: "operator", name: "THE OPERATOR", desc: "Cinematic studio portrait. Cream key light, dark set.", g: ["#F0EDE8", "#41666C"], status: "approved" },
  { id: "bloom", name: "STATIC BLOOM", desc: "Glitch-art frame pull. Louder. Her idea.", g: ["#35D0DC", "#0A4A52"], status: "candidate" },
];
const GEN_LOOKS = [
  { id: "circuit", name: "PALE CIRCUIT", desc: "Line-art profile over live schematics.", g: ["#BFEDEF", "#0A6B75"], status: "candidate" },
  { id: "noir", name: "TEAL NOIR", desc: "Low-key portrait, one hard light.", g: ["#4FC3CE", "#083E45"], status: "candidate" },
];

const STATE_LABEL: Record<EveMode, string> = {
  idle: "STANDING BY",
  listening: "LISTENING",
  thinking: "THINKING",
  speaking: "SPEAKING",
  alert: "TRIPWIRE",
};

const CONV_KEY = "eve.conversationId";

type Look = { id: string; name: string; desc: string; g: string[]; status: string; img?: string };
const WEAR_KEY = "eve.wearing";
type Ping = { t: string; tag: string; msg: string; ms: number; alert?: boolean };

export default function EveApp() {
  const [booted, setBooted] = useState(false);
  const [bootLeaving, setBootLeaving] = useState(false);
  const [tab, setTab] = useState<"today" | "eve" | "ops" | "wire">("today");
  const [mode, setMode] = useState<EveMode>("idle");
  const [line, setLine] = useState<string | null>(null);
  const [userLine, setUserLine] = useState<string | null>(null);
  const [errNote, setErrNote] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [micNote, setMicNote] = useState(false);
  const [toast, setToast] = useState<Ping | null>(null);
  const [dayRunning, setDayRunning] = useState(false);
  const [approved, setApproved] = useState<Record<string, string>>({});
  const [wardrobe, setWardrobe] = useState(false);
  const [looks, setLooks] = useState<Look[]>(BASE_LOOKS);
  const [genBusy, setGenBusy] = useState(false);
  const [genDone, setGenDone] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [live, setLive] = useState<EveState>({ online: false });
  // RED-tier confirm cards (02 §6) + their resolution notes.
  const [confirms, setConfirms] = useState<PendingConfirm[]>([]);
  const [confirmNote, setConfirmNote] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [opsBusy, setOpsBusy] = useState<string | null>(null);
  // Her senses (Phase 4, 05 §7): live enabled state for the Wire row.
  const [smsSense, setSmsSense] = useState(false);
  const [notifSense, setNotifSense] = useState(false);

  const convId = useRef<string | null>(localStorage.getItem(CONV_KEY));
  const busy = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const lastInputWasVoice = useRef(false);
  const ttsAvailable = useRef(false);
  const senseHandles = useRef<PluginListenerHandle[]>([]);
  const smsWired = useRef(false);
  const notifWired = useRef(false);

  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  };

  // ---- her senses (Phase 4, 05 §7): forward texts + notifications to the
  // brain's transient buffers while the app is open. Wiring is idempotent,
  // and nothing here ever PROMPTS — the permission asks live behind the
  // "ENABLE HER SENSES" buttons on the Wire screen (lazy, 05 §7).
  const wireSmsListener = useCallback(async () => {
    if (!smsWired.current) {
      smsWired.current = true;
      senseHandles.current.push(await onSmsReceived((e) => void forwardSms(e)));
    }
    setSmsSense(true);
  }, []);

  const wireNotificationListener = useCallback(async () => {
    if (!notifWired.current) {
      notifWired.current = true;
      senseHandles.current.push(
        await onNotificationPosted((e) => {
          if (e.package === "com.churlish.eve") return; // her own pings — no feedback loop
          void forwardNotification(e);
        }),
      );
    }
    setNotifSense(true);
  }, []);

  const refreshSenses = useCallback(async () => {
    if (!smsSupported()) return;
    // Wire only what's ALREADY granted — never auto-request on boot.
    const { sms } = await checkReadSmsPermissions();
    if (sms === "granted") void wireSmsListener();
    if (await isNotificationAccessEnabled()) void wireNotificationListener();
    else setNotifSense(false); // revoked in settings — show it honestly
  }, [wireSmsListener, wireNotificationListener]);
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30_000);
    const t = timers.current;
    // FCM registration + deeplink routing (native only; no-op in the browser).
    initPush((deeplink) => {
      if (deeplink === "eve://today") setTab("today");
      else if (deeplink === "eve://ops") setTab("ops");
    });
    // Senses: wire whatever's already granted; re-check with the state poll
    // so flipping notification access in settings lands within a minute.
    void refreshSenses();
    // Her real wardrobe — Brandon's renders served by the brain (05 §5).
    // These are HIS uploads: pre-approved by definition; his last worn pick
    // persists locally. Falls back to the demo gradients offline — and keeps
    // RETRYING with the state poll until the brain answers, so one blip at
    // launch doesn't strip her closet for the whole session.
    let wardrobeLoaded = false;
    const loadWardrobe = () =>
      fetchWardrobe().then(({ wearing, looks: ws }) => {
        if (!ws.length) return;
        // The brain is the single truth for "wearing" — she changes her own
        // look with wear_look, and King's taps post there too. localStorage
        // is only the pre-brain fallback.
        const worn = wearing ?? localStorage.getItem(WEAR_KEY);
        if (wardrobeLoaded) {
          // Later polls: only sync the worn look (hers may have changed).
          if (worn) {
            setLooks((ls) =>
              ls.some((l) => l.id === worn && l.status !== "wearing")
                ? ls.map((l) => ({
                    ...l,
                    status: l.id === worn ? "wearing" : l.status === "wearing" ? "approved" : l.status,
                  }))
                : ls,
            );
          }
          return;
        }
        wardrobeLoaded = true;
        setLooks(
          ws.map((w) => ({
            id: w.file,
            name: w.name,
            desc: "",
            g: ["#1CB9C8", "#007A87"],
            img: wardrobeImgUrl(w),
            status: (worn ? w.file === worn : w.file.toLowerCase() === "base.png") ? "wearing" : "approved",
          })),
        );
      });
    // Live ledger for Today/Ops — refresh every 60s (wardrobe piggybacks
    // until it lands once).
    const loadState = () =>
      fetchState().then((s) => {
        setLive(s);
        ttsAvailable.current = !!s.connectors?.find((c) => c.key === "elevenlabs")?.connected;
        void loadWardrobe(); // cheap JSON; keeps her self-chosen look in sync
        void refreshSenses(); // cheap native checks; never prompts
      });
    loadState();
    loadWardrobe();
    const stateTimer = setInterval(loadState, 60_000);
    return () => {
      clearInterval(clock);
      clearInterval(stateTimer);
      t.forEach(clearTimeout);
      abortRef.current?.abort();
      senseHandles.current.forEach((h) => void h.remove());
    };
  }, []);

  // ---- the live brain call ----
  const runMessage = useCallback(async (text: string, showUser = true, viaVoice = false) => {
    if (busy.current || !text.trim()) return;
    busy.current = true;
    lastInputWasVoice.current = viaVoice;
    abortRef.current = new AbortController();
    setErrNote(null);
    setUserLine(showUser ? text : null);
    setLine("");
    setMode("thinking");

    await streamChat(text, convId.current, "app", {
      onState: (s) => {
        if (s === "speaking") setMode("speaking");
        else if (s === "idle") setMode("idle");
      },
      onToken: (t) => setLine((prev) => (prev ?? "") + t),
      onConfirm: (c) => setConfirms((cs) => (cs.some((x) => x.id === c.id) ? cs : [...cs, c])),
      onDone: ({ conversationId, fullText }) => {
        convId.current = conversationId;
        localStorage.setItem(CONV_KEY, conversationId);
        setMode("idle");
        busy.current = false;
        // Voice loop (05 §3): spoken question → spoken answer. Degrades to
        // text silently when ElevenLabs isn't wired.
        if (lastInputWasVoice.current && ttsAvailable.current && fullText.trim()) {
          void speakText(fullText).then((url) => {
            if (!url) return;
            const audio = new Audio(url);
            setMode("speaking");
            audio.onended = () => {
              setMode("idle");
              URL.revokeObjectURL(url);
            };
            audio.play().catch(() => setMode("idle"));
          });
        }
      },
      onError: (m) => {
        setErrNote(m);
        setLine((prev) => prev || null);
        setMode("idle");
        busy.current = false;
      },
    }, abortRef.current.signal);
  }, []);

  const sendText = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    runMessage(t);
  };

  // ---- RED-tier confirm resolution ----
  const decideConfirm = async (c: PendingConfirm, approve: boolean) => {
    setConfirmNote((n) => ({ ...n, [c.id]: "…" }));
    const r = await resolveConfirm(c.id, c.hash, approve);
    let note: string;
    if (r.ok && r.clientAction?.type === "send_sms") {
      // SMS leaves from HIS SIM (02 §6 / 05 §7): the brain approved the exact
      // payload; this phone transmits it. Only reachable through an explicit
      // approve — the ONLY path that ever calls sendSms.
      const p = r.clientAction.payload as { phoneNumber: string; message: string };
      try {
        let { sms } = await checkSendSmsPermissions();
        if (sms !== "granted") ({ sms } = await requestSendSmsPermissions());
        if (sms !== "granted") throw new Error("SEND_SMS permission denied");
        await sendSms({ phoneNumber: p.phoneNumber, message: p.message });
        void reportSmsSent(p.phoneNumber, p.message);
        note = "SENT from your phone";
      } catch (err) {
        note = `FAILED — ${err instanceof Error ? err.message : "send error"}`;
      }
    } else {
      note = r.ok ? (r.executed ? `SENT — ${r.detail ?? ""}` : "CANCELLED") : `FAILED — ${r.error ?? "unknown"}`;
    }
    setConfirmNote((n) => ({ ...n, [c.id]: note }));
    later(() => {
      setConfirms((cs) => cs.filter((x) => x.id !== c.id));
      setConfirmNote((n) => {
        const { [c.id]: _gone, ...rest } = n;
        return rest;
      });
    }, 5000);
    fetchState().then(setLive);
  };

  // ---- her senses: the lazy permission asks (Wire screen buttons) ----
  const enableSmsSense = async () => {
    const { sms } = await requestReadSmsPermissions();
    if (sms === "granted") void wireSmsListener();
  };
  const enableNotifSense = async () => {
    // Notification access is a settings toggle, not a runtime prompt: send
    // him there; the state poll wires the listener once he flips it on.
    if (await isNotificationAccessEnabled()) return void wireNotificationListener();
    await openNotificationAccessSettings();
  };

  // ---- Ops actions (approve / hold / dismiss) ----
  const opsAction = async (id: string, action: "approve" | "hold" | "dismiss") => {
    setOpsBusy(id);
    await actOnAttention(id, action);
    setOpsBusy(null);
    fetchState().then(setLive);
  };

  const wake = () => {
    setBootLeaving(true);
    later(() => {
      setBooted(true);
      setTab("eve");
      // Generated greeting — not a canned string. Seed is a system event, not shown.
      runMessage("[King just opened the app. Greet him and give a short read on the moment.]", false);
    }, 480);
  };

  // Voice in (05 §3): tap to record, tap to stop → Deepgram via the brain →
  // the transcript goes through the normal chat loop.
  const micTap = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    const sttReady = live.connectors?.find((c) => c.key === "deepgram")?.connected;
    if (!sttReady) {
      setMicNote(true);
      later(() => setMicNote(false), 2600);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setMode("thinking");
        const blob = new Blob(chunks, { type: mime || "audio/webm" });
        const r = await transcribeAudio(blob);
        if (r.ok && r.transcript?.trim()) {
          runMessage(r.transcript, true, true);
        } else {
          setMode("idle");
          setErrNote(r.error || "didn't catch that — try again");
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setMode("listening");
    } catch {
      setErrNote("microphone unavailable — check the permission");
    }
  };

  const runDay = () => {
    if (dayRunning) return;
    setDayRunning(true);
    let at = 300;
    DAY_PINGS.forEach((p, i) => {
      later(() => {
        setToast(p);
        if (p.alert) setMode("alert");
      }, at);
      later(() => {
        setToast(null);
        if (p.alert) setMode("idle");
        if (i === DAY_PINGS.length - 1) setDayRunning(false);
      }, at + p.ms);
      at += p.ms + 700;
    });
  };

  const wearing = looks.find((l) => l.status === "wearing") || looks[0];
  const wear = (id: string) => {
    localStorage.setItem(WEAR_KEY, id);
    void postWear(id);
    setLooks((ls) =>
      ls.map((l) => ({
        ...l,
        status: l.id === id ? "wearing" : l.status === "wearing" ? "approved" : l.status,
      })),
    );
  };
  const approveLook = (id: string) =>
    setLooks((ls) => ls.map((l) => (l.id === id ? { ...l, status: "approved" } : l)));
  const vetoLook = (id: string) => setLooks((ls) => ls.filter((l) => l.id !== id));
  const genLooks = () => {
    if (genBusy || genDone) return;
    setGenBusy(true);
    later(() => {
      setLooks((ls) => [...ls, ...GEN_LOOKS]);
      setGenBusy(false);
      setGenDone(true);
    }, 2600);
  };

  const approvals = [
    { id: "a1", t: "Reel — HLP Ep. 41 clip", s: "Starfire · IG + TikTok · Thu 9 AM" },
    { id: "a2", t: "Carousel — Authority myths", s: "Starfire · LinkedIn · Fri 8 AM" },
    { id: "a3", t: "Static — Diagnostic teaser", s: "Starfire · IG · Fri 12 PM" },
  ];

  const clock = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dateEyebrow = now
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase();
  const weekNo = Math.ceil(
    ((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 +
      new Date(now.getFullYear(), 0, 1).getDay() +
      1) /
      7,
  );
  const greeting =
    now.getHours() < 12 ? "Morning" : now.getHours() < 18 ? "Afternoon" : "Evening";

  return (
    <div className="eve-root">
      <style>{CSS}</style>
      <div className="eve-app">
        {/* toast layer */}
        {toast && (
          <div className={`toast${toast.alert ? " alert" : ""}`}>
            <div className="tdot" />
            <div className="tc">
              <div className="th">
                <b>EVE · {toast.tag}</b>
                <span>{toast.t}</span>
              </div>
              <div className="tm">{toast.msg}</div>
            </div>
          </div>
        )}

        {/* status bar */}
        <div className="sbar mono">
          <span>{clock}</span>
          <span className="live"><span className="dot" />EVE ONLINE</span>
          <span className="demo-tag">PHASE 4</span>
        </div>

        {/* ---------- TODAY ---------- */}
        {tab === "today" && (
          <div className="screen">
            <div className="eyebrow mono">{dateEyebrow} · WEEK {weekNo}</div>
            <h1 className="h1 disp">{greeting}, Brandon.</h1>
            <p className="sub">
              {live.online && live.latestBrief?.text
                ? live.latestBrief.text
                : live.online
                  ? "The ledger's live. Set Today's Three, or just tell her what matters."
                  : "Clean calendar until 10:30. One overdue item is quietly becoming a problem — it's first on the list."}
            </p>
            <div className="eyebrow mono" style={{ color: "var(--tealHi)", marginTop: -8, marginBottom: 12 }}>
              {live.online ? "LIVE — memory spine online" : "SAMPLE — brain unreachable"}
            </div>

            <div className="card">
              <div className="label"><b>THE FLOOR — SALES CONVERSATIONS</b><span className="mono">WK {weekNo}</span></div>
              <div className="floor-num">{live.online ? live.floor?.count ?? 0 : 1} <em>/ {live.online ? live.floor?.goal ?? 3 : 3}</em></div>
              <div className="floor">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={(live.online ? live.floor?.count ?? 0 : 1) > i ? "on" : ""} />
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--faint)" }}>
                {live.online
                  ? "Real conversations logged this week — calls and meetings, not drafts."
                  : "Two blocks protected: Thu 10:00 · Fri 1:30 — treated like shoot days."}
              </div>
            </div>

            <div className="card">
              <div className="label"><b>TODAY'S THREE</b></div>
              {live.online && live.todaysThree?.length ? (
                live.todaysThree.map((t) => (
                  <div className="pri" key={t.id}>
                    <span className="n">{String(t.priority).padStart(2, "0")}</span>
                    <span>
                      {t.title}
                      {t.detail && <span className="meta">{t.detail}</span>}
                    </span>
                  </div>
                ))
              ) : live.online ? (
                <div className="pri">
                  <span className="n">—</span>
                  <span>
                    Nothing set yet
                    <span className="meta">tell EVE what matters today, or capture tasks — she'll slot them</span>
                  </span>
                </div>
              ) : (
                <>
                  <div className="pri">
                    <span className="n">01</span>
                    <span>
                      Send the Meta case-reset email
                      <span className="meta"><span className="overdue">41h in drafts</span> · she drafts, you send</span>
                    </span>
                  </div>
                  <div className="pri">
                    <span className="n">02</span>
                    <span>
                      Doctor Mid-Nite pass on the Diagnostic funnel
                      <span className="meta">pre-launch gate — nothing goes live unexamined</span>
                    </span>
                  </div>
                  <div className="pri">
                    <span className="n">03</span>
                    <span>
                      Clear Starfire's approval batch
                      <span className="meta">6 posts queued · one sitting, not a stream</span>
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="card">
              <div className="label"><b>RUN EVE'S DAY</b><span className="mono">SCRIPTED PREVIEW</span></div>
              <p style={{ fontSize: 13.5, color: "var(--dim)", margin: "0 0 12px", lineHeight: 1.5 }}>
                Watch how she checks in — morning brief, midday nudge, a tripwire,
                and the close-out. The real cadence goes live in Phase 2.
              </p>
              <button className="btn" onClick={runDay} disabled={dayRunning}>
                <Play size={14} /> {dayRunning ? "Running the day…" : "Play the day"}
              </button>
            </div>

            <div className="card">
              <div className="label"><b>CAPTURE — ANY DOOR IN</b></div>
              <div style={{ fontSize: 13.5, color: "var(--dim)", lineHeight: 1.55 }}>
                Speak it, type it, or forward an email to her address — she turns
                it into a dated task, files it to the right client, and keeps a
                link back to the source thread. The inbox exists to be emptied.
              </div>
            </div>

            <div className="row2">
              <div className="mini">
                <div className="k mono">PARKING LEDGER</div>
                <div className="v">3 ideas held · one eligible Thursday</div>
              </div>
              <div className="mini">
                <div className="k mono">RENEWAL RADAR</div>
                <div className="v">1 window opens in 19 days · case build set</div>
              </div>
            </div>
          </div>
        )}

        {/* ---------- EVE / TALK ---------- */}
        {tab === "eve" && (
          <div className="screen">
            <div className="stage">
              {/* Worn look's portrait rides behind the core (05 §5) — the
                  core stays the universal fallback + speaking indicator. */}
              {wearing.img && (
                <img
                  src={wearing.img}
                  alt={`EVE — ${wearing.name}`}
                  style={{
                    width: 148,
                    height: 148,
                    objectFit: "cover",
                    borderRadius: "50%",
                    display: "block",
                    margin: "0 auto 10px",
                    border: "1px solid var(--line)",
                    boxShadow: `0 0 34px ${wearing.g[0]}44`,
                    opacity: mode === "alert" ? 0.55 : 1,
                  }}
                />
              )}
              <EveCore mode={mode} glow={wearing.g} size={wearing.img ? 92 : undefined} />
              <div className="state-lab mono">{STATE_LABEL[mode]}</div>
              <div className="state-lab mono" style={{ marginTop: 4, letterSpacing: ".2em", color: "var(--dim)" }}>
                LOOK · {wearing.name}
              </div>

              <div className="convo">
                {userLine && <div className="ubub">{userLine}</div>}
                <div className="bubble" style={{ marginTop: 0 }}>
                  {line ? (
                    line
                  ) : mode === "thinking" ? (
                    <span style={{ color: "var(--faint)" }}>…</span>
                  ) : (
                    <span style={{ color: "var(--faint)" }}>
                      Type below or pick a prompt. She's live — real replies, real memory
                      within this conversation.
                    </span>
                  )}
                  {errNote && (
                    <span style={{ display: "block", marginTop: 8, color: "var(--red)", fontSize: 12 }} className="mono">
                      connection: {errNote}
                    </span>
                  )}
                </div>

                {/* RED-tier confirm cards (02 §6): exact payload + approve round-trip */}
                {confirms.map((c) => (
                  <div className="bubble" key={c.id} style={{ marginTop: 10, borderColor: "var(--red)" }}>
                    <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--red)", marginBottom: 6 }}>
                      RED TIER · {c.kind.replace(/_/g, " ").toUpperCase()} · NOTHING SENDS WITHOUT YOU
                    </div>
                    <div style={{ fontSize: 13.5, marginBottom: 6 }}>{c.summary}</div>
                    {Object.entries(c.payload).map(([k, v]) => (
                      <div key={k} style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.45 }}>
                        <b className="mono" style={{ fontSize: 10, letterSpacing: ".1em" }}>{k.toUpperCase()}</b>{" "}
                        {String(v).slice(0, 240)}
                      </div>
                    ))}
                    {confirmNote[c.id] ? (
                      <div className="mono" style={{ fontSize: 11, marginTop: 8, color: confirmNote[c.id].startsWith("SENT") ? "var(--tealHi)" : "var(--dim)" }}>
                        {confirmNote[c.id]}
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button className="btn" style={{ padding: "8px 14px", fontSize: 12 }} onClick={() => decideConfirm(c, true)}>
                          <Check size={13} /> Approve — send it
                        </button>
                        <button className="btn ghost" style={{ padding: "8px 14px", fontSize: 12 }} onClick={() => decideConfirm(c, false)}>
                          <X size={13} /> Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="chips">
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    className="chip"
                    disabled={mode !== "idle"}
                    onClick={() => runMessage(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="inputrow">
                <input
                  className="tinput"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendText();
                  }}
                  placeholder="Type to her — she remembers"
                  aria-label="Message EVE"
                />
                <button className="sendbtn" onClick={sendText} aria-label="Send">
                  <Send size={17} />
                </button>
              </div>

              <button
                className="micbtn"
                onClick={micTap}
                aria-label={recording ? "Stop and send" : "Talk to EVE"}
                style={recording ? { borderColor: "var(--red)", color: "var(--red)" } : undefined}
              >
                <Mic size={24} />
              </button>

              <div className="voice-tag mono">
                {recording ? (
                  <b style={{ color: "var(--red)" }}>LISTENING — TAP AGAIN TO SEND</b>
                ) : micNote ? (
                  <b style={{ color: "var(--tealHi)" }}>HER EARS NEED THE DEEPGRAM KEY — TYPE TO HER FOR NOW</b>
                ) : (
                  <>
                    VOICE ·{" "}
                    <b>
                      {live.connectors?.find((c) => c.key === "deepgram")?.connected ? "ears live" : "ears await key"}
                      {" · "}
                      {live.connectors?.find((c) => c.key === "elevenlabs")?.connected ? "voice live" : "voice awaits key"}
                    </b>
                  </>
                )}
              </div>

              <div className="skinrow mono">
                <span className="skin on">{wearing.name}</span>
                <button className="skin" onClick={() => setWardrobe(true)}>
                  OPEN WARDROBE →
                </button>
              </div>
              <div className="voice-tag mono" style={{ marginTop: 8 }}>
                WARDROBE PREVIEW · HIGGSFIELD PIPELINE LANDS IN PHASE 4
              </div>
            </div>
          </div>
        )}

        {/* ---------- OPS ---------- */}
        {tab === "ops" && (
          <div className="screen">
            <div className="eyebrow mono">OPERATIONS</div>
            <h1 className="h1 disp">Your signature, not your time.</h1>
            <p className="sub">
              Everything below arrives finished. You approve, hold, or send — she
              handles the rest.
            </p>
            <div className="eyebrow mono" style={{ color: "var(--tealHi)", marginTop: -8, marginBottom: 12 }}>
              {live.online ? "PULSE + FLEET LIVE" : "SAMPLE — connects when the brain is reachable"}
            </div>

            {live.online && !!live.pendingConfirms?.length && (
              <div className="card" style={{ borderColor: "var(--red)" }}>
                <div className="label">
                  <b style={{ color: "var(--red)" }}>WAITING ON YOUR THUMB — RED TIER</b>
                  <span className="mono">{live.pendingConfirms.length}</span>
                </div>
                {live.pendingConfirms.map((c) => (
                  <div className="ap" key={c.id}>
                    <div className="t">
                      {c.summary}
                      <small>expires {new Date(c.expiresAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</small>
                    </div>
                    {confirmNote[c.id] ? (
                      <span className="done-lab mono">{confirmNote[c.id]}</span>
                    ) : (
                      <>
                        <button className="icnbtn ok" aria-label="Approve send" onClick={() => decideConfirm(c, true)}>
                          <Check size={15} />
                        </button>
                        <button className="icnbtn" aria-label="Cancel send" onClick={() => decideConfirm(c, false)}>
                          <X size={15} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {live.online && (
              <div className="card">
                <div className="label">
                  <b>ATTENTION — LIVE</b>
                  <span className="mono">{live.attentionItems?.length ?? 0} OPEN</span>
                </div>
                {live.attentionItems?.length ? (
                  live.attentionItems.slice(0, 6).map((a) => (
                    <div className="ap" key={a.id}>
                      <span className="mono" style={{ fontSize: 10, color: a.kind === "tripwire" ? "var(--red)" : "var(--tealHi)", border: "1px solid var(--line)", borderRadius: 4, padding: "3px 6px", whiteSpace: "nowrap" }}>
                        {a.kind.replace("_", " ").toUpperCase()} · N{a.nudge_level}
                      </span>
                      <div className="t">
                        {a.message}
                        {a.kind === "silent_client" && a.ref?.draft && <small>draft ready — approve turns it into a Today task</small>}
                      </div>
                      {opsBusy === a.id ? (
                        <span className="done-lab mono">…</span>
                      ) : (
                        <>
                          <button className="icnbtn ok" aria-label="Approve" onClick={() => opsAction(a.id, "approve")}>
                            <Check size={15} />
                          </button>
                          <button className="icnbtn" aria-label="Hold 24h" onClick={() => opsAction(a.id, "hold")}>
                            <Pause size={15} />
                          </button>
                          <button className="icnbtn" aria-label="Dismiss" onClick={() => opsAction(a.id, "dismiss")}>
                            <X size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 13.5, color: "var(--dim)" }}>Nothing needs you. She'll surface it here when it does.</div>
                )}
              </div>
            )}

            {live.online && (
              <div className="card">
                <div className="label"><b>CLIENT PULSE — LIVE RADAR</b>
                  <span className="mono">
                    {(live.clients ?? []).filter((c) => c.days_quiet !== null && c.days_quiet > c.cadence_days).length} QUIET
                  </span>
                </div>
                {live.clients?.length ? (
                  live.clients.map((cl) => (
                    <div className="ap" key={cl.id}>
                      <span className="mono" style={{ fontSize: 10, color: cl.days_quiet !== null && cl.days_quiet > cl.cadence_days ? "var(--red)" : "var(--tealHi)", border: "1px solid var(--line)", borderRadius: 4, padding: "3px 6px", whiteSpace: "nowrap" }}>
                        {cl.days_quiet === null ? "NEW" : `${cl.days_quiet}d`}
                      </span>
                      <div className="t">
                        {cl.name}
                        <small>cadence {cl.cadence_days}d</small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 13.5, color: "var(--dim)" }}>No clients in the ledger yet — add them and she starts watching cadences.</div>
                )}
              </div>
            )}

            <div className="card">
              <div className="label">
                <b>JOBS IN FLIGHT — THE FLEET</b>
                <span className="mono">{live.online ? `${live.jobs?.length ?? 0} ACTIVE` : "SAMPLE"}</span>
              </div>
              {live.online ? (
                live.jobs?.length ? (
                  live.jobs.map((j) => (
                    <div className="ap" key={j.id}>
                      <div className="t">
                        {j.agent || "eve"}
                        <small>{j.title}</small>
                      </div>
                      <span className="mono" style={{ fontSize: 9.5, letterSpacing: ".14em", color: j.status === "running" ? "var(--tealHi)" : j.status === "in_approvals" ? "var(--cream)" : "var(--faint)", whiteSpace: "nowrap" }}>
                        {j.status.replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 13.5, color: "var(--dim)" }}>
                    No jobs in flight. Tell EVE what to dispatch — an outcome is enough.
                  </div>
                )
              ) : (
                ([
                  ["Pennyworth", "Proposal draft — TrueNorth expansion", "RUNNING", "var(--tealHi)"],
                  ["Red Robin", "Ad refresh batch — frequency tripwire", "IN APPROVALS", "var(--cream)"],
                  ["Iris West", "Monday sweep — fresh angles, full roster", "QUEUED", "var(--faint)"],
                ] as const).map(([agent, job, status, col]) => (
                  <div className="ap" key={agent}>
                    <div className="t">
                      {agent}
                      <small>{job}</small>
                    </div>
                    <span className="mono" style={{ fontSize: 9.5, letterSpacing: ".14em", color: col, whiteSpace: "nowrap" }}>
                      {status}
                    </span>
                  </div>
                ))
              )}
              <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 8, lineHeight: 1.5 }}>
                You give her the job — by agent name or just the outcome. She
                dispatches, checks the work, and brings back one approval batch,
                not a stream of questions.
              </div>
            </div>

            <div className="card">
              <div className="label"><b>APPROVAL INBOX — STARFIRE</b><span className="mono">6 QUEUED</span></div>
              {approvals.map((a) => (
                <div className="ap" key={a.id}>
                  <div className="thumb" />
                  <div className="t">
                    {a.t}
                    <small>{a.s}</small>
                  </div>
                  {approved[a.id] ? (
                    <span className="done-lab mono">{approved[a.id]}</span>
                  ) : (
                    <>
                      <button
                        className="icnbtn ok"
                        aria-label="Approve"
                        onClick={() => setApproved((s) => ({ ...s, [a.id]: "APPROVED" }))}
                      >
                        <Check size={15} />
                      </button>
                      <button
                        className="icnbtn"
                        aria-label="Hold"
                        onClick={() => setApproved((s) => ({ ...s, [a.id]: "HELD" }))}
                      >
                        <Pause size={15} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {!live.online && (
            <div className="card">
              <div className="label"><b>CLIENT PULSE — TOUCH-BASE RADAR</b><span className="mono">2 QUIET</span></div>
              {([
                ["Acacia Wellness", "11d", "Sprint 3 shipped, no reaction logged. Say: recap + one win + next-shoot ask."],
                ["TrueNorth", "8d", "LinkedIn set is performing. Send the numbers before Friday's invoice lands."],
                ["GE Outdoors", "REV FRI", "Recruiting system check-in — cadence review, already on your calendar."],
              ] as const).map(([n, d, w]) => (
                <div className="ap" key={n}>
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: "var(--tealHi)",
                      border: "1px solid var(--line)",
                      borderRadius: 4,
                      padding: "3px 6px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d}
                  </span>
                  <div className="t">
                    {n}
                    <small>{w}</small>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 8, lineHeight: 1.5 }}>
                Each client gets a cadence. Go quiet past it and she surfaces the
                account, what's in flight, and a drafted update — nothing lives in
                your head or dies in the inbox.
              </div>
            </div>
            )}

            <div className="card">
              <div className="label"><b>FOLLOW-UPS</b></div>
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                2 aging past 48 hours. Drafts are written and sitting in your
                outbox — <span style={{ color: "var(--dim)" }}>she drafts to send-ready; sending stays yours.</span>
              </div>
            </div>

            <div className="card">
              <div className="label"><b>TRIPWIRES</b></div>
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                Ad frequency at 3.4 against the 3.0 rule — refresh batch already
                drafted by Red Robin. Metric pairs read together, never alone.
              </div>
            </div>

            <div className="card">
              <div className="label"><b>GUARDIAN — RETENTION</b></div>
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                One retainer enters its renewal window in 19 days. The
                receipts-based case starts building Monday — before the window,
                not during it.
              </div>
            </div>
          </div>
        )}

        {/* ---------- WIRE ---------- */}
        {tab === "wire" && (
          <div className="screen">
            <div className="eyebrow mono">THE WIRE</div>
            <h1 className="h1 disp">One face. The whole fleet behind it.</h1>
            <p className="sub">
              You talk to EVE. She routes to everything else — the OS, the
              agents, the connectors. Status is honest: only what's wired reads LIVE.
            </p>

            <div className="wgrid">
              {(() => {
                const cx = (key: string) => live.connectors?.find((c) => c.key === key);
                const tiles: [string, string][] = [
                  ["EVE Brain", live.online ? "LIVE" : "UNREACHABLE"],
                  ["Supabase — her memory", live.online ? "LIVE" : "OFFLINE"],
                  ["Gmail", cx("gmail")?.connected ? "LIVE" : "KEY NEEDED"],
                  ["Google Calendar", cx("gcal")?.connected ? "LIVE" : "KEY NEEDED"],
                  ["Notion", cx("notion")?.connected ? "LIVE" : "KEY NEEDED"],
                  ["Slack", cx("slack")?.connected ? "LIVE" : "KEY NEEDED"],
                  ["Stripe", cx("stripe")?.connected ? "LIVE" : "KEY NEEDED"],
                  ["Meta Ads", "LATER"],
                  ["Deepgram — her ears", cx("deepgram")?.connected ? "LIVE" : "KEY NEEDED"],
                  ["ElevenLabs Voice", cx("elevenlabs")?.connected ? "LIVE" : "KEY NEEDED"],
                  ["EVE Fleet — dispatch", live.online ? "LIVE" : "OFFLINE"],
                  ["Higgsfield — wardrobe", "PHASE 4"],
                  ["Even G2 Glasses", "PHASE 5"],
                ];
                return tiles.map(([n, s]) => (
                  <div className="wtile" key={n}>
                    <div className="n">{n}</div>
                    <div className="s mono">
                      <span className={`wdot${s === "LIVE" ? "" : " off"}`} />
                      {s}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* HER SENSES (Phase 4, 05 §7): lazy permission asks — the system
                prompts fire from THESE taps, never on boot. */}
            <div className="card" style={{ marginTop: 14 }}>
              <div className="label"><b>ENABLE HER SENSES</b><span className="mono">PHASE 4</span></div>
              <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5, marginBottom: 10 }}>
                Texts and notifications forward to her brain only while the app
                is open — transient, never long-term memory. Replies always go
                through your thumb.
              </div>
              {smsSupported() ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    style={{ padding: "8px 14px", fontSize: 12 }}
                    disabled={smsSense}
                    onClick={enableSmsSense}
                  >
                    {smsSense ? "SMS — LIVE" : "SMS"}
                  </button>
                  <button
                    className="btn ghost"
                    style={{ padding: "8px 14px", fontSize: 12 }}
                    disabled={notifSense}
                    onClick={enableNotifSense}
                  >
                    {notifSense ? "NOTIFICATIONS — LIVE" : "Notifications"}
                  </button>
                </div>
              ) : (
                <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                  ANDROID BUILD ONLY — the browser has no SMS or notification access
                </div>
              )}
            </div>

            <div className="legend">
              <b style={{ color: "var(--tealHi)" }}>GREEN</b> — she drafts and builds everything, unprompted. <br />
              <b style={{ color: "var(--dim)" }}>YELLOW</b> — built to done, assumptions flagged on top. <br />
              <b style={{ color: "var(--red)" }}>RED</b> — nothing external ever sends without you.
            </div>
          </div>
        )}

        {/* ---------- tabs ---------- */}
        <nav className="tabs">
          {([
            ["today", "TODAY", Sun],
            ["eve", "EVE", Mic],
            ["ops", "OPS", ListChecks],
            ["wire", "WIRE", Network],
          ] as const).map(([id, lab, Icon]) => (
            <button
              key={id}
              className={`tab${tab === id ? " on" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={18} />
              {lab}
            </button>
          ))}
        </nav>

        {/* ---------- wardrobe ---------- */}
        {wardrobe && (
          <div className="wsheet" onClick={() => setWardrobe(false)}>
            <div className="wpanel" onClick={(e) => e.stopPropagation()}>
              <div className="whead">
                <div>
                  <div className="eyebrow mono" style={{ margin: 0 }}>WARDROBE</div>
                  <div className="disp" style={{ fontSize: 26, fontWeight: 600 }}>Her closet. Her call.</div>
                </div>
                <button className="btn ghost" onClick={() => setWardrobe(false)}>Close</button>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5, marginTop: 6 }}>
                She generates candidates through Higgsfield, keeps what you
                approve, and picks what to wear. Veto anything, anytime. (Preview —
                real renders land in Phase 4.)
              </div>

              <div className="wgrid2">
                {looks.map((l) => (
                  <div className={`lookcard${l.status === "wearing" ? " wearing" : ""}`} key={l.id}>
                    {l.img ? (
                      <img
                        src={l.img}
                        alt={l.name}
                        loading="lazy"
                        className="lookswatch"
                        style={{ objectFit: "cover", width: "100%" }}
                      />
                    ) : (
                      <div
                        className="lookswatch"
                        style={{
                          background: `radial-gradient(90% 90% at 50% 38%, ${l.g[0]}cc, ${l.g[1]}55 55%, #070B0C 100%)`,
                        }}
                      />
                    )}
                    <div className="lookname">{l.name}</div>
                    <div className="lookdesc">{l.desc}</div>
                    <div className="lookrow">
                      {l.status === "wearing" ? (
                        <span className="wstatus mono">WEARING NOW</span>
                      ) : l.status === "approved" ? (
                        <button className="lbtn pri" onClick={() => wear(l.id)}>WEAR</button>
                      ) : (
                        <>
                          <button className="lbtn pri" onClick={() => approveLook(l.id)}>APPROVE</button>
                          <button className="lbtn" onClick={() => vetoLook(l.id)}>VETO</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16 }}>
                <button className="btn" onClick={genLooks} disabled={genBusy || genDone}>
                  {genBusy
                    ? "She's in the studio…"
                    : genDone
                    ? "Fresh candidates delivered"
                    : "Have her generate new looks"}
                </button>
                {genBusy && (
                  <div className="genline mono">
                    RENDERING VIA HIGGSFIELD · SHE'S PICKY — GIVE HER A SECOND
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---------- boot ---------- */}
        {!booted && (
          <div className={`boot${bootLeaving ? " boot-out" : ""}`}>
            <EveCore mode="idle" size={200} />
            <div className="wm disp">EVE</div>
            <div className="ws mono">EXECUTIVE VOICE ENGINE · CHURLISH MEDIA</div>
            <button className="btn" onClick={wake}>Wake her up</button>
          </div>
        )}
      </div>
    </div>
  );
}
