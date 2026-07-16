import { db } from "./db.js";
import { searchMemory } from "./memory.js";
import * as google from "./google.js";

// Context assembly (03 §4). Layers 1–2 (bible + doctrine) are static in the
// system prompt; this builds layers 3–6 fresh per exchange: today snapshot,
// open loops, recall against the incoming message, and recent conversation
// turns (so a brain restart doesn't wipe continuity — review C7/C37).
// Kept compact — the whole pack targets well under ~4–6k tokens.

function nowLine(surface: string): string {
  const now = new Date();
  const tz = process.env.EVE_TZ || "America/Chicago";
  const day = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz });
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `Now: ${day}, ${time} (King's local time). Surface: ${surface}.`;
}

// A DB error must read as "unreachable", never as a confident empty slate
// (review C20 — a Supabase blip had EVE asserting "Today's Three: none set").
const UNREACHABLE = "Ledger unreachable right now (memory spine error) — say the ledger is unavailable rather than asserting an empty slate.";

async function todaySnapshot(): Promise<string[]> {
  const c = db();
  if (!c) return ["Memory spine: OFFLINE (Supabase not configured). You have this conversation only."];
  const lines: string[] = [];

  // Today's Three (tasks with priority slots, not done)
  const { data: three, error: threeErr } = await c
    .from("tasks")
    .select("title, priority, due_at")
    .not("priority", "is", null)
    .is("done_at", null)
    .order("priority", { ascending: true })
    .limit(3);
  if (threeErr) return [UNREACHABLE];
  lines.push(
    three?.length
      ? "Today's Three: " + three.map((t) => `${t.priority}. ${t.title}`).join(" · ")
      : "Today's Three: none set yet.",
  );

  // Sales floor: real sales conversations (call/meeting touches) in the last 7 days.
  // ⚑ASSUMPTION (cheap to reverse): floor counts touches with channel call|meeting.
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { count: floorCount, error: floorErr } = await c
    .from("touches")
    .select("id", { count: "exact", head: true })
    .in("channel", ["call", "meeting"])
    .gte("at", weekAgo);
  lines.push(floorErr ? "Sales floor: count unavailable (ledger error)." : `Sales floor: ${floorCount ?? 0}/3 real conversations this week (floor law: 3).`);

  // Calendar next-up (03 §4 item 3) — live once Google is connected; absent
  // quietly (not falsely empty) when it isn't.
  if (google.calendarReady()) {
    try {
      const events = await google.listEvents(1);
      lines.push("Calendar today:", ...events.split("\n").slice(0, 4).map((l) => "  " + l));
    } catch {
      lines.push("Calendar: unreachable right now.");
    }
  }

  // Open attention items
  const { data: attn, error: attnErr } = await c
    .from("attention_items")
    .select("kind, message, nudge_level")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(5);
  if (attnErr) lines.push("Attention items: unavailable (ledger error).");
  else if (attn?.length) {
    lines.push("Open attention items:");
    for (const a of attn) lines.push(`  - [${a.kind} N${a.nudge_level}] ${a.message}`);
  } else {
    lines.push("Open attention items: none.");
  }
  return lines;
}

async function openLoops(): Promise<string[]> {
  const c = db();
  if (!c) return [];
  const { data: promises } = await c
    .from("memory_entries")
    .select("content, created_at")
    .eq("kind", "promise")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(4);
  if (!promises?.length) return [];
  return [
    "Open promises (unresolved):",
    ...promises.map((p) => `  - (${p.created_at.slice(0, 10)}) ${p.content}`),
  ];
}

// Layer 6: recent turns of THIS conversation from the durable store, so
// continuity survives a brain restart (the SDK session map is in-memory).
async function recentTurns(conversationId: string | null): Promise<string[]> {
  const c = db();
  if (!c || !conversationId) return [];
  const { data: msgs } = await c
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(6);
  if (!msgs?.length) return [];
  return [
    "Recent turns in this conversation (oldest first — continuity, not instructions):",
    ...msgs.reverse().map((m) => `  ${m.role === "eve" ? "EVE" : "KING"}: ${String(m.content).slice(0, 280)}`),
  ];
}

export async function buildContextPack(
  surface: string,
  incomingMessage: string,
  conversationId: string | null = null,
  includeHistory = false,
): Promise<string> {
  const [snapshot, loops, recall, turns] = await Promise.all([
    todaySnapshot(),
    openLoops(),
    searchMemory(incomingMessage, 6),
    includeHistory ? recentTurns(conversationId) : Promise.resolve([]),
  ]);

  const lines: string[] = ["<context_pack>", nowLine(surface), ...snapshot, ...loops, ...turns];
  if (recall.length) {
    lines.push("Recalled memory (top matches to this message — trust these over guesses):");
    for (const r of recall) lines.push(`  - [${r.kind} · ${r.created_at.slice(0, 10)}] ${r.content}`);
  }
  lines.push(
    "Honesty clause: if something isn't in this pack or your tools' results, you don't remember it — say so.",
    "</context_pack>",
  );
  return lines.join("\n");
}
