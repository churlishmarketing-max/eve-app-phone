// owner: stream S2
//
// Scenarios, one per state the deck has to be able to prove:
//   deck            — the hero board, calm queue
//   deck-offline    — her brain unreachable: shells, DOWN light, no fake zeros
//   deck-streaming   — mid-turn: his line, her partial line, the ▌ cursor
//   deck-alert      — a RED confirm waiting, rendered WITHOUT the modal so the
//                     deck underneath is visible (the modal has its own shot,
//                     and it is S3's)
//   nav-deck        — the nav strip with DECK lit (the default destination)
//   nav-body        — view "body": the BODY pane in the data column, BODY lit
//   nav-settings    — view "settings": the full-frame wire, WIRE lit, and the
//                     proof the strip survives the pane that unmounts the rail
//   nav-probe       — NOT a fixture: the real <App/>, driven by real DOM events,
//                     with the result rendered into the frame (see NavProbe)
//
// Deck is pure presentation, so every one of these except nav-probe is a
// fixture plus props — no poll, no greeting seed, no bridge round-trip. The
// clock is PINNED to the design's mock instant (SAT 29 AUG 14:07) so a shot can
// be diffed against design-reference/A-deck.html line for line; the live app
// runs a real clock.

import { useEffect, useRef, useState } from "react";
import type { EveState } from "@shared/contract";
import {
  mockDispatchJobs,
  mockFleet,
  mockFleetV2,
  mockJobConfirm,
  mockJobFailedItem,
  mockState,
  mockVitals,
} from "@shared/fixtures";
import App from "../deck/App";
import Deck, { type DeckProps } from "../deck/Deck";
import type { DeckMsg, EveMode } from "../deck/types";

const PINNED = new Date(2026, 7, 29, 14, 7, 0);

function base(over: Partial<DeckProps> = {}): DeckProps {
  const state: EveState = { ...mockState(), pendingConfirms: [] };
  return {
    now: PINNED,
    sessionNo: 23,
    state,
    fetchedAt: PINNED.toISOString(),
    refresh: async () => undefined,
    chat: { messages: [], streamingId: null, mode: "idle", toolNote: null, errNote: null, busy: false },
    mode: "idle" as EveMode,
    transientNote: null,
    wardrobe: { name: "AUTHORITY", url: null, prevUrl: null, changedCaption: null },
    plateMode: null,
    voiceName: "Rachel",
    silentAtDesk: false,
    quietHours: false,
    view: "deck",
    closetOpen: false,
    vitals: mockVitals(1),
    onSend: () => undefined,
    onConfirmResolved: () => undefined,
    onToggleSilent: () => undefined,
    onOpenWardrobe: () => undefined,
    onCloseWardrobe: () => undefined,
    onView: () => undefined,
    onDispatchUnit: () => undefined,
    ...over,
  };
}

// THE CORE's boards carry the P1 v0.1 fleet block (CONTRACT-v0.1 §2) on top of
// the canonical mock state: mockState() itself is untouched, because the
// EVE_MOCK brain answering the live app must keep answering exactly as every
// earlier receipt was judged. "core-fleet-nofleet" below is the board WITHOUT
// it — the honest no-answer state an older brain produces.
function coreState(over: Partial<EveState> = {}): EveState {
  return { ...mockState(), pendingConfirms: [], fleet: mockFleet(), ...over };
}

// The dispatcher's state: one job per status (in_approvals · queued · running
// · done · failed), the failed one's job_failed attention item, and the RED
// send card the in_approvals one is waiting on, linked both ways by id.
function dispatchState(): EveState {
  const base = mockState();
  return {
    ...base,
    fleet: mockFleet(),
    jobs: mockDispatchJobs(),
    jobsWindow: { hours: 24, limit: 50 },
    attentionItems: [...(base.attentionItems ?? []), mockJobFailedItem()],
    pendingConfirms: [mockJobConfirm()],
  };
}

// v0.2 — the dispatcher's state with the fleet block the brain serves since
// his skills became units (mockFleetV2: the brain's own rows, 56 / 42 / 9).
function fleetState(): EveState {
  return { ...dispatchState(), fleet: mockFleetV2() };
}

