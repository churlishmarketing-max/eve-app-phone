-- ============================================================
-- EVE — THE UNIT CLOCK v0.1 (standing orders for the 37 units)
-- Run once in the Supabase dashboard: SQL Editor → paste → Run.
-- Purely ADDITIVE and IDEMPOTENT. Safe to run twice. No drops, no data
-- updates, no change to any existing table or constraint.
-- Additions beyond the brief are marked ⚑ADDED with rationale.
--
-- WHY A TABLE AND NOT A CRON EXPRESSION IN CODE. The brain already runs ten
-- hardcoded crons (brain/src/schedule.ts) and not one of King's units can be
-- put on that clock. Every one of his standing orders has to survive a Railway
-- redeploy, so the schedule is DATA, not code, and not an in-process Map:
-- in-memory state has already cost this codebase one NOT DEPLOYABLE verdict.
-- The drain (brain/src/clock.ts) reads this table on a one-minute tick and
-- hands each due row to the EXISTING dispatch path (dispatch.ts dispatchUnit).
-- There is no second runner.
--
-- WHAT THIS TABLE IS NOT. It is not a permission grant. A row here says WHEN a
-- unit runs, never WHAT it may do — there is deliberately no tier, no tool
-- list, and no permission column (see ⚑DELIBERATELY ABSENT below). A scheduled
-- run is a DISPATCH, not a new autonomy: it inherits exactly the tier and
-- permissions the unit already has when King runs it by hand.
--
-- The brain boots and runs whether or not this file has been applied: the
-- drain reports the missing table once and does nothing else.
-- ============================================================

create table if not exists unit_schedules (
  id           uuid primary key default gen_random_uuid(),
  unit         text not null,                      -- registry key: 'starfire', 'research', 'pennyworth'
  task         text not null,                      -- the sentence handed to the unit, verbatim, every run
  why          text,                               -- her one-line routing reason (rides onto jobs.why)
  client       text,                               -- declared input for units that require one (pennyworth)
  cron         text not null,                      -- 5-field cron, produced from his words by clock.ts parseWhen()
  tz           text not null default 'America/Chicago',  -- same fallback as schedule.ts / context.ts (review C5)
  said         text,                               -- ⚑ADDED: HIS words that created it ("every monday at 9"), so
                                                   -- the read-back can quote him instead of quoting cron syntax
  enabled      boolean not null default true,
  created_by   text not null default 'king',       -- who created it. R4: only his own turn may write a row here;
                                                   -- clock.ts createSchedule() refuses any other authority.
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  next_run_at  timestamptz,                        -- ⚑ADDED: the CLAIM column — see the note below
  last_run_at  timestamptz,
  last_job_id  uuid references jobs(id),           -- the job row the last fire opened (null if it was refused)
  last_status  text,                               -- 'dispatched' | 'refused' | 'skipped_stale' | 'error'
  last_detail  text                                -- what she would say about that last fire, in words
);

-- ⚑ADDED: next_run_at. The brief asks for last_run_at; a due-scan needs the
-- other end of the interval too, and it is what makes double-firing
-- structurally impossible rather than merely unlikely. The drain CLAIMS a row
-- by advancing next_run_at with a compare-and-set (update … where id = $1 and
-- next_run_at = $2) BEFORE it dispatches. A second tick that overlaps the first
-- loses the CAS, updates nothing, and dispatches nothing. Without this column
-- the only guard would be an in-process boolean, which is the in-memory mistake
-- again. Nullable on purpose: a row typed by hand in the Supabase dashboard
-- with no next_run_at is ADOPTED on the next tick (clock.ts adoptSchedules)
-- rather than ignored — same "editable in the dashboard, zero redeploy" ethos
-- as app_state in rotation.ts.

-- ⚑DELIBERATELY ABSENT: tier. jobs.tier is written by dispatchUnit from the
-- unit's registry row (registry.ts Capability.runner), and that is the only
-- place a tier may come from. A tier column here would be a second, editable
-- source of truth for what a unit is allowed to do, and a standing order that
-- could widen a unit's tier is exactly the autonomy grant this table must not
-- be. Ruling R3.
-- ⚑DELIBERATELY ABSENT: tools / allowed_tools / permission_mode. A background
-- worker holds WORKER_TOOLS (dispatch.ts) and nothing else, in code. A manifest
-- row cannot widen it and neither can a schedule row.
-- ⚑DELIBERATELY ABSENT: catch_up / on_missed. The missed-run policy is one
-- rule for every row, stated once in code (clock.ts CATCH_UP_MS) and reported
-- on the row it skipped. A per-row knob would let one forgotten standing order
-- stampede a week of missed runs on the first boot after an outage.

