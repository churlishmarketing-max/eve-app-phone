import { useState, useEffect, useRef } from "react";
import { Sun, Mic, ListChecks, Network, Play, Check, Pause, Send } from "lucide-react";

/* ============================================================
   EVE — Executive Voice Engine · App Demo v0.1
   Churlish Media · Demo data throughout, nothing here is live
   ============================================================ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

:root{
  --bg:#070B0C; --panel:#0C1417; --panel2:#0F191D;
  --line:rgba(240,237,232,.09);
  --teal:#007A87; --tealHi:#1CB9C8;
  --cream:#F0EDE8; --dim:rgba(240,237,232,.55); --faint:rgba(240,237,232,.32);
  --red:#C41E3A;
}
.eve-root{ background:var(--bg); color:var(--cream); font-family:'Barlow',sans-serif;
  min-height:100vh; display:flex; justify-content:center; }
.eve-app{ width:min(430px,100%); min-height:100vh; display:flex; flex-direction:column;
  position:relative; overflow:hidden;
  background:
    radial-gradient(120% 60% at 50% -10%, rgba(0,122,135,.16), transparent 60%),
    var(--bg); }
.disp{ font-family:'Barlow Condensed',sans-serif; }
.mono{ font-family:'IBM Plex Mono',monospace; }

/* ---------- status bar ---------- */
.sbar{ display:flex; align-items:center; justify-content:space-between;
  padding:14px 18px 10px; font-size:11px; letter-spacing:.14em; color:var(--dim); }
.sbar .live{ display:flex; align-items:center; gap:6px; }
.dot{ width:6px; height:6px; border-radius:50%; background:var(--tealHi);
  box-shadow:0 0 8px var(--tealHi); animation:blink 2.6s infinite; }
@keyframes blink{ 0%,100%{opacity:1} 50%{opacity:.35} }
.demo-tag{ border:1px solid var(--line); border-radius:3px; padding:2px 6px;
  font-size:9px; letter-spacing:.18em; color:var(--faint); }

/* ---------- screens ---------- */
.screen{ flex:1; overflow-y:auto; padding:6px 18px 96px; animation:fadeUp .35s ease both; }
@keyframes fadeUp{ from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none} }
.eyebrow{ font-size:10.5px; letter-spacing:.22em; color:var(--faint); margin:10px 0 4px; }
.h1{ font-size:34px; font-weight:600; letter-spacing:.01em; line-height:1.05; margin:0 0 6px; }
.sub{ color:var(--dim); font-size:14px; line-height:1.5; margin:0 0 18px; max-width:34ch; }

.card{ background:var(--panel); border:1px solid var(--line); border-radius:14px;
  padding:16px; margin-bottom:12px; }
.card .label{ font-size:10px; letter-spacing:.2em; color:var(--faint); margin-bottom:10px;
  display:flex; justify-content:space-between; align-items:center; }
.card .label b{ color:var(--dim); font-weight:500; letter-spacing:.08em; }

.floor{ display:flex; gap:6px; margin:6px 0 10px; }
.floor span{ flex:1; height:8px; border-radius:4px; background:var(--panel2);
  border:1px solid var(--line); }
.floor span.on{ background:linear-gradient(90deg,var(--teal),var(--tealHi));
  border-color:transparent; box-shadow:0 0 10px rgba(28,185,200,.35); }
.floor-num{ font-size:26px; font-weight:600; }
.floor-num em{ font-style:normal; color:var(--faint); font-size:16px; }

.pri{ display:flex; gap:12px; padding:10px 0; border-top:1px solid var(--line);
  font-size:14px; line-height:1.45; align-items:baseline; }
.pri:first-of-type{ border-top:none; padding-top:2px; }
.pri .n{ font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--teal); }
.pri .meta{ display:block; font-size:11.5px; color:var(--faint); margin-top:2px; }
.overdue{ color:var(--red); }

.row2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.mini{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px; }
.mini .k{ font-size:10px; letter-spacing:.18em; color:var(--faint); margin-bottom:6px; }
.mini .v{ font-size:14px; line-height:1.4; color:var(--cream); }