const STREAM: DeckMsg[] = [
  { id: "u1", role: "you", text: "Who's gone quiet?" },
  {
    id: "e1",
    role: "eve",
    text: "Rustic Lumber — 12 days, cadence is 7. I drafted Zach an update yesterday; it's sitting in approvals.",
  },
];

export const scenarios: Record<string, () => JSX.Element> = {
  deck: () => <Deck {...base()} />,

  "deck-offline": () => <Deck {...base({ state: { online: false }, fetchedAt: null, vitals: null })} />,

  "deck-streaming": () => (
    <Deck
      {...base({
        chat: {
          messages: STREAM,
          streamingId: "e1",
          mode: "thinking",
          toolNote: null,
          errNote: null,
          busy: true,
        },
        mode: "thinking",
      })}
    />
  ),

  "deck-alert": () => <Deck {...base({ state: mockState(), mode: "alert" })} />,

  // THE INLINE VARIANT OF THE RED CARD, WHICH NOTHING EVER PHOTOGRAPHED.
  // "deck-alert" above turns the rail red but leaves chat.messages empty, so
  // the card it is named after never renders; the confirm/summon keys in
  // s3-scenarios cover the modal and summon variants only. ConfirmCard's three
  // variants do not differ by CLASS — they differ by the GROUND behind them,
  // and inline is the only variant with no plate of its own (the .confirmv6
  // gradient's second stop is rgba(--rgbPanel,0), i.e. fully transparent, so
  // the talk column shows through). That is a distinct contrast case and it
  // had no receipt. Real Deck, real TalkColumn, real ConfirmCard, real fixture.
  "deck-alert-inline": () => (
    <Deck
      {...base({
        state: mockState(),
        mode: "alert",
        chat: {
          messages: [
            ...STREAM,
            {
              id: "e2",
              role: "eve",
              text: "Here it is — say the word.",
              confirms: mockState().pendingConfirms,
            },
          ],
          streamingId: null,
          mode: "alert",
          toolNote: null,
          errNote: null,
          busy: false,
        },
      })}
    />
  ),

  // ---- the nav strip, one shot per lit destination -------------------------
  // Deck is presentational, so `view` alone drives which segment burns; there
  // is no click to simulate. CLOSET has no fixture shot of its own because the
  // wardrobe panel is App.tsx's sibling overlay, not a child of Deck — it
  // cannot be reached from a DeckProps fixture. nav-probe below reaches it.
  "nav-deck": () => <Deck {...base()} />,

  "nav-body": () => <Deck {...base({ view: "body" })} />,

  "nav-settings": () => <Deck {...base({ view: "settings" })} />,

  "nav-core": () => <Deck {...base({ view: "core" })} />,

  // ---- THE CORE, the hybrid overview --------------------------------------
  // Rendered through the REAL <Deck/> and the real `view` branch, not through a
  // stand-in, so every capture also proves the title bar, the nav strip, .scan
  // and .vig survive the pane that unmounts the three-column grid.
  //
  // These run CoreScreen, which means the /health call and the session log are
  // the live code paths (under EVE_MOCK, health resolves to mockHealth() —
  // fleet.count 24). Nothing on these boards is a hand-written figure.

  // The hero board: calm queue, two jobs in flight, the wire 8 of 10.
  core: () => <Deck {...base({ view: "core", state: coreState() })} />,

  // HER BRAIN UNREACHABLE. Every counter dashes, the fleet header says SOURCE
  // DOWN, the telemetry LINK cell says DOWN, and the command bar refuses to
  // pretend it can send. No zeroes anywhere.
  "core-offline": () => (
    <Deck {...base({ view: "core", state: { online: false }, fetchedAt: null, vitals: null })} />
  ),

  // A RED CONFIRM WAITING: the orb goes to .orb.red, the RED rung of the
  // clearance ladder lights, and RED WAITING reads 1 in --redInk. This is the
  // only board where anything on this screen is red.
  "core-red": () => (
    <Deck {...base({ view: "core", state: coreState({ pendingConfirms: mockState().pendingConfirms }), mode: "alert" })} />
  ),

  // SHE IS SPEAKING: the 28-bar waveform is the only board it appears on,
  // because it renders only while she is actually speaking or the mic is open.
  "core-speaking": () => (
    <Deck
      {...base({
        view: "core",
        state: coreState(),
        mode: "speaking",
        chat: {
          messages: STREAM,
          streamingId: "e1",
          mode: "speaking",
          toolNote: null,
          errNote: null,
          busy: true,
        },
      })}
    />
  ),

  // THE FLEET IS MOSTLY NAME-ONLY. Nothing is dispatched, so the runnable
  // units read IDLE (or NEEDS WIRING — Pennyworth with the OS unwired) — and
  // the header states the gap out loud: N REGISTERED, 5 DISPATCHABLE, both
  // computed from the fleet block's array. One dashed card carries the rest
  // with a REAL numeral. The strip must read truthfully here or it does not
  // read truthfully anywhere.
  "core-nameonly": () => <Deck {...base({ view: "core", state: coreState({ jobs: [] }) })} />,

  // ---- P1 v0.1: the dispatcher's hub -------------------------------------
  // ONE JOB PER STATUS + A FLEET BLOCK. The chips on the strip read the jobs
  // (Pennyworth NEEDS YOU, Research RUNNING, Suicide Squad 1 HELD, JSA DONE
  // 24H, Justice League FAILED 24H), THE WIRE's four rows read 1 / 1 / 1 / 1,
  // the JOBS rail lists all five newest-first, and the session log's mount
  // line states the 24 h list's own numbers. RED WAITING is 1 because the
  // send card is pending; the failed job is GOLD everywhere, never red.
  "core-jobs": () => <Deck {...base({ view: "core", state: dispatchState() })} />,

  // THE ONE NEW SURFACE. The in_approvals pennyworth job is open in the centre
  // column: his sentence verbatim, who she picked and why, the [BRAIN] badge,
  // the four-station timeline, NEXT: RED, the OS draft, and the RED send card
  // INLINE — the shipped ConfirmCard, inline variant, not a second renderer.
  // Nothing is approved here; the card is photographed, not answered.
  "core-job-detail": () => <Deck {...base({ view: "core", state: dispatchState(), coreJobId: "job-pw-1" })} />,

  // NO FLEET BLOCK ON THE WIRE. The canonical mock state has no `fleet` key —
  // exactly what an older brain (or a failed roster read) serves. The header
  // says NO ANSWER YET, the tag says the block was not on this answer, one
  // dashed card says why, and the FLEET readout is a dash. No zero anywhere.
  "core-fleet-nofleet": () => <Deck {...base({ view: "core" })} />,

  // ---- P1 v0.2: skills are units; the FLEET tab -----------------------------
  // THE FLEET TAB (key 6). Every unit on the v0.2 fleet block (56 against the
  // bundled roster: 42 RUNNABLE, 14 WORKSPACE ONLY, 9 pinned, kinds 4/1/37 —
  // all computed from the array), division-grouped, one row each: dot, name +
  // dispatch key, badge + kind · tier, job, triggers, state + last run, the
  // PIN toggle, and DISPATCH for a RUNNABLE unit / NO RUNNER for the rest.
  // Pins are the brain's default here (a throwaway profile holds no local
  // overrides). The dispatch jobs light research / pennyworth / suicide-squad
  // / jsa / justice-league exactly as core-jobs does.
  "fleet-tab": () => <Deck {...base({ view: "fleet", state: fleetState() })} />,

  // THE CORE WITH THE PINNED CARDS. The same v0.2 block: the strip draws the
  // pinned units — nine on the wire, capped at eight, runnable first then by
  // activity (research RUNNING, pennyworth NEEDS YOU, then the idle pins in
  // the brain's order; jimmy-olsen, last of the nine, is the one not drawn) —
  // and the "+N ON ROSTER" card is the door to the FLEET tab, its numeral the
  // real remainder. Everything under the strip is core-jobs, unchanged.
  "core-pinned": () => <Deck {...base({ view: "core", state: fleetState() })} />,

  // THE CORE'S COMMAND BAR PREFILLED — what a FLEET row's DISPATCH leaves
  // behind: "dispatch starfire: " in the box, focused, nothing sent.
  "core-prefill": () => (
    <Deck {...base({ view: "core", state: fleetState(), corePrefill: { text: "dispatch starfire: ", seq: 1 } })} />
  ),

  // THE DECK'S OPS PANE WITH THE DISPATCHER'S STATE: the job_failed attention
  // item renders as an approval-inbox row (glyph "!", JOB FAILED · N1), and
  // JOBS IN FLIGHT lists the three in-flight rows only — done and failed are
  // filtered out, because jobs[] is a 24 h list now, not an in-flight list.
  "deck-jobs": () => <Deck {...base({ state: dispatchState() })} />,

  "nav-probe": () => {
    holdShutter();
    return <NavProbe />;
  },
};

