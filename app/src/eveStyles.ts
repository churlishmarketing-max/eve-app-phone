// EVE — v6 shell. Ported from Brandon's own redesign
// (EVE_ Executive Voice Engine-handoff, 2026-07-17). Its layout, type scale
// and motion are still that mock's law; the PALETTE and FONTS were reskinned
// (2026-09-25) onto Churlish OS's own terminal red/black system — the same
// tokens app/automations/tokens.ts, app/eve/EveChat.tsx and app/inbox/
// InboxCard.tsx use on the OS web app: bg #080809, panel #0e0e11, line
// rgba(236,232,225,.07-.09), cream #ece8e1, red #e6322b, gold #c8960a,
// green #3fb97a. The app's old teal identity (#1CB9C8 / #007A87 / #9BEFF7)
// is retired — every accent that used to read teal now reads red or reddim,
// the OS's one accent colour, per Brandon: "EVE's phone app must get the
// OS's terminal red/black style." OS below is the single source of truth;
// CSS interpolates it into :root, and EveApp.tsx imports it directly for the
// spots (the entity's ORB/CORE gradients, her mode colours) that build their
// own gradient strings rather than reading a CSS custom property.
//
// Fonts load from index.html: Barlow Condensed (headings, cond below) and
// JetBrains Mono (everything else — labels and body alike, mono below),
// same pairing as the OS web app. System-font fallbacks keep the shell
// readable offline, before the Google Fonts link resolves.
//
// Deliberate departures from the mock, all functional:
//  - fluid width (real phone, not a 430px art-board); safe-area insets kept
//  - textarea input (his earlier grow-to-fit ask) styled as the mock's input
//  - keyboard law: below 640px viewport height the entity zone and mic row
//    step aside so the conversation and input always survive (adjustResize)
export const OS = {
  bg: "#080809",
  panel: "#0e0e11",
  panel2: "#0a0a0c",
  line: "rgba(236,232,225,.07)",
  line2: "rgba(236,232,225,.09)",
  red: "#e6322b",
  reddim: "#a13228",
  redInk: "#ff6b63",
  cream: "#ece8e1",
  muted: "rgba(236,232,225,.62)",
  dim: "rgba(236,232,225,.4)",
  gold: "#c8960a",
  ok: "#3fb97a",
};
export const cond = "'Barlow Condensed','Arial Narrow',sans-serif";
export const mono = "'JetBrains Mono',ui-monospace,monospace";

