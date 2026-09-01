// owner: stream S3 — Artboard F, SETTINGS/WIRE.
//
// Mounted by deck/Deck.tsx inside its own `.panewrap` (see settings.css for
// why this component does not also apply that wrapper). Fetches its own data
// — props are just `{ onBack }` — and stays live via window.eve.onStateUpdate
// so the node grid never goes stale while the pane is open.
import { useCallback, useEffect, useState } from "react";
import type { ConfigView, ConnectorStatus, EveState, Health } from "@shared/contract";
import "./settings.css";
// STREAM T — the four-world theme system.
import "../../styles/theme-picker.css";
import { THEMES, getTheme, setTheme, type ThemeId } from "../theme";
// STREAM V — her voice picker, mounted here per that stream's documented
// import path and props: `import VoicePicker from "./VoicePicker"` +
// <VoicePicker onClose={...} />. It is self-contained and takes no other props.
import VoicePicker from "./VoicePicker";
// FILING HANDS (DESK/S3) — hop 0, enrollment. Self-contained: it fetches its
// own roots/status off window.eve.desk and takes no props. Mounted full-width
// in the extras row rather than in the three-card grid, because the disclosure
// screen and the per-root OneDrive banner are sentences he has to be able to
// read, not chips.
import DeskSettings from "../desk/DeskSettings";
// HER VOICE'S OWN AUDIO PATH. This row must not keep a second copy of the
// storage key or a second enumerateDevices of its own — two readers of one
// setting is exactly how a picker and a player end up disagreeing about which
// speaker she is coming out of. Everything here comes from the module that
// actually routes the audio.
import {
  listOutputs,
  probeOutputRoute,
  saveOutputDevice,
  savedOutputId,
  type OutputDevice,
  type SinkOutcome,
} from "../voice/audioOut";

export interface SettingsPaneProps {
  onBack: () => void;
}

interface NodeMeta {
  code: string;
  name: string;
  role: string;
  /** Static fallback only — before live connector data arrives (or offline),
   *  this is the one row that should still read as phase-gated rather than
   *  a bare DOWN. Once real data is in, the live detail always wins. */
  future?: boolean;
}

// Codes/names/roles verbatim (handoff §4 Artboard F / EveApp.tsx:740-751),
// fixed order — never derived from the connectors array, which can arrive in
// any order or be missing entirely while offline.
const NODES: NodeMeta[] = [
  { code: "EV", name: "EVE Brain", role: "reasoning core" },
  { code: "SB", name: "Supabase", role: "memory · ledgers" },
  { code: "GM", name: "Gmail", role: "read · draft · send" },
  { code: "CL", name: "Calendar", role: "clocks · windows" },
  { code: "OS", name: "Churlish OS", role: "board · pennyworth" },
  { code: "DG", name: "Deepgram", role: "her ears" },
  { code: "11", name: "ElevenLabs", role: "her voice" },
  { code: "FL", name: "EVE Fleet", role: "research · tribunals" },
  { code: "WB", name: "Live Web", role: "search · sources" },
  { code: "G2", name: "G2 Glasses", role: "her eyes · someday", future: true },
];

interface NodeStatus {
  glyph: string;
  label: string;
  cls: "" | "gold" | "dash";
  future: boolean;
}

// Verbatim port of deck/RailColumn.tsx's findConnector (kept local rather than
// imported — S2 owns that file, S3 owns this one — "shared in spirit, not in
// code," per file ownership) so the wire micro-row and this grid read
// /state.connectors with the exact same normalization.
function findConnector(cs: ConnectorStatus[], key: string): ConnectorStatus | undefined {
  const k = key.toLowerCase();
  return cs.find((c) => c.key.toLowerCase() === k || c.name.toLowerCase().startsWith(k));
}

// The live brain keys these five with its own full-name connector ids; the
// EVE_MOCK fixtures (and the live brain, presumably, for anything that is not
// one of these five) key them with the desktop's 2-letter/numeric code. Try
// the full name first, then fall back to the code itself — either one is an
// "exact key" match inside findConnector, so mock and live both resolve.
const CONNECTOR_NAME: Record<string, string> = {
  GM: "gmail",
  CL: "gcal",
  OS: "churlish_os",
  DG: "deepgram",
  11: "elevenlabs",
};