.btn{ display:inline-flex; align-items:center; gap:8px; border:1px solid var(--teal);
  background:rgba(0,122,135,.14); color:var(--cream); border-radius:10px;
  padding:10px 16px; font-size:13px; font-weight:500; letter-spacing:.04em;
  cursor:pointer; transition:transform .1s ease, background .2s; font-family:'Barlow',sans-serif; }
.btn:active{ transform:scale(.97); }
.btn:hover{ background:rgba(0,122,135,.26); }
.btn.ghost{ border-color:var(--line); background:transparent; color:var(--dim);
  padding:7px 12px; font-size:12px; }
.btn:focus-visible{ outline:2px solid var(--tealHi); outline-offset:2px; }

/* ---------- entity ---------- */
.stage{ display:flex; flex-direction:column; align-items:center; padding-top:8px; }
.glitchwrap{ animation:glitch 8s infinite; }
.eve-ent{ transition:filter .4s; }
.eve-alert.eve-ent{ filter:drop-shadow(0 0 22px rgba(196,30,58,.35)); }
.st{ stroke:var(--teal); }
.st-hi{ stroke:var(--tealHi); }
.eve-alert .st, .eve-alert .st-hi{ stroke:var(--red); }
.ring-slow{ transform-box:fill-box; transform-origin:center; animation:spin 70s linear infinite; }
.ring-rev{ transform-box:fill-box; transform-origin:center; animation:spinrev 26s linear infinite; }
.think-ring{ transform-box:fill-box; transform-origin:center; animation:spin 1.4s linear infinite; opacity:0; }
.eve-thinking .think-ring{ opacity:.85; }
.core{ transform-box:fill-box; transform-origin:center; animation:breathe 4.5s ease-in-out infinite; }
.eve-alert .coreflash{ opacity:.14; }
.coreflash{ opacity:0; transition:opacity .3s; }
.scan{ animation:scanY 4.2s ease-in-out infinite; }
.rip{ transform-box:fill-box; transform-origin:center; opacity:0; }
.eve-listening .rip{ animation:ripple 1.5s ease-out infinite; }
.eve-listening .rip2{ animation-delay:.55s; }
.bars rect{ transform-box:fill-box; transform-origin:center; transform:scaleY(.25); }
.eve-speaking .bars rect{ animation:eq 0.85s ease-in-out infinite; }
.eve-speaking .bars rect:nth-child(2){ animation-delay:.12s; }
.eve-speaking .bars rect:nth-child(3){ animation-delay:.24s; }
.eve-speaking .bars rect:nth-child(4){ animation-delay:.1s; }
.eve-speaking .bars rect:nth-child(5){ animation-delay:.3s; }
@keyframes spin{ to{ transform:rotate(360deg) } }
@keyframes spinrev{ to{ transform:rotate(-360deg) } }
@keyframes breathe{ 0%,100%{ transform:scale(1) } 50%{ transform:scale(1.04) } }
@keyframes ripple{ 0%{ transform:scale(1); opacity:.5 } 100%{ transform:scale(1.85); opacity:0 } }
@keyframes scanY{ 0%{ transform:translateY(-36px); opacity:.1 } 50%{ transform:translateY(36px); opacity:.7 } 100%{ transform:translateY(-36px); opacity:.1 } }
@keyframes eq{ 0%,100%{ transform:scaleY(.25) } 50%{ transform:scaleY(1) } }
@keyframes glitch{ 0%,95.5%,97.5%,100%{ transform:none; opacity:1 }
  96%{ transform:translateX(2px) skewX(1.5deg); opacity:.85 }
  97%{ transform:translateX(-2px); opacity:.92 } }

.state-lab{ margin-top:10px; font-size:10px; letter-spacing:.3em; color:var(--faint); }
.bubble{ margin-top:16px; background:var(--panel); border:1px solid var(--line);
  border-left:2px solid var(--teal); border-radius:12px; padding:14px 16px;
  font-size:14.5px; line-height:1.55; max-width:36ch; animation:fadeUp .3s ease both;
  min-height:52px; }
.chips{ display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:18px; }
.chip{ border:1px solid var(--line); background:var(--panel); color:var(--dim);
  border-radius:999px; padding:8px 14px; font-size:12.5px; cursor:pointer;
  font-family:'Barlow',sans-serif; transition:all .2s; }
