import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The memory spine. Same rule as Firebase: if Supabase isn't configured yet,
// the brain still runs — chat works, memory features report unavailable.
let client: SupabaseClient | null = null;

export function initDb(): void {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[db] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — memory spine offline.");
    return;
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  console.log("[db] supabase client ready");
}

export function db(): SupabaseClient | null {
  return client;
}

export function isDbReady(): boolean {
  return client !== null;
}

// Test seam (verify/dispatch-harness.ts): swap in a fake client so the job
// writers can be proven without a network. Never called by the server.
export function _setDbForTests(c: SupabaseClient | null): void {
  client = c;
}
