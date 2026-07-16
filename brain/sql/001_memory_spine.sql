-- ============================================================
-- EVE — Phase 2 memory spine (03_MEMORY_SPEC §2, verbatim tables)
-- Run once in the Supabase dashboard: SQL Editor → paste → Run.
-- Additions beyond the spec are marked ⚑ADDED with rationale.
-- ============================================================

-- Supabase convention: extensions live in the `extensions` schema.
create extension if not exists vector with schema extensions;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  surface text not null,               -- app | voice | glasses | capture
  started_at timestamptz default now(),
  summary text                          -- filled by distillation
);

create table if not exists messages (
  id bigint generated always as identity primary key,
  conversation_id uuid references conversations(id),
  role text not null check (role in ('user','eve')),
  content text not null,
  created_at timestamptz default now()
);

-- Embedding dim 1024 = voyage-4 default (spec's 1536 carried a ⚑VERIFY flag and
-- was wrong — that's an OpenAI dim; verified against live Voyage docs 2026-07-16).
-- Model pinned in brain/src/embeddings.ts; changing it later = re-embed the table.
create table if not exists memory_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in
    ('fact','decision','promise','preference','event','lesson')),
  content text not null,
  source_conversation uuid references conversations(id),
  salience int not null default 3,      -- 1..5; decayed monthly, bumped on recall
  status text not null default 'active' check (status in ('active','superseded')),
  created_at timestamptz default now(),
  last_recalled_at timestamptz,         -- ⚑ADDED: needed for the spec's own decay rule
                                        -- ("unrecalled in 30 days") to be computable
  embedding extensions.vector(1024)
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cadence_days int not null default 7,  -- pulse cadence, per client
  last_touch_at timestamptz,
  status text not null default 'active',
  notes text
);

create table if not exists touches (
  id bigint generated always as identity primary key,
  client_id uuid references clients(id),
  channel text,                          -- email | call | slack | meeting | app
  summary text,
  source_link text,                      -- e.g. Gmail thread URL
  at timestamptz default now()
);

create table if not exists attention_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                    -- silent_client | overdue | tripwire |
                                         -- review_due | renewal | routine_risk
  ref jsonb,                             -- pointer to client/task/etc
  message text,                          -- generated, in character
  nudge_level int not null default 1,    -- escalation state (04 §4)
  due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz default now()   -- ⚑ADDED: ordering + "today" queries
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  agent text,                            -- pennyworth | red-robin | ... | eve
  title text not null,
  status text not null default 'queued'
    check (status in ('queued','running','in_approvals','done','failed')),
  result_ref text,                       -- storage path / doc link
  created_at timestamptz default now(),
  finished_at timestamptz
);

create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cadence text not null default 'daily',
  streak int not null default 0,
  last_done_on date
);

create table if not exists runs (                      -- observability (02 §8)
  id bigint generated always as identity primary key,
  job text, detail jsonb, ok boolean, at timestamptz default now()
);

-- ⚑ADDED: tasks. The spec's own machinery references tasks without defining a
-- table — attention rule `overdue` is "task past due" (04 §2), capture "parses →
-- task" (02 §3), and Today's Three needs a source. Minimal shape, single-user.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text,
  client_id uuid references clients(id),
  source_link text,                      -- capture provenance (email thread etc.)
  priority int,                          -- 1..3 = Today's Three slot; null = backlog
  due_at timestamptz,
  done_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- Recall: semantic search RPC (cosine distance), active entries only,
-- salience-weighted. Single-user table stays tiny → no ANN index needed
-- (exact scan is fine well past 10k rows; add HNSW later if it ever grows).
-- ============================================================
create or replace function match_memories(
  query_embedding extensions.vector(1024),
  match_count int default 6
)
returns table (
  id uuid, kind text, content text, salience int,
  created_at timestamptz, similarity float
)
language sql stable as $$
  select
    m.id, m.kind, m.content, m.salience, m.created_at,
    1 - (m.embedding <=> query_embedding) as similarity
  from memory_entries m
  where m.status = 'active' and m.embedding is not null
  -- Salience-weighted ordering: distance dominates, salience breaks near-ties.
  -- ⚑ The 0.02/point blend is a starting heuristic, not doc-verified — tune later;
  -- pure `order by m.embedding <=> query_embedding` is the documented baseline.
  order by (m.embedding <=> query_embedding) - (m.salience * 0.02)
  limit match_count;
$$;

-- Keyword fallback (no embedding key configured yet): Postgres full-text search.
alter table memory_entries
  add column if not exists fts tsvector
  generated always as (to_tsvector('english', content)) stored;
create index if not exists memory_entries_fts on memory_entries using gin (fts);

-- ============================================================
-- Seed template (edit + run the inserts you want; examples commented out)
-- ============================================================
-- insert into clients (name, cadence_days, last_touch_at) values
--   ('Acacia Wellness', 7, now() - interval '11 days'),
--   ('TrueNorth',       7, now() - interval '8 days');
-- insert into routines (name) values ('Morning sales block'), ('Inbox zero sweep');
