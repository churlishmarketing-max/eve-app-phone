// EVE — editorial shell.
// Ported from the approved v4 design (eve-premium-interface-redesign / "EVE v4").
// Its layout, palette, type scale, spacing and motion are law (01 §3).
// Fonts load from index.html (Barlow Condensed / Barlow + italic / IBM Plex Mono).
//
// One deliberate departure from the source: the design is a fixed 430x932
// art-board. The real app is fullscreen on a Nothing Phone 3, so the frame is
// fluid (width:100%) — the 26px side gutter and the 70px / 76px insets are kept.
export const CSS = `
:root{
  --bg:#070B0C; --panel:#0C1417; --panel2:#0F191D;
  --line:rgba(240,237,232,.1);
  --hair:rgba(240,237,232,.12);
  --teal:#007A87; --tealHi:#1CB9C8;
  --cream:#F0EDE8;
  --dim:rgba(240,237,232,.6);
  --faint:rgba(240,237,232,.42);
  --red:#C41E3A;
}
*{ box-sizing:border-box; -webkit-font-smoothing:antialiased; }
::-webkit-scrollbar{ width:0; height:0; }

/* ---------- keyframes (verbatim from the design's <style> block) ---------- */
@keyframes evebreathe{0%,100%{transform:scale(1);opacity:.9;}50%{transform:scale(1.07);opacity:1;}}
@keyframes evespin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
@keyframes evespinrev{from{transform:rotate(0deg);}to{transform:rotate(-360deg);}}
@keyframes everipple{0%{transform:scale(.6);opacity:.7;}100%{transform:scale(1.5);opacity:0;}}
@keyframes evewave{0%,100%{transform:scaleY(.35);}50%{transform:scaleY(1);}}
@keyframes pulsedot{0%,100%{opacity:1;box-shadow:0 0 8px #1CB9C8;}50%{opacity:.4;box-shadow:0 0 3px #1CB9C8;}}
@keyframes fadeUp{ from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none} }
@keyframes sheetUp{ from{ transform:translateY(40px); opacity:0 } to{ transform:none; opacity:1 } }
@keyframes bootOut{ to{ opacity:0; transform:scale(1.04) } }

/* ---------- frame ---------- */
.eve-root{ margin:0; background:var(--bg); color:var(--cream);
  font-family:Barlow,system-ui,sans-serif; }
.eve-frame{ position:relative; width:100%; height:100vh; height:100dvh;
  background:var(--bg); overflow:hidden; }
.eve-glow{ position:absolute; top:-190px; left:50%; transform:translateX(-50%);
  width:660px; height:470px; pointer-events:none; z-index:0;
  background:radial-gradient(closest-side,rgba(0,122,135,.18),rgba(0,122,135,.05) 55%,transparent 75%); }
.disp{ font-family:'Barlow Condensed',Barlow,sans-serif; }
.mono{ font-family:'IBM Plex Mono',ui-monospace,monospace; }

/* ---------- header ---------- */
.eve-head{ position:relative; z-index:3; display:flex; align-items:center; gap:11px;
  padding:calc(22px + env(safe-area-inset-top)) 26px 14px; }
.eve-dot{ width:9px; height:9px; flex-shrink:0; border-radius:50%;
  background:radial-gradient(circle at 40% 35%,rgba(240,237,232,.9),#1CB9C8 55%,#063A42);
  animation:evebreathe 5s ease-in-out infinite; }
.eve-wm{ font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:21px;
  letter-spacing:.14em; line-height:1; }
.eve-sub{ font-family:'IBM Plex Mono',monospace; font-size:8.5px; letter-spacing:.28em;
  color:var(--faint); white-space:nowrap; line-height:1.3; }
.eve-rule{ flex:1; height:1px; background:var(--hair); }
.eve-folio{ font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.16em;
  color:rgba(28,185,200,.85); white-space:nowrap; }

/* ---------- screens ---------- */
.eve-screen{ position:absolute; top:calc(70px + env(safe-area-inset-top));
  bottom:calc(76px + env(safe-area-inset-bottom)); left:0; right:0;
  overflow-y:auto; -webkit-overflow-scrolling:touch; z-index:2;
  padding:8px 26px 40px; animation:fadeUp .35s ease both; }

/* Talk is a PINNED COLUMN, not a scrolling page — King must be able to see
   her at all times (his call, 2026-07-16). The plate and the input rail hold
   still; only the transcript between them moves. */
.eve-screen.talk{ overflow:hidden; display:flex; flex-direction:column; padding-bottom:10px; }
.talk .eyebrow, .talk .chips, .talk .inrow, .talk .footrow{ flex-shrink:0; }
/* The plate is the one flexible block: as tall as the clamp allows, but it
   YIELDS to the transcript's guaranteed minimum on short screens — her image
   never squeezes the conversation to zero. */
.talk .plate{ flex:0 1 auto; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
.talk .plate .staterow{ flex-shrink:0; }
/* basis 0, not auto: the transcript takes LEFTOVER space and scrolls its
   content — a long conversation must never out-negotiate her plate. */
.tscroll{ flex:1 1 0; min-height:96px; overflow-y:auto; -webkit-overflow-scrolling:touch;
  margin:14px 0 2px;
  /* fade the conversation out under the plate instead of hard-cutting it */
  -webkit-mask-image:linear-gradient(180deg,transparent 0,#000 16px);
  mask-image:linear-gradient(180deg,transparent 0,#000 16px); }
.tscroll::-webkit-scrollbar{ width:0; height:0; }
.eyebrow{ font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.24em;
  color:var(--faint); margin-bottom:12px; }
.h1{ font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:60px;
  line-height:.92; margin:0 0 16px; }
.h1.sm{ font-size:54px; line-height:.94; }
.lede{ margin:0 0 8px; font-size:16.5px; line-height:1.55; color:rgba(240,237,232,.7);
  max-width:342px; text-wrap:pretty; }
.lede.ops{ font-size:16px; color:rgba(240,237,232,.65); max-width:340px; margin:0; }

/* ---------- editorial sections ---------- */
.sec{ position:relative; border-top:1px solid var(--line); padding:26px 0 24px; overflow:hidden; }
.sec.first{ margin-top:24px; }
.sec.tight{ padding:24px 0 22px; }
.sec.last{ padding:26px 0 0; }
.sec.red{ border-top-color:rgba(196,30,58,.28); }
.ghost{ position:absolute; top:-18px; right:-8px; font-family:'Barlow Condensed',sans-serif;
  font-weight:700; font-size:118px; line-height:1; color:rgba(28,185,200,.06); pointer-events:none; }
.ghost.sm{ font-size:100px; color:rgba(28,185,200,.055); }
.ghost.red{ color:rgba(196,30,58,.07); }
.seclab{ font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.2em;
  color:rgba(28,185,200,.85); margin-bottom:14px; }
.seclab.red{ color:var(--red); }
.secbody{ position:relative; z-index:1; }
.secnote{ margin:0; font-size:14.5px; line-height:1.55; color:var(--dim);
  position:relative; z-index:1; text-wrap:pretty; }
.secnote b{ color:var(--cream); font-weight:400; }
.aside{ font-family:Barlow,sans-serif; font-style:italic; font-size:13.5px;
  color:rgba(28,185,200,.75); margin-top:12px; }

/* ---------- today: the floor ---------- */
.floornum{ font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:70px; line-height:.85; }
.floornum em{ font-style:normal; font-size:32px; color:rgba(240,237,232,.3); }
.floorrow{ display:flex; align-items:baseline; gap:14px; position:relative; z-index:1; }
.floorcap{ font-size:14.5px; color:rgba(240,237,232,.55); line-height:1.4; padding-bottom:6px; }
.bars{ display:flex; gap:5px; margin:16px 0 10px; max-width:250px; }
.bars span{ flex:1; height:4px; border-radius:2px; background:rgba(240,237,232,.09); }
.bars span.on{ background:linear-gradient(90deg,#007A87,#1CB9C8); box-shadow:0 0 8px rgba(28,185,200,.5); }
.floorfoot{ font-size:13.5px; color:var(--faint); }

/* ---------- today's three ---------- */
.three{ display:flex; flex-direction:column; gap:20px; position:relative; z-index:1; }
.item{ display:flex; gap:16px; }
.item .n{ font-family:'IBM Plex Mono',monospace; font-size:12px; color:rgba(28,185,200,.8); padding-top:3px; }
.item .n.due{ color:var(--red); }
.item .t{ font-size:18px; font-weight:500; line-height:1.28; }
.item .m{ font-size:13.5px; margin-top:4px; color:rgba(240,237,232,.45); }
.item .m .due{ color:var(--red); }

/* ---------- run her day ---------- */
.playrow{ display:flex; align-items:center; gap:16px; position:relative; z-index:1; }
.play{ width:48px; height:48px; flex-shrink:0; border-radius:50%; background:rgba(0,122,135,.15);
  border:1px solid rgba(28,185,200,.45); cursor:pointer; display:flex; align-items:center;
  justify-content:center; box-shadow:0 0 16px rgba(28,185,200,.15); transition:transform .1s; }
.play:active{ transform:scale(.95); }
.play:disabled{ opacity:.45; cursor:default; }
.playtri{ width:0; height:0; border-top:7px solid transparent; border-bottom:7px solid transparent;
  border-left:11px solid #1CB9C8; margin-left:3px; }
.playtxt{ font-size:14.5px; line-height:1.45; color:var(--dim); }

/* ---------- two-up minis ---------- */
.twoup{ display:flex; gap:26px; }
.twoup .col{ flex:1; }
.twoup .div{ width:1px; background:var(--line); }
.twoup .k{ font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.18em;
  color:var(--faint); margin-bottom:8px; }
.twoup .v{ font-size:14px; line-height:1.45; color:var(--dim); }

/* ---------- the plate (EVE / talk) — her portrait IS the plate ---------- */
.plate{ position:relative; border:1px solid rgba(28,185,200,.16); border-radius:4px;
  background:linear-gradient(180deg,rgba(12,20,23,.5),rgba(7,11,12,.2)); padding:6px;
  cursor:pointer; transition:border-color .4s ease, box-shadow .4s ease; }
/* the frame carries her state now that the core is gone */
.plate.m-listening{ border-color:rgba(28,185,200,.5); box-shadow:0 0 26px rgba(28,185,200,.2); }
.plate.m-thinking{ border-color:rgba(28,185,200,.38); box-shadow:0 0 20px rgba(28,185,200,.12); }
.plate.m-speaking{ border-color:rgba(28,185,200,.6); box-shadow:0 0 30px rgba(28,185,200,.24); }
.plate.m-alert{ border-color:rgba(196,30,58,.55); box-shadow:0 0 26px rgba(196,30,58,.18); }
.br{ position:absolute; width:14px; height:14px; pointer-events:none; z-index:2; }
.br.tl{ top:-1px; left:-1px; border-top:1px solid #1CB9C8; border-left:1px solid #1CB9C8; }
.br.tr{ top:-1px; right:-1px; border-top:1px solid #1CB9C8; border-right:1px solid #1CB9C8; }
.br.bl{ bottom:-1px; left:-1px; border-bottom:1px solid #1CB9C8; border-left:1px solid #1CB9C8; }
.br.brr{ bottom:-1px; right:-1px; border-bottom:1px solid #1CB9C8; border-right:1px solid #1CB9C8; }
/* hero portrait: fixed height (clamp, no aspect-ratio — Android WebView law),
   full-bleed cover anchored to her face */
.portrait.hero{ position:relative; width:100%; flex:1 1 auto;
  height:clamp(300px, 44vh, 470px); min-height:210px; }
.portrait.hero img{ position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; object-position:50% 16%;
  border-radius:3px; border:1px solid rgba(28,185,200,.18); display:block;
  box-shadow:inset 0 0 40px rgba(0,122,135,.14); }
.portrait.alert img{ opacity:.55; }
.corefall{ height:clamp(300px, 44vh, 470px); display:flex; align-items:center; justify-content:center; }
/* Keyboard open (adjustResize shrinks the viewport): she compresses to a
   strip instead of bleeding over the transcript; chips step aside so the
   conversation and the input rail always survive. Placed AFTER the base
   .portrait.hero rules — same specificity, so source order decides. */
@media (max-height:640px){
  .talk .eyebrow{ display:none; }
  .talk .chips{ display:none; }
  .portrait.hero, .corefall{ min-height:0; height:clamp(0px, 24vh, 220px); }
  .tscroll{ min-height:72px; margin:10px 0 2px; }
}
.staterow{ display:flex; justify-content:space-between; align-items:center;
  border-top:1px solid rgba(28,185,200,.14); margin:6px 4px 0; padding:9px 2px 4px; }
.statelab{ font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.22em; color:#1CB9C8;
  display:inline-flex; align-items:center; }
.statelab.alert{ color:var(--red); }
.statetag{ font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:.16em; color:rgba(240,237,232,.35); }
/* state ticks in the strip — the orb's job, miniaturized */
.thinkdots{ display:inline-flex; gap:3px; margin-right:9px; }
.thinkdots i{ width:4px; height:4px; border-radius:50%; background:#1CB9C8;
  animation:evebreathe 1s ease-in-out infinite; }
.thinkdots i:nth-child(2){ animation-delay:.18s; }
.thinkdots i:nth-child(3){ animation-delay:.36s; }
.minivox{ display:inline-flex; gap:2.5px; margin-right:9px; align-items:center; }
.minivox i{ width:3px; height:11px; border-radius:1.5px; background:#1CB9C8;
  animation:evewave .9s ease-in-out infinite; }
.minivox i:nth-child(2){ animation-delay:.14s; }
.minivox i:nth-child(3){ animation-delay:.28s; }
.minivox i:nth-child(4){ animation-delay:.42s; }
.minivox i:nth-child(5){ animation-delay:.56s; }

/* ---------- the entity ---------- */
.corezone{ position:relative; display:flex; align-items:center; justify-content:center; }
.ring-out{ position:absolute; border-radius:50%; border:1px dashed rgba(28,185,200,.28);
  animation:evespin 26s linear infinite; }
.ring-in{ position:absolute; border-radius:50%; border:1px solid rgba(0,122,135,.4);
  border-top-color:transparent; border-bottom-color:transparent; animation:evespinrev 14s linear infinite; }
.ring-think{ position:absolute; border-radius:50%; border:2px solid transparent;
  border-top-color:#1CB9C8; animation:evespin 1.1s linear infinite; }
.rip{ position:absolute; border-radius:50%; border:1px solid rgba(28,185,200,.5);
  animation:everipple 1.8s ease-out infinite; }
.rip.rip2{ border-color:rgba(28,185,200,.35); animation-delay:.9s; }
.core{ position:relative; border-radius:50%; animation:evebreathe 5.5s ease-in-out infinite;
  display:flex; align-items:center; justify-content:center; gap:4px; }
.wave{ width:4px; height:18px; border-radius:2px; background:#F0EDE8;
  animation:evewave .9s ease-in-out infinite; }
.alert .ring-out{ border-color:rgba(196,30,58,.28); }
.alert .ring-in{ border-color:rgba(196,30,58,.4); border-top-color:transparent; border-bottom-color:transparent; }

/* ---------- messages (typographic, never bubbles) ---------- */
.msgs{ margin:26px 0 4px; display:flex; flex-direction:column; gap:18px; }
.evelab{ font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.24em;
  color:#1CB9C8; margin-bottom:6px; }
.evetext{ font-size:16px; line-height:1.55; color:#F0EDE8; white-space:pre-wrap; }
.evetext code{ font-family:'IBM Plex Mono',monospace; font-size:13.5px; background:rgba(255,255,255,.07);
  padding:1px 5px; border-radius:4px; }
.evetext b{ color:#FFFFFF; }
.youwrap{ padding-left:24px; border-left:1px solid rgba(240,237,232,.14); }
.youlab{ font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.24em;
  color:rgba(240,237,232,.4); margin-bottom:6px; }
.youtext{ font-size:15px; line-height:1.5; color:rgba(240,237,232,.55); white-space:pre-wrap; }
.errline{ font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.1em;
  color:var(--red); margin-top:8px; }

/* ---------- RED-tier confirm (02 §6) ---------- */
.confirm{ border:1px solid rgba(196,30,58,.5); border-left-width:2px; border-radius:4px;
  padding:14px; background:rgba(196,30,58,.04); }
.confirm .hd{ font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.18em;
  color:var(--red); margin-bottom:8px; }
.confirm .sum{ font-size:15px; line-height:1.45; margin-bottom:10px; }
.field{ font-size:13px; color:var(--dim); line-height:1.5; margin-bottom:4px; word-break:break-word; }
.field b{ font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.12em;
  color:var(--faint); font-weight:400; display:block; }
.cnote{ font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:.12em; margin-top:10px; color:var(--dim); }
.cnote.ok{ color:var(--tealHi); }

/* ---------- chips ---------- */
.chips{ display:flex; flex-wrap:wrap; column-gap:18px; row-gap:6px; margin:11px 0 7px; }
.chip{ background:none; border:none; padding:11px 0; min-height:44px; color:rgba(28,185,200,.75);
  font-family:Barlow,sans-serif; font-style:italic; font-size:14.5px; cursor:pointer; text-align:left; }
.chip:disabled{ opacity:.4; cursor:default; }
.chip:focus-visible{ outline:2px solid var(--tealHi); outline-offset:3px; border-radius:2px; }

/* ---------- input row ---------- */
/* Mic + send sit RIGHT: King runs the phone right-handed and wants them under
   his thumb (his call, 2026-07-16). align-end keeps them on the last line as
   the textarea grows. */
.inrow{ display:flex; gap:10px; align-items:flex-end; border-top:1px solid var(--line); padding-top:16px; }
.mic{ width:56px; height:56px; flex-shrink:0; border-radius:50%;
  background:radial-gradient(circle at 50% 35%,rgba(0,122,135,.4),rgba(12,20,23,.9));
  border:1px solid rgba(28,185,200,.35); cursor:pointer; display:flex; align-items:center;
  justify-content:center; box-shadow:0 0 20px rgba(28,185,200,.15); transition:transform .12s; }
.mic:active{ transform:scale(.94); }
.mic.on{ border-color:#1CB9C8; }
.mic.rec{ border-color:var(--red); box-shadow:0 0 20px rgba(196,30,58,.3); }
/* Grows with what he types (auto-sized in JS, capped ~5 lines) instead of a
   single-line rail that hides the sentence he's writing. */
.tin{ flex:1; min-width:0; background:none; border:none; border-bottom:1px solid rgba(240,237,232,.15);
  padding:12px 2px; min-height:44px; max-height:124px; color:#F0EDE8;
  font-family:Barlow,sans-serif; font-size:15px; line-height:1.45; outline:none;
  resize:none; overflow-y:auto; }
.tin::-webkit-scrollbar{ width:0; }
.tin:focus{ border-bottom-color:var(--tealHi); }
.tin::placeholder{ color:var(--faint); }
.sendb{ width:44px; height:44px; flex-shrink:0; background:none; border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center; }
.sendb:active{ transform:scale(.94); }
.footrow{ display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:16px; }
.foottag{ font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.14em; color:rgba(240,237,232,.35); }
.foottag b{ color:var(--dim); font-weight:400; }
.wardrobe-open{ background:none; border:none; cursor:pointer; padding:11px 0; min-height:44px;
  font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.14em;
  color:rgba(28,185,200,.8); text-align:right; }

/* ---------- ops rows ---------- */
.jobs{ display:flex; flex-direction:column; gap:14px; position:relative; z-index:1; }
.jobrow{ display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
.jobrow .a{ font-size:16.5px; font-weight:500; }
.jobrow .b{ font-size:13.5px; color:rgba(240,237,232,.42); }
.jobrow .s{ font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.1em; white-space:nowrap; }
.oprow{ display:flex; align-items:center; gap:12px; padding:11px 0; }
.oprow .t{ flex:1; min-width:0; font-size:15px; font-weight:500; line-height:1.35; }
.oprow .t small{ display:block; font-size:12.5px; color:rgba(240,237,232,.42); margin-top:1px; font-weight:400; }
.tag{ font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.1em; white-space:nowrap;
  border:1px solid var(--line); border-radius:4px; padding:3px 6px; color:var(--tealHi); flex-shrink:0; }
.tag.hot{ color:var(--red); }
.okb{ width:38px; height:38px; flex-shrink:0; background:rgba(0,122,135,.14);
  border:1px solid rgba(28,185,200,.4); border-radius:8px; cursor:pointer;
  display:flex; align-items:center; justify-content:center; }
.ghb{ width:38px; height:38px; flex-shrink:0; background:none; border:1px solid rgba(240,237,232,.14);
  border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.donelab{ font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.12em; color:var(--tealHi); }
.pulse{ display:flex; flex-direction:column; gap:16px; position:relative; z-index:1; }
.pulserow{ display:flex; gap:12px; }
.pulserow .d{ flex-shrink:0; font-family:'IBM Plex Mono',monospace; font-size:11px; color:#1CB9C8; padding-top:2px; }
.pulserow .d.hot{ color:var(--red); }
.pulserow .n{ font-size:15.5px; font-weight:500; }
.pulserow .w{ font-size:13.5px; line-height:1.5; color:rgba(240,237,232,.45); margin-top:2px; }

/* ---------- 44px hit area on small controls (05 §9) ---------- */
.hit44{ position:relative; }
.hit44::before{ content:""; position:absolute; top:50%; left:50%;
  transform:translate(-50%,-50%); width:100%; height:100%; min-width:44px; min-height:44px; }

/* ---------- wire ---------- */
.wgroup{ display:flex; align-items:center; gap:10px; margin-bottom:14px; }
.wgroup .d{ width:7px; height:7px; border-radius:50%; }
.wgroup .l{ font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:.22em; }
.wchips{ display:flex; flex-wrap:wrap; gap:8px; position:relative; z-index:1; }
.wchip{ display:inline-flex; align-items:center; gap:8px; border:1px solid var(--line);
  border-radius:7px; padding:8px 13px; font-size:14px; color:rgba(240,237,232,.75); }
.wchip .d{ width:5px; height:5px; border-radius:50%; flex-shrink:0; }
.senses{ display:flex; gap:10px; position:relative; z-index:1; flex-wrap:wrap; }
.sense{ border:1px solid rgba(240,237,232,.12); border-radius:999px; padding:8px 16px;
  font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.12em;
  color:rgba(240,237,232,.45); background:none; cursor:pointer; }
.sense.on{ border-color:rgba(28,185,200,.45); color:#1CB9C8; cursor:default; }
.legend{ border-top:1px solid var(--line); padding:22px 0 0; display:flex; flex-direction:column;
  gap:9px; font-size:14px; line-height:1.5; }
.legend .k{ font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:.12em; }
.legend .v{ color:var(--dim); }

/* ---------- bottom nav ---------- */
.eve-nav{ position:absolute; bottom:0; left:0; right:0; z-index:5; display:flex;
  height:calc(76px + env(safe-area-inset-bottom)); padding-bottom:env(safe-area-inset-bottom);
  background:rgba(6,10,11,.95); backdrop-filter:blur(10px);
  border-top:1px solid rgba(240,237,232,.08); }
.navb{ flex:1; background:none; border:none; cursor:pointer; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:5px; padding:0; position:relative;
  font-family:Barlow,sans-serif; }
.navb .bar{ position:absolute; top:0; left:22%; right:22%; height:2px; background:transparent; }
.navb.on .bar{ background:#1CB9C8; box-shadow:0 0 10px #1CB9C8; }
.navb .n{ font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:15px; color:rgba(240,237,232,.35); }
.navb .l{ font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.24em; color:rgba(240,237,232,.35); }
.navb.on .n, .navb.on .l{ color:#1CB9C8; }
.navb:focus-visible{ outline:2px solid var(--tealHi); outline-offset:-4px; }

/* ---------- wardrobe sheet ---------- */
.wscrim{ position:absolute; inset:0; z-index:8; background:rgba(4,7,8,.72); backdrop-filter:blur(3px); }
.wsheet{ position:absolute; left:0; right:0; bottom:0; z-index:9; max-height:86%;
  display:flex; flex-direction:column;
  background:linear-gradient(180deg,#0F191D,#0A1114); border-top:1px solid rgba(28,185,200,.16);
  border-radius:22px 22px 0 0; box-shadow:0 -18px 60px rgba(0,0,0,.6);
  padding:14px 26px calc(32px + env(safe-area-inset-bottom));
  animation:sheetUp .35s cubic-bezier(.2,.9,.3,1.1) both; }
.grab{ width:42px; height:4px; border-radius:2px; background:rgba(240,237,232,.18); margin:0 auto 18px; flex-shrink:0; }
.whead{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-shrink:0; }
.wlab{ font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:.22em; color:rgba(28,185,200,.75); }
.wclose{ background:none; border:none; cursor:pointer; color:rgba(240,237,232,.5);
  font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.18em; padding:11px 0; min-height:44px; }
.wh2{ font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:36px; line-height:1; margin:0 0 8px; flex-shrink:0; }
.wp{ margin:0 0 18px; font-size:14.5px; line-height:1.55; color:rgba(240,237,232,.55); text-wrap:pretty; flex-shrink:0; }
.wgrid{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:16px;
  overflow-y:auto; -webkit-overflow-scrolling:touch; min-height:0;
  grid-auto-rows:max-content; align-content:start; }
.wgrid::-webkit-scrollbar{ width:0; height:0; }
.lookc{ border:1px solid rgba(240,237,232,.1); border-radius:14px; cursor:pointer; overflow:hidden;
  background:#0C1417; padding:0; text-align:center; }
.lookc.on{ border-color:rgba(28,185,200,.5); box-shadow:0 0 20px rgba(28,185,200,.14); }
/* Her renders are tall portraits (768x1376) — a 3:4 thumb keeps the face and
   the look, where a square crop would cut both. */
/* Android's WebView collapsed these to slivers under aspect-ratio inside a
   scrolling grid (rendered fine in desktop Chrome — the phone is the truth).
   The padding-top ratio box works everywhere. */
.lookc .thumb{ position:relative; width:100%; padding-top:133%; background:#0C1417; }
.lookc .thumb img{ position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; object-position:50% 18%; display:block; }
.lookc .nm{ font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:.1em;
  color:rgba(240,237,232,.55); padding:7px 4px; line-height:1.3; }
.lookc.on .nm{ color:#1CB9C8; }
.wfoot{ text-align:center; font-family:Barlow,sans-serif; font-style:italic; font-size:13px;
  color:rgba(240,237,232,.4); flex-shrink:0; }

/* ---------- boot ---------- */
.boot{ position:absolute; inset:0; z-index:60; background:var(--bg); display:flex;
  flex-direction:column; align-items:center; justify-content:center;
  animation:fadeUp .5s ease both; }
.boot .wm{ font-family:'Barlow Condensed',sans-serif; font-size:56px; font-weight:700;
  letter-spacing:.34em; margin:18px 0 0 .34em; }
.boot .ws{ font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.32em;
  color:var(--faint); margin:6px 0 34px; }
.boot-out{ animation:bootOut .5s ease both; pointer-events:none; }
.wakeb{ background:rgba(0,122,135,.15); border:1px solid rgba(28,185,200,.45); color:var(--cream);
  border-radius:999px; padding:14px 30px; min-height:44px; font-family:'IBM Plex Mono',monospace;
  font-size:11px; letter-spacing:.22em; cursor:pointer; box-shadow:0 0 16px rgba(28,185,200,.15); }
.wakeb:active{ transform:scale(.97); }
.wakeb:focus-visible{ outline:2px solid var(--tealHi); outline-offset:3px; }

@media (prefers-reduced-motion: reduce){
  *{ animation-duration:.01ms !important; animation-iteration-count:1 !important; transition:none !important; }
}
`;
