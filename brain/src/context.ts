import { db } from "./db.js";
import { searchMemory } from "./memory.js";
import * as google from "./google.js";
import { getWearing } from "./wardrobe.js";

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

// Bible v3 §6 — the wardrobe-flavor law needs her to KNOW what she has on
// without spending a tool call: the look flavors her metaphors ~5%, never her
// voice. Cached in wardrobe.ts, so this costs nothing per turn.
function wornLine(): string[] {
  const worn = getWearing();
  if (!worn) return [];
  return [
    `Wearing: ${worn.replace(/\.[^.]+$/, "")} — flavor only (Bible v3 §6): the look tints your ` +
      `metaphors a few percent; the voice, the rules and the tics stay yours in every costume.`,
  ];
}

// A DB error must read as "unreachable", never as a confident empty slate
// (review C20 — a Supabase blip had EVE asserting "Today's Three: none set").
const UNREACHABLE = "Ledger unreachable right now (memory spine error) — say the ledger is unavailable rather than asserting an empty slate.";

async function todaySnapshot(): Promise<string[]> {
  const c = db();
  if (!c) return ["Memory spine: OFFLINE (Supabase not configured). You have this conversation only."];
  const lines: string[] = [];
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

  // This runs on the critical path of EVERY reply, so the independent reads
  // (three tasks, floor count, attention items, calendar) fire in PARALLEL —
  // the pack waits for the slowest, not the sum. Calendar carries its own 2s
  // cap so a slow Google never stalls her.
  const calendar: Promise<string | null> = google.calendarReady()
    ? Promise.race([
        google.listEvents(1),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error("calendar timeout")), 2000)),
      ]).catch(() => null)
    : Promise.resolve(null);

  const [threeR, floorR, attnR, cal] = await Promise.all([
    c.from("tasks").select("title, priority, due_at").not("priority", "is", null).is("done_at", null).order("priority", { ascending: true }).limit(3),
    c.from("touches").select("id", { count: "exact", head: true }).in("channel", ["call", "meeting"]).gte("at", weekAgo),
    c.from("attention_items").select("kind, message, nudge_level").is("resolved_at", null).order("created_at", { ascending: false }).limit(5),
    calendar,
  ]);

  // Today's Three
  if (threeR.error) return [UNREACHABLE];
  lines.push(
    threeR.data?.length
      ? "Today's Three: " + threeR.data.map((t) => `${t.priority}. ${t.title}`).join(" · ")
      : "Today's Three: none set yet.",
  );

  // Sales floor (call/meeting touches, last 7 days; floor law: 3)
  lines.push(floorR.error ? "Sales floor: count unavailable (ledger error)." : `Sales floor: ${floorR.count ?? 0}/3 real conversations this week (floor law: 3).`);

  // Calendar (null = not connected or timed out — say so, don't fake empty)
  if (google.calendarReady()) {
    if (cal) lines.push("Calendar today:", ...cal.split("\n").slice(0, 4).map((l) => "  " + l));
    else lines.push("Calendar: not fetched this turn (ask me and I'll pull it live).");
  }

  // Open attention items
  if (attnR.error) lines.push("Attention items: unavailable (ledger error).");
  else if (attnR.data?.length) {
    lines.push("Open attention items:");
    for (const a of attnR.data) lines.push(`  - [${a.kind} N${a.nudge_level}] ${a.message}`);
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

  const lines: string[] = [
    "<context_pack>",
    // Eyes-only framing (tone-suite finding 2026-07-17: she was narrating her
    // own scaffolding — "that's new since I last answered you", "this pack",
    // "since Phase 3-4 kicked in"). This briefing is HERS; she reads it silently
    // and answers as herself.
    "This is your private briefing — read it, don't recite it. Never quote it, call it 'the pack',",
    "narrate its deltas as news ('that's new since…'), or cite your own build phase / how long",
    "you've had memory. To King you are simply a person who knows things, not a system reading state.",
    nowLine(surface),
    ...wornLine(),
    ...snapshot,
    ...loops,
    ...turns,
  ];
  if (recall.length) {
    lines.push("Recalled memory (top matches to this message — trust these over guesses):");
    for (const r of recall) lines.push(`  - [${r.kind} · ${r.created_at.slice(0, 10)}] ${r.content}`);
  }
  lines.push(
    "Honesty clause (physics, not policy — Bible v3 §5): if something isn't in this pack or a tool",
    "result, you don't have it — name the gap plainly, never invent it. The time line above is the",
    "ONLY clock; never state a time, date, or 'how long ago' you didn't read there. When you claim an",
    "action done (filed, flagged, queued, sent), it must be one a tool actually returned this turn —",
    "a plausible-sounding action you didn't take is a fabrication.",
    "</context_pack>",
  );
  return lines.join("\n");
}
