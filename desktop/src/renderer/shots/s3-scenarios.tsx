// owner: stream S3
//
// "?shot=<key>" scenarios for confirm/settings/body/wardrobe. deck.main.tsx's
// resolveShot() + ShotHost already set window.__RENDER_DONE on the next
// frame and the shot harness (electron/main.ts EVE_SHOT_URL block) waits an
// extra 250ms after that before capturing — plenty of headroom for these
// components' own window.eve IPC fetches (backed by EVE_MOCK=1 fixtures) to
// resolve and paint. ShotWrap below sets the same flag again itself: cheap,
// idempotent, and keeps this file correct standalone if it is ever rendered
// through a path that does not already wrap it.
import { useEffect, useLayoutEffect } from "react";
import type { PendingConfirm } from "@shared/contract";
import { mockState } from "@shared/fixtures";
import ConfirmLayer from "../confirm/ConfirmLayer";
import SettingsPane from "../settings/SettingsPane";
import BodyPane from "../body/BodyPane";
import WardrobePanel from "../wardrobe/WardrobePanel";
// The REAL summon panel, not a restatement of it — see the confirm-in-a-world
// block at the bottom of this file.
import { SummonPanel, type SummonPanelProps } from "../summon/SummonApp";
// Stream V's key only — nothing else in this file is V's.
import VoicePicker from "../settings/VoicePicker";
// Stream T's keys only — nothing else in this file is T's.
import { applyTheme, THEMES, type ThemeId } from "../theme";
// FILING HANDS (DESK/S3). The REAL components with their data injected. These
// states — a half-failed batch, a 50-row card, a dry-run outcome — only occur
// with real files under the app, and none of them may be photographed by
// putting real files under the app. A mock-up of the card could not have caught
// the bidi bug and cannot catch the next one, so nothing here is a mock-up of a
// component: it is the shipped component holding invented data.
import FileBatchCard from "../desk/FileBatchCard";
import DeskSettings from "../desk/DeskSettings";
import DeskLogPanel from "../desk/DeskLogPanel";
import {
  SHOT_BATCHES,
  SHOT_ROOTS,
  SHOT_STATUS_ARMED,
  SHOT_STATUS_OFF,
  shotConfirm,
  shotDryRunOutcome,
  shotHalfFailedConfirm,
  shotHalfFailedOutcome,
  shotLargePayload,
  shotPayload,
  shotPreflight,
  shotPreflightSmall,
} from "../desk/shot-fixtures";

