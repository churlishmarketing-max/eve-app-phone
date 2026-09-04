-- 006_durable_origin.sql — WHERE A PERMANENT MEMORY CAME FROM (audit 6, X1/X2)
--
-- ###########################################################################
-- DO NOT RUN THIS YET. THE SHIPPING BUILD DOES NOT NEED IT.
--
-- Picture intake is OFF (brain/src/intake.ts, audit 7 NOT DEPLOYABLE). With
-- the door shut a durable row is withheld from recall only on a PROVED taint,
-- and there is none: `conversations.saw_image` is true for 0 of his 115
-- conversations, and the deployed brain at 4cf6a1c has no image path at all,
-- so no picture has ever reached it. MEASURED, not assumed — with this column
-- absent, `npx tsx verify/recall-measure.ts` reports 159 of 159 rows
-- recallable, 0 withheld.
--
-- The brain handles its absence deliberately rather than by accident:
--   * saveMemory retries the insert without the stamp (memory.ts), so no note,
--     no fact and no check-in line fails on a column that is not there;
--   * the provenance select re-issues without the column, so a row that names
--     a source_conversation is STILL joined to conversations.saw_image and a
--     positive taint there still withholds it;
--   * /health.durableOriginReady reports FALSE, and that is CORRECT — not a
--     fault, not a to-do, and not something to apply this file to silence.
--
-- RUN IT ON THE DAY PICTURE INTAKE IS SWITCHED BACK ON, AND RUN IT FIRST.
-- With pixels reaching the model a durable row must be able to say where it
-- came from, and until this column exists recall withholds EVERYTHING on
-- purpose (X2, fail-closed). verify/intake-harness.ts proves both states.
-- ###########################################################################
--
-- Purely ADDITIVE and IDEMPOTENT. Safe to run twice. No drops, no data
-- rewrites, no change to any existing column, no backfill.
--
-- ---------------------------------------------------------------------------
-- WHY THIS COLUMN EXISTS
--
-- Audit 6's single load-bearing finding: the picture taint gated PLAN BUILDING
-- when the thing that needed gating was ANYTHING DURABLE THAT OUTLIVES THE
-- CONVERSATION. `save_note` — GREEN, no confirm card, documented to her as
-- needing no confirmation — wrote straight into `memory_entries` with NO
-- source_conversation and no gate. `searchMemory` then read that row back into
-- every later conversation under "trust these over guesses", and into the brief
-- handed to unattended fleet workers. A folder name that existed only as glyphs
-- in a screenshot reached a real confirm card in a different, genuinely clean
-- thread three turns later.
--
-- Gating the write closes tomorrow. It does not close today, because his store
-- ALREADY HOLDS ROWS WRITTEN BEFORE THE FIX — and the proven chain runs through
-- exactly those rows. So the read side has to classify a row too, and a row can
-- only be classified if it says where it came from.
--
-- ---------------------------------------------------------------------------
-- THE THREE ANSWERS, AND THERE IS NO FOURTH
--
--   'conversation'  a turn caused this write. Its `source_conversation` is set,
--                   and recall joins that to `conversations.saw_image` (sql/005)
--                   before the row may be read back.
--   'system'        no conversation behind it and no path a picture could take:
--                   the nightly pulse, a vitals check-in he typed into his own
--                   textarea, a cron job. Readable without a join.
--   NULL            no recorded origin. Every row written before this build.
--                   NOT PROVABLY CLEAN, therefore WITHHELD from recall.
--
-- ---------------------------------------------------------------------------
-- THERE IS DELIBERATELY NO BACKFILL, AND THE COST IS STATED RATHER THAN HIDDEN
--
-- An `update memory_entries set origin = 'system' where origin is null` would
-- make her memory work again in one statement and would be a lie: it would
-- declare the pre-fix population — the population D6-10's card was minted out of
-- — free of pictures, which nothing in this repo can check. So legacy rows stay
-- NULL and stay quarantined. brain/src/memory.ts counts them and hands her one
-- line saying items were WITHHELD rather than letting her say she never had
-- them.
--
-- UNTIL THIS FILE IS APPLIED, the provenance select errors and recall returns
-- NOTHING — fail-closed, the same posture filing has had since sql/005, and
-- reported the same way on /health.
-- ---------------------------------------------------------------------------

alter table memory_entries
  add column if not exists origin text;

alter table memory_entries
  drop constraint if exists memory_entries_origin_check;

alter table memory_entries
  add constraint memory_entries_origin_check
  check (origin is null or origin in ('conversation', 'system'));

comment on column memory_entries.origin is
  'Audit 6. Where this durable row came from: conversation (join source_conversation -> conversations.saw_image before recalling) | system (no conversation, no picture path) | NULL (written before the gate existed — not provably clean, withheld from recall).';

create index if not exists memory_entries_origin_idx on memory_entries (origin);
