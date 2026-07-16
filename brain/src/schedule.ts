import cron from "node-cron";
import { runMorningBrief } from "./brief.js";
import { runDistill } from "./distill.js";
import { runPulseSweep } from "./pulse.js";
import { runFloorCheck, runCloseout, runWeekPreview, runRoutineRiskCheck } from "./proactive.js";
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
  // 20:00 routine risk — attention item only, no push (04 §2).
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
  console.log(
    `[schedule] armed (${TZ}): 07:00 brief · 11:45 floor (wk) · 12:30 pulse · 17:30 closeout · 20:00 routines · Sun 19:00 preview · 02:00 distill; quiet 21:30–06:30`,
  );
}
