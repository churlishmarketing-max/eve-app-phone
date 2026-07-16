-- Push tokens must survive a redeploy. Hosted filesystems (Railway/Fly) are
-- ephemeral: a JSON file on disk is wiped every deploy, so the 7:00 brief
-- would silently fail until the app next launched. Single-user, so this stays
-- tiny; the brain reads it with the service-role key only.

create table if not exists push_tokens (
  token text primary key,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_updated_idx on push_tokens (updated_at desc);

-- Small durable key/value for brain state that must outlive a redeploy —
-- currently just the look she's wearing (her choice; 05 §5). Same reason as
-- above: a hosted filesystem forgets, and she shouldn't get undressed by a
-- deploy.
create table if not exists app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
