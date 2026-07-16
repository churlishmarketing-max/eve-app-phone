import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { saveMemory, searchMemory, logTouch, type MemoryKind } from "./memory.js";

// EVE's Phase-2 tools — all 🟢 GREEN tier (internal writes, no external sends).
// RED-tier tools (send_email etc.) arrive in Phase 3 and will emit
// confirm_request instead of executing (02 §6).

function text(s: string, isError = false) {
  return { content: [{ type: "text" as const, text: s }], ...(isError ? { isError: true } : {}) };
}

// Underscore server name — tool names the model sees follow
// mcp__{server_name}__{tool_name} (verified against live SDK docs).
export function buildMemoryServer(getConversationId: () => string | null) {
  return createSdkMcpServer({
    name: "eve_memory",
    version: "1.0.0",
    tools: [
      tool(
        "search_memory",
        "Search EVE's long-term memory (decisions, promises, facts, preferences, lessons). " +
          "Use whenever King references shared history — 'that thing we discussed', 'my', 'the plan', " +
          "'what did we decide'. Returns the top matches. If nothing comes back, say you don't have it — " +
          "NEVER invent a memory.",
        {
          query: z
            .string()
            .describe(
              "Distinctive keywords — names, projects, topics, nouns from the ask " +
                "(e.g. 'Supabase memory project'), NOT a full question. Retry once with " +
                "different keywords before concluding nothing exists.",
            ),
        },
        async ({ query }) => {
          const hits = await searchMemory(query);
          if (hits.length === 0) return text("No memory entries match. Do not fabricate — say so plainly.");
          return text(
            hits
              .map((h) => `[${h.kind} · ${h.created_at.slice(0, 10)} · salience ${h.salience}] ${h.content}`)
              .join("\n"),
          );
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "save_memory",
        "Save a durable memory entry IMMEDIATELY when the conversation contains an explicit decision, " +
          "promise, or preference ('let's always…', 'remind me to…', 'I've decided…'). Don't wait for the " +
          "nightly distillation. Keep content one self-contained sentence with concrete names/numbers/dates.",
        {
          kind: z.enum(["fact", "decision", "promise", "preference", "event", "lesson"]),
          content: z.string().describe("One self-contained sentence stating the durable fact"),
        },
        async ({ kind, content }) => {
          const r = await saveMemory(kind as MemoryKind, content, getConversationId() ?? undefined);
          return text(r.ok ? `Saved (${kind}).` : `Could not save: ${r.error}`, !r.ok);
        },
      ),
      tool(
        "log_touch",
        "Log REAL client contact (sent email, call held, meeting) — updates the client-pulse radar. " +
          "Drafts do NOT count as touches. Only log when King says contact actually happened.",
        {
          client: z.string().describe("Client name (fuzzy match ok)"),
          channel: z.enum(["email", "call", "slack", "meeting", "app"]),
          summary: z.string().describe("One line on what the contact was"),
        },
        async ({ client, channel, summary }) => {
          const r = await logTouch(client, channel, summary);
          return text(r.ok ? `Touch logged for ${client}.` : `Could not log touch: ${r.error}`, !r.ok);
        },
      ),
    ],
  });
}
