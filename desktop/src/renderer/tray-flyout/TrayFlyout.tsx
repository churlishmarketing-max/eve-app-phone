// owner: stream S4
//
// THE TRAY FLYOUT — Artboard E, 360x480.
//
// The 4-second surface: who needs you, where the floor stands, and three ways
// out (deck / summon / the OS). It is not a small deck — it never grows a chat,
// a confirm card or a settings row.
//
// Laws it renders:
//   * §8.3 honesty — offline says so in shell copy; it never draws fake rows or
//     a fake floor number.
//   * §8.4 quiet hours — the gold footer replaces nothing else; the tray icon
//     dims and everything still queues.
//   * §8.6 compression — tray lines stay short; the message text is the brain's.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { AttentionItem, ConfigView, EveState } from "@shared/contract";

const ROOT: CSSProperties = {
  width: 360,
  height: 480,
  background: "var(--bg)",
  border: "1px solid var(--hair2)",
  borderRadius: 12,
  boxShadow: "0 24px 60px rgba(0,0,0,.6)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const HEAD: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderBottom: "1px solid var(--hair)",
};

const THUMB: CSSProperties = {
  width: 44,
  height: 56,
  borderRadius: 6,
  overflow: "hidden",
  border: "1px solid rgba(28,185,200,.3)",
  flex: "none",
  background: "var(--panel)",
};

const BODY: CSSProperties = {
  flex: 1,
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 7,
  minHeight: 0,
};

const FOOT: CSSProperties = {
  padding: "9px 12px",
  borderTop: "1px solid var(--hair)",
  fontFamily: "var(--mono)",
  fontSize: 8,
  letterSpacing: ".16em",
  color: "var(--gold)",
  textAlign: "center",
};

const SHELL: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "rgba(240,237,232,.55)",
  padding: "4px 2px",
};

const NOTE: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 8.5,
  letterSpacing: ".14em",
  color: "var(--gold)",
  textAlign: "center",
};

/** §8.3 canonical offline copy — verbatim. */
const OFFLINE_COPY =
  "Her brain is unreachable, so this screen is a shell. It fills in the moment she answers.";
const QUIET_COPY = "QUIET HOURS — SHE HOLDS EVERYTHING UNTIL 06:30";
const NO_OS_URL = "SET THE OS URL IN SETTINGS";

function glyphFor(kind: string): string {
  if (kind === "silent_client") return "@";
  if (kind === "approval") return "▸";
  if (kind === "tripwire") return "▲";
  return "•";
}

export interface TrayFlyoutProps {
  /** Shot seam only: force the quiet-hours footer for a visual receipt. */
  demoQuietHours?: boolean;
}

