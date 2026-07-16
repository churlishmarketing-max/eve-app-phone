// Ported verbatim from eve-handoff/assets/eve-app-demo.jsx (the approved v0.5
// design — layout, palette, type, motion are law). Do not restyle.
export const CSS = `
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
  min-height:52px; white-space:pre-wrap; }
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