// ---------------------------------------------------------------------------
// NAV PROBE — the behavioural half of this stream's verification.
//
// The three fixture shots above prove the strip DRAWS the right lit segment for
// a given `view`. They cannot prove that clicking it, or pressing its keycap,
// goes anywhere: Deck is presentational, and the router (Deck.tsx's `go`) plus
// the key handlers (App.tsx) live above it.
//
// So this scenario mounts the real <App/>, drives it with real DOM events, and
// renders what happened. The PNG is the evidence — every line in the ledger is
// an assertion that ran through the shipped code path, not a claim about it.
//
// Under EVE_MOCK the fixtures ship a pending RED confirm, which is convenient:
// the first steps prove the top rung of the keyboard chain — a RED card on
// screen owns the keyboard, and nothing navigates out from under it — before
// cancelling it (mocked, no network: electron/api.ts:152) and testing the rest.
// ---------------------------------------------------------------------------

interface Step {
  name: string;
  want: string;
  got: string;
  pass: boolean;
}

/** The lit segment's text, e.g. "1DECK". "(none)" when nothing is lit. */
function lit(): string {
  const el = document.querySelector(".navseg.on");
  return el ? (el.textContent ?? "").replace(/\s+/g, "") : "(none)";
}

function press(key: string, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function click(sel: string): string {
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) return "missing";
  el.click();
  return "clicked";
}

