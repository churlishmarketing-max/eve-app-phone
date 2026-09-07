// THE BRIEF — the pane. Owning stream: THE BRIEF (C).
//
// WHAT THIS IS. runMorningBrief() emitted a TWENTY-FIVE WORD push and nothing
// else. He asked for four things: what needs you today, what she did overnight,
// what is slipping, today's shape. The push is unchanged and stays the nudge —
// he is away from the desk constantly — and this is the brief it points at.
//
// PRESENTATIONAL ON PURPOSE, exactly like CorePane: every figure arrives as a
// prop and nothing here fetches, so a shot scenario renders it from a fixture
// with no brain, no poll and no bridge round-trip. BriefScreen.tsx is the thin
// container. All the state→view judgement lives in briefView.ts, which is the
// only file on this screen that can lie.
//
// IT IS A READING SURFACE, not a dashboard. There are no counters on it, no
// sparklines and no gauges, because he reads this once at 06:00 with a coffee
// and the job is to be read, not to be monitored. So: one column, capped at a
// measure that stays readable, four sections in HIS order, and every row is a
// sentence with her recommendation under it.
//
// THREE THINGS IT REFUSES TO DO
//
//   1. IT NEVER FILLS SPACE. An empty section prints the brain's own `empty`
//      sentence and stops. C4 called the empty brief "the common one" and it
//      is: nothing scheduled runs between 21:00 and 06:30. The all-clear state
//      below is designed to be the good outcome — teal, said plainly, done —
//      rather than a blank screen that reads like a failure.
//
//   2. IT NEVER LAUNDERS AN UNTRUSTED LINE. A row the brain stamped
//      origin:"untrusted" came out of a stranger's mail or a calendar invite.
//      It renders as QUOTED text behind a MAIL / INVITE cap, with no action on
//      it and no address in it, and the deck says out loud how many such lines
//      there are. R1: it may be summarised, it may never drive anything. There
//      is not one button on this pane, from any origin.
//
//   3. IT NEVER SHOWS A FIGURE WITHOUT ITS SOURCE. Every row carries the table
//      and row id it was read from, and a section that could not read one of
//      its sources shows a dash and the reason instead of a zero and an
//      all-clear (briefView.ts, sectionCount).
//
// RED. Nothing on this screen is #C41E3A except a row that IS a pending RED
// confirm card, and it wears it as a 3px structural rail with the cap in
// --redInk — structure wears the law hex, small type wears the legible
// variant. briefView.paneTone() enforces that; a tripwire the brain toned red
// arrives here as gold.

import type { BriefItem, BriefSection } from "@shared/contract";
import { BLIND_NOT_CLEAR, DASH, paneTone, sectionCount, sectionKnowledge, toneClass, untrustedNote, type BriefView } from "./briefView";
import "../../styles/brief.css";

export interface BriefPaneProps {
  view: BriefView;
  /** When /state last answered. null when it never has. */
  fetchedAt: string | null;
}