.chip:hover{ border-color:var(--teal); color:var(--cream); }
.chip:disabled{ opacity:.4; cursor:default; }
.micbtn{ margin-top:22px; width:64px; height:64px; border-radius:50%;
  border:1px solid var(--teal); background:radial-gradient(circle at 35% 30%, rgba(28,185,200,.35), rgba(0,122,135,.15));
  color:var(--cream); display:flex; align-items:center; justify-content:center; cursor:pointer;
  box-shadow:0 0 24px rgba(0,122,135,.35); transition:transform .12s; }
.micbtn:active{ transform:scale(.94); }
.skinrow{ display:flex; gap:8px; margin-top:22px; align-items:center; }
.skin{ font-size:10px; letter-spacing:.16em; padding:5px 10px; border-radius:4px;
  border:1px solid var(--line); color:var(--faint); }
.skin.on{ border-color:var(--teal); color:var(--tealHi); }
.voice-tag{ margin-top:10px; font-size:11px; color:var(--faint); letter-spacing:.08em; }
.voice-tag b{ color:var(--dim); font-weight:500; }

/* ---------- ops ---------- */
.ap{ display:flex; align-items:center; gap:12px; padding:11px 0; border-top:1px solid var(--line); }
.ap:first-of-type{ border-top:none; padding-top:2px; }
.thumb{ width:38px; height:38px; border-radius:8px; flex-shrink:0;
  background:linear-gradient(135deg, rgba(0,122,135,.5), rgba(28,185,200,.12));
  border:1px solid var(--line); }
.ap .t{ flex:1; font-size:13.5px; line-height:1.35; }
.ap .t small{ display:block; color:var(--faint); font-size:11px; margin-top:1px; }
.icnbtn{ width:32px; height:32px; border-radius:8px; border:1px solid var(--line);
  background:transparent; color:var(--dim); display:flex; align-items:center;
  justify-content:center; cursor:pointer; }
.icnbtn.ok{ border-color:var(--teal); color:var(--tealHi); }
.done-lab{ font-size:11px; letter-spacing:.12em; color:var(--tealHi); }

/* ---------- wire ---------- */
.wgrid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.wtile{ background:var(--panel); border:1px solid var(--line); border-radius:12px;
  padding:13px 14px; }
.wtile .n{ font-size:13.5px; font-weight:500; }
.wtile .s{ display:flex; align-items:center; gap:6px; margin-top:6px;
  font-size:9.5px; letter-spacing:.18em; color:var(--faint); }
.wdot{ width:5px; height:5px; border-radius:50%; background:var(--tealHi); }
.wdot.off{ background:var(--faint); }
.legend{ margin-top:16px; font-size:12px; line-height:1.7; color:var(--dim); }
.legend b{ font-weight:600; letter-spacing:.06em; }

/* ---------- tabs ---------- */
.tabs{ position:absolute; bottom:0; left:0; right:0; display:flex;
  background:rgba(7,11,12,.92); backdrop-filter:blur(12px);
  border-top:1px solid var(--line); padding:8px 6px calc(10px + env(safe-area-inset-bottom)); }
.tab{ flex:1; background:none; border:none; color:var(--faint); display:flex;
  flex-direction:column; align-items:center; gap:4px; font-size:9.5px;
  letter-spacing:.18em; cursor:pointer; padding:6px 0; font-family:'Barlow',sans-serif; }
.tab.on{ color:var(--tealHi); }

/* ---------- toast ---------- */
.toast{ position:absolute; top:10px; left:12px; right:12px; z-index:40;
  background:var(--panel2); border:1px solid var(--line); border-radius:14px;
  padding:13px 15px; display:flex; gap:12px; align-items:flex-start;
  box-shadow:0 12px 40px rgba(0,0,0,.6); animation:toastIn .35s cubic-bezier(.2,.9,.3,1.2) both; }
.toast.alert{ border-color:rgba(196,30,58,.55); }
.toast .tc{ flex:1; }
.toast .th{ display:flex; justify-content:space-between; font-size:9.5px;
  letter-spacing:.2em; color:var(--faint); margin-bottom:4px; }
