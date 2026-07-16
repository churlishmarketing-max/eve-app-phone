import { WebClient } from "@slack/web-api";

// Slack READ access (Phase 3 scope is read-only; send_slack is RED and lands
// later). SLACK_TOKEN should be a user token (xoxp) so EVE sees what Brandon
// sees, or a bot token invited to the channels that matter.

let client: WebClient | null = null;

function token(): string | undefined {
  return process.env.SLACK_USER_TOKEN || process.env.SLACK_TOKEN;
}

export function ready(): boolean {
  return !!token();
}

export function statusDetail(): string {
  return ready() ? "user token set" : "needs SLACK_USER_TOKEN (xoxp — user scopes, so EVE sees what King sees)";
}

export function explainError(e: unknown): string {
  if (!ready()) return "Slack isn't wired up yet (needs a token in the brain's env). Say exactly that.";
  return `Slack call failed: ${e instanceof Error ? e.message : String(e)}`;
}

function c(): WebClient {
  if (!ready()) throw new Error("not connected");
  if (!client) client = new WebClient(token());
  return client;
}

export async function read(channel: string | undefined, max: number): Promise<string> {
  const web = c();
  const chans = await web.conversations.list({ types: "public_channel,private_channel", limit: 100 });
  const all = chans.channels ?? [];
  const targets = channel ? all.filter((ch) => ch.name === channel.replace(/^#/, "")) : all.filter((ch) => ch.is_member).slice(0, 5);
  if (targets.length === 0) return channel ? `No channel "#${channel}" I can see.` : "No channels I'm in yet.";
  const out: string[] = [];
  for (const ch of targets) {
    const hist = await web.conversations.history({ channel: ch.id!, limit: channel ? max : Math.ceil(max / targets.length) });
    const msgs = (hist.messages ?? [])
      .filter((m) => m.type === "message" && m.text)
      .map((m) => `  - ${m.text!.slice(0, 160)}`);
    if (msgs.length) out.push(`#${ch.name}:\n${msgs.join("\n")}`);
  }
  return out.length ? out.join("\n") : "Nothing recent in the channels I can see.";
}