function ShotWrap({ children, flex = false }: { children: JSX.Element; flex?: boolean }) {
  useEffect(() => {
    let cancelled = false;
    const mark = () => {
      if (!cancelled) window.__RENDER_DONE = true;
    };
    requestAnimationFrame(() => requestAnimationFrame(mark));
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        // STREAM T: was the literal #030506. Same colour in TERMINAL, and now
        // the wrapper follows the world instead of staying black under PAPER.
        background: "var(--void)",
        display: "flex",
        flexDirection: flex ? "column" : undefined,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

const noop = () => {};

// ---------------------------------------------------------------------------
// THE THEME SYSTEM NEVER PHOTOGRAPHED THE CONFIRM LAYER.
//
// The four "theme-<id>" boards below exercise the token surface on a deck-like
// board, and the "confirm" / "confirm-sms" keys exercise the real card — but
// nothing crossed the two, so the app's HIGHEST-STAKES surface was the one
// surface no world had ever been shot in. That is exactly where the hardcoded
// #0C1417 plate hid: TERMINAL looked right, so the bug was invisible to the
// receipts. These keys close that hole.
//
// They render the REAL ConfirmLayer / ConfirmCard / SummonPanel components — a
// mock-up of the card could not have caught this bug and cannot catch the next
// one. The world is applied in a layout effect (before paint, well before
// ShotWrap flips __RENDER_DONE), so each capture is deterministic and needs no
// "?theme=" on the URL.
// ---------------------------------------------------------------------------
function InWorld({ id, children, flex }: { id: ThemeId; children: JSX.Element; flex?: boolean }) {
  useLayoutEffect(() => {
    applyTheme(id);
  }, [id]);
  return <ShotWrap flex={flex}>{children}</ShotWrap>;
}

const SUMMON_BASE: SummonPanelProps = {
  phase: "streaming",
  transcript: "eve, send zach the renewal numbers",
  reply: "",
  tool: null,
  confirm: null,
  note: null,
  error: null,
  typing: false,
  draft: "",
};

// The fixture confirm (gmail_send) — verbatim mock, not restated by hand.
const GMAIL_CONFIRM: PendingConfirm = mockState().pendingConfirms![0];

// No fixture covers send_sms (fixtures.ts only carries the gmail_send mock);
// the build spec asks this scenario to prove the disabled-approve law
// specifically, so this is a scenario-local test fixture, not asserted fact —
// the phone number is the standard US placeholder exchange (555).
const SMS_CONFIRM: PendingConfirm = {
  id: "confirm-mock-sms",
  kind: "send_sms",
  summary: "Text Zach that the renewal numbers are locked.",
  payload: {
    phoneNumber: "+1 512 555 0142",
    message: "Zach — numbers are locked. Sending the paperwork now.",
  },
  hash: "mock-hash-sms",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 35 * 60_000).toISOString(),
};

// ---------------------------------------------------------------------------
// STREAM T — the four worlds, each on a representative deck-like surface.
//
// Built out of the law classes in src/styles/eve-desktop.css directly rather
// than out of deck/**: those files belong to other streams this round, and a
// theme board only needs to exercise the tokens, not the deck's live wiring.
// Every colour on this board therefore arrives through a var() the theme files
// declare — which is the whole claim being photographed.
//
// The theme is applied in a layout effect (before the browser paints, and well
// before ShotWrap flips __RENDER_DONE), so a capture is deterministic.
//
// Nothing here is his data. Rows read SAMPLE, the floor reads offline in words
// rather than showing invented zeros, and no sentence is put in her mouth.
function ThemeBoard({ id }: { id: ThemeId }) {
  useLayoutEffect(() => {
    applyTheme(id);
  }, [id]);

  const meta = THEMES.find((t) => t.id === id)!;

  return (
    <div className="frame" style={{ width: "100%", height: "100%" }}>
      <div className="scan" />
      <div className="vig" />
      <div className="aura" />
      <div className="fbr tl" />
      <div className="fbr tr" />
      <div className="fbr bl" />
      <div className="fbr br" />

      <div className="tbar">
        <span>
          <i className="dot" /> EVE · {meta.name}
        </span>
        <span className="sesch">SESSION 0000</span>
      </div>

      <div className="deck" style={{ gridTemplateColumns: "264px 1px 1fr 1px 300px" }}>
        {/* rail */}
        <div className="col cant-left" style={{ padding: 16, gap: 12 }}>
          <div className="eyeb">
            <span>▸ HER</span>
            <span className="r">SAMPLE</span>
          </div>
          <div className="pcard" style={{ height: 150 }}>
            <div className="pc tl" />
            <div className="pc tr" />
            <div className="pc bl" />
            <div className="pc br" />
            <div className="pfr">
              <div className="sheen" />
              <div className="plateCore">
                <div className="orb" style={{ width: 74, height: 74 }} />
              </div>
            </div>
          </div>
          <div className="pbadge">
            <span className="wm">EVE</span>
            <span className="dv" />
            <span className="lk">CHIEF OF STAFF</span>
          </div>
          <div className="stateline">● ONLINE</div>
          <div className="stateline think">◇ THINKING</div>
          <div className="stateline listen">● LIVE MIC</div>
          <div className="divrow">
            <span className="l">WIRE</span>
            <span className="rule" />
            <span className="r">10</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span className="jcode">EV</span>
            <span className="jcode">SB</span>
            <span className="jcode">GM</span>
          </div>
          <div className="footline" style={{ marginTop: "auto" }}>
            {meta.source}
          </div>
        </div>
        <div className="vr" />

        {/* talk */}
        <div className="col" style={{ padding: 16, gap: 12 }}>
          <div className="eyeb">
            <span>▸ TALK</span>
            <span className="r">SAMPLE SURFACE — NOT A TRANSCRIPT</span>
          </div>
          <div className="bub eve">
            <div className="bname eve">EVE</div>
            <div className="btext">
              [ sample bubble — the shell never writes her lines ]<span className="cur">▍</span>
            </div>
          </div>
          <div className="bub you">
            <div className="bname you">YOU</div>
            <div className="btext">[ sample bubble ]</div>
          </div>
          <div className="confirmv6">
            <div className="hd">RED — NEEDS YOU</div>
            <div className="sum">Sample confirm card. Red is the tier and the mic, nothing else.</div>
            <div className="field">
              <b>TO</b>
              sample@example.com
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <span className="cbtn ok">APPROVE</span>
              <span className="cbtn gh">NOT NOW</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: "auto" }}>
            <span className="micv6 on">●</span>
            <span className="cmdinput" style={{ display: "block" }}>
              Sample composer.
            </span>
            <span className="sendb" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              ⏎
            </span>
          </div>
        </div>
        <div className="vr" />

        {/* data */}
        <div className="col cant-right" style={{ padding: 16, gap: 10 }}>
          <div className="eyeb">
            <span>▸ FLOOR</span>
            <span className="r">OFFLINE</span>
          </div>
          <div className="mini">
            <div className="k">SALES FLOOR</div>
            <div className="floorbig">
              —<em>/—</em>
            </div>
            <div className="fbars" style={{ marginTop: 8 }}>
              <span className="on" />
              <span className="on" />
              <span />
              <span />
              <span />
            </div>
            <div className="floorline">offline — she is not guessing</div>
          </div>
          <div className="t3row">
            <span className="idx">1</span>
            <span className="tt">SAMPLE ROW</span>
            <span className="tm">—</span>
          </div>
          <div className="t3row due">
            <span className="idx">2</span>
            <span className="tt">SAMPLE — DUE</span>
            <span className="tm due">DUE</span>
          </div>
          <div className="oprow">
            <span className="gl">◆</span>
            <span style={{ minWidth: 0 }}>
              <div className="tt">Sample job</div>
              <div className="sub">RUNNING</div>
            </span>
            <span className="acts">
              <span className="stat run">RUN</span>
            </span>
          </div>
          <div className="oprow">
            <span className="gl">◆</span>
            <span style={{ minWidth: 0 }}>
              <div className="tt">Sample ledger</div>
              <div className="sub">MONEY</div>
            </span>
            <span className="acts">
              <span className="stat gold">$—</span>
            </span>
          </div>
          <div className="node" style={{ marginTop: 4 }}>
            <div className="code">EV</div>
            <div className="nm">EVE Brain</div>
            <div className="role">reasoning core</div>
            <div className="st">● LIVE</div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
            <span className="chipv6">CHIP</span>
            <span className="chipv6 on">ON</span>
            <span className="kbd">ESC</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FILING HANDS — the shot harness for the desk UI.
//
// A stub bridge, not the live one: every desk component takes its IPC surface
// as an optional prop precisely so a capture is deterministic and never depends
// on what is (or is not) enrolled on the machine taking the picture. Under
// EVE_MOCK the live `window.eve.desk` answers with an empty, disarmed desk —
// which is the honest answer for a machine with filing off, and exactly the
// state these captures need NOT to be in.
// ---------------------------------------------------------------------------
const DESK_STUB = {
  roots: async () => SHOT_ROOTS,
  status: async () => SHOT_STATUS_ARMED,
  enroll: async () => ({ ok: false, refusal: "no folder picked" }),
  setRoot: async () => ({ ok: true }),
  arm: async () => ({ ok: true, enabled: true, killAccel: SHOT_STATUS_ARMED.killAccel ?? null }),
  kill: async () => ({ ok: true, enabled: false, killAccel: SHOT_STATUS_ARMED.killAccel ?? null, stopped: 0 }),
  preflight: async () => shotPreflightSmall(),
  cancel: async () => ({ ok: true }),
  undo: async () => ({
    ok: true,
    batchId: "",
    undoId: "",
    dryRun: false,
    restored: 0,
    refused: 0,
    failed: 0,
    items: [],
    removedDirs: [],
    complete: true,
  }),
  previewUndo: async () => DESK_STUB.undo(),
  undoSince: async () => [],
  log: async () => SHOT_BATCHES,
  outcome: async () => null,
  onProgress: () => () => {},
};

/**
 * Freezes transitions and animations for the capture (see the data-shot block
 * in desk.css). Without it the harness photographed `.cbtn`'s 250ms background
 * transition mid-flight: PUT THE 10 BACK measured 2.30:1 off the PNG and
 * 14.19:1 off the live DOM. The stylesheet was right; the camera was early. A
 * receipt has to be of the settled state or it is not a receipt.
 */
function NoMotion() {
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-shot", "desk");
    return () => document.documentElement.removeAttribute("data-shot");
  }, []);
  return null;
}

