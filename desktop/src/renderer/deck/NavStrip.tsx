// THE NAV STRIP — owning stream: S2. The deck's destination selector.
//
// WHY IT LIVES IN THE TITLE BAR, not in a column of its own:
// the deck is three columns wide at 1440 and the LAST one is `1fr`, so every
// pixel a vertical nav rail took would come out of the DATA column — and the
// data column is already the squeezed one. At the 1120x720 minimum it renders
// in 294px, where the approval rows wrap to three lines and the BODY strip
// clips (verify/n/baseline-1120.png). A 48px rail would drop that to 246px and
// make the minimum size worse to fix a discoverability bug. The title bar, by
// contrast, has ~330px of dead space between the clock and the session badge
// at 1120, and ~650px at 1440. This costs the deck nothing, and because Tbar
// renders OUTSIDE Deck.tsx's `view === "settings"` branch, the strip is the one
// mount point that survives all three views AND the wardrobe overlay — a rail
// nav would vanish exactly when he is in the wire and wants out of it.
//
// It is a segment group, not a navbar: one bordered instrument switch with
// hairline dividers, the way a mode selector reads, and the active destination
// is a lit segment (teal wash, ice type, a 2px bar under it) rather than an
// underline-on-hover link.
//
// The five destinations are the whole map. DECK / BODY / WIRE / CORE are
// `DeckView` values; CLOSET is App.tsx's separate `closetOpen` overlay, which is
// why this component takes both and why NavDest is a superset of DeckView.
//
// A FIFTH SEGMENT AND THE 1120px MINIMUM. Space Mono 9px at .16em is ~6.84px a
// character, so a CORE segment is ~64px (18 padding + 13 keycap + 5 gap + 27
// text) and the strip goes from ~270px to ~334px. The header above measured the
// title bar's dead space at ~330px at 1120 — four pixels short. nav.css shaves
// the segment padding from 9px to 7px below 1280 (20px back), which is the fix:
// no destination is dropped and no keycap is hidden.

import type { DeckView } from "./types";
import "./nav.css";

export type NavDest = DeckView | "closet";

export interface NavItem {
  /** The bare digit that jumps here. Drawn on the segment as a keycap. */
  key: string;
  dest: NavDest;
  label: string;
  /** The tooltip. Carries the shortcut and the way back — there is no separate
      shortcut sheet, per spec: "otherwise list shortcuts in the nav tooltips". */
  hint: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: "1",
    dest: "deck",
    label: "DECK",
    hint: "The command deck — today, ops, the body strip.  Key 1.",
  },
  {
    key: "2",
    dest: "body",
    label: "BODY",
    hint: "The engine — energy, sleep, habits, the floor.  Key 2, Esc back to the deck.",
  },
  {
    key: "3",
    dest: "closet",
    label: "CLOSET",
    hint: "Her closet — the wardrobe. Also opens by clicking her portrait.  Key 3, Esc closes it.",
  },
  {
    key: "4",
    dest: "settings",
    label: "WIRE",
    hint: "The wire — settings, connectors, voice.  Key 4, Esc back to the deck.",
  },
  {
    key: "5",
    dest: "core",
    label: "CORE",
    hint: "The core — the fleet, her presence, the counters.  Key 5, Esc back to the deck.",
  },
];

/** Digit -> destination, built from the same list the keycaps are drawn from,
    so the strip and App.tsx's key handler can never drift apart. */
export const NAV_BY_KEY: Record<string, NavDest> = Object.fromEntries(
  NAV_ITEMS.map((i) => [i.key, i.dest]),
);

/** True while the keystroke belongs to a text field — the chat composer, a
    settings input, the habit-name draft in the body pane. Bare digits navigate
    only when he is NOT typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable === true;
}

export interface NavStripProps {
  view: DeckView;
  closetOpen: boolean;
  onGo: (dest: NavDest) => void;
}

export default function NavStrip({ view, closetOpen, onGo }: NavStripProps) {
  // The closet is an overlay that sits ON TOP of whatever view is underneath,
  // so while it is open it — not the view behind it — is where he is.
  const active: NavDest = closetOpen ? "closet" : view;

  return (
    <nav className="navstrip" aria-label="Destinations">
      {NAV_ITEMS.map((item) => {
        const on = item.dest === active;
        return (
          <button
            key={item.dest}
            type="button"
            className={on ? "navseg on" : "navseg"}
            aria-current={on ? "page" : undefined}
            title={item.hint}
            onClick={() => onGo(item.dest)}
          >
            <span className="navkey" aria-hidden="true">
              {item.key}
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