const has = (sel: string): string => (document.querySelector(sel) ? "yes" : "no");
const settle = (ms = 90): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Hold the shutter open. deck.main.tsx's ShotHost sets window.__RENDER_DONE on
// the frame after mount and electron/main.ts captures 250ms later — long before
// a multi-second sequence finishes. Redefining the property as a getter over
// our own flag swallows that write, so the capture happens when the probe says
// it may and not a frame earlier. Only this scenario does it.
let shutterOpen = false;
function holdShutter(): void {
  if (Object.getOwnPropertyDescriptor(window, "__RENDER_DONE")?.get) return;
  Object.defineProperty(window, "__RENDER_DONE", {
    configurable: true,
    get: () => shutterOpen,
    set: () => undefined,
  });
}

function NavProbe(): JSX.Element {
  const [steps, setSteps] = useState<Step[]>([]);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      const out: Step[] = [];
      const rec = (name: string, want: string, got: string) => {
        out.push({ name, want, got, pass: want === got });
      };

      await settle(500); // let App's first poll answer and the modal mount

      // --- the top rung: a RED card owns the keyboard ---------------------
      rec("a RED confirm is on screen", "yes", has(".confirm-modal-wrap"));
      press("2");
      await settle();
      rec("key 2 while RED is pending", "1DECK", lit());
      press("Escape");
      await settle();
      rec("Esc while RED is pending", "1DECK", lit());

      rec("cancel the RED card", "clicked", click(".confirm-modal-wrap .cbtn.gh"));
      await settle(5600); // ConfirmCard holds the resolved card for 5s
      rec("RED card cleared", "no", has(".confirm-modal-wrap"));

      // --- every destination, by click ------------------------------------
      const segs = Array.from(document.querySelectorAll(".navseg")) as HTMLElement[];
      rec(
        "the nav names four destinations",
        "1DECK|2BODY|3CLOSET|4WIRE",
        segs.map((s) => (s.textContent ?? "").replace(/\s+/g, "")).join("|"),
      );

      segs[1]?.click();
      await settle();
      rec("click BODY", "2BODY", lit());
      rec("  · BODY pane took the data column", "no", has(".bodystrip"));

      segs[3]?.click();
      await settle();
      rec("click WIRE", "4WIRE", lit());
      rec("  · full-frame wire mounted", "yes", has(".panewrap"));
      rec("  · nav survives the pane that unmounts the rail", "4", String(document.querySelectorAll(".navseg").length));

      segs[2]?.click();
      await settle();
      rec("click CLOSET", "3CLOSET", lit());
      rec("  · wardrobe panel open", "yes", has(".wardrobe-scrim"));

      segs[0]?.click();
      await settle();
      rec("click DECK from the open closet", "1DECK", lit());
      rec("  · closet closed with it", "no", has(".wardrobe-scrim"));

      // --- every destination, by keycap -----------------------------------
      press("2");
      await settle();
      rec("key 2", "2BODY", lit());
      press("3");
      await settle();
      rec("key 3", "3CLOSET", lit());
      press("4");
      await settle();
      rec("key 4", "4WIRE", lit());
      press("1");
      await settle();
      rec("key 1", "1DECK", lit());

      // --- the typing guard ------------------------------------------------
      const ta = document.querySelector("textarea") as HTMLTextAreaElement | null;
      ta?.focus();
      if (ta) press("2", ta);
      await settle();
      rec("key 2 from inside the composer", "1DECK", lit());

      // --- the Esc chain, rungs 2 and 3 ------------------------------------
      press("3");
      await settle();
      press("Escape");
      await settle();
      rec("Esc closes the closet first", "1DECK", lit());
      rec("  · wardrobe gone", "no", has(".wardrobe-scrim"));

      press("2");
      await settle();
      press("Escape");
      await settle();
      rec("Esc returns a non-deck view to the deck", "1DECK", lit());

      // --- the two click targets that used to be invisible ------------------
      click(".pcard");
      await settle();
      rec("her portrait still opens the closet", "3CLOSET", lit());
      press("Escape");
      await settle();
      click(".bodystrip");
      await settle();
      rec("the BODY strip still opens the pane", "2BODY", lit());
      press("1");
      await settle();

      // --- geometry: the deck must not have been squeezed -------------------
      // The nav costs the columns nothing because it lives in the title bar.
      // These three assertions are what "nothing" means, measured rather than
      // asserted, at whatever EVE_SHOT_SIZE the harness asked for. Run last so
      // the layout has fully settled.
      const de = document.documentElement;
      rec(
        `no horizontal scroll at ${window.innerWidth}x${window.innerHeight}`,
        "0",
        String(Math.max(0, de.scrollWidth - de.clientWidth)),
      );
      const deck = document.querySelector(".deck") as HTMLElement | null;
      rec(
        "three columns + two rules still on the grid",
        "5",
        deck ? String(getComputedStyle(deck).gridTemplateColumns.split(" ").length) : "(no deck)",
      );
      const cap = document.querySelector(".bodyopen") as HTMLElement | null;
      const capCol = cap?.closest(".col") as HTMLElement | null;
      let capOn = "no";
      if (cap && capCol) {
        const c = cap.getBoundingClientRect();
        const k = capCol.getBoundingClientRect();
        capOn = c.right <= k.right + 1 && c.left >= k.left - 1 ? "yes" : "no";
      }
      rec("the BODY strip's OPEN cap is inside the column", "yes", capOn);

      setSteps(out);
      // Two frames so the ledger is painted before the shutter releases.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          shutterOpen = true;
        }),
      );
    })();
  }, []);

  const failed = steps.filter((s) => !s.pass).length;

  return (
    <>
      <App />
      {steps.length > 0 ? (
        <div
          style={{
            position: "fixed",
            inset: "40px 90px",
            zIndex: 20,
            overflow: "auto",
            padding: "18px 22px",
            borderRadius: 12,
            border: "1px solid rgba(28,185,200,.45)",
            background: "rgba(7,11,12,.96)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            lineHeight: 1.9,
            letterSpacing: ".04em",
            color: "rgba(240,237,232,.85)",
          }}
        >
          <div style={{ color: "var(--tealHi)", letterSpacing: ".2em", marginBottom: 10 }}>
            NAV PROBE — {steps.length - failed}/{steps.length} PASS
            {failed > 0 ? ` · ${failed} FAILED` : ""}
          </div>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              <span style={{ width: 40, flex: "none", color: s.pass ? "var(--tealHi)" : "var(--gold)" }}>
                {s.pass ? "PASS" : "FAIL"}
              </span>
              <span style={{ flex: 1 }}>{s.name}</span>
              <span style={{ flex: "none", color: "rgba(240,237,232,.45)" }}>
                want {s.want} · got {s.got}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
