import cron from "node-cron";
import { runMorningBrief } from "./brief.js";
import { runDistill } from "./distill.js";
import { runPulseSweep } from "./pulse.js";
import { runFloorCheck, runCloseout, runWeekPreview, runRoutineRiskCheck } from "./proactive.js";
import { rotateLook } from "./rotation.js";
import { startClock } from "./clock.js";
import { startOsEventsPull } from "./os-events.js";
import { stamp } from "./health.js";

// Brandon is Central time. Same fallback as context.ts — a missing EVE_TZ
// must not put the scheduler and the context pack in different timezones
// (review finding C5).
const TZ = process.env.EVE_TZ || "America/Chicago";

function hmInTz(d: Date): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { h: h === 24 ? 0 : h, m };
}

// Quiet hours per 04_PROACTIVE_ENGINE §1: 21:30–06:30. The 07:00 brief sits
// just outside; any ad-hoc trigger inside the window is suppressed.
export function isQuietHours(d: Date): boolean {
  const { h, m } = hmInTz(d);
  const afterStart = h > 21 || (h === 21 && m >= 30);
  const beforeEnd = h < 6 || (h === 6 && m < 30);
  return afterStart || beforeEnd;
}

// ONE HOUSE B2.4 — "never drive the live brain". The crons (07:00 brief,
// 17:30 close-out, pulse, the unit clock …) run only on the hosted brain, or
// where someone deliberately sets EVE_SCHEDULERS=on. A laptop boot of this
// repo serves /chat and /state but never fires a job on its own. The
// Railway marker is the same kind of free-in-the-cloud signal push.ts's send
// wall uses. Returned with its reason so the boot log can say which.
export function schedulersGate(env: NodeJS.ProcessEnv = process.env): { on: boolean; why: string } {
  if (env.EVE_SCHEDULERS === "on") return { on: true, why: "EVE_SCHEDULERS=on" };
  // Any Railway-injected RAILWAY_* variable marks the hosted brain — the same
  // prefix scan push.ts uses, so a Railway rename can never silently stop the
  // 07:00 brief, the pulse, the unit clock and the OS pull (review M1).
  const marker = Object.keys(env).find((k) => k.startsWith("RAILWAY_") && env[k]);
  if (marker) return { on: true, why: `hosted (${marker} set)` };
  return { on: false, why: "no RAILWAY_* marker, EVE_SCHEDULERS is not on" };
}

export function startSchedulers(): void {
  cron.schedule(
    "0 7 * * *",
    () => {
      runMorningBrief()
        .then((r) => {
          stamp("brief", { ok: r.ok, reason: r.reason });
          console.log("[morning_brief]", r.ok ? `sent ${r.id}` : r.reason);
        })
        .catch((e) => console.error("[morning_brief] error", e));
    },
    { timezone: TZ },
  );
  // 11:45 weekdays — sales-floor pace; pushes only if behind (04 §1).
  cron.schedule(
    "45 11 * * 1-5",
    () => {
      runFloorCheck()
        .then((r) => console.log("[floor_check]", JSON.stringify(r)))
        .catch((e) => console.error("[floor_check] error", e));
    },
    { timezone: TZ },
  );
  // 12:30 pulse sweep — pushes only when something's quiet (04 §1).
  cron.schedule(
    "30 12 * * *",
    () => {
      runPulseSweep()
        .then((r) => console.log("[pulse_sweep]", r.ok ? `${r.quiet.length} quiet, pushed=${r.pushed}` : r.reason))
        .catch((e) => console.error("[pulse_sweep] error", e));
    },
    { timezone: TZ },
  );
  // 17:30 close-out — shipped vs slipped (04 §1).
  cron.schedule(
    "30 17 * * *",
    () => {
      runCloseout()
        .then((r) => console.log("[closeout]", JSON.stringify(r)))
        .catch((e) => console.error("[closeout] error", e));
    },
    { timezone: TZ },
  );
  // 20:00 BODY check — attention items, plus AT MOST ONE consolidated push
  // naming what's still open (N1→N2→N3 by consecutive missed days, no N4).
  // Silent when everything's ticked. No new slot was armed for the body: the
  // 07:00 brief carries the check-in ask as a clause and this slot carries the
  // evening nudge, both inside quiet hours 21:30–06:30.
  cron.schedule(
    "0 20 * * *",
    () => {
      runRoutineRiskCheck()
        .then((r) => console.log("[routine_risk]", JSON.stringify(r)))
        .catch((e) => console.error("[routine_risk] error", e));
    },
    { timezone: TZ },
  );
  // Sunday 19:00 — week preview (04 §1, optional).
  cron.schedule(
    "0 19 * * 0",
    () => {
      runWeekPreview()
        .then((r) => console.log("[week_preview]", JSON.stringify(r)))
        .catch((e) => console.error("[week_preview] error", e));
    },
    { timezone: TZ },
  );
  // 02:00 nightly distillation — no push (04 §1).
  cron.schedule(
    "0 2 * * *",
    () => {
      runDistill()
        .then((r) => {
          if (r.ok) stamp("distill", r as unknown as Record<string, unknown>);
          console.log("[distill]", JSON.stringify(r));
        })
        .catch((e) => console.error("[distill] error", e));
    },
    { timezone: TZ },
  );
  // Automatic wardrobe rotation — 3 look-changes a day (off-round minutes on
  // purpose). Pool is discovered live each run, so any newly-imported outfit is
  // eligible instantly. Silent (no push); the night slot inside quiet hours is
  // fine because nothing pings. Times land in the requested windows.
  const rotate = (slot: "morning" | "evening" | "night") =>
    rotateLook(slot)
      .then((r) => console.log("[wardrobe-rotate]", slot, r.ok ? `→ ${r.chosen} (${r.dayType}, pool ${r.poolSize})` : `skipped: ${r.reason}`))
      .catch((e) => console.error("[wardrobe-rotate] error", e));
  cron.schedule("14 7 * * *", () => void rotate("morning"), { timezone: TZ });   // ~07:14
  cron.schedule("22 18 * * *", () => void rotate("evening"), { timezone: TZ });  // ~18:22
  cron.schedule("43 22 * * *", () => void rotate("night"), { timezone: TZ });    // ~22:43
  // THE UNIT CLOCK — the eleventh slot, and the only one that is not a job of
  // her own. It wakes every minute, asks unit_schedules what is due, and hands
  // each due row to dispatchUnit (clock.ts). The ten above are unchanged: this
  // adds a drain beside them, it does not reschedule any of them.
  startClock();
  // ONE HOUSE 4c (4.3/4.4) — the minute OS pull. Armed here so it lives behind
  // the same gate as every cron above: a laptop boot never pulls or pushes.
  // Without CHURLISH_OS_TOKEN it arms nothing and logs that once (os-events.ts).
  startOsEventsPull();
  console.log(
    `[schedule] armed (${TZ}): 07:00 brief · 07:14/18:22/22:43 wardrobe · 11:45 floor (wk) · 12:30 pulse · 17:30 closeout · 20:00 routines · Sun 19:00 preview · 02:00 distill; quiet 21:30–06:30`,
  );
}