function connectorStatus(c: ConnectorStatus | undefined): NodeStatus {
  if (!c) return { glyph: "●", label: "DOWN", cls: "dash", future: false };
  if (c.connected) return { glyph: "●", label: "LIVE", cls: "", future: false };
  if (c.detail.includes("KEY")) return { glyph: "●", label: c.detail.toUpperCase(), cls: "gold", future: false };
  if (c.detail.includes("PHASE")) return { glyph: "◌", label: c.detail.toUpperCase(), cls: "dash", future: true };
  return { glyph: "●", label: "DOWN", cls: "dash", future: false };
}

// A status with no source at all is a lie either way (LIVE or DOWN) — render
// it dim and unclaimed instead. Used for WB always, and for EV/SB/FL for the
// window before their one live signal (state/health) has answered even once.
const NO_SOURCE: NodeStatus = { glyph: "—", label: "", cls: "dash", future: false };

// Honesty law: each node reads from its OWN real source, never from a single
// borrowed connectors lookup.
//   GM/CL/OS/DG/11 -> /state.connectors (live full-name key or mock code).
//   EV             -> state.online.
//   SB             -> health.memoryReady.
//   FL             -> health.fleet {ready,live,count}.
//   WB             -> no live signal exists today; always the dim dash.
//   G2             -> unchanged: the old plain connectors-by-code lookup,
//                     which is how the phase-gated dash has always rendered.
function nodeStatus(node: NodeMeta, state: EveState | null, health: Health | null): NodeStatus {
  switch (node.code) {
    case "GM":
    case "CL":
    case "OS":
    case "DG":
    case "11": {
      const cs = state?.connectors ?? [];
      const full = CONNECTOR_NAME[node.code];
      return connectorStatus(findConnector(cs, full) ?? findConnector(cs, node.code));
    }
    case "EV":
      if (!state) return NO_SOURCE;
      return state.online
        ? { glyph: "●", label: "LIVE", cls: "", future: false }
        : { glyph: "●", label: "DOWN", cls: "dash", future: false };
    case "SB":
      if (!health) return NO_SOURCE;
      return health.memoryReady
        ? { glyph: "●", label: "LIVE", cls: "", future: false }
        : { glyph: "●", label: "DOWN", cls: "dash", future: false };
    case "FL":
      if (!health) return NO_SOURCE;
      return health.fleet?.ready && health.fleet?.live
        ? { glyph: "●", label: `LIVE · ${health.fleet.count} UNITS`, cls: "", future: false }
        : { glyph: "●", label: "DOWN", cls: "dash", future: false };
    case "WB":
      return NO_SOURCE;
    default: {
      // G2 — untouched. No live/mock brain has ever sent this key; it always
      // falls to the not-found branch below, exactly as it did before.
      const c = state?.connectors?.find((x) => x.key === node.code);
      if (!c) {
        return node.future
          ? { glyph: "◌", label: "PHASE 5", cls: "dash", future: true }
          : { glyph: "●", label: "DOWN", cls: "dash", future: false };
      }
      return connectorStatus(c);
    }
  }
}

function formatHotkey(hk: string | undefined): string {
  const raw = hk && hk.trim() ? hk : "CommandOrControl+Space";
  return raw
    .split("+")
    .map((part) => {
      const p = part.trim().toLowerCase();
      if (p === "commandorcontrol" || p === "control" || p === "ctrl") return "CTRL";
      if (p === "command" || p === "cmd" || p === "meta" || p === "super") return "CMD";
      if (p === "alt" || p === "option") return "ALT";
      if (p === "shift") return "SHIFT";
      return part.trim().toUpperCase();
    })
    .join("+");
}

