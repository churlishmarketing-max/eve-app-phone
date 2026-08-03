-- ============================================================
-- EVE — Phase 6: health / habits / routine (Founder-OS tab 06 parity)
-- Run once in the Supabase dashboard: SQL Editor → paste → Run.
-- Additions beyond 001 are marked ⚑ADDED with rationale.
--
-- ONE LAW: a real-world fact gets exactly ONE owner. Three disjoint owners
-- cover this whole tab, so no fact is stored twice and no sync is needed:
--   energy / sleep / the day's note   -> daily_checkins   (below)
--   every checkbox AND every habit    -> routines + routine_days (below)
--   sales conversations               -> floorView() in floor.ts, NO STORAGE
-- The check-in's "Trained", "Deep-work block" and "Ate right" boxes are habits
-- rendered in a different card — they are `routines` rows, not columns here.
-- That is why daily_checkins has no booleans at all.
-- ============================================================

-- ---- the daily check-in: one row per KING-LOCAL day (America/Chicago) ----
-- on_date is always written from brain/src/day.ts localDay(), never date(now()):
-- now() is UTC and would roll his day over at 7pm his time.
create table if not exists daily_checkins (
  on_date     date primary key,            -- the local day IS the identity
  energy      int check (energy between 1 and 5),
  sleep_hours numeric(3,1) check (sleep_hours >= 0 and sleep_hours <= 24),
  note        text,                        -- the one-line "how's the head today?"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- ⚑DELIBERATELY ABSENT: calls_done. His Founder-OS check-in has a "3 calls done"
-- box (Cockpit.jsx:835), but sales conversations are ALREADY counted by floor.ts
-- across two ledgers with a max() reconciliation (floor.ts:97-102). A boolean
-- here would be a second counter for the same act and the two would drift —
-- the exact bug the header comment at floor.ts:5-12 exists to kill. The tab
-- renders that box from floorView(); it has no storage and no writer.
-- ⚑DELIBERATELY ABSENT: trained / deep_work / ate_right. They are `routines`
-- rows with slot='checkin' (below), so the tick path is identical to a habit's
-- and there is exactly one place a "did he train today" answer comes from.

-- ---- habits = the EXISTING routines table, EXTENDED (never a second table) ----
alter table routines add column if not exists created_at timestamptz not null default now();
alter table routines add column if not exists active     boolean     not null default true;
alter table routines add column if not exists sort_order int         not null default 100;

-- ⚑ADDED: slot is PRESENTATION ONLY — which card the row draws in. It carries
-- no storage semantics, so it cannot create a second ledger the way a
-- pass-through column would. 'checkin' rows draw as the check-in card's
-- checkboxes; 'habit' rows draw in NON-NEGOTIABLE HABITS with a streak counter.
alter table routines add column if not exists slot text not null default 'habit'
  check (slot in ('habit', 'checkin'));

-- ---- per-day habit ledger: the history `routines` cannot hold ----
-- PK (routine_id, on_date) makes a tick idempotent BY CONSTRUCTION rather than
-- by a read-then-branch (ops.ts:23-25); untick is a delete; the 7-day strip is
-- a range scan; a non-contiguous week (done Mon, skip Tue, done Wed) is
-- representable, which a single last_done_on column can never be.
create table if not exists routine_days (
  routine_id uuid not null references routines(id) on delete cascade,
  on_date    date not null,
  done_at    timestamptz not null default now(),
  primary key (routine_id, on_date)
);
create index if not exists routine_days_date_idx on routine_days (on_date desc);

-- Backfill the ONE day that is recoverable. Everything before last_done_on is
-- genuinely gone — `routines` never stored it. Streaks start honest from here.
insert into routine_days (routine_id, on_date)
  select id, last_done_on from routines where last_done_on is not null
  on conflict do nothing;

-- ---- seed the check-in boxes as routines rows (idempotent) ----
-- "3 sales conversations" is NOT seeded: it is floorView(), rendered read-only.
insert into routines (name, cadence, slot, sort_order)
  select v.name, 'daily', 'checkin', v.ord
  from (values ('Trained', 10), ('Deep-work block', 20), ('Ate right', 30)) as v(name, ord)
  where not exists (select 1 from routines r where r.name = v.name);

-- ---- partial upsert by day (energy now, sleep later, note later) ----
-- An RPC rather than a JS .upsert(): explicit merge semantics, one round trip,
-- same pattern as match_memories in 001. COALESCE returns the first NON-NULL
-- argument, so an omitted field (SQL NULL) preserves the existing value while
-- an explicitly sent 0 or '' overwrites it.
create or replace function upsert_checkin(
  p_date   date,
  p_energy int     default null,
  p_sleep  numeric default null,
  p_note   text    default null
) returns daily_checkins language sql volatile as $$
  insert into daily_checkins as d (on_date, energy, sleep_hours, note)
  values (p_date, p_energy, p_sleep, p_note)
  on conflict (on_date) do update set
    energy      = coalesce(excluded.energy,      d.energy),
    sleep_hours = coalesce(excluded.sleep_hours, d.sleep_hours),
    note        = coalesce(excluded.note,        d.note),
    updated_at  = now()
  returning d.*;
$$;