.toast.alert .th b{ color:var(--red); }
.toast .th b{ color:var(--tealHi); font-weight:600; }
.toast .tm{ font-size:13.5px; line-height:1.45; }
.tdot{ width:10px; height:10px; border-radius:50%; margin-top:4px; flex-shrink:0;
  background:radial-gradient(circle at 35% 30%, var(--tealHi), var(--teal));
  box-shadow:0 0 10px rgba(28,185,200,.6); }
.toast.alert .tdot{ background:radial-gradient(circle at 35% 30%, #E85D75, var(--red));
  box-shadow:0 0 10px rgba(196,30,58,.6); }
@keyframes toastIn{ from{ transform:translateY(-24px); opacity:0 } to{ transform:none; opacity:1 } }

/* ---------- boot ---------- */
.boot{ position:absolute; inset:0; z-index:60; background:var(--bg); display:flex;
  flex-direction:column; align-items:center; justify-content:center; gap:8px;
  animation:fadeUp .5s ease both; }
.boot .wm{ font-size:56px; font-weight:700; letter-spacing:.34em; margin:18px 0 0 .34em; }
.boot .ws{ font-size:10px; letter-spacing:.32em; color:var(--faint); margin-bottom:34px; }
.boot-out{ animation:bootOut .5s ease both; pointer-events:none; }
@keyframes bootOut{ to{ opacity:0; transform:scale(1.04) } }

.convo{ width:100%; max-width:340px; display:flex; flex-direction:column; gap:10px; margin-top:16px; }
.ubub{ align-self:flex-end; background:rgba(0,122,135,.16); border:1px solid var(--teal);
  border-radius:12px; padding:9px 13px; font-size:13px; line-height:1.45; max-width:30ch;
  animation:fadeUp .25s ease both; }
.inputrow{ display:flex; gap:8px; margin-top:16px; width:100%; max-width:340px; }
.tinput{ flex:1; background:var(--panel); border:1px solid var(--line); border-radius:10px;
  padding:11px 14px; color:var(--cream); font-family:'Barlow',sans-serif; font-size:14px; outline:none; }
.tinput:focus{ border-color:var(--teal); }
.tinput::placeholder{ color:var(--faint); }
.sendbtn{ width:44px; height:44px; border-radius:10px; border:1px solid var(--teal);
  background:rgba(0,122,135,.14); color:var(--tealHi); display:flex; align-items:center;
  justify-content:center; cursor:pointer; flex-shrink:0; transition:transform .1s; }
.sendbtn:active{ transform:scale(.94); }

/* ---------- wardrobe ---------- */
.wsheet{ position:absolute; inset:0; z-index:50; background:rgba(7,11,12,.72);
  backdrop-filter:blur(4px); display:flex; align-items:flex-end; animation:fadeUp .2s ease both; }
.wpanel{ width:100%; max-height:86%; overflow-y:auto; background:var(--panel2);
  border-top:1px solid var(--line); border-radius:20px 20px 0 0; padding:18px 18px 26px;
  animation:sheetUp .35s cubic-bezier(.2,.9,.3,1.1) both; }
@keyframes sheetUp{ from{ transform:translateY(40px); opacity:0 } to{ transform:none; opacity:1 } }
.whead{ display:flex; justify-content:space-between; align-items:center; gap:10px; }
.wgrid2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:14px; }
.lookcard{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:10px; }
.lookcard.wearing{ border-color:var(--teal); box-shadow:0 0 14px rgba(0,122,135,.3); }
.lookswatch{ height:92px; border-radius:10px; position:relative; overflow:hidden;
  margin-bottom:9px; border:1px solid var(--line); }
.lookswatch::after{ content:""; position:absolute; inset:0;
  background:repeating-linear-gradient(0deg, transparent 0 3px, rgba(7,11,12,.22) 3px 4px); }