export const CSS = `
:root{
  --bg:${OS.bg}; --panel:${OS.panel}; --panel2:${OS.panel2};
  --hair:${OS.line}; --hair2:${OS.line2};
  --teal:${OS.reddim}; --tealHi:${OS.red}; --ice:${OS.cream};
  --cream:${OS.cream}; --dim:${OS.muted}; --faint:${OS.dim};
  --gold:${OS.gold}; --red:${OS.red}; --green:${OS.ok};
  --reddim:${OS.reddim};
  /* --redInk · TEXT-LEGIBILITY VARIANT OF THE LAW RED. Adopted from the
     desktop, whose reasoning is law here (eve-desktop.css:44-62): STRUCTURE
     always wears the law hex — the 3px confirm rail, the card border, the tier
     dot, the mic ring and its glyph, .orb.red — and only SMALL TYPE may wear
     the variant. It is still the same colour, lightness lifted until it
     clears 4.5:1 on the ground it is printed on — recomputed here for the OS
     reskin's red (was #C41E3A/#FF6B85, now ${OS.red}/${OS.redInk}); nothing
     new was invented. Re-measure if the law red ever moves again. */
  --redInk:${OS.redInk};
}
*{ box-sizing:border-box; -webkit-font-smoothing:antialiased; -webkit-tap-highlight-color:transparent; }
::-webkit-scrollbar{ width:0; height:0; display:none; }
*{ scrollbar-width:none; }
::selection{ background:rgba(230,50,43,.35); }

@keyframes ospin{ to{ transform:rotate(360deg); } }
@keyframes ospinrev{ to{ transform:rotate(-360deg); } }
@keyframes breathe{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.05); } }
@keyframes aurabreathe{ 0%,100%{ opacity:.7; } 50%{ opacity:1; } }
@keyframes ripple{ 0%{ transform:scale(.55); opacity:.7; } 100%{ transform:scale(1.95); opacity:0; } }
@keyframes wavebar{ 0%,100%{ transform:scaleY(.22); } 50%{ transform:scaleY(1); } }
@keyframes dotpulse{ 0%,100%{ opacity:1; } 50%{ opacity:.3; } }
@keyframes blinkc{ 0%,49%{ opacity:1; } 50%,100%{ opacity:0; } }
@keyframes scandrift{ from{ background-position:0 0; } to{ background-position:0 240px; } }
@keyframes floatup{ 0%{ transform:translateY(30px); opacity:0; } 15%{ opacity:.5; } 85%{ opacity:.3; } 100%{ transform:translateY(-300px); opacity:0; } }
@keyframes typedot{ 0%,100%{ opacity:.25; transform:translateY(0); } 50%{ opacity:1; transform:translateY(-2px); } }
@keyframes simslide{ 0%{ width:8%; } 50%{ width:86%; } 100%{ width:8%; } }
@keyframes bootOut{ to{ opacity:0; transform:scale(1.04); } }
/* boot entity (unchanged from the earlier shell) */
@keyframes evebreathe{0%,100%{transform:scale(1);opacity:.9;}50%{transform:scale(1.07);opacity:1;}}
@keyframes evespin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
@keyframes evespinrev{from{transform:rotate(0deg);}to{transform:rotate(-360deg);}}
@keyframes everipple{0%{transform:scale(.6);opacity:.7;}100%{transform:scale(1.5);opacity:0;}}
@keyframes evewave{0%,100%{transform:scaleY(.35);}50%{transform:scaleY(1);}}

/* ---------- frame ---------- */
.eve-root{ margin:0; background:#0a0a0c; color:var(--cream); font-family:'JetBrains Mono',ui-monospace,monospace; }
.eve-frame{ position:relative; width:100%; height:100vh; height:100dvh; background:var(--bg);
  overflow:hidden; display:flex; flex-direction:column; }
.mono{ font-family:'JetBrains Mono',ui-monospace,monospace; }
.disp{ font-family:'Barlow Condensed','Arial Narrow',sans-serif; }

.aura{ position:absolute; top:-140px; left:50%; margin-left:-280px; width:560px; height:420px;
  border-radius:50%; background:radial-gradient(closest-side, rgba(161,50,40,.26), rgba(161,50,40,.07) 55%, transparent 72%);
  pointer-events:none; z-index:0; animation:aurabreathe 6s ease-in-out infinite; }
.motes{ position:absolute; top:60px; left:0; right:0; height:340px; pointer-events:none; z-index:0; }
.motes span{ position:absolute; border-radius:50%; background:rgba(230,50,43,.45); }
.scan{ position:absolute; inset:0; z-index:5; pointer-events:none;
  background:repeating-linear-gradient(0deg, rgba(236,232,225,.022) 0px, rgba(236,232,225,.022) 1px, transparent 1px, transparent 3px);
  animation:scandrift 16s linear infinite; }
.vig{ position:absolute; inset:0; z-index:5; pointer-events:none; box-shadow:inset 0 0 60px rgba(10,10,12,.55); }

/* ---------- status bar ---------- */
.sbar{ position:relative; z-index:2; flex:none; display:flex; align-items:center; justify-content:space-between;
  padding:calc(10px + env(safe-area-inset-top)) 18px 10px; font-family:'JetBrains Mono',ui-monospace,monospace;
  font-size:9.5px; letter-spacing:.18em; color:rgba(236,232,225,.5); border-bottom:1px solid rgba(236,232,225,.06); }
.sbar .r{ display:flex; align-items:center; gap:7px; }
.sbar .lnk{ color:var(--tealHi); animation:dotpulse 3s ease-in-out infinite; }
.sbar .lnk.down{ color:var(--red); animation:none; }
.sbar .lnklab{ color:rgba(230,50,43,.8); }
.sbar .lnklab.down{ color:rgba(230,50,43,.9); }

/* ---------- screen zone ---------- */
.zone{ position:relative; z-index:1; flex:1; min-height:0; }
.scr{ position:absolute; inset:0; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch;
  padding:22px 18px 30px; }
.scr.talk{ display:flex; flex-direction:column; padding:0; overflow:hidden; }

/* ---------- shared bits ---------- */
.eyeb{ display:flex; align-items:baseline; justify-content:space-between;
  font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9.5px; letter-spacing:.22em; color:rgba(230,50,43,.85); }
.eyeb .r{ color:rgba(236,232,225,.35); }
.h1v6{ margin:12px 0 0; font-family:'Barlow Condensed','Arial Narrow',sans-serif; font-weight:700; font-size:44px;
  line-height:.98; letter-spacing:.01em; color:var(--cream); }
.ledev6{ margin:10px 0 0; font-size:14px; line-height:1.5; color:var(--dim); text-wrap:pretty; }
.card{ background:var(--panel); border:1px solid var(--hair); border-radius:0; padding:16px;
  box-shadow:inset 0 1px 0 rgba(236,232,225,.04), inset 0 0 26px rgba(230,50,43,.04), 0 10px 26px rgba(0,0,0,.35); }
.divrow{ display:flex; align-items:center; gap:10px; margin:24px 0 12px; }
.divrow .l{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9.5px; letter-spacing:.22em; color:rgba(230,50,43,.85); }
.divrow .rule{ flex:1; height:1px; background:var(--hair); }
.divrow .r{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.16em; color:rgba(236,232,225,.35); }
/* THE UNMEASURED MARKER. .r is a quiet value slot at .35 — MEASURED 2.85:1 on
   --bg — which is fine for "3 WAITING" (a number he can also read from the
   rows below it) and NOT fine for the dash, which is the only thing on screen
   saying "this was never measured". An L3 signal he cannot read is the same
   failure as a checkmark he did not earn. --dim is .62, the value already in
   this file and the one .cmeta uses for the same class of provenance text:
   2.85:1 -> 6.77:1. Base .r is untouched. */
.divrow .r.unmeasured{ color:var(--dim); }
.footnote{ margin-top:26px; text-align:center; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px;
  letter-spacing:.1em; color:rgba(236,232,225,.28); }
.hit44{ min-width:44px; min-height:44px; }
.errline{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:10px; letter-spacing:.08em; color:var(--red); }

/* ---------- today ---------- */
.floorbig{ font-family:'Barlow Condensed','Arial Narrow',sans-serif; font-weight:700; font-size:42px; line-height:1; color:var(--cream); }
.floorbig em{ font-style:normal; color:rgba(236,232,225,.3); }
.fbars{ display:flex; gap:5px; margin-top:12px; }
.fbars span{ flex:1; height:7px; border-radius:0; background:rgba(236,232,225,.06); border:1px solid rgba(236,232,225,.07); }
.fbars span.on{ background:linear-gradient(90deg,#a13228,#e6322b); border:none; box-shadow:0 0 12px rgba(230,50,43,.45); }
.mline{ margin-top:10px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:10px; letter-spacing:.04em; color:rgba(236,232,225,.45); }
.t3{ display:flex; flex-direction:column; gap:9px; }
.t3row{ display:flex; align-items:center; gap:14px; background:var(--panel2); border:1px solid var(--hair);
  border-left:2px solid rgba(230,50,43,.45); border-radius:0; padding:13px 14px; }
.t3row.due{ border-left-color:var(--red); }
.t3row .idx{ font-family:'JetBrains Mono',ui-monospace,monospace; font-weight:600; font-size:17px; color:var(--tealHi); }
.t3row.due .idx{ color:var(--red); }
.t3row .tt{ font-weight:600; font-size:14.5px; color:var(--cream); }
.t3row .tm{ margin-top:3px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.14em; color:rgba(236,232,225,.4); }
.t3row.due .tm{ color:rgba(230,50,43,.9); }
.simhead{ display:flex; align-items:center; gap:14px; }
.simplay{ cursor:pointer; flex:none; width:52px; height:52px; border-radius:50%; border:1px solid rgba(230,50,43,.55);
  background:rgba(230,50,43,.08); display:flex; align-items:center; justify-content:center;
  box-shadow:0 0 18px rgba(230,50,43,.25); }
.simplay:disabled{ opacity:.45; }
.simtt{ font-family:'Barlow Condensed','Arial Narrow',sans-serif; font-weight:600; font-size:22px; line-height:1; color:var(--cream); }
.simsub{ margin-top:4px; font-size:12.5px; color:rgba(236,232,225,.55); }
.simtag{ align-self:flex-start; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.18em; color:rgba(230,50,43,.7); }
.simbar{ margin-top:14px; height:3px; border-radius:0; background:rgba(236,232,225,.07); overflow:hidden; }
.simfill{ height:100%; background:linear-gradient(90deg,#a13228,#e6322b); box-shadow:0 0 10px rgba(230,50,43,.6); transition:width .6s ease; }
.simfill.run{ animation:simslide 2.4s ease-in-out infinite; }
.simline{ margin-top:9px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:10px; letter-spacing:.04em; color:rgba(236,232,225,.5); min-height:15px; }
.simline .c{ color:var(--tealHi); animation:blinkc 1s step-end infinite; }
.capbox{ cursor:pointer; margin-top:11px; display:flex; align-items:center; gap:10px; background:var(--bg);
  border:1px solid rgba(236,232,225,.08); border-radius:0; padding:11px 12px; }
.capbox .ph{ flex:1; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:10.5px; color:rgba(236,232,225,.45); }
.caphint{ margin-top:9px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.14em; color:rgba(236,232,225,.3); }
.minis{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px; }
.mini{ background:var(--panel); border:1px solid var(--hair); border-radius:0; padding:14px;
  box-shadow:inset 0 1px 0 rgba(236,232,225,.04), 0 8px 20px rgba(0,0,0,.3); }
.mini .k{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.2em; color:rgba(230,50,43,.8); }
.mini .n{ margin-top:8px; font-family:'Barlow Condensed','Arial Narrow',sans-serif; font-weight:700; font-size:34px; line-height:1; color:var(--cream); }
.mini .n em{ font-style:normal; font-size:20px; color:rgba(236,232,225,.4); }
.mini .s{ margin-top:4px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.08em; color:rgba(236,232,225,.45); }
.mini .x{ margin-top:8px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.06em; color:rgba(236,232,225,.3); }

/* ---------- talk: entity ---------- */
.ehead{ flex:none; position:relative; padding-top:10px; }
.etag{ text-align:center; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.3em; color:rgba(236,232,225,.35); }
.ezone{ position:relative; height:212px; display:flex; align-items:center; justify-content:center; }
.eaura{ position:absolute; width:280px; height:280px; border-radius:50%; animation:aurabreathe 6s ease-in-out infinite; }
.erip{ position:absolute; width:104px; height:104px; border-radius:50%; border:1px solid rgba(230,50,43,.55); animation:ripple 2.4s ease-out infinite; }
.erip.r2{ border-color:rgba(230,50,43,.45); animation-delay:.8s; }
.erip.r3{ border-color:rgba(236,232,225,.4); animation-delay:1.6s; }
.ering{ position:absolute; width:172px; height:172px; transform:rotateX(67deg); }
.ering > div{ width:100%; height:100%; border-radius:50%; border:1px solid rgba(230,50,43,.42); border-bottom-color:transparent; animation:ospin 15s linear infinite; }
.ering2{ position:absolute; width:128px; height:128px; transform:rotateX(72deg) rotate(24deg); }
.ering2 > div{ width:100%; height:100%; border-radius:50%; border:1px solid rgba(236,232,225,.28); border-top-color:transparent; animation:ospinrev 9.5s linear infinite; }
.efast{ position:absolute; width:112px; height:112px; opacity:0; transition:opacity .3s; }
.efast.on{ opacity:1; }
.efast > div{ width:100%; height:100%; border-radius:50%; border:1.5px solid transparent; border-top-color:var(--ice); animation:ospin .85s linear infinite; }
.orb{ cursor:pointer; width:92px; height:92px; border-radius:50%; animation:breathe 4.6s ease-in-out infinite; border:none; padding:0; }
.ewave{ position:absolute; bottom:18px; display:flex; align-items:flex-end; gap:4px; height:18px; }
.ewave span{ width:3px; background:var(--tealHi); border-radius:0; transform-origin:bottom; animation:wavebar .8s ease-in-out infinite; }
.ewave span:nth-child(2){ height:18px; animation-duration:.7s; animation-delay:.15s; }
.ewave span:nth-child(3){ height:15px; background:var(--ice); animation-delay:.3s; }
.ewave span:nth-child(4){ height:18px; animation-duration:.65s; animation-delay:.1s; }
.ewave span:nth-child(5){ height:11px; animation-duration:.95s; animation-delay:.22s; }
.ewave span:nth-child(1){ height:12px; }

/* talk: portrait mode */
.pwrap{ position:relative; padding:14px 0 4px; display:flex; flex-direction:column; align-items:center; }
.pwrap .eaura{ top:-20px; width:320px; height:300px; }
.pcard{ position:relative; width:188px; height:218px; cursor:pointer; border:none; background:none; padding:0; }
.pc{ position:absolute; width:20px; height:20px; }
.pc.tl{ top:-7px; left:-7px; border-top:2px solid var(--tealHi); border-left:2px solid var(--tealHi); }
.pc.tr{ top:-7px; right:-7px; border-top:2px solid var(--tealHi); border-right:2px solid var(--tealHi); }
.pc.bl{ bottom:-7px; left:-7px; border-bottom:2px solid var(--tealHi); border-left:2px solid var(--tealHi); }
.pc.br{ bottom:-7px; right:-7px; border-bottom:2px solid var(--tealHi); border-right:2px solid var(--tealHi); }
.pfr{ position:absolute; inset:3px; border-radius:0; overflow:hidden; border:1px solid rgba(230,50,43,.3); background:var(--panel); }
.pfr img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:50% 12%; display:block; }
.pfr .sheen{ position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(180deg, rgba(230,50,43,.1), rgba(8,8,9,0) 38%, rgba(161,50,40,.16)); mix-blend-mode:screen; }
.pfr.alert img{ opacity:.6; }
.pbadge{ margin-top:12px; display:flex; align-items:center; gap:10px; padding:7px 13px; background:var(--panel);
  border:1px solid var(--hair2); border-radius:0; box-shadow:0 6px 18px rgba(0,0,0,.4); }
.pbadge .wm{ display:inline-block; font-family:'Barlow Condensed','Arial Narrow',sans-serif; font-weight:900; font-size:13px; letter-spacing:.02em; text-transform:uppercase; background:var(--red); color:#0a0707; padding:1px 8px; transform:skewX(-7deg); }
.pbadge .dv{ width:1px; height:14px; background:rgba(236,232,225,.15); }
.pbadge .sb{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8px; letter-spacing:.22em; color:rgba(236,232,225,.4); }
.pbadge .morb{ width:22px; height:22px; border-radius:50%; animation:breathe 4.6s ease-in-out infinite; }
.elabel{ text-align:center; margin-top:2px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9.5px; letter-spacing:.26em; }

/* ---------- talk: conversation ---------- */
.conv{ flex:1; min-height:90px; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch;
  padding:14px 18px 8px; display:flex; flex-direction:column; gap:10px; }
.brow{ display:flex; }
.brow.eve{ justify-content:flex-start; }
.brow.you{ justify-content:flex-end; }
.bub{ max-width:84%; border-radius:0; padding:9px 12px 8px; }
.bub.eve{ background:var(--panel); border:1px solid rgba(236,232,225,.06); border-left:2px solid var(--tealHi); }
.bub.you{ background:rgba(161,50,40,.15); border:1px solid rgba(230,50,43,.2); }
.bname{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.18em; margin-bottom:4px; }
.bub.eve .bname{ color:rgba(230,50,43,.8); }
.bub.you .bname{ color:rgba(236,232,225,.38); }
.btext{ font-size:13.5px; line-height:1.48; color:rgba(236,232,225,.92); white-space:pre-wrap; }
.btext code{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12px; background:rgba(255,255,255,.07); padding:1px 5px; border-radius:0; }
.btext b{ color:#FFFFFF; }
.tybub{ background:var(--panel); border:1px solid rgba(236,232,225,.06); border-left:2px solid var(--tealHi);
  border-radius:0; padding:11px 14px; display:flex; gap:5px; }
.tybub span{ width:4px; height:4px; border-radius:50%; background:var(--tealHi); animation:typedot 1.1s ease-in-out infinite; }
.tybub span:nth-child(2){ animation-delay:.18s; }
.tybub span:nth-child(3){ animation-delay:.36s; }

/* RED confirm card, in-conversation (02 §6) */
.confirmv6{ width:100%; background:linear-gradient(180deg, rgba(230,50,43,.09), rgba(14,14,17,0));
  border:1px solid rgba(230,50,43,.3); border-left:3px solid var(--red); border-radius:0; padding:12px 14px; }
/* 9px TYPE, so --redInk and not the law hex. The 3px rail and the 1px border
   above still carry #e6322b, so the card READS as red exactly as before —
   only the one line naming the tier moved, and it moved along its own
   lightness axis. 3.26:1 -> 6.98:1 on this plate (composited through the .09
   alpha and the gradient). This is the header of the one card whose whole job
   is to be read before something irreversible happens. */
.confirmv6 .hd{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.18em; color:var(--redInk); }
.confirmv6 .sum{ margin-top:7px; font-weight:600; font-size:13.5px; color:var(--cream); }
.confirmv6 .field{ margin-top:6px; font-size:12px; line-height:1.45; color:rgba(236,232,225,.6); word-break:break-word; }
/* The key label was rgba(236,232,225,.4) — MEASURED 3.44:1 against this plate
   at 8.5px. It names the field he is being asked to approve, so it goes to .55
   (5.48:1). The payload text above it measures 6.31:1 and is left alone. The
   desktop shipped a confirm card whose payload text measured 1.02:1 and an
   audit caught it; a card he cannot read is a card he cannot judge. */
.confirmv6 .field b{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.12em; color:rgba(236,232,225,.55); display:block; }
.confirmv6 .row{ margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; }
/* The card's own provenance: the hash it is bound to, when it dies, and the
   job that raised it. 9px, so it wears .62 rather than the .4 the field key
   used to. EXPIRED is the one word on this line allowed to be red. */
.cmeta{ margin-top:9px; display:flex; flex-wrap:wrap; gap:4px 12px; font-size:8.5px; letter-spacing:.1em;
  color:rgba(236,232,225,.62); }
/* EXPIRED is 8.5px TYPE on the same red plate — 3.34:1 on the law hex, so it
   takes the ink variant like the header above it (7.14:1). It is still the one
   word on this line allowed to be red. */
.cmeta .gone{ color:var(--redInk); }
.cbtn{ cursor:pointer; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.12em; text-transform:uppercase; font-weight:700; border-radius:0; padding:8px 11px; }
.cbtn.ok{ color:#0a0707; background:var(--red); border:1px solid var(--red); }
.cbtn.gh{ color:var(--cream); background:transparent; border:1px solid var(--hair2); font-weight:400; }
/* SEND IT with no unit picked looked exactly like SEND IT ready to fire —
   .chipv6 had a :disabled rule and .cbtn never did. Caught in the 420px
   screenshot, not in the code. */
.cbtn:disabled{ opacity:.4; cursor:default; }
.cnote6{ margin-top:9px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.12em; color:rgba(236,232,225,.55); }
.cnote6.ok{ color:var(--tealHi); }
/* The desk lock. Stands exactly where APPROVE would stand on a card this phone
   cannot approve — a file batch runs at his desk, not here. Engraved, not
   pressable: dashed hairline, transparent plate, uppercase mono, and a <p>
   rather than a disabled <button>, so no opacity rule ever stacks on the one
   sentence telling him where to go. Deliberately quieter than CANCEL beside it
   and still comfortably legible. Mirrors the desktop's send_sms .clocked. */
.confirmv6 .clocked{ margin:0; flex:1; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px;
  letter-spacing:.12em; text-transform:uppercase; line-height:1.4; text-align:left;
  border-radius:0; padding:8px 11px; color:rgba(236,232,225,.62); background:none;
  border:1px dashed rgba(236,232,225,.3); }

/* ---------- talk: chips / input / mic ---------- */
.chiprow{ flex:none; display:flex; gap:8px; overflow-x:auto; padding:8px 18px; }
.chipv6{ flex:none; cursor:pointer; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9.5px; letter-spacing:.12em;
  text-transform:uppercase; color:rgba(236,232,225,.7); padding:7px 11px; border:1px solid rgba(230,50,43,.28);
  border-radius:0; background:rgba(230,50,43,.05); }
.chipv6:disabled{ opacity:.4; }
.inputrow{ flex:none; display:flex; gap:8px; padding:4px 18px 10px; align-items:flex-end; }
.tinv6{ flex:1; min-width:0; background:var(--panel); border:1px solid var(--hair2); border-radius:0;
  padding:11px 12px; color:var(--cream); font-family:'JetBrains Mono',ui-monospace,monospace; font-size:14px; caret-color:var(--tealHi);
  outline:none; resize:none; min-height:42px; max-height:124px; overflow-y:auto; line-height:1.4; }
.sendv6{ cursor:pointer; width:42px; height:42px; flex:none; border-radius:0; background:rgba(230,50,43,.14);
  border:1px solid rgba(230,50,43,.4); display:flex; align-items:center; justify-content:center; }
.microw{ flex:none; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; padding:0 18px 10px; }
.vline{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.14em; line-height:1.6;
  color:rgba(236,232,225,.38); white-space:pre-line; }
.vline.rec{ color:var(--red); }
.micv6{ cursor:pointer; width:62px; height:62px; border-radius:50%; border:1px solid rgba(230,50,43,.4);
  background:radial-gradient(circle at 50% 38%, rgba(230,50,43,.16), rgba(14,14,17,.9) 75%);
  box-shadow:0 0 16px rgba(230,50,43,.18); display:flex; align-items:center; justify-content:center; transition:box-shadow .3s; }
.micv6.on{ border-color:var(--hair2); box-shadow:0 0 14px rgba(236,232,225,.12); }
.micv6.rec{ border-color:var(--red); box-shadow:0 0 30px rgba(230,50,43,.5); }
.wbtn{ cursor:pointer; justify-self:end; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.16em;
  color:rgba(230,50,43,.75); padding:7px 9px; border:1px solid rgba(230,50,43,.25); border-radius:0; background:none; }
.footline{ flex:none; padding-bottom:8px; text-align:center; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px;
  letter-spacing:.1em; color:rgba(236,232,225,.26); }

/* keyboard law: the conversation and input always survive */
@media (max-height:640px){
  .ezone, .pwrap, .etag{ display:none; }
  .chiprow{ display:none; }
  .microw{ display:none; }
  .footline{ display:none; }
}

/* ---------- ops ---------- */
.jobrow6{ display:flex; align-items:center; gap:12px; background:var(--panel); border:1px solid var(--hair);
  border-radius:0; padding:11px 12px; }
.jcode{ flex:none; width:28px; height:28px; border-radius:0; background:rgba(230,50,43,.08);
  border:1px solid rgba(230,50,43,.22); display:flex; align-items:center; justify-content:center;
  font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9.5px; font-weight:600; color:var(--tealHi); }
.jmain{ flex:1; min-width:0; }
.jname{ display:block; font-weight:600; font-size:13.5px; color:var(--cream); }
.jtask{ display:block; margin-top:2px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.06em;
  color:rgba(236,232,225,.4); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.jtag{ flex:none; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8px; letter-spacing:.14em; border-radius:0; padding:4px 7px; }
.jtag.run{ color:var(--tealHi); background:rgba(230,50,43,.1); border:1px solid rgba(230,50,43,.35); }
.jtag.appr{ color:var(--gold); background:rgba(200,150,10,.08); border:1px solid rgba(200,150,10,.3); }
.jtag.que{ color:rgba(236,232,225,.45); background:transparent; border:1px solid rgba(236,232,225,.14); }
.aprow{ display:flex; align-items:center; gap:12px; background:var(--panel2); border:1px solid var(--hair);
  border-radius:0; padding:10px 12px; }
.aglyph{ flex:none; width:42px; height:42px; border-radius:0; background:linear-gradient(135deg, #0e0e11, rgba(161,50,40,.4));
  border:1px solid rgba(230,50,43,.2); display:flex; align-items:center; justify-content:center;
  font-family:'JetBrains Mono',ui-monospace,monospace; font-size:13px; color:var(--ice); }
.amain{ flex:1; min-width:0; }
.atitle{ display:block; font-weight:500; font-size:13px; color:var(--cream); line-height:1.3; }
.asub{ display:block; margin-top:2px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.12em; color:rgba(236,232,225,.4); }
.abtns{ flex:none; display:flex; gap:6px; }
.pulcard{ background:var(--panel); border:1px solid var(--hair); border-radius:0; padding:4px 14px;
  box-shadow:inset 0 1px 0 rgba(236,232,225,.04); }
.pulrow{ display:flex; align-items:baseline; gap:10px; padding:11px 0; border-bottom:1px solid var(--hair); }
.pulrow:last-child{ border-bottom:none; }
.pulname{ flex:none; font-weight:600; font-size:13.5px; color:var(--cream); width:92px; }
.puldays{ flex:none; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.1em;
  color:rgba(236,232,225,.5); border:1px solid rgba(236,232,225,.14); border-radius:0; padding:2px 6px; }
.puldays.hot{ color:var(--gold); border-color:rgba(200,150,10,.35); }
.pulsay{ flex:1; font-size:12px; line-height:1.4; color:rgba(236,232,225,.55); }
.trip6{ margin-top:24px; background:linear-gradient(180deg, rgba(230,50,43,.09), rgba(14,14,17,0));
  border:1px solid rgba(230,50,43,.3); border-left:3px solid var(--red); border-radius:0; padding:13px 14px; }
/* The other tier header on the identical red plate, and the identical fault:
   9px type on the law hex measured 3.27:1. Same move, same reason — the rail
   and border on .trip6 above keep #e6322b. 3.27:1 -> 6.99:1. */
.trip6 .hd{ display:flex; align-items:center; gap:8px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.2em; color:var(--redInk); }
.trip6 .tt{ margin-top:8px; font-weight:600; font-size:14px; color:var(--cream); }
.trip6 .tm{ margin-top:4px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9.5px; line-height:1.6; letter-spacing:.04em; color:rgba(236,232,225,.5); }
.secnote6{ font-size:13px; line-height:1.5; color:rgba(236,232,225,.5); }

/* ---------- wire ---------- */
.wgrid6{ display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:20px; }
.wnode{ background:var(--panel); border:1px solid var(--hair); border-radius:0; padding:12px;
  box-shadow:inset 0 1px 0 rgba(236,232,225,.03); }
.wnode.dash{ border:1px dashed rgba(236,232,225,.14); opacity:.62; }
.wnode.dim{ opacity:.62; }
.wnode .top{ display:flex; align-items:center; gap:8px; }
.wcode{ flex:none; width:24px; height:24px; border-radius:0; background:var(--panel2); border:1px solid var(--hair2);
  display:flex; align-items:center; justify-content:center; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8px;
  font-weight:600; color:rgba(236,232,225,.7); }
.wdot{ margin-left:auto; font-size:10px; }
.wdot.live{ color:var(--tealHi); animation:dotpulse 3.2s ease-in-out infinite; }
.wdot.key{ color:var(--gold); }
.wdot.off{ color:rgba(236,232,225,.35); }
.wname6{ margin-top:9px; font-weight:600; font-size:13px; color:var(--cream); }
.wrole{ margin-top:2px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.06em; color:rgba(236,232,225,.4); }
.wstat{ margin-top:8px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8px; letter-spacing:.16em; }
.wstat.live{ color:rgba(230,50,43,.85); }
.wstat.key{ color:rgba(200,150,10,.9); }
.wstat.off{ color:rgba(236,232,225,.35); }
.wstat.p4{ color:rgba(236,232,225,.3); }
.sensecard{ margin-top:14px; background:linear-gradient(180deg, rgba(230,50,43,.08), rgba(14,14,17,0));
  border:1px solid rgba(230,50,43,.22); border-radius:0; padding:16px; }
.sensecard .hd{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.22em; color:rgba(230,50,43,.9); }
.sensecard .bd{ margin-top:8px; font-size:13.5px; line-height:1.5; color:rgba(236,232,225,.75); text-wrap:pretty; }
.sensebtns{ margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; }
.sense6{ cursor:pointer; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9.5px; letter-spacing:.16em; color:var(--ice);
  background:rgba(230,50,43,.14); border:1px solid rgba(230,50,43,.45); border-radius:0; padding:8px 12px; }
.sense6.on{ color:var(--tealHi); background:none; border-color:rgba(230,50,43,.45); cursor:default; }
.rules{ margin-top:14px; }
.rulerow{ display:flex; align-items:baseline; gap:10px; margin-top:10px; }
.rulerow .dot{ flex:none; width:8px; height:8px; border-radius:50%; }
.rulerow .k{ flex:none; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.18em; width:52px; }
.rulerow .v{ font-size:12.5px; color:rgba(236,232,225,.65); }

/* ---------- body (vitals) ---------- */
/* segmented picker: equal columns, every cell its own 44px target.
   auto-fit + minmax(44px,1fr) is the whole safety story — the browser lays as
   many >=44px tracks as the box allows and wraps the remainder to a second
   row, so a narrow phone costs a row of height instead of shrinking the
   target under the hit44 floor (:93). auto-fit, not auto-fill: with 5 energy
   buttons in a 6-track box the empty track collapses instead of leaving a
   hole. */
.segrow{ display:grid; grid-template-columns:repeat(auto-fit,minmax(44px,1fr)); gap:6px; margin-top:10px; }
.seg{ cursor:pointer; min-height:44px; display:flex; align-items:center; justify-content:center;
  font-family:'JetBrains Mono',ui-monospace,monospace; font-size:13px; letter-spacing:.06em; color:rgba(236,232,225,.5);
  background:var(--panel2); border:1px solid rgba(236,232,225,.12); border-radius:0; padding:0 2px; }
.seg.on{ color:var(--ice); font-weight:600; border-color:rgba(230,50,43,.6); background:rgba(230,50,43,.14);
  box-shadow:inset 0 0 16px rgba(230,50,43,.18), 0 0 10px rgba(230,50,43,.12); }
/* 7-day strip: minmax(0,…) so seven cells can never force a sideways scroll */
.wkstrip{ display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:5px; margin-top:10px; }
.wkcell{ background:var(--panel2); border:1px solid var(--hair); border-radius:0; padding:8px 1px 7px; text-align:center; }
.wkcell.now{ border-color:rgba(230,50,43,.4); }
.wkcell .d{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8px; letter-spacing:.06em; color:rgba(236,232,225,.38); }
.wkcell .e{ margin-top:5px; font-family:'Barlow Condensed','Arial Narrow',sans-serif; font-weight:700; font-size:19px; line-height:1; color:var(--cream); }
.wkcell .e.none{ color:rgba(236,232,225,.22); }
.wkdots{ margin-top:6px; display:flex; justify-content:center; gap:4px; }
.wkdots i{ width:5px; height:5px; border-radius:50%; background:rgba(236,232,225,.12); }
.wkdots i.on{ background:var(--tealHi); box-shadow:0 0 6px rgba(230,50,43,.55); }

/* ---------- wardrobe sheet ---------- */
.scrim6{ position:absolute; inset:0; z-index:9; background:rgba(10,10,12,.68); backdrop-filter:blur(3px); }
.sheet6{ position:absolute; left:0; right:0; bottom:0; z-index:10; background:var(--panel);
  border-top:1px solid rgba(230,50,43,.3); border-radius:0;
  padding:10px 18px calc(24px + env(safe-area-inset-bottom));
  box-shadow:0 -20px 60px rgba(0,0,0,.55); max-height:82%; overflow-y:auto; -webkit-overflow-scrolling:touch; }
.grab6{ width:36px; height:3px; border-radius:0; background:rgba(236,232,225,.15); margin:0 auto; }
.shead{ display:flex; align-items:center; margin-top:14px; }
.shead .lab{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.24em; color:rgba(230,50,43,.85); }
.shead .tt{ margin-top:6px; font-family:'Barlow Condensed','Arial Narrow',sans-serif; font-weight:700; font-size:27px; line-height:1; color:var(--cream); }
.sclose{ cursor:pointer; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.16em;
  color:rgba(236,232,225,.5); border:1px solid rgba(236,232,225,.14); border-radius:0; padding:7px 9px; background:none; }
.modes{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:16px; }
.modec{ cursor:pointer; border:1px solid rgba(236,232,225,.1); background:var(--panel2); border-radius:0;
  padding:13px; text-align:center; transition:border-color .25s; }
.modec.on{ border-color:rgba(230,50,43,.6); background:rgba(230,50,43,.07); }
.modec .sw{ display:inline-block; width:34px; height:34px; border-radius:50%;
  background:radial-gradient(circle at 35% 30%, #ece8e1 0%, #e6322b 32%, #a13228 60%, #1a0605 100%);
  box-shadow:0 0 14px rgba(230,50,43,.5); }
.modec .k{ display:block; margin-top:9px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9.5px; letter-spacing:.22em; color:var(--cream); }
.modec .s{ display:block; margin-top:3px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.08em; color:rgba(236,232,225,.4); }
.lgrid{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:12px;
  grid-auto-rows:max-content; align-content:start; }
.lookc{ cursor:pointer; border:1px solid rgba(236,232,225,.1); background:var(--panel2); border-radius:0;
  padding:6px; text-align:center; transition:border-color .25s; }
.lookc.on{ border-color:rgba(230,50,43,.6); box-shadow:0 0 16px rgba(230,50,43,.14); }
.lookc .thumb{ display:block; position:relative; width:100%; padding-top:133%; background:var(--bg); border-radius:0; overflow:hidden; }
.lookc .thumb img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:50% 14%; display:block; }
.lookc .nm{ margin-top:6px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.1em;
  color:rgba(236,232,225,.65); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.lookc.on .nm{ color:var(--tealHi); }
.vchip{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.12em; color:var(--ice);
  padding:8px 11px; border:1px solid rgba(230,50,43,.6); border-radius:0; background:rgba(230,50,43,.1); display:inline-block; }
.pillrow{ display:flex; gap:7px; flex-wrap:wrap; }
.pill6{ cursor:pointer; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px; letter-spacing:.16em;
  color:rgba(236,232,225,.5); padding:7px 10px; border:1px solid rgba(236,232,225,.14); border-radius:0;
  background:transparent; transition:border-color .25s; }
.pill6.on{ color:var(--ice); border-color:rgba(230,50,43,.6); background:rgba(230,50,43,.1); }
.pill6.on.alert{ color:var(--red); border-color:rgba(230,50,43,.55); background:rgba(230,50,43,.1); }
.acclock{ display:flex; align-items:center; gap:10px; margin-top:18px; padding:11px 13px; background:var(--panel2);
  border:1px solid var(--hair); border-radius:0; font-family:'JetBrains Mono',ui-monospace,monospace; }
.acclock .k{ font-size:9px; letter-spacing:.18em; color:rgba(236,232,225,.7); }
.acclock .s{ margin-left:auto; font-size:8.5px; letter-spacing:.06em; color:rgba(236,232,225,.35); }

/* ---------- nav ---------- */
/* SEVEN tabs now — FLEET joined, then OS (Step 10). At a 390px viewport that
   is ~54px a column; the label is 7.5px mono and the longest word (TODAY,
   FLEET) is five letters, so every label still fits on one line. The class
   keeps its old name — renaming it buys nothing and touches every screen. */
.nav6{ position:relative; z-index:2; flex:none; display:grid; grid-template-columns:repeat(7,1fr);
  background:rgba(8,8,9,.94); border-top:1px solid var(--hair);
  padding:8px 6px calc(14px + env(safe-area-inset-bottom)); }
.navi{ cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:5px; padding-top:8px;
  position:relative; background:none; border:none; }
.navi .tick{ position:absolute; top:0; width:18px; height:2px; border-radius:0; background:var(--tealHi);
  box-shadow:0 0 8px rgba(230,50,43,.8); opacity:0; }
.navi.on .tick{ opacity:1; }
.navi .lb{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:7.5px; letter-spacing:.1em; color:rgba(236,232,225,.42); }
.navi.on .lb{ color:var(--tealHi); }

/* ---------- OS (Step 10) — the Churlish OS launcher chrome ---------- */
.oshero{ margin-top:18px; width:100%; cursor:pointer; text-align:left; display:grid;
  grid-template-columns:1fr auto; gap:4px 12px; padding:16px; border-radius:0;
  background:linear-gradient(180deg, rgba(230,50,43,.10), rgba(14,14,17,.9));
  border:1px solid rgba(230,50,43,.35); color:var(--cream); font-family:inherit; }
.oshero .k{ font-size:11px; letter-spacing:.24em; color:var(--ice); }
.oshero .l{ grid-column:1; font-size:14px; line-height:1.4; color:var(--dim); }
.oshero .u{ grid-column:1; font-size:8.5px; letter-spacing:.1em; color:rgba(236,232,225,.3); overflow-wrap:anywhere; }
.oshero .go{ grid-column:2; grid-row:1 / span 3; align-self:center; font-size:10px; letter-spacing:.2em;
  color:var(--tealHi); padding:8px 10px; border:1px solid rgba(230,50,43,.35); border-radius:0; }
.osgrid{ margin-top:10px; display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.oslink{ cursor:pointer; text-align:left; display:flex; flex-direction:column; gap:5px; padding:12px;
  border-radius:0; background:var(--panel); border:1px solid var(--hair2); color:var(--cream); min-width:0; font-family:inherit; }
.oslink .k{ font-size:9.5px; letter-spacing:.18em; color:rgba(236,232,225,.85); }
.oslink .l{ font-size:12.5px; line-height:1.35; color:var(--dim); }
.oslink .u{ font-size:8.5px; letter-spacing:.08em; color:rgba(230,50,43,.6); }
.oshero:active, .oslink:active{ border-color:var(--tealHi); }
.osnote .hd{ font-size:9px; letter-spacing:.22em; color:rgba(230,50,43,.85); margin-bottom:6px; }
.osrow{ display:flex; gap:10px; align-items:baseline; padding:7px 0; border-top:1px solid var(--hair); }
.osrow .k{ flex:none; width:56px; font-size:8.5px; letter-spacing:.16em; color:rgba(236,232,225,.45); }
.osrow .v{ font-size:13px; line-height:1.4; color:var(--dim); }
.chipv6.fill{ border-style:dashed; }

/* ---------- boot (unchanged shell) ---------- */
.boot{ position:absolute; inset:0; z-index:20; background:var(--bg); display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:10px; }
.boot.boot-out{ animation:bootOut .5s ease forwards; }
.boot .wm{ display:inline-block; font-family:'Barlow Condensed','Arial Narrow',sans-serif; font-weight:900; font-size:44px; letter-spacing:.01em; text-transform:uppercase; margin-top:12px; background:var(--red); color:#0a0707; padding:2px 16px; transform:skewX(-7deg); }
.boot .ws{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.3em; color:rgba(236,232,225,.4); }
.wakeb{ margin-top:26px; cursor:pointer; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:10.5px; letter-spacing:.26em;
  text-transform:uppercase; color:#0a0707; background:var(--red); border:1px solid var(--red);
  font-weight:700; border-radius:0; padding:14px 26px; }
.corezone{ position:relative; display:flex; align-items:center; justify-content:center; height:200px; width:220px; }
.ring-out{ position:absolute; border-radius:50%; border:1px dashed rgba(230,50,43,.28); animation:evespin 26s linear infinite; }
.ring-in{ position:absolute; border-radius:50%; border:1px solid rgba(161,50,40,.4);
  border-top-color:transparent; border-bottom-color:transparent; animation:evespinrev 14s linear infinite; }
.ring-think{ position:absolute; border-radius:50%; border:2px solid transparent; border-top-color:#e6322b; animation:evespin 1.1s linear infinite; }
.rip{ position:absolute; border-radius:50%; border:1px solid rgba(230,50,43,.5); animation:everipple 1.8s ease-out infinite; }
.rip.rip2{ border-color:rgba(230,50,43,.35); animation-delay:.9s; }
.core{ position:relative; border-radius:50%; animation:evebreathe 5.5s ease-in-out infinite;
  display:flex; align-items:center; justify-content:center; gap:4px; }
.wave{ width:4px; height:18px; border-radius:0; background:#ece8e1; animation:evewave .9s ease-in-out infinite; }
.alert .ring-out{ border-color:rgba(230,50,43,.28); }
.alert .ring-in{ border-color:rgba(230,50,43,.4); border-top-color:transparent; border-bottom-color:transparent; }

/* ============================================================
   THE DISPATCHER (P1-P4, 2026-09-06). Every colour below comes
   from a token or from a value already in this file. FAILED and
   "needs you" wear --gold, never --red: red is the RED confirm
   tier and the live mic, and a failed job is neither. --green is
   still the WIRE autonomy dot and nothing else.
   ============================================================ */

/* the brief: whatever /state served, whole, with her own breaks */
.briefv7{ white-space:pre-wrap; }
.briefv7 b{ color:var(--cream); }
.briefv7 code{ font-family:'JetBrains Mono',ui-monospace,monospace; font-size:.9em; color:var(--ice); }
.briefstamp{ margin-top:8px; font-size:8.5px; letter-spacing:.16em; color:rgba(236,232,225,.4); }

/* P7: one sentence naming the failure, under the status bar */
.linkbar{ flex:none; padding:6px 18px 0; font-size:9px; letter-spacing:.08em; color:var(--gold); }

/* the dispatch four */
.four6{ display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:12px; }
.f6{ background:var(--panel); border:1px solid var(--hair); border-radius:0; padding:9px 6px; text-align:center; }
.f6 .fv{ display:block; font-family:'Barlow Condensed','Arial Narrow',sans-serif; font-weight:700; font-size:26px; line-height:1; color:var(--cream); }
.f6 .fk{ display:block; margin-top:4px; font-size:7.5px; letter-spacing:.1em; color:rgba(236,232,225,.5); }
.f6.acc .fv{ color:var(--ice); }
.f6.hot{ border-color:rgba(200,150,10,.35); }
.f6.hot .fv{ color:var(--gold); }
.f6.red{ border-color:rgba(230,50,43,.4); }
.f6.red .fv{ color:var(--red); }
.f6.off .fv{ color:rgba(236,232,225,.32); }

/* a job row, and the detail it opens onto */
.jobwrap{ display:flex; flex-direction:column; }
.jobrow6.jhead{ width:100%; cursor:pointer; text-align:left; font:inherit; color:inherit; }
.jobwrap.open .jobrow6{ border-bottom-left-radius:0; border-bottom-right-radius:0; border-bottom-color:transparent; }
.jage{ flex:none; font-size:8.5px; letter-spacing:.06em; color:rgba(236,232,225,.42); }
.jdet{ background:var(--panel2); border:1px solid var(--hair); border-top:none;
  border-radius:0; padding:12px 14px; display:flex; flex-direction:column; gap:6px; }
.jkv{ display:flex; gap:10px; font-size:9.5px; letter-spacing:.06em; color:rgba(236,232,225,.72); word-break:break-word; }
.jkv b{ flex:none; width:74px; font-weight:400; letter-spacing:.12em; color:rgba(236,232,225,.45); }
.jres{ margin-top:2px; white-space:pre-wrap; word-break:break-word; font-size:10px; line-height:1.5;
  color:rgba(236,232,225,.68); background:rgba(8,8,9,.6); border:1px solid var(--hair);
  border-radius:0; padding:9px 10px; max-height:260px; overflow:auto; }

/* what she brought back, off the attention item */
.wide6{ width:100%; margin-top:8px; text-align:center; }
.deliv6{ margin-top:8px; white-space:pre-wrap; word-break:break-word; font-size:12px; line-height:1.55;
  color:rgba(236,232,225,.78); background:var(--panel2); border:1px solid var(--hair);
  border-radius:0; padding:12px 13px; max-height:340px; overflow:auto; }

/* ---------- the fleet ---------- */
.fmeta{ display:flex; flex-wrap:wrap; gap:4px 14px; margin-top:10px; font-size:8.5px;
  letter-spacing:.12em; color:rgba(236,232,225,.5); }
.dispunit{ font-size:9px; letter-spacing:.16em; color:rgba(230,50,43,.85); }
.dispbox{ width:100%; margin-top:10px; min-height:76px; resize:none; }
.dsay{ margin-top:11px; border-left:2px solid var(--hair2); padding-left:11px; }
.dsay.ok{ border-left-color:var(--tealHi); }
.dsay.no{ border-left-color:var(--gold); }
.dsay .k{ font-size:8.5px; letter-spacing:.14em; color:rgba(236,232,225,.55); }
.dsay.ok .k{ color:var(--tealHi); }
.dsay.no .k{ color:var(--gold); }
.dsay .s{ margin:5px 0 8px; font-size:12.5px; line-height:1.5; color:var(--cream); }
.altrow{ display:flex; flex-wrap:wrap; gap:7px; margin-top:7px; }

.ugrid{ display:flex; flex-direction:column; gap:8px; }
.ucard{ background:var(--panel); border:1px solid var(--hair); border-radius:0; padding:12px 13px; }
.ucard.future{ border:1px dashed rgba(236,232,225,.14); background:transparent; }
.ucard.picked{ border-color:rgba(230,50,43,.5); background:rgba(230,50,43,.05); }
.utop{ display:flex; align-items:center; gap:10px; }
.ucode{ flex:none; width:28px; height:28px; border-radius:0; background:rgba(230,50,43,.08);
  border:1px solid rgba(230,50,43,.22); color:var(--tealHi); font-size:9.5px; letter-spacing:.06em;
  display:flex; align-items:center; justify-content:center; }
.uname{ flex:1; min-width:0; font-weight:600; font-size:13.5px; color:var(--cream); }
.udot{ flex:none; font-size:10px; color:rgba(236,232,225,.3); }
.udot.live{ color:var(--tealHi); animation:evebreathe 2.2s ease-in-out infinite; }
.udot.ready{ color:var(--teal); }
.udot.idle{ color:rgba(236,232,225,.4); }
.urole{ display:block; width:100%; margin-top:7px; cursor:pointer; text-align:left; font:inherit;
  background:none; border:none; padding:0; font-size:12px; line-height:1.5; color:rgba(236,232,225,.66);
  overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.urole.open{ -webkit-line-clamp:unset; display:block; }
.umeta{ display:flex; flex-wrap:wrap; gap:5px 10px; margin-top:9px; font-size:8px;
  letter-spacing:.1em; color:rgba(236,232,225,.5); }
.ubadge{ border-radius:0; padding:3px 6px; border:1px solid rgba(236,232,225,.16); }
.ubadge.run{ color:var(--tealHi); border-color:rgba(230,50,43,.35); background:rgba(230,50,43,.08); }
.ubadge.no{ color:rgba(236,232,225,.45); }
.ustat{ align-self:center; }
.ustat.run{ color:var(--tealHi); }
.ustat.gold{ color:var(--gold); }
.tred{ color:var(--red); }
.utrig{ margin-top:8px; font-size:8.5px; letter-spacing:.06em; line-height:1.6; color:rgba(236,232,225,.45); }
.usend{ width:100%; margin-top:10px; text-align:center; }
.ucard .clocked{ margin:10px 0 0; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:8.5px;
  letter-spacing:.12em; text-transform:uppercase; line-height:1.4; text-align:center;
  border-radius:0; padding:8px 11px; color:rgba(236,232,225,.62);
  border:1px dashed rgba(236,232,225,.3); }
/* ============================================================
   PAIRING + THE KEY CARD (2026-09-06). His token stopped
   shipping inside the bundle; this is the screen where he hands
   it over once, and the WIRE card where he rotates or erases it.

   COLOUR LAW, HELD: no --red anywhere below. Red is the RED
   confirm tier and the live mic, and a mistyped token is
   neither. A pairing failure wears --gold — the same colour
   .linkbar already uses for "her brain refused this token"
   under the status bar. Teal is the accent, as everywhere else.
   Every value here is a token or a value already in this file.
   ============================================================ */

.pairscr{ position:relative; z-index:2; flex:1; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch;
  display:flex; flex-direction:column; align-items:center;
  padding:calc(26px + env(safe-area-inset-top)) 18px calc(26px + env(safe-area-inset-bottom)); }
.pairwm{ display:inline-block; font-family:'Barlow Condensed','Arial Narrow',sans-serif; font-weight:900; font-size:36px; letter-spacing:.01em;
  text-transform:uppercase; line-height:1; margin-top:4px; background:var(--red); color:#0a0707; padding:2px 14px; transform:skewX(-7deg); }
.pairws{ margin-top:6px; font-size:8.5px; letter-spacing:.28em; color:rgba(236,232,225,.4); text-align:center; }
.pairbox{ width:100%; max-width:420px; margin-top:24px; background:var(--panel); border:1px solid var(--hair);
  border-radius:0; padding:16px;
  box-shadow:inset 0 1px 0 rgba(236,232,225,.04), inset 0 0 26px rgba(230,50,43,.04), 0 10px 26px rgba(0,0,0,.35); }
.pairh{ margin:12px 0 0; font-family:'Barlow Condensed','Arial Narrow',sans-serif; font-weight:700; font-size:34px;
  line-height:1; letter-spacing:.01em; color:var(--cream); }
.pairlede{ margin:9px 0 0; font-size:13.5px; line-height:1.5; color:var(--dim); text-wrap:pretty; }
.pairmig{ margin-top:12px; font-size:8.5px; letter-spacing:.1em; line-height:1.7; color:var(--gold);
  border:1px dashed rgba(200,150,10,.4); border-radius:0; padding:9px 10px; }
.pairlab{ margin-top:16px; font-size:8.5px; letter-spacing:.22em; color:rgba(230,50,43,.85); }
.pairurl{ margin-top:5px; font-size:10px; letter-spacing:.02em; line-height:1.4; color:rgba(236,232,225,.5);
  word-break:break-all; }
.pairin{ width:100%; margin-top:6px; background:var(--panel2); border:1px solid var(--hair2); border-radius:0;
  padding:13px 12px; color:var(--cream); font-family:'JetBrains Mono',ui-monospace,monospace; font-size:14px; letter-spacing:.18em;
  caret-color:var(--tealHi); outline:none; }
.pairin:focus{ border-color:rgba(230,50,43,.55); }
.pairin::placeholder{ color:rgba(236,232,225,.28); letter-spacing:.06em; }
.pairchars{ margin-top:7px; font-size:8.5px; letter-spacing:.16em; color:rgba(236,232,225,.4); }
.pairerr{ margin-top:12px; display:block; border:1px solid rgba(200,150,10,.45); border-radius:0;
  background:rgba(200,150,10,.06); padding:11px 12px; }
.pairerr .k{ display:block; font-size:9px; letter-spacing:.24em; color:var(--gold); }
.pairerr .s{ display:block; margin-top:6px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:13px; letter-spacing:0;
  line-height:1.45; color:var(--cream); }
.pairerr .d{ display:block; margin-top:6px; font-size:8.5px; letter-spacing:.1em; line-height:1.5;
  color:rgba(236,232,225,.5); }
.pairbtn{ width:100%; margin-top:16px; cursor:pointer; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:10.5px;
  letter-spacing:.26em; text-transform:uppercase; font-weight:700; color:#0a0707; background:var(--red);
  border:1px solid var(--red); border-radius:0; padding:14px 20px; }
.pairbtn:disabled{ opacity:.4; cursor:default; }
.pairback{ width:100%; margin-top:9px; cursor:pointer; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9px; letter-spacing:.2em;
  text-transform:uppercase; color:var(--cream); background:transparent; border:1px solid var(--hair2); border-radius:0;
  padding:12px 20px; }
.pairfoot{ margin-top:16px; font-size:8.5px; letter-spacing:.1em; line-height:1.7;
  color:rgba(236,232,225,.28); }

/* the key card on WIRE — masked confirmation, rotate, erase */
.keycard .hd{ font-size:9px; letter-spacing:.22em; color:rgba(230,50,43,.85); }
.keyrow{ display:flex; align-items:baseline; gap:10px; margin-top:11px; }
.keyrow .k{ flex:none; width:76px; font-size:8.5px; letter-spacing:.16em; color:rgba(236,232,225,.4); }
.keyrow .v{ flex:1; min-width:0; font-size:9.5px; letter-spacing:.12em; line-height:1.5;
  color:rgba(236,232,225,.62); }
.keyrow .v.on{ color:var(--tealHi); }
.keyrow .v.brainurl{ letter-spacing:.02em; word-break:break-all; }
.keybtns{ display:flex; gap:8px; margin-top:15px; }
.keyb{ flex:1; cursor:pointer; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:9.5px; letter-spacing:.16em;
  color:var(--ice); background:rgba(230,50,43,.05); border:1px solid rgba(230,50,43,.28);
  border-radius:0; padding:11px 9px; }
.keyb.out{ color:var(--gold); background:rgba(200,150,10,.05); border-color:rgba(200,150,10,.35); }
`;