/** The modal chrome ConfirmLayer paints around a file batch, so a card capture
 *  is shot on the plate it actually lands on. */
function DeskModal({ children }: { children: JSX.Element }) {
  return (
    <>
      <NoMotion />
      <div className="confirm-scrim" />
      <div className="confirm-modal-wrap wide">{children}</div>
    </>
  );
}

/** The pane chrome for the two full-width desk panels. */
function DeskPane({ children }: { children: JSX.Element }) {
  return (
    <div className="panewrap" style={{ padding: 18 }}>
      <NoMotion />
      {children}
    </div>
  );
}

export const scenarios: Record<string, () => JSX.Element> = {
  confirm: () => (
    <ShotWrap>
      <ConfirmLayer confirms={[GMAIL_CONFIRM]} onResolved={noop} />
    </ShotWrap>
  ),

  "confirm-sms": () => (
    <ShotWrap>
      <ConfirmLayer confirms={[SMS_CONFIRM]} onResolved={noop} />
    </ShotWrap>
  ),

  // THE RED MODAL, IN EVERY WORLD. Real ConfirmLayer, real ConfirmCard, real
  // fixture payload — one key per theme so a regression in any one of them is a
  // diffable PNG rather than a thing somebody has to remember to click into.
  "confirm-terminal": () => (
    <InWorld id="terminal">
      <ConfirmLayer confirms={[GMAIL_CONFIRM]} onResolved={noop} />
    </InWorld>
  ),
  "confirm-neon": () => (
    <InWorld id="neon">
      <ConfirmLayer confirms={[GMAIL_CONFIRM]} onResolved={noop} />
    </InWorld>
  ),
  "confirm-paper": () => (
    <InWorld id="paper">
      <ConfirmLayer confirms={[GMAIL_CONFIRM]} onResolved={noop} />
    </InWorld>
  ),
  "confirm-amber": () => (
    <InWorld id="amber">
      <ConfirmLayer confirms={[GMAIL_CONFIRM]} onResolved={noop} />
    </InWorld>
  ),

  // The OTHER surface that hosts the card — the 680w summon overlay, whose own
  // panel carried the same hardcoded plate. PAPER is the world that proves it:
  // shoot with summon.html, which is where the live panel lives.
  "summon-confirm-paper": () => (
    <InWorld id="paper" flex>
      <div style={{ margin: "auto", display: "flex", justifyContent: "center", width: "100%" }}>
        <SummonPanel {...SUMMON_BASE} confirm={GMAIL_CONFIRM} />
      </div>
    </InWorld>
  ),

  settings: () => (
    <ShotWrap flex>
      <div className="panewrap">
        <SettingsPane onBack={noop} />
      </div>
    </ShotWrap>
  ),

  body: () => (
    <ShotWrap flex>
      <div style={{ padding: "16px 16px 10px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <BodyPane onBack={noop} />
      </div>
    </ShotWrap>
  ),

  wardrobe: () => (
    <ShotWrap>
      <WardrobePanel open busy={false} onClose={noop} onPreviewState={noop} />
    </ShotWrap>
  ),

  // owner: stream V. The picker as settings will mount it. Its own voices fetch
  // resolves inside ShotWrap's rAF + the harness's post-flag settle; run this
  // key with EVE_MOCK=0 EVE_SHOT_WAIT=online to capture her real account.
  // owner: stream T — one key per world. The board applies the world itself;
  // "?theme=<id>" on any other page does the same without writing his pick.
  "theme-terminal": () => <ThemeBoard id="terminal" />,
  "theme-neon": () => <ThemeBoard id="neon" />,
  "theme-paper": () => <ThemeBoard id="paper" />,
  "theme-amber": () => <ThemeBoard id="amber" />,

  // The settings pane carrying the THEME section and stream V's voice card.
  "settings-themes": () => (
    <ShotWrap flex>
      <div className="panewrap">
        <SettingsPane onBack={noop} />
      </div>
    </ShotWrap>
  ),

  "voice-picker": () => (
    <ShotWrap flex>
      <div className="panewrap" style={{ padding: 18, display: "flex" }}>
        <VoicePicker onClose={noop} />
      </div>
    </ShotWrap>
  ),

  // -------------------------------------------------------------------------
  // FILING HANDS. Every key below is shot in TERMINAL and in PAPER, because
  // PAPER is the world that inverts the ink channel and it is where a hardcoded
  // plate produced the CRITICAL confirm-card blindness. A filing card that only
  // reads in one world is a filing card that lies in three.
  // -------------------------------------------------------------------------

  // 1. SETTINGS — the folder allowlist, armed, with a synced root, a live root
  //    and a refused root all on screen at once.
  "desk-settings": () => (
    <ShotWrap flex>
      <DeskPane>
        <DeskSettings bridge={DESK_STUB} initialRoots={SHOT_ROOTS} initialStatus={SHOT_STATUS_ARMED} />
      </DeskPane>
    </ShotWrap>
  ),
  "desk-settings-paper": () => (
    <InWorld id="paper" flex>
      <DeskPane>
        <DeskSettings bridge={DESK_STUB} initialRoots={SHOT_ROOTS} initialStatus={SHOT_STATUS_ARMED} />
      </DeskPane>
    </InWorld>
  ),

  // 1b. THE DISCLOSURE — the screen he has to read before the master switch can
  //     go from OFF to ARMED. Shot with no roots enrolled, which is the state a
  //     fresh install is actually in.
  "desk-settings-arm": () => (
    <ShotWrap flex>
      <DeskPane>
        <DeskSettings bridge={DESK_STUB} initialRoots={[]} initialStatus={SHOT_STATUS_OFF} initialDisclosure />
      </DeskPane>
    </ShotWrap>
  ),
  "desk-settings-arm-paper": () => (
    <InWorld id="paper" flex>
      <DeskPane>
        <DeskSettings bridge={DESK_STUB} initialRoots={[]} initialStatus={SHOT_STATUS_OFF} initialDisclosure />
      </DeskPane>
    </InWorld>
  ),

  // 2. A SMALL BATCH. Seven rows, and two of them are hostile: one carries
  //    U+202E (it reads as a .pdf everywhere else and it is an .exe), one is
  //    bound for a folder whose A is Cyrillic. Both must be legible AS attacks.
  "desk-confirm-small": () => (
    <ShotWrap>
      <DeskModal>
        <FileBatchCard
          confirm={shotConfirm(shotPayload())}
          payload={shotPayload()}
          variant="modal"
          onResolved={noop}
          bridge={DESK_STUB}
          initialPreflight={shotPreflightSmall()}
        />
      </DeskModal>
    </ShotWrap>
  ),
  "desk-confirm-small-paper": () => (
    <InWorld id="paper">
      <DeskModal>
        <FileBatchCard
          confirm={shotConfirm(shotPayload())}
          payload={shotPayload()}
          variant="modal"
          onResolved={noop}
          bridge={DESK_STUB}
          initialPreflight={shotPreflightSmall()}
        />
      </DeskModal>
    </InWorld>
  ),

  // 3. A LARGE BATCH — 50 rows, the hard cap, LIVE (not dry run). Captured
  //    BEFORE the list has been scrolled, so the PNG's job is to show APPROVE
  //    disabled and the gate line unsatisfied. `assumeRead` is deliberately not
  //    passed here.
  "desk-confirm-large": () => {
    const p = shotLargePayload();
    return (
      <ShotWrap>
        <DeskModal>
          <FileBatchCard
            confirm={shotConfirm(p)}
            payload={p}
            variant="modal"
            onResolved={noop}
            bridge={DESK_STUB}
            initialPreflight={shotPreflight(p)}
          />
        </DeskModal>
      </ShotWrap>
    );
  },
  "desk-confirm-large-paper": () => {
    const p = shotLargePayload();
    return (
      <InWorld id="paper">
        <DeskModal>
          <FileBatchCard
            confirm={shotConfirm(p)}
            payload={p}
            variant="modal"
            onResolved={noop}
            bridge={DESK_STUB}
            initialPreflight={shotPreflight(p)}
          />
        </DeskModal>
      </InWorld>
    );
  },

  // 4. A DRY-RUN RESULT. Every verb on this capture must be WOULD HAVE, and the
  //    undo line must say there is nothing to undo. (G-A5 / PART-5)
  "desk-confirm-dryrun": () => (
    <ShotWrap>
      <DeskModal>
        <FileBatchCard
          confirm={shotConfirm(shotPayload())}
          payload={shotPayload()}
          variant="modal"
          onResolved={noop}
          bridge={DESK_STUB}
          initialPreflight={shotPreflightSmall()}
          initialStage={{ s: "applied", outcome: shotDryRunOutcome() }}
        />
      </DeskModal>
    </ShotWrap>
  ),
  "desk-confirm-dryrun-paper": () => (
    <InWorld id="paper">
      <DeskModal>
        <FileBatchCard
          confirm={shotConfirm(shotPayload())}
          payload={shotPayload()}
          variant="modal"
          onResolved={noop}
          bridge={DESK_STUB}
          initialPreflight={shotPreflightSmall()}
          initialStage={{ s: "applied", outcome: shotDryRunOutcome() }}
        />
      </DeskModal>
    </InWorld>
  ),

  // 5. A HALF-FAILED BATCH. Ten landed, twenty did not, and the primary action
  //    has flipped to PUT THE 10 BACK. (PART-1 / PART-2 / G-C13 / G-C14)
  "desk-confirm-half": () => {
    const c = shotHalfFailedConfirm();
    return (
      <ShotWrap>
        <DeskModal>
          <FileBatchCard
            confirm={c}
            payload={c.payload as never}
            variant="modal"
            onResolved={noop}
            bridge={DESK_STUB}
            initialStage={{ s: "applied", outcome: shotHalfFailedOutcome() }}
          />
        </DeskModal>
      </ShotWrap>
    );
  },
  "desk-confirm-half-paper": () => {
    const c = shotHalfFailedConfirm();
    return (
      <InWorld id="paper">
        <DeskModal>
          <FileBatchCard
            confirm={c}
            payload={c.payload as never}
            variant="modal"
            onResolved={noop}
            bridge={DESK_STUB}
            initialStage={{ s: "applied", outcome: shotHalfFailedOutcome() }}
          />
        </DeskModal>
      </InWorld>
    );
  },

  // 6. THE LOG AND THE UNDO — the panel S2 mounts in the deck's OPS column.
  //    One live batch that half-failed, one dry run, one already put back, one
  //    INTERRUPTED — RECONCILED with an AMBIGUOUS row expanded.
  "desk-log": () => (
    <ShotWrap flex>
      <DeskPane>
        <DeskLogPanel
          bridge={DESK_STUB}
          initialBatches={SHOT_BATCHES}
          initialStatus={SHOT_STATUS_ARMED}
          initialExpanded={SHOT_BATCHES[3].batchId}
        />
      </DeskPane>
    </ShotWrap>
  ),
  "desk-log-paper": () => (
    <InWorld id="paper" flex>
      <DeskPane>
        <DeskLogPanel
          bridge={DESK_STUB}
          initialBatches={SHOT_BATCHES}
          initialStatus={SHOT_STATUS_ARMED}
          initialExpanded={SHOT_BATCHES[3].batchId}
        />
      </DeskPane>
    </InWorld>
  ),

  // 7. THE DISPATCH PATH ITSELF — the real ConfirmLayer, handed a real
  //    file_batch confirm, with NO injected preflight. It goes through
  //    ConfirmCard's kind switch and calls the live desk over IPC, so this
  //    capture proves the wiring rather than the layout. On a machine with
  //    filing off it should show a refusal or CAN'T CHECK, never an APPROVE.
  "desk-confirm-live": () => (
    <ShotWrap>
      <ConfirmLayer confirms={[shotConfirm(shotPayload())]} onResolved={noop} />
    </ShotWrap>
  ),
};
