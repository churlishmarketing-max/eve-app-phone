// EVE's notebook — King's private Discord #eve-notes channel (server: Backpack),
// reached through an incoming WEBHOOK. Deliberately write-only: he said he
// doesn't need her reading the channel back, and a webhook has no read scope,
// no bot application, no token, and no privileged intent to maintain. If we
// ever want her conversing IN Discord, that's a bot — a different build that
// this doesn't block (the notes stay as real messages in the channel).
//
// Every note ALSO lands in her durable memory (connectors.ts calls saveMemory
// alongside this), so "what did you note about X?" works off her own spine
// without ever reading Discord. Discord is the surface HE browses; memory is
// the surface SHE recalls from. One write, two homes.

const LIMIT = 2000; // Discord's hard per-message character cap — exceeding it 400s
const CHUNK = 1900; // headroom for the "(2/3)" part marker we prepend

function webhook(): string | undefined {
  return process.env.DISCORD_NOTES_WEBHOOK_URL || undefined;
}

export function notesReady(): boolean {
  return !!webhook();
}

export function notesStatusDetail(): string {
  return notesReady()
    ? "webhook set → Discord #eve-notes"
    : "needs DISCORD_NOTES_WEBHOOK_URL (Discord → #eve-notes → Integrations → Webhooks)";
}

// Split a long note so nothing is ever silently dropped. Prefers paragraph
// breaks, then line breaks, then a hard cut — a note that loses its second half
// is worse than one that arrives in two messages.
function chunk(text: string): string[] {
  if (text.length <= CHUNK) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > CHUNK) {
    const window = rest.slice(0, CHUNK);
    // break at the last paragraph, else last newline, else last space
    let cut = window.lastIndexOf("\n\n");
    if (cut < CHUNK * 0.5) cut = window.lastIndexOf("\n");
    if (cut < CHUNK * 0.5) cut = window.lastIndexOf(" ");
    if (cut < CHUNK * 0.5) cut = CHUNK; // no good seam — hard cut
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

// One POST, with a single 429 retry honoring Discord's retry_after (seconds,
// float). Webhooks are rate limited per-webhook; multi-part notes post
// sequentially, so a burst of parts is the realistic way to trip it.
async function post(url: string, content: string): Promise<{ ok: boolean; status: number; error?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ac = new AbortController();
    const deadline = setTimeout(() => ac.abort(), 10_000);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
        signal: ac.signal,
      });
      if (r.status === 429 && attempt === 0) {
        const j = (await r.json().catch(() => ({}))) as { retry_after?: number };
        await new Promise((res) => setTimeout(res, Math.min(5000, (j.retry_after ?? 1) * 1000 + 100)));
        continue;
      }
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        return { ok: false, status: r.status, error: body.slice(0, 200) || `HTTP ${r.status}` };
      }
      return { ok: true, status: r.status };
    } catch (e) {
      return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
    } finally {
      clearTimeout(deadline);
    }
  }
  return { ok: false, status: 429, error: "rate limited twice" };
}

// Post a note to #eve-notes. Returns how many messages it took so the caller can
// report honestly rather than claiming a clean single write.
export async function postNote(
  body: string,
  title?: string,
): Promise<{ ok: boolean; parts?: number; error?: string }> {
  const url = webhook();
  if (!url) return { ok: false, error: "notebook not connected (DISCORD_NOTES_WEBHOOK_URL unset)" };
  const text = body.trim();
  if (!text) return { ok: false, error: "empty note" };

  const head = title?.trim() ? `**${title.trim()}**\n` : "";
  const parts = chunk(head + text);

  for (let i = 0; i < parts.length; i++) {
    const marker = parts.length > 1 ? `*(${i + 1}/${parts.length})*\n` : "";
    const payload = (marker + parts[i]).slice(0, LIMIT);
    const r = await post(url, payload);
    if (!r.ok) {
      return {
        ok: false,
        parts: i,
        error: i > 0 ? `part ${i + 1}/${parts.length} failed: ${r.error}` : r.error,
      };
    }
  }
  return { ok: true, parts: parts.length };
}