function fmtHM(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// OUTPUT DEVICE. The id no longer lives in a private const here: it is owned
// by src/renderer/voice/audioOut.ts, which is the one place that actually
// routes audio. Two copies of a storage key is how a picker and a player end
// up disagreeing about which speaker she is coming out of.
//
// The row also stores the device's LABEL beside its id, for one reason: when
// the device is unplugged, enumerateDevices can no longer tell anyone its
// name, and "SPEAKERS (HIDOCK H1E) IS NOT CONNECTED" is a diagnosis while
// "the saved device is missing" is a shrug.

// STREAM T — a theme card's preview is a real (tiny) deck, not a coloured
// rectangle. Every element below is one of the law classes from
// src/styles/eve-desktop.css, wrapped in `.tw-<world>`, which the world's own
// theme file declares in the SAME rule as `:root[data-theme="<world>"]`. So the
// preview and the real window are reading one declaration, and a swatch cannot
// drift from the world it claims to show.
//
// Nothing here is data. The row labels say SAMPLE, the numeral well shows a
// type specimen rather than a figure, and the state word is PREVIEW — a
// settings preview must not be mistakable for his floor or his tasks.
function ThemeWorld({ id }: { id: ThemeId }) {
  return (
    <div className={`themeworld tw-${id}`}>
      <div className="themeprev">
        <div className="tp-bar">
          <i />
          EVE · PREVIEW
        </div>
        <div className="tp-body">
          <div className="tp-plate">
            <span className="orb" />
            <span className="tp-state">PREVIEW</span>
          </div>
          <div className="tp-col">
            <div className="eyeb">
              <span>▸ SAMPLE</span>
              <span className="r">NOT LIVE</span>
            </div>
            <div className="mini">
              <div className="k">SURFACE</div>
              <div className="n">Aa</div>
            </div>
            <div className="t3row">
              <span className="idx">1</span>
              <span className="tt">SAMPLE ROW</span>
            </div>
            {/* This row used to be labelled "RED TIER" and borrow .due to get a
                red left rule for free. Overdue is GOLD now (boss ruling), so the
                label would have been a lie about what the swatch shows — and the
                RED tier already has its own honest swatch in the strip below,
                titled with the law. The row now says what it actually is. */}
            <div className="t3row due">
              <span className="idx">2</span>
              <span className="tt">OVERDUE</span>
            </div>
            <span className="chipv6">CHIP</span>
          </div>
        </div>
      </div>
      {/* the tokens themselves, in role order; the last two are the law */}
      <div className="themesw">
        <i style={{ background: "var(--bg)" }} title="ground" />
        <i style={{ background: "var(--panel)" }} title="raised surface" />
        <i style={{ background: "var(--cream)" }} title="text" />
        <i style={{ background: "var(--tealHi)" }} title="her · alive · done" />
        <i style={{ background: "var(--ice)" }} title="highlight" />
        <i style={{ background: "var(--gold)" }} title="money · hot state (overdue, quiet client)" />
        <i style={{ background: "var(--red)" }} title="LAW — RED tier + live mic" />
        <i style={{ background: "var(--green)" }} title="LAW — GREEN autonomy dot" />
      </div>
    </div>
  );
}

export default function SettingsPane({ onBack }: SettingsPaneProps) {
  const [state, setState] = useState<EveState | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [config, setConfig] = useState<ConfigView | null>(null);

  const [brainDraft, setBrainDraft] = useState<string | null>(null);
  const [brainError, setBrainError] = useState<string | null>(null);

  const [tokenReplacing, setTokenReplacing] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");
  const [linkStatus, setLinkStatus] = useState<"up" | "down" | null>(null);

  // The picked world. getTheme() is the same reader the three renderer entries
  // use at boot, so this cannot disagree with what is on screen.
  const [theme, setThemeSel] = useState<ThemeId>(() => getTheme());
  const pickTheme = (id: ThemeId) => {
    setThemeSel(id);
    setTheme(id); // paints <html> immediately and persists; other windows follow
  };

  const [outputDevices, setOutputDevices] = useState<OutputDevice[]>([]);
  const [outputDevice, setOutputDevice] = useState<string | null>(() => savedOutputId());
  // WHERE THE AUDIO IS ACTUALLY GOING — not what is saved. Null until the
  // probe answers; the row says so rather than guessing in the meantime.
  const [route, setRoute] = useState<SinkOutcome | null>(null);

  // ---- live data: config + state (connectors) + health --------------------
  useEffect(() => {
    let cancelled = false;
    void window.eve.config.get().then((c) => {
      if (!cancelled) setConfig(c);
    });
    void window.eve.state.get().then((s) => {
      if (!cancelled) setState(s.state);
    });
    void window.eve.health().then((h) => {
      if (!cancelled) setHealth(h);
    });
    const unsub = window.eve.onStateUpdate((e) => {
      if (!cancelled) setState(e.state);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // ---- Esc leaves the pane; a mono "← DECK" affordance does the same -------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  // ---- output device: the list, AND where the audio actually goes ---------
  //
  // Two separate questions, and the row used to answer only the first. His
  // Windows default output is a SAMSUNG monitor over HDMI, so "she is talking
  // to my monitor" looked identical to "she is not talking", and neither was
  // visible anywhere in the app. probeOutputRoute() runs the same setSinkId
  // her voice runs, against a silent element, and reports what came back.
  const refreshOutputs = useCallback(async (): Promise<void> => {
    const list = await listOutputs();
    setOutputDevices(list.devices);
    setRoute(await probeOutputRoute());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = (): void => {
      void refreshOutputs().then(() => {
        if (cancelled) return;
      });
    };
    run();
    // Plugging a headset in or unplugging the desk speakers changes the answer
    // while this pane is open. A row that goes stale on a device change is the
    // row that made this invisible in the first place.
    const md = navigator.mediaDevices;
    md?.addEventListener?.("devicechange", run);
    return () => {
      cancelled = true;
      md?.removeEventListener?.("devicechange", run);
    };
  }, [refreshOutputs]);

  const pickOutputDevice = (id: string) => {
    const chosen = outputDevices.find((d) => d.id === id) ?? null;
    setOutputDevice(id || null);
    // The LABEL is stored beside the id on purpose: once the device is
    // unplugged, enumerateDevices can no longer supply its name, and
    // "SPEAKERS (HIDOCK H1E) IS NOT CONNECTED" is a diagnosis while "the saved
    // device is missing" is a shrug.
    saveOutputDevice(id || null, chosen?.label ?? null);
    void refreshOutputs();
  };

  const toggleSilent = async () => {
    if (!config) return;
    const next = !config.silentAtDesk;
    setConfig({ ...config, silentAtDesk: next });
    const r = await window.eve.config.set({ silentAtDesk: next });
    if (r.ok && r.config) setConfig(r.config);
  };

  const brainValue = brainDraft ?? config?.brainUrl ?? "";
  const flushBrainUrl = async () => {
    if (brainDraft === null) return;
    const trimmed = brainDraft.trim();
    if (!trimmed || trimmed === config?.brainUrl) {
      setBrainDraft(null);
      setBrainError(null);
      return;
    }
    let httpsOk = false;
    try {
      httpsOk = new URL(trimmed).protocol === "https:";
    } catch {
      httpsOk = false;
    }
    if (!httpsOk) {
      setBrainError("HTTPS URLS ONLY");
      return;
    }
    setBrainError(null);
    const r = await window.eve.config.set({ brainUrl: trimmed });
    if (r.ok && r.config) {
      setConfig(r.config);
      setBrainDraft(null);
    } else {
      setBrainError((r.error ?? "SAVE FAILED").toUpperCase());
    }
  };

  // "clear the field immediately" (handoff): capture the value and blank the
  // draft synchronously, before anything async happens.
  const submitToken = (raw: string) => {
    const val = raw.trim();
    setTokenDraft("");
    setTokenReplacing(false);
    if (!val) return;
    void (async () => {
      const r = await window.eve.config.set({ token: val });
      if (r.ok && r.config) setConfig(r.config);
      const su = await window.eve.state.refresh();
      setLinkStatus(su.state.online ? "up" : "down");
      setTimeout(() => setLinkStatus(null), 6000);
    })();
  };

  const showTokenInput = !config?.tokenSet || tokenReplacing;

  return (
    <div className="settings-pane">
      <button type="button" className="settings-back" onClick={onBack}>
        ← DECK
      </button>

      <div className="eyeb">
        <span>▸ THE WIRE — 10 NODES</span>
        <span className="r">FLEET COUNT RENDERS FROM /health.fleet.count — NEVER HARDCODED</span>
      </div>

      <div className="settings-nodegrid">
        {NODES.map((n) => {
          const s = nodeStatus(n, state, health);
          return (
            <div className={`node${s.future ? " future" : ""}`} key={n.code}>
              <div className="settings-nodehead">
                <span className="code">{n.code}</span>
                <span className={`st${s.cls ? ` ${s.cls}` : ""}`}>
                  {s.glyph} {s.label}
                </span>
              </div>
              <div className="nm">{n.name}</div>
              <div className="role">{n.role}</div>
            </div>
          );
        })}
      </div>

      <div className="settings-cards">
        {/* AUTONOMY — verbatim on every surface (handoff §8 law 1) */}
        <div className="card" style={{ padding: "14px 16px" }}>
          <div className="eyeb">
            <span>AUTONOMY — HOUSE RULES</span>
            <span className="r">EVERY SURFACE</span>
          </div>
          <div className="settings-rules">
            <div className="settings-rule">
              <span className="dot" style={{ background: "var(--green)" }} />
              <span>
                <b className="k" style={{ color: "var(--greenText)" }}>
                  GREEN
                </b>
                Acts, then tells you. Filing, drafts, research, the OS board.
              </span>
            </div>
            <div className="settings-rule">
              <span className="dot" style={{ background: "var(--gold)" }} />
              <span>
                <b className="k" style={{ color: "var(--gold)" }}>
                  YELLOW
                </b>
                Drafts, then waits. Anything a client will read.
              </span>
            </div>
            <div className="settings-rule">
              <span className="dot" style={{ background: "var(--red)" }} />
              <span>
                {/* The DOT beside this keeps the law hex (see the span above);
                    the WORD is 9px type and takes --redInk, exactly as the word
                    GREEN two rows up already takes --greenText. */}
                <b className="k" style={{ color: "var(--redInk)" }}>
                  RED
                </b>
                Never without you. Money out, sends, anything public.
              </span>
            </div>
          </div>
        </div>

        {/* VOICE & SUMMON */}
        <div className="card wirecard" style={{ padding: "14px 16px" }}>
          <div className="eyeb">
            <span>VOICE &amp; SUMMON</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <div className="wirerow2">
              <span className="k">HOTKEY</span>
              <span className="v">
                <span className="kbd">{formatHotkey(config?.hotkey)}</span> · TAP TO TALK, AGAIN TO SEND
              </span>
            </div>
            <div className="wirerow2">
              <span className="k">PTT MODE</span>
              <span className="v" style={{ color: "var(--ice)" }}>
                TAP-TOGGLE
              </span>
            </div>
            <div className="wirerow2 dashed">
              <span className="k dim">HOLD</span>
              <span className="v">NEEDS A NATIVE KEY HOOK · V1.1</span>
            </div>
            <div className="wirerow2">
              <span className="k">SILENT AT THE DESK</span>
              <button type="button" className="settings-linkbtn" onClick={() => void toggleSilent()}>
                {config?.silentAtDesk ? "ON" : "DEFAULT OFF"}
              </button>
            </div>
            <div className="wirerow2">
              <span className="k">OUTPUT DEVICE</span>
              {outputDevices.length ? (
                <select
                  className="settings-outsel"
                  value={outputDevice ?? ""}
                  onChange={(e) => pickOutputDevice(e.target.value)}
                >
                  {/* An explicit "follow Windows" row. Defaulting the select to
                      devices[0] used to make the system default LOOK like a
                      deliberate pick of whatever happened to enumerate first. */}
                  <option value="">FOLLOW THE SYSTEM DEFAULT</option>
                  {outputDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="v">SYSTEM DEFAULT</span>
              )}
            </div>
            {/* IN USE — the fact, under the wish.
                This row exists because his Windows default output is the
                SAMSUNG monitor over HDMI, not the speakers on his desk. When
                she spoke to the monitor it was indistinguishable, from inside
                the app, from her not speaking at all: the row above showed a
                saved id and the sound went somewhere he was not sitting. This
                one is measured, not stored — probeOutputRoute() runs the same
                setSinkId her voice runs and reports what came back. */}
            <div className="wirerow2">
              <span className="k dim">IN USE RIGHT NOW</span>
              <span
                className="v"
                style={{ color: route?.fellBack ? "var(--gold)" : route ? "var(--tealHi)" : undefined }}
              >
                {route
                  ? `${route.appliedLabel.toUpperCase()}${route.fellBack ? " · FELL BACK" : ""}`
                  : "CHECKING…"}
              </span>
            </div>
            {route?.fallbackReason ? (
              <div className="wirerow2 dashed">
                <span className="k dim">WHY</span>
                <span className="v" style={{ color: "var(--gold)" }}>
                  {route.fallbackReason.toUpperCase()}
                </span>
              </div>
            ) : null}
            <div className="wirerow2 dashed">
              <span className="k dim">WAKE WORD &quot;EVE&quot;</span>
              <span className="v">V2 · CHANGES THE LISTENING LAW · REQUIRES YOUR SIGN-OFF</span>
            </div>
          </div>
          <div className="footline" style={{ marginTop: "auto", paddingTop: 10 }}>
            voice out only when the turn came in by voice. typed turns never speak.
          </div>
        </div>

        {/* NOTIFICATIONS + CONNECTION */}
        <div className="settings-col">
          <div className="card" style={{ padding: "14px 16px" }}>
            <div className="eyeb">
              <span>NOTIFICATIONS</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <div className="wirerow2">
                <span className="k">RED CONFIRMS</span>
                <span className="v">TOAST</span>
              </div>
              <div className="wirerow2">
                <span className="k">TRIPWIRES</span>
                <span className="v">TOAST</span>
              </div>
              <div className="wirerow2">
                <span className="k">EVERYTHING ELSE</span>
                <span className="v">DECK ONLY</span>
              </div>
              <div className="wirerow2">
                <span className="k">QUIET 21:30–06:30</span>
                <span className="v">HER LAW, NOT A SETTING</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: "14px 16px", flex: 1 }}>
            <div className="eyeb">
              <span>CONNECTION</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <div className="wirerow2">
                <span className="k">BRAIN</span>
                <input
                  className={`settings-cfginput${brainError ? " bad" : ""}`}
                  value={brainValue}
                  onChange={(e) => setBrainDraft(e.target.value)}
                  onBlur={() => void flushBrainUrl()}
                  spellCheck={false}
                />
              </div>
              {brainError && <div className="settings-error">{brainError}</div>}

              <div className="wirerow2">
                <span className="k">BEARER</span>
                {config?.tokenSet && !tokenReplacing ? (
                  <span className="v link">
                    SET · STORED IN WINDOWS CREDENTIAL VAULT
                    <button type="button" className="settings-linkbtn" onClick={() => setTokenReplacing(true)}>
                      REPLACE
                    </button>
                  </span>
                ) : !config?.tokenSet ? (
                  <span className="v" style={{ color: "var(--gold)" }}>
                    NOT SET — PASTE IT ONCE
                  </span>
                ) : null}
              </div>
              {showTokenInput && (
                <div className="wirerow2">
                  <span className="k dim">TOKEN</span>
                  <input
                    type="password"
                    className="settings-cfginput"
                    autoFocus={tokenReplacing}
                    placeholder="⏎ to save"
                    value={tokenDraft}
                    onChange={(e) => setTokenDraft(e.target.value)}
                    onBlur={(e) => submitToken(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitToken((e.target as HTMLInputElement).value);
                    }}
                  />
                </div>
              )}
              {linkStatus && (
                <div className={`settings-linked ${linkStatus}`}>{linkStatus === "up" ? "● LINKED" : "● STILL DOWN"}</div>
              )}
            </div>

            <div className="settings-chips">
              <span className="chipv6" style={{ cursor: "default" }}>
                PHASE {health?.phase ?? "—"}
              </span>
              <span className="chipv6" style={{ cursor: "default" }}>
                STT {health?.voiceReady?.stt ? "✓" : "✗"} TTS {health?.voiceReady?.tts ? "✓" : "✗"}
              </span>
              <span className="chipv6" style={{ cursor: "default" }}>
                FLEET {health?.fleet?.ready ? "READY" : "—"} · {health?.fleet?.live ? "LIVE" : "—"}
              </span>
              <span className="chipv6" style={{ cursor: "default" }}>
                LAST BRIEF {fmtHM(health?.lastBrief?.at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* FILING HANDS — the folder allowlist, the master switch, the trash and
          the stop. Full width, above the theme row: it is the only section on
          this screen that grants a capability over his real files. */}
      <DeskSettings />

      <div className="settings-extra">
        {/* THEME — four worlds he already owns. Not four palettes invented here. */}
        <div className="card" style={{ padding: "14px 16px" }}>
          <div className="eyeb">
            <span>THEME — FOUR WORLDS</span>
            <span className="r">DECK · SUMMON · TRAY FLYOUT, TOGETHER</span>
          </div>
          <div className="themegrid">
            {THEMES.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`themecard${theme === t.id ? " on" : ""}`}
                aria-pressed={theme === t.id}
                onClick={() => pickTheme(t.id)}
              >
                <ThemeWorld id={t.id} />
                <div className="themename">
                  <span>{t.name}</span>
                  {theme === t.id && <span className="sel">● ON</span>}
                </div>
                <div className="themenote">{t.note}</div>
              </button>
            ))}
          </div>
          <div className="footline" style={{ marginTop: 10 }}>
            red and green do not change with the theme. red is the RED tier and the live mic; green is the
            autonomy dot. every world keeps both.
          </div>
        </div>

        {/* HER VOICE — stream V's card, mounted per its documented contract. */}
        <div className="voicewrap">
          <VoicePicker />
        </div>
      </div>

      <div className="footnote">she only sees what you hand her. keys stay in your vault.</div>
    </div>
  );
}
