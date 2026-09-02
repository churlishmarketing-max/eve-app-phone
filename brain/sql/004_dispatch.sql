-- 004_dispatch.sql — THE DISPATCHER v0.1 (D-DISPATCH §1.1)
--
-- Purely ADDITIVE and IDEMPOTENT. Safe to run twice. No drops, no data updates,
-- no change to the existing jobs_status_check constraint: v0.1 uses only the
-- five statuses that already exist (queued, running, in_approvals, done,
-- failed). The three new lifecycle states in D-DISPATCH (proposed,
-- needs_input, cancelled) arrive with v0.2 and their own migration.
--
-- The brain detects these columns at boot with one probing select
-- (dispatch.ts probeDispatchSchema). Until this file is applied it runs in
-- pre-migration mode — unit rides in `agent`, the rest is held in memory —
-- and says so on /health.dispatchReady. Nothing here is required for the
-- brain to boot.

alter table jobs add column if not exists host            text default 'brain';   -- 'brain' | 'desk'
alter table jobs add column if not exists unit            text;                   -- roster key: 'pennyworth', 'jsa', 'research'
alter table jobs add column if not exists spec            jsonb;                  -- {said, unit, routedBy, routedWhy, inputs?} — his sentence verbatim
alter table jobs add column if not exists result          jsonb;                  -- what a REPORT returned. Never written speculatively.
alter table jobs add column if not exists awaiting        jsonb;                  -- v0.2: the open question when status='needs_input'. NULL in v0.1.
alter table jobs add column if not exists parent_id       uuid references jobs(id); -- v0.2: step jobs. NULL in v0.1.
alter table jobs add column if not exists step            int  default 1;         -- v0.2: step number under parent_id
alter table jobs add column if not exists cost_usd        numeric;                -- ACTUAL spend from the SDK result. NULL = unmeasured (renders as a dash)
alter table jobs add column if not exists desk_id         text;                   -- v0.3: which install executed a desk job. NULL in v0.1.
alter table jobs add column if not exists conversation_id text;                   -- so the receipt lands in the right thread
alter table jobs add column if not exists why             text;                   -- her one-line routing reason (shows on the job row)
alter table jobs add column if not exists tier            text;                   -- 'green' | 'red' — the tier of the job's next/last action
alter table jobs add column if not exists confirm_id      text;                   -- the pending confirm this job is waiting on (in-memory id; resolves → done/failed)
alter table jobs add column if not exists updated_at      timestamptz default now();

-- /state.jobs reads the last 24 h newest-first; /state.fleet derives lastRunAt per unit.
create index if not exists jobs_created_at_idx on jobs (created_at desc);
create index if not exists jobs_unit_idx       on jobs (unit);
create index if not exists jobs_status_idx     on jobs (status);