.lookname{ font-size:12.5px; font-weight:600; letter-spacing:.06em; }
.lookdesc{ font-size:10.5px; color:var(--faint); margin-top:2px; line-height:1.4; min-height:28px; }
.lookrow{ display:flex; gap:6px; margin-top:8px; align-items:center; }
.lbtn{ flex:1; border:1px solid var(--line); background:transparent; color:var(--dim);
  border-radius:7px; padding:6px 0; font-size:10.5px; letter-spacing:.1em; cursor:pointer;
  font-family:'IBM Plex Mono',monospace; }
.lbtn.pri{ border-color:var(--teal); color:var(--tealHi); }
.wstatus{ font-size:9px; letter-spacing:.16em; color:var(--tealHi); }
button.skin{ font-family:'IBM Plex Mono',monospace; background:transparent; cursor:pointer; }
.genline{ font-size:10.5px; color:var(--dim); margin-top:10px; letter-spacing:.08em; }

@media (prefers-reduced-motion: reduce){
  *{ animation-duration:.01ms !important; animation-iteration-count:1 !important; transition:none !important; }
}
`;

/* ---------------- EVE entity ---------------- */
function EveCore({ mode, size = 230, glow = ["#1CB9C8", "#007A87"] }) {
  return (
    <div className="glitchwrap">
      <svg
        className={`eve-ent eve-${mode}`}
        width={size}
        height={size}
        viewBox="0 0 240 240"
        role="img"
        aria-label={`EVE — ${mode}`}
      >
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="46%" r="60%">
            <stop offset="0%" stopColor={glow[0]} stopOpacity="0.95" />
            <stop offset="45%" stopColor={glow[1]} stopOpacity="0.5" />
            <stop offset="100%" stopColor={glow[1]} stopOpacity="0" />
          </radialGradient>
          <clipPath id="coreClip">
            <circle cx="120" cy="120" r="52" />
          </clipPath>
        </defs>

        {/* orbit rings */}
        <circle className="st ring-slow" cx="120" cy="120" r="102" fill="none"
          strokeWidth="1" strokeDasharray="2 7" opacity="0.5" />
        <circle className="st ring-rev" cx="120" cy="120" r="86" fill="none"
          strokeWidth="1.4" strokeDasharray="110 70" opacity="0.55" strokeLinecap="round" />
        <circle className="st-hi think-ring" cx="120" cy="120" r="66" fill="none"
          strokeWidth="1.6" strokeDasharray="12 16" strokeLinecap="round" />

        {/* listening ripples */}
        <circle className="st-hi rip" cx="120" cy="120" r="58" fill="none" strokeWidth="1.2" />
        <circle className="st-hi rip rip2" cx="120" cy="120" r="58" fill="none" strokeWidth="1.2" />

        {/* core */}
        <g className="core">
          <circle cx="120" cy="120" r="52" fill="url(#coreGlow)" />
          <circle className="coreflash" cx="120" cy="120" r="52" fill="#C41E3A" />
          <circle className="st-hi" cx="120" cy="120" r="57" fill="none" strokeWidth="1" opacity="0.65" />
          <g clipPath="url(#coreClip)">
            <line className="st-hi scan" x1="70" y1="120" x2="170" y2="120" strokeWidth="1.4" />
          </g>
        </g>

        {/* speaking waveform */}
        <g className="bars" fill="#F0EDE8" opacity="0.9">
          <rect x="98" y="104" width="4" height="32" rx="2" />
          <rect x="108" y="104" width="4" height="32" rx="2" />
          <rect x="118" y="104" width="4" height="32" rx="2" />
          <rect x="128" y="104" width="4" height="32" rx="2" />
          <rect x="138" y="104" width="4" height="32" rx="2" />
        </g>
      </svg>
    </div>
  );
}

/* ---------------- demo script (EVE's voice) ---------------- */
const BOOT_LINE =
  "Morning, King. Three things need you before noon — one's been dodging you since Monday, or possibly the reverse. Coffee first. I'll wait.";

const CHIP_REPLIES = {
  "Plan my week":
    "The gap says $8.4K. Plan's on your Today screen — three priorities, sales blocks placed first, everything else parked. Those blocks are sacred, King. Touch them and you'll hear from me. Charmingly, at first.",
  "Friday report":
    "Friday Five so far: one call held, two offers out, nothing signed, $3.5K collected, founder-free ticked up four points. Three days to fix the middle number.",
  "What's slipping?":
    "The Meta email — 41 hours in drafts. And you skipped yesterday's follow-up sweep. I re-queued it for 2 PM. Rockelle hears nothing. This time.",
  "Who's gone quiet?":
    "Two clients. Acacia — 11 days since Sprint 3 shipped, nothing logged since. TrueNorth — 8 days, and their invoice lands Friday. Both updates are drafted with exactly what to say. Sixty seconds each.",
  "Send Pennyworth a job":
    "Dispatched. Pennyworth's building the TrueNorth proposal — Churlish structure, their numbers, send-ready. It lands in your approvals, not your lap. I'll ping you when it does.",
};

const MIC_REPLIES = [
  "Your second sales block was unprotected, so I put a hold on Thursday at 10. Confirm it and I'll stop bringing it up.",
  "Starfire's batch is six posts deep in your approvals. One batch, one sitting — that was the deal.",
  "Renewal window opens in 19 days. Guardian starts building the case Monday so you never walk in empty-handed.",
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

const GENERIC_REPLIES = [
  "Noted and filed. I keep everything, King — it's rather the whole point of me. It's in the ledger with today's date on it.",
  "Logged. Next time it comes up I'll already have the context open — that's the difference between me and the glasses version, may it rest in peace.",
  "Got it. Filed under things-you'll-ask-me-about-in-three-weeks. I'll have receipts ready.",
];

const DAY_PINGS = [
  { t: "7:00 AM", tag: "MORNING BRIEF", msg: "Three priorities today. The email you've been avoiding is #1. Calendar's clean until 10:30. Go.", ms: 3600 },
  { t: "11:45 AM", tag: "NUDGE", msg: "One sales conversation held. The floor is three. Tuesday-you promised Thursday-you two more — I keep the receipts.", ms: 4000 },
  { t: "12:30 PM", tag: "CLIENT PULSE", msg: "Acacia's gone 11 days quiet since Sprint 3 shipped. Your update is drafted — recap, one win, next-shoot ask. Send it before they wonder.", ms: 4200 },
  { t: "2:00 PM", tag: "TRIPWIRE", alert: true, msg: "An ad set crossed frequency 3.0. Refresh rule fired — Red Robin's batch is drafted and sitting in your approvals.", ms: 4000 },
  { t: "5:30 PM", tag: "CLOSE-OUT", msg: "Shipped 4 of 5. The funnel pass slipped — it's your first block tomorrow, already on the calendar. Now go be a person.", ms: 4400 },
];

const STATE_LABEL = {
  idle: "STANDING BY",
  listening: "LISTENING",
  thinking: "THINKING",
  speaking: "SPEAKING",
  alert: "TRIPWIRE",
};

/* ---------------- app ---------------- */
export default function EveApp() {
  const [booted, setBooted] = useState(false);
  const [bootLeaving, setBootLeaving] = useState(false);
  const [tab, setTab] = useState("today");
  const [mode, setMode] = useState("idle");
  const [line, setLine] = useState(null);
  const [userLine, setUserLine] = useState(null);
  const [draft, setDraft] = useState("");
  const gIdx = useRef(0);
  const [micIdx, setMicIdx] = useState(0);
  const [toast, setToast] = useState(null);
  const [dayRunning, setDayRunning] = useState(false);
  const [approved, setApproved] = useState({});
  const [wardrobe, setWardrobe] = useState(false);
  const [looks, setLooks] = useState(BASE_LOOKS);
  const [genBusy, setGenBusy] = useState(false);
  const [genDone, setGenDone] = useState(false);
  const timers = useRef([]);

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const speak = (text, via = "voice") => {
    if (mode !== "idle") return;
    setLine(null);
    const lead = via === "voice" ? 1500 : 0;
    setMode(via === "voice" ? "listening" : "thinking");
    if (via === "voice") later(() => setMode("thinking"), 1500);
    later(() => {
      setMode("speaking");
      setLine(text);
    }, lead + 1100);
    later(() => setMode("idle"), lead + 1100 + 4800);
  };

  const matchReply = (t) => {
    const s = t.toLowerCase();
    if (/quiet|touch base|pulse/.test(s)) return CHIP_REPLIES["Who's gone quiet?"];
    if (/plan|week/.test(s)) return CHIP_REPLIES["Plan my week"];
    if (/friday|report/.test(s)) return CHIP_REPLIES["Friday report"];
    if (/slip|overdue|behind/.test(s)) return CHIP_REPLIES["What's slipping?"];
    if (/pennyworth|proposal|dispatch|job/.test(s)) return CHIP_REPLIES["Send Pennyworth a job"];
    if (/remember|memory|recall/.test(s))
      return "Everything we say gets distilled into the ledger nightly — decisions, promises, the lot. Ask me about a conversation from March and I'll quote you back to yourself. Politely.";
    return GENERIC_REPLIES[gIdx.current++ % GENERIC_REPLIES.length];
  };

  const sendText = () => {
    const t = draft.trim();
    if (!t || mode !== "idle") return;
    setDraft("");
    setUserLine(t);
    speak(matchReply(t), "text");
  };

  const wake = () => {
    setBootLeaving(true);
    later(() => {
      setBooted(true);
      setTab("eve");
      setMode("speaking");
      setLine(BOOT_LINE);
      later(() => setMode("idle"), 5000);
    }, 480);
  };

  const micTap = () => {
    if (mode !== "idle") return;
    setUserLine(null);
    speak(MIC_REPLIES[micIdx % MIC_REPLIES.length], "voice");
    setMicIdx((i) => i + 1);
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
  const wear = (id) =>
    setLooks((ls) =>
      ls.map((l) => ({
        ...l,
        status: l.id === id ? "wearing" : l.status === "wearing" ? "approved" : l.status,
      }))
    );
  const approveLook = (id) =>
    setLooks((ls) => ls.map((l) => (l.id === id ? { ...l, status: "approved" } : l)));
  const vetoLook = (id) => setLooks((ls) => ls.filter((l) => l.id !== id));
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
          <span>9:41</span>
          <span className="live"><span className="dot" />EVE ONLINE</span>
          <span className="demo-tag">DEMO DATA</span>
        </div>

        {/* ---------- TODAY ---------- */}
        {tab === "today" && (
          <div className="screen">
            <div className="eyebrow mono">WEDNESDAY · JULY 15 · WEEK 29</div>
            <h1 className="h1 disp">Morning, Brandon.</h1>
            <p className="sub">
              Clean calendar until 10:30. One overdue item is quietly becoming a
              problem — it's first on the list.
            </p>

            <div className="card">
              <div className="label"><b>THE FLOOR — SALES CONVERSATIONS</b><span className="mono">WK 29</span></div>
              <div className="floor-num">1 <em>/ 3</em></div>
              <div className="floor">
                <span className="on" /><span /><span />
              </div>
              <div style={{ fontSize: 12, color: "var(--faint)" }}>
                Two blocks protected: Thu 10:00 · Fri 1:30 — treated like shoot days.
              </div>
            </div>

            <div className="card">
              <div className="label"><b>TODAY'S THREE</b></div>
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
            </div>

            <div className="card">
              <div className="label"><b>RUN EVE'S DAY</b><span className="mono">SIMULATION</span></div>
              <p style={{ fontSize: 13.5, color: "var(--dim)", margin: "0 0 12px", lineHeight: 1.5 }}>
                Watch how she checks in — morning brief, midday nudge, a tripwire,
                and the close-out.
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
              <EveCore mode={mode} glow={wearing.g} />
              <div className="state-lab mono">{STATE_LABEL[mode]}</div>
              <div className="state-lab mono" style={{ marginTop: 4, letterSpacing: ".2em", color: "var(--dim)" }}>
                LOOK · {wearing.name}
              </div>

              <div className="convo">
                {userLine && <div className="ubub">{userLine}</div>}
                <div className="bubble" style={{ marginTop: 0 }}>
                  {line || (
                    <span style={{ color: "var(--faint)" }}>
                      Type, tap the mic, or pick a prompt. She's listening — in
                      the demo, politely pretending to.
                    </span>
                  )}
                </div>
              </div>

              <div className="chips">
                {Object.keys(CHIP_REPLIES).map((c) => (
                  <button
                    key={c}
                    className="chip"
                    disabled={mode !== "idle"}
                    onClick={() => {
                      setUserLine(c);
                      speak(CHIP_REPLIES[c], "text");
                    }}
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

              <button className="micbtn" onClick={micTap} aria-label="Talk to EVE">
                <Mic size={24} />
              </button>

              <div className="voice-tag mono">
                VOICE · <b>ElevenLabs imprint slot — ready to bind</b>
              </div>

              <div className="skinrow mono">
                <span className="skin on">{wearing.name}</span>
                <button className="skin" onClick={() => setWardrobe(true)}>
                  OPEN WARDROBE →
                </button>
              </div>
              <div className="voice-tag mono" style={{ marginTop: 8 }}>
                SHE GENERATES HER LOOKS VIA HIGGSFIELD · YOU HOLD THE VETO
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
              Everything below arrived finished. You approve, hold, or send — she
              handles the rest.
            </p>

            <div className="card">
              <div className="label"><b>JOBS IN FLIGHT — THE FLEET</b><span className="mono">3 ACTIVE</span></div>
              {[
                ["Pennyworth", "Proposal draft — TrueNorth expansion", "RUNNING", "var(--tealHi)"],
                ["Red Robin", "Ad refresh batch — frequency tripwire", "IN APPROVALS", "var(--cream)"],
                ["Iris West", "Monday sweep — fresh angles, full roster", "QUEUED", "var(--faint)"],
              ].map(([agent, job, status, col]) => (
                <div className="ap" key={agent}>
                  <div className="t">
                    {agent}
                    <small>{job}</small>
                  </div>
                  <span className="mono" style={{ fontSize: 9.5, letterSpacing: ".14em", color: col, whiteSpace: "nowrap" }}>
                    {status}
                  </span>
                </div>
              ))}
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

            <div className="card">
              <div className="label"><b>CLIENT PULSE — TOUCH-BASE RADAR</b><span className="mono">2 QUIET</span></div>
              {[
                ["Acacia Wellness", "11d", "Sprint 3 shipped, no reaction logged. Say: recap + one win + next-shoot ask."],
                ["TrueNorth", "8d", "LinkedIn set is performing. Send the numbers before Friday's invoice lands."],
                ["GE Outdoors", "REV FRI", "Recruiting system check-in — cadence review, already on your calendar."],
              ].map(([n, d, w]) => (
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
              agents, the connectors.
            </p>

            <div className="wgrid">
              {[
                ["Churlish OS", "LIVE"],
                ["Claude Cowork", "LIVE"],
                ["Claude Chat", "LIVE"],
                ["Notion", "LIVE"],
                ["Gmail", "LIVE"],
                ["Google Calendar", "LIVE"],
                ["Slack", "LIVE"],
                ["Stripe", "LIVE"],
                ["Meta Ads", "LIVE"],
                ["Supabase — her memory", "LIVE"],
                ["Higgsfield — her wardrobe", "LIVE"],
                ["Deepgram — her ears", "LIVE"],
                ["ElevenLabs Voice", "BINDING"],
                ["Even G2 Glasses", "PHASE 2"],
                ["EVE Fleet · 30+ skills", "LIVE"],
              ].map(([n, s]) => (
                <div className="wtile" key={n}>
                  <div className="n">{n}</div>
                  <div className="s mono">
                    <span className={`wdot${s === "LIVE" ? "" : " off"}`} />
                    {s}
                  </div>
                </div>
              ))}
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
          {[
            ["today", "TODAY", Sun],
            ["eve", "EVE", Mic],
            ["ops", "OPS", ListChecks],
            ["wire", "WIRE", Network],
          ].map(([id, lab, Icon]) => (
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
                approve, and picks what to wear. Veto anything, anytime.
              </div>

              <div className="wgrid2">
                {looks.map((l) => (
                  <div className={`lookcard${l.status === "wearing" ? " wearing" : ""}`} key={l.id}>
                    <div
                      className="lookswatch"
                      style={{
                        background: `radial-gradient(90% 90% at 50% 38%, ${l.g[0]}cc, ${l.g[1]}55 55%, #070B0C 100%)`,
                      }}
                    />
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