-- The drain's only hot query: enabled rows whose next_run_at has passed.
create index if not exists unit_schedules_due_idx on unit_schedules (next_run_at) where enabled;
create index if not exists unit_schedules_unit_idx on unit_schedules (unit);

-- ============================================================
-- W1 · THE DURABLE CONVERSATION TAINT (R1 fifth door)
--
-- FOLDED INTO THIS FILE ON PURPOSE. 007 is unapplied, so this is ONE migration
-- for King to paste, not two. A migration pasted into the wrong Supabase
-- project has already happened once this month; every extra paste is another
-- chance to do it again. Still purely ADDITIVE and IDEMPOTENT — safe to run
-- twice, no drops, no data rewrites, no change to any existing column.
--
-- WHY A COLUMN AND NOT A MAP. The TurnLatch (brain/src/authority.ts) protects a
-- TURN. The model's memory is a CONVERSATION: chat.ts passes `resume`, so the
-- SDK reloads the whole thread including the RAW mail tool-result from turn 1.
-- The judge drove it — turn 1 reads mail and schedule_unit refuses (0 rows);
-- turn 2 of the SAME conversation is fully armed and WRITES a row created_by
-- 'king' whose task came out of the mailbox. Evicting the SDK session id on the
-- latch does not close it: it delays it exactly one turn, because the next turn
-- resumes a session that still contains the replay.
--
-- So the fact moves NEXT TO THE TRANSCRIPT IT MUST AGREE WITH: same store, same
-- table, same row, same lifetime. A restart cannot separate them, because
-- neither of them is in the brain's process.
--
-- MONOTONIC AGAINST EVERY WRITER. Exactly one writer exists
-- (brain/src/untrusted.ts markUntrustedRead) and it only ever writes `true`.
-- Nothing writes false — not an error, not eviction, not a restart. It ends
-- when the conversationId ends, which is what the deck's reset button does.
--
-- NOT MONOTONIC AGAINST ABSENCE, and that is why the read order matters. If the
-- row is LOST, `ensureConversation`'s upsert plus this column's `not null
-- default false` would RE-MINT it as clean. So chat.ts READS BEFORE IT MINTS and
-- readUntrustedTaintBeforeMint is the only thing allowed to interpret a missing
-- row (no row + a surviving transcript = orphan, which REFUSES; no row +
-- nothing at all = a genuinely new conversation, source 'new', never 'row').
--
-- AND THE READ FAILS CLOSED. If this column is absent the select errors and
-- brain/src/untrusted.ts reports UNKNOWN — which REFUSES. STATE THE COST
-- PLAINLY: until this file is applied, every authority-taking tool
-- (schedule_unit, cancel_schedule, dispatch_unit, calendar_create_event,
-- save_note, save_memory, log_touch, os_command writes, os_create_invoice)
-- refuses in her own words and names the migration as the reason. That is
-- deliberate. The alternative is a brain that puts work on his clock while
-- unable to say whether the instruction came out of his mailbox.
-- ============================================================

alter table conversations add column if not exists read_untrusted boolean not null default false;

comment on column conversations.read_untrusted is
  'MONOTONIC AGAINST EVERY WRITER. True once any turn of this conversation pulled third-party text in (mail, calendar, texts, notifications, OS client rows, filenames). Written BEFORE that text is returned to the model; nothing ever writes false. NOT monotonic against a LOST ROW: this default would re-mint one as clean, so brain/src/chat.ts reads the taint BEFORE ensureConversation and readUntrustedTaintBeforeMint interprets a missing row. An unreadable answer REFUSES every authority-taking tool.';

-- The distiller asks this column about a night of conversations at once
-- (brain/src/distill.ts), so the partial index is worth its bytes: the hot
-- question is "which of these are NOT clean".
create index if not exists conversations_read_untrusted_idx
  on conversations (id) where read_untrusted;