export default function TrayFlyout({ demoQuietHours = false }: TrayFlyoutProps = {}): JSX.Element {
  const [state, setState] = useState<EveState | null>(null);
  const [cfg, setCfg] = useState<ConfigView | null>(null);
  const [look, setLook] = useState<{ name: string; url: string } | null>(null);
  const [resolved, setResolved] = useState<Record<string, "approve" | "hold">>({});
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<number | null>(null);

  // Claim the shot flag before the entry's rAF can set it, so a screenshot
  // never catches this window mid-load with an empty NEEDS YOU list.
  useLayoutEffect(() => {
    window.__RENDER_DONE = false;
  }, []);

  const flash = useCallback((text: string) => {
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    setNote(text);
    noteTimer.current = window.setTimeout(() => setNote(null), 3000);
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      // refresh(), not get(): opening the flyout is exactly the moment the
      // numbers must be current.
      const [upd, config, wardrobe] = await Promise.all([
        window.eve.state.refresh().catch(() => null),
        window.eve.config.get().catch(() => null),
        window.eve.wardrobe.get().catch(() => null),
      ]);
      if (!live) return;
      if (upd) setState(upd.state);
      if (config) setCfg(config);
      if (wardrobe) {
        const worn = wardrobe.looks.find((l) => l.file === wardrobe.wearing) ?? null;
        setLook(worn ? { name: worn.name, url: worn.url } : null);
      }
      window.__RENDER_DONE = true;
    })();
    const un = window.eve.onStateUpdate((e) => setState(e.state));
    return () => {
      live = false;
      un();
      if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    };
  }, []);

  const act = useCallback(
    (item: AttentionItem, action: "approve" | "hold") => {
      // Optimistic: the row answers before the brain does, then the refresh
      // decides the truth.
      setResolved((r) => ({ ...r, [item.id]: action }));
      flash(action === "approve" ? "APPROVED — SENT TO HER" : "HELD — SHE'LL WAIT");
      void window.eve
        .attention(item.id, action)
        .catch(() => undefined)
        .then(() => window.eve.state.refresh())
        .then((upd) => {
          if (upd) setState(upd.state);
        })
        .catch(() => undefined);
    },
    [flash],
  );

  const openOs = useCallback(() => {
    void window.eve.openExternal("os").then((r) => {
      if (!r?.ok) flash(NO_OS_URL);
      else void window.eve.flyoutHide();
    });
  }, [flash]);

  const online = state?.online === true;
  const items = (state?.attentionItems ?? []).slice(0, 3);
  const floor = state?.floor;
  const quiet = demoQuietHours || cfg?.quietHours === true;

  return (
    <div style={ROOT}>
      <div style={HEAD}>
        <div style={THUMB}>
          {look?.url ? (
            <img
              src={look.url}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "radial-gradient(circle at 50% 35%, rgba(28,185,200,.16), rgba(12,20,23,.9) 78%)",
              }}
            />
          )}
        </div>
        <div>
          <div className="pbadge" style={{ padding: "4px 9px", gap: 7 }}>
            <span className="wm" style={{ fontSize: 13 }}>
              EVE
            </span>
            <span className="dv" style={{ height: 11 }} />
            <span className="lk">{look?.name ?? "—"}</span>
          </div>
          <div className="stateline" style={{ fontSize: 8.5, marginTop: 6 }}>
            {online ? "○ IDLE — HOLDING THE ROOM" : "○ LINK DOWN — SHELL ONLY"}
          </div>
        </div>
      </div>

      <div style={BODY}>
        <div className="eyeb" style={{ fontSize: 8.5 }}>
          <span>NEEDS YOU</span>
          <span className="r">{online ? items.length : "—"}</span>
        </div>

        {!online ? (
          <div style={SHELL}>{OFFLINE_COPY}</div>
        ) : items.length === 0 ? (
          <div style={SHELL}>Nothing is waiting on you. She'll say so when that changes.</div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="oprow" style={{ padding: "6px 9px", minHeight: 30 }}>
              <span className="gl" style={{ fontSize: 10 }}>
                {glyphFor(it.kind)}
              </span>
              <div className="tt" style={{ fontSize: 11 }}>
                {it.message}
              </div>
              <div className="acts">
                {resolved[it.id] ? (
                  <span className="stat dim">{resolved[it.id] === "approve" ? "APPROVED" : "HELD"}</span>
                ) : (
                  <>
                    <span
                      className="cbtn ok"
                      style={{ padding: "4px 7px" }}
                      role="button"
                      tabIndex={0}
                      onClick={() => act(it, "approve")}
                    >
                      APPROVE
                    </span>
                    <span
                      className="cbtn gh"
                      style={{ padding: "4px 7px" }}
                      role="button"
                      tabIndex={0}
                      onClick={() => act(it, "hold")}
                    >
                      HOLD
                    </span>
                  </>
                )}
              </div>
            </div>
          ))
        )}

        {/* margin-top:4 — verbatim from the E board; with fewer than three
            rows the slack falls at the bottom exactly as the board's flex does. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
          <div className="mini" style={{ flex: 1, padding: "9px 12px" }}>
            <div className="k">FLOOR</div>
            {online && floor ? (
              <div className="n" style={{ fontSize: 24, marginTop: 2 }}>
                {floor.count}
                <em style={{ fontSize: 14 }}>/{floor.goal}</em>
              </div>
            ) : (
              // §8.3: never a fake zero.
              <div
                className="n"
                style={{ fontSize: 14, marginTop: 6, color: "rgba(240,237,232,.45)", fontFamily: "var(--mono)" }}
              >
                &gt; offline
              </div>
            )}
          </div>
          <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              className="cbtn ok"
              style={{ textAlign: "center" }}
              role="button"
              tabIndex={0}
              onClick={() => {
                void window.eve.deckFocus().then(() => window.eve.flyoutHide());
              }}
            >
              OPEN DECK
            </span>
            <span
              className="cbtn gh"
              style={{ textAlign: "center" }}
              role="button"
              tabIndex={0}
              onClick={() => {
                // Label only — the global hotkey does the actual summoning.
                void window.eve.flyoutHide();
              }}
            >
              SUMMON — CTRL+SPACE
            </span>
            <span
              className="cbtn gh"
              style={{ textAlign: "center" }}
              role="button"
              tabIndex={0}
              onClick={openOs}
            >
              OPEN THE OS →
            </span>
          </div>
        </div>

        {note ? <div style={NOTE}>{note}</div> : null}
      </div>

      {quiet ? <div style={FOOT}>{QUIET_COPY}</div> : null}
    </div>
  );
}
