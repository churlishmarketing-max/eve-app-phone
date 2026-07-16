# 03 — MEMORY SPEC

Memory is the difference between EVE and every stateless assistant Brandon has
tried — including the amnesiac glasses build. It lives server-side in Supabase
so **every surface shares one memory**; when the glasses are updated in Phase
5 they inherit it for free.

## 1. Three layers

| Layer | What | Where |
|---|---|---|
| **Live context** | The current conversation | request payload + `messages` table |
| **The ledger** | Structured facts: decisions, promises, clients, cadences, preferences, goals, jobs, routines | typed tables below |
| **Recall** | Semantic search over distilled memory entries | `memory_entries` + pgvector |

## 2. Schema (Postgres / Supabase — enable `pgvector`)

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  surface text not null,               -- app | voice | glasses | capture
  started_at timestamptz default now(),
  summary text                          -- filled by distillation
);

create table messages (
  id bigint generated always as identity primary key,
  conversation_id uuid references conversations(id),
  role text not null check (role in ('user','eve')),
  content text not null,
  created_at timestamptz default now()
);

create table memory_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in
    ('fact','decision','promise','preference','event','lesson')),
  content text not null,
  source_conversation uuid references conversations(id),
  salience int not null default 3,      -- 1..5; decayed monthly, bumped on recall
  status text not null default 'active' check (status in ('active','superseded')),
  created_at timestamptz default now(),
  embedding vector(1536)                -- ⚑VERIFY dims for chosen embedding model
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cadence_days int not null default 7,  -- pulse cadence, per client
  last_touch_at timestamptz,
  status text not null default 'active',
  notes text
);

create table touches (
  id bigint generated always as identity primary key,
  client_id uuid references clients(id),
  channel text,                          -- email | call | slack | meeting | app
  summary text,
  source_link text,                      -- e.g. Gmail thread URL
  at timestamptz default now()
);

create table attention_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                    -- silent_client | overdue | tripwire |
                                         -- review_due | renewal | routine_risk
  ref jsonb,                             -- pointer to client/task/etc
  message text,                          -- generated, in character
  nudge_level int not null default 1,    -- escalation state (04 §4)
  due_at timestamptz,
  resolved_at timestamptz
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  agent text,                            -- pennyworth | red-robin | ... | eve
  title text not null,
  status text not null default 'queued'
    check (status in ('queued','running','in_approvals','done','failed')),
  result_ref text,                       -- storage path / doc link
  created_at timestamptz default now(),
  finished_at timestamptz
);

create table routines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cadence text not null default 'daily',
  streak int not null default 0,
  last_done_on date
);

create table runs (                      -- observability (02 §8)
  id bigint generated always as identity primary key,
  job text, detail jsonb, ok boolean, at timestamptz default now()
);
```

The **goal ledger** (targets, standing rules, current-phase directives) lives
as a versioned markdown document in storage, editable only by Brandon (RED),
and is injected into context as a digest — it is law, not memory.

## 3. Writing memory

- Every exchange appends to `messages`.
- **In-flight capture:** when a conversation contains an explicit decision,
  promise, or preference ("let's always...", "remind me to...", "I've decided"),
  the brain writes a `memory_entries` row immediately via a `save_memory` tool
  — don't wait for the nightly job.
- **Client touches:** any interaction that constitutes real client contact
  (sent email, logged call, meeting) writes a `touches` row and bumps
  `clients.last_touch_at`. Drafts do NOT count as touches.

## 4. Context assembly — every `/chat` exchange

Build, in order, inside a token budget (~guideline: keep the pack under ~4–6k
tokens; tune):

1. Character Bible (static, cached)
2. Doctrine digest (static, cached)
3. **Today snapshot:** date/time, calendar next-up, Today's Three, sales-floor
   count, open attention items
4. **Open loops:** unresolved promises + top attention items
5. **Recall:** top-k (k≈6) `memory_entries` by embedding similarity to the
   incoming message, salience-weighted, `status='active'` only
6. Last N messages of the current conversation (N≈20, then rely on summary)

This is what makes her answer Brandon mid-story instead of in a vacuum.

## 5. Nightly distillation (n8n → `POST /job {job:"distill"}`)

1. Pull the day's messages per conversation.
2. Brain summarizes each conversation → `conversations.summary`.
3. Extract durable entries (decisions, facts, promises, lessons) →
   `memory_entries` with embeddings; supersede contradicted entries
   (`status='superseded'`, never delete — history matters).
4. Detect client touches mentioned in conversation → `touches`.
5. Monthly: decay salience by 1 for entries unrecalled in 30 days (floor 1).

She remembers the **substance** of the day, the way a person does — not a
transcript dump.

## 6. Recall rules (binding on the agent)

- `search_memory(query)` is a first-class tool; use it whenever the user
  references shared history ("that thing we discussed", "my", "the plan").
- **Honesty clause:** if recall returns nothing, she says she doesn't have it —
  charmingly, but plainly. She never fabricates a memory. Test this in Phase 2
  DoD with a planted false premise.
- Recalled entries get a salience bump (+1, cap 5).
