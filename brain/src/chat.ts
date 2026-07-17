import { query } from "@anthropic-ai/claude-agent-sdk";
import { staticSystemPrompt } from "./persona.js";
import { buildContextPack } from "./context.js";
import { ensureConversation, appendMessage } from "./memory.js";
import { buildMemoryServer } from "./tools.js";
import { buildConnectorServer, connectorToolNames } from "./connectors.js";
import type { PendingConfirm } from "./confirm.js";

const MODEL = process.env.EVE_MODEL || "claude-sonnet-5";

// conversationId (app-side) -> Agent SDK session id, so an app restart on the
// phone can resume the thread. In-memory; durable history lives in Supabase.
const sessions = new Map<string, string>();

export interface ChatEvents {
  onState: (state: "thinking" | "speaking" | "idle") => void;
  onToken: (text: string) => void;
  onTool: (name: string) => void;
  // RED-tier tool queued an external send — app renders the confirm card (02 §6).
  onConfirm?: (confirm: PendingConfirm) => void;
  onDone: (info: { conversationId: string; fullText: string }) => void;
  onError: (message: string) => void;
}

export async function runChat(
  conversationId: string,
  userMessage: string,
  surface: string,
  events: ChatEvents,
  abort?: AbortController,
): Promise<void> {
  const resumeSession = sessions.get(conversationId);
  let fullText = "";
  let speaking = false;
  let timedOut = false;

  // The SDK retries a 5xx up to CLAUDE_CODE_MAX_RETRIES times with backoff —
  // during an Anthropic outage that reads as a silent hang for minutes. Fail
  // honestly instead: abort and say what happened.
  const ac = abort ?? new AbortController();
  const deadline = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, 100_000);

  events.onState("thinking");

  try {
    // Persist the user turn + assemble context (parallel; both tolerate an
    // offline spine). History rehydrates from the durable store only when
    // there's no live SDK session to resume — a brain restart must not wipe
    // continuity (review C7), and a resumed session already has the turns.
    const [contextPack] = await Promise.all([
      buildContextPack(surface, userMessage, conversationId, !resumeSession),
      ensureConversation(conversationId, surface),
    ]);
    void appendMessage(conversationId, "user", userMessage);

    const memoryServer = buildMemoryServer(() => conversationId);
    const connectorServer = buildConnectorServer((c) => events.onConfirm?.(c));

    const q = query({
      // Volatile context rides in the user turn; system prompt stays static
      // (prompt-cache friendly).
      prompt: `${contextPack}\n\n${userMessage}`,
      options: {
        model: MODEL,
        systemPrompt: staticSystemPrompt,
        // Re-passed on every call including resumes — in-process MCP servers
        // don't persist with the session transcript.
        mcpServers: { eve_memory: memoryServer, eve_hands: connectorServer },
        // Memory + connector tools are pre-approved at the SDK layer. RED-tier
        // enforcement lives INSIDE the send tools (confirm.ts): they queue a
        // pending confirm and return — they cannot send. Live web (search +
        // fetch) is on: reads only, nothing external can be sent through it.
        // File/shell tools stay off — her body is the phone, not this box.
        allowedTools: [
          "mcp__eve_memory__search_memory",
          "mcp__eve_memory__save_memory",
          "mcp__eve_memory__log_touch",
          ...connectorToolNames,
          "WebSearch",
          "WebFetch",
        ],
        disallowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
        // Web hops + OS round-trips stack up fast in one answer; 12 keeps a
        // real research-then-act turn from dying mid-thought.
        maxTurns: 12,
        includePartialMessages: true,
        // A disconnected phone must not keep the loop burning tokens (C18);
        // the same controller carries the outage deadline.
        abortController: ac,
        ...(resumeSession ? { resume: resumeSession } : {}),
      },
    });

    for await (const message of q) {
      if (message.type === "system" && message.subtype === "init") {
        sessions.set(conversationId, message.session_id);
      } else if (message.type === "stream_event") {
        const event = message.event;
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          if (!speaking) {
            speaking = true;
            events.onState("speaking");
          }
          fullText += event.delta.text;
          events.onToken(event.delta.text);
        } else if (
          event.type === "content_block_start" &&
          event.content_block.type === "tool_use"
        ) {
          events.onTool(event.content_block.name);
        }
      } else if (message.type === "result") {
        if (message.subtype !== "success") {
          // Terminal error yield from the SDK. Stop here — falling through to
          // onState/onDone would double-fire onto an already-ended response
          // (review finding: ERR_STREAM_WRITE_AFTER_END on every agent error).
          // Evict the session id too: a poisoned resume must not permanently
          // break this conversation (review C27) — next turn rebuilds from
          // the durable store.
          sessions.delete(conversationId);
          events.onError(`agent result: ${message.subtype}`);
          return;
        }
      }
    }

    if (fullText.trim()) void appendMessage(conversationId, "eve", fullText);
    events.onState("idle");
    events.onDone({ conversationId, fullText });
  } catch (err) {
    sessions.delete(conversationId);
    events.onError(
      timedOut
        ? "the Anthropic API isn't answering right now (overloaded or down) — not your connection. Try again in a minute."
        : err instanceof Error
          ? err.message
          : String(err),
    );
  } finally {
    clearTimeout(deadline);
  }
}