/** "07:12" in his own clock, or a dash. Never a guess. */
function clock(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return DASH;
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Row({ item }: { item: BriefItem }) {
  const tone = paneTone(item);
  const untrusted = item.origin === "untrusted";
  return (
    <div className={`brow ${toneClass(tone)}`.trim()}>
      <div className="brow-head">
        {untrusted ? <span className="bsrc-cap">MAIL / INVITE</span> : null}
        {/* Untrusted text is QUOTED so it reads as a report of what a stranger
            wrote, never as her own voice. There is no control next to it. */}
        <span className={untrusted ? "btext quoted" : "btext"}>{item.text}</span>
      </div>
      <div className="brec">{item.recommend}</div>
      {/* The receipt. Every row can be traced back to a record. */}
      <div className="bsrc">{item.source}</div>
    </div>
  );
}

function Section({ s }: { s: BriefSection }) {
  const count = sectionCount(s);
  const known = sectionKnowledge(s);
  return (
    <section className="bsec">
      <div className="divrow">
        <span className="l">{s.title}</span>
        <span className="rule" />
        <span className="r">{count}</span>
      </div>

      {/* A blind source outranks everything else in the section: he is told what
          she could not see BEFORE he is told what she found, because an
          all-clear under a failed read is the lie this whole pane exists to
          avoid. */}
      {s.blind.map((b, i) => (
        <div className="bblind" key={`b${i}`}>
          {b}
        </div>
      ))}

      {/* The three-way choice is NOT made here. briefView.sectionKnowledge() is
          the one decision, mirrored in brain/src/briefing.ts and executed
          against it by the brain harness (C7), so the 07:00 push cannot claim an
          all-clear this pane withholds. This is a switch on that answer. */}
      {known === "listed" ? (
        s.items.map((it) => <Row item={it} key={it.id} />)
      ) : known === "blind" ? (
        // NOT the empty sentence. She did not measure this section, so she does
        // not get to say it is clear.
        <div className="bempty muted">{BLIND_NOT_CLEAR}</div>
      ) : (
        <div className="bempty">{s.empty}</div>
      )}
    </section>
  );
}

export default function BriefPane(p: BriefPaneProps) {
  const { view } = p;
  const deck = view.deck;

  // ---- no deck at all: two different sentences, never one ------------------
  if (!deck) {
    return (
      <div className="briefwrap">
        <div className="briefcol">
          <div className="eyeb">
            <span>THE BRIEF</span>
            <span className="r">{view.absence === "no-key" ? "NO ANSWER" : "NOT YET"}</span>
          </div>
          <div className="card bnone">
            <div className="lede">{view.absenceSay}</div>
            <div className="footline bnone-foot">
              STATE READ {clock(p.fetchedAt)} · THE 07:00 PUSH IS UNAFFECTED — IT IS SENT FROM HER BRAIN, NOT FROM THIS SCREEN
            </div>
          </div>
        </div>
      </div>
    );
  }

  const untrusted = untrustedNote(deck);

  return (
    <div className="briefwrap">
      <div className="briefcol">
        {/* ---- the head: what this is, and exactly what it covers ---------- */}
        <div className="eyeb">
          <span>THE BRIEF</span>
          <span className="r">
            {deck.day} · BUILT {clock(deck.at)}
          </span>
        </div>
        <div className="bwindow">
          Overnight window {deck.window} — she works while he does not.
        </div>

        {/* A deck she filed, that is no longer being refreshed. Not an error,
            and not current. Both halves get said. */}
        {view.stale ? (
          <div className="bstale">
            Her brain is not answering right now. This is the brief she filed at {clock(deck.at)} — still true as of then, not
            refreshed since.
          </div>
        ) : null}

        {/* The brief itself was built with a source down. */}
        {deck.state === "degraded" ? (
          <div className="bstale">This brief was built while her spine was down. It is a record of what she could reach, not of the day.</div>
        ) : null}

        {/* ---- THE ALL-CLEAR (C4) -----------------------------------------
            The common morning, and the one a dishonest brief would pad. It is
            TEAL, not green: green is the autonomy dot and nothing else. It is
            stated once, plainly, as the good outcome it is — and the four
            sections still render underneath so he can see exactly what was
            checked to earn it. */}
        {view.allClear ? (
          <div className="ballclear">
            <div className="bac-l">ALL CLEAR</div>
            <div className="bac-t">
              Nothing needs you, nothing is slipping, the night was quiet and the day is open. Every source answered — this is a
              measured all-clear, not an empty screen.
            </div>
          </div>
        ) : null}

        {/* R1, said on the surface rather than only in the code. */}
        {untrusted ? <div className="buntrusted">{untrusted}</div> : null}

        {deck.sections.map((s) => (
          <Section s={s} key={s.key} />
        ))}

        {/* ---- what it does NOT cover, every time -------------------------
            counters.ts's DELETED ledger, on the reading surface: a screen that
            reports "what needs you" has to name what it cannot see, or it is
            lying by omission. */}
        <div className="divrow bcov-head">
          <span className="l">WHAT THIS BRIEF CANNOT SEE</span>
          <span className="rule" />
        </div>
        {deck.coverage.map((c, i) => (
          <div className="bcov" key={`c${i}`}>
            {c}
          </div>
        ))}

        <div className="footnote bfoot">
          BUILT {clock(deck.at)} · STATE READ {clock(p.fetchedAt)} · THE 25-WORD PUSH STILL GOES AT 07:00 — THIS IS WHAT IT POINTS AT
        </div>
      </div>
    </div>
  );
}
