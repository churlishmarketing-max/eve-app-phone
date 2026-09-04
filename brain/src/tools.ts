import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { saveMemory, searchMemory, logTouch, type MemoryKind } from "./memory.js";
import { withheldRecallLine } from "./durable.js";
import { type DeskPack } from "./desk.js";

// EVE's Phase-2 tools — all 🟢 GREEN tier (internal writes, no external sends).
// RED-tier tools (send_email etc.) arrive in Phase 3 and will emit
// confirm_request instead of executing (02 §6).

function text(s: string, isError = false) {
  return { content: [{ type: "text" as const, text: s }], ...(isError ? { isError: true } : {}) };
}

// Underscore server name — tool names the model sees follow
// mcp__{server_name}__{tool_name} (verified against live SDK docs).
// `desk` is THIS TURN'S pack or null, and it is used for exactly one thing:
// G-I7, the barrier between an untrusted filename and her permanent memory.
// Defaulted, so every existing caller and every surface without a desk behaves
// byte-identically.
//
// SINCE AUDIT 6 (X1) THAT BARRIER IS NOT APPLIED HERE. It moved into the one
// door every durable write goes through (durable.ts), because the law was
// written in this file's comment and BROKEN ONE FUNCTION AWAY: connectors.ts's
// save_note wrote the same table through the same function with no barrier at
// all. The pack is now handed to the gate as part of the write's ORIGIN, so the
// two paths cannot disagree again — there is only one path.
export function buildMemoryServer(
  getConversationId: () => string | null,
  desk: DeskPack | null = null,
) {
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
          // WITHHELD IS NOT THE SAME ANSWER AS NOTHING (audit 6, X2). A row that
          // came out of a conversation this brain cannot rule a picture out of
          // is not recalled — and she is told the count, so "I don't have
          // anything on that" never gets said about something she is holding
          // back.
          const { hits, withheld } = await searchMemory(query);
          const held = withheldRecallLine(withheld);
          if (hits.length === 0) {
            return text(
              held
                ? `No memory entries I am allowed to read match. ${held} Do not fabricate — say so plainly.`
                : "No memory entries match. Do not fabricate — say so plainly.",
            );
          }
          return text(
            hits
              .map((h) => `[${h.kind} · ${h.created_at.slice(0, 10)} · salience ${h.salience}] ${h.content}`)
              .join("\n") + (held ? `\n\n${held}` : ""),
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
          // ONE DOOR (audit 6, X1). G-I7's filename barrier, the picture taint,
          // and the fail-closed unknown branch all live inside saveMemory now.
          // What used to be here was a LOCAL copy of the barrier, and a local
          // copy is exactly what let save_note ship without one.
          const r = await saveMemory(kind as MemoryKind, content, {
            kind: "conversation",
            conversationId: getConversationId() ?? "",
            desk,
          });
          if (r.withheld) return text(r.withheld.say, true);
          return text(r.ok ? `Saved (${kind}).` : `Could not save: ${r.error}`, !r.ok);
        },
      ),
      tool(
        "log_touch",
        "Log REAL client contact (sent email, call held, meeting) — updates the client-pulse radar. " +
          "Drafts do NOT count as touches. Only log when King says contact actually happened. " +
          "IT LOGS NOTHING ON A CONVERSATION A PICTURE HAS BEEN IN: a touch line is read back months " +
          "later as this client's history, so it is held to the same rule as a note. It tells you when it " +
          "withheld — say so, and never say the touch is logged when it is not.",
        {
          client: z.string().describe("Client name (fuzzy match ok)"),
          channel: z.enum(["email", "call", "slack", "meeting", "app"]),
          summary: z.string().describe("One line on what the contact was"),
        },
        async ({ client, channel, summary }) => {
          // THE THIRD DURABLE STORE, THROUGH THE SAME DOOR (audit 6, X1).
          // `touches.summary` is model-composed prose that pulse.ts reads back
          // into the prompt drafting the client update King sends — kin to the
          // spine, and ungated until someone enumerated the writers.
          const r = await logTouch(client, channel, summary, {
            kind: "conversation",
            conversationId: getConversationId() ?? "",
            desk,
          });
          if (r.withheld) {
            return text(
              `${r.withheld.say} The touch is NOT on his client radar and his cadence has not moved — do ` +
                `not tell him it is logged.`,
              true,
            );
          }
          return text(r.ok ? `Touch logged for ${client}.` : `Could not log touch: ${r.error}`, !r.ok);
        },
      ),
    ],
  });
}
