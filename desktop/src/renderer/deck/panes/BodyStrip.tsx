// BODY strip — owning stream: S2. Artboard A, DATA column bottom: one line,
// click anywhere for the full BODY pane (Artboard D, S3's).
//
// /vitals is deliberately outside /state, so this line is fed by a lazy one-shot
// (useVitalsStrip). Offline it says so rather than printing a 0/5.
//
// DISCOVERABILITY (this round): it always WAS a <button>, and it read as a
// status line — no border, no hover state, nothing saying it went anywhere. It
// now wears .navtarget (deck/nav.css): a bordered row that lights teal on
// hover, with an `OPEN ▸` cap on the right, matching .oprow's language one
// section up. The click target is unchanged — still the whole row — so nothing
// that worked before stopped working. The three runtime check-in names sit
// between the summary and the cap and ellipsise there, so a long habit name
// pushes on itself instead of shoving the cap off the column edge.

import type { EveState, Vitals } from "@shared/contract";

export interface BodyStripProps {
  vitals: Vitals | null;
  state: EveState;
  onOpen: () => void;
}

export default function BodyStrip({ vitals, state, onOpen }: BodyStripProps) {
  const online = state.online;
  const habits = vitals?.habits ?? [];
  const checkins = habits.filter((h) => h.slot === "checkin");
  const floor = vitals?.floor ?? state.floor;

  const energy = vitals?.checkin?.energy;
  const sleep = vitals?.checkin?.sleep_hours;

  // Never a fake zero (§8 law 3): anything she has not answered for is an
  // em-dash, and offline every slot is one.
  const dash = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : String(v));
  const habitsLabel = online && vitals ? `${habits.filter((h) => h.done_today).length}/${habits.length}` : "—/—";
  const floorLabel = online && floor ? `${floor.count}/${floor.goal}` : "—/—";
  const left = `BODY — ENERGY ${online ? dash(energy) : "—"}/5 · SLEEP ${online ? dash(sleep) : "—"}H · HABITS ${habitsLabel} · FLOOR ${floorLabel}`;

  return (
    <button
      type="button"
      className="bodystrip navtarget"
      onClick={onOpen}
      title="The engine — her body ledger. Key 2, Esc back to the deck."
    >
      <span className="bodysum">{left}</span>
      {/* Always rendered, even empty: it is the flexible middle that keeps the
          OPEN cap pinned right whether or not there are check-ins to show. */}
      <span className="bodyfill">
        {online && checkins.length > 0
          ? checkins.map((h) => `${h.name.toUpperCase()} ${h.done_today ? "✓" : "○"}`).join(" · ")
          : ""}
      </span>
      <span className="bodyopen">OPEN ▸</span>
    </button>
  );
}
