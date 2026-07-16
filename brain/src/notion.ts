import { Client } from "@notionhq/client";

// Notion read access via an internal-integration token (NOTION_API_KEY).
// Brandon must also share the relevant pages/databases with the integration.

let client: Client | null = null;

function token(): string | undefined {
  return process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
}

export function ready(): boolean {
  return !!token();
}

export function statusDetail(): string {
  return ready() ? "integration token set" : "needs NOTION_TOKEN (ntn_… internal integration) + pages shared with it";
}

export function explainError(e: unknown): string {
  if (!ready()) {
    return "Notion isn't wired up yet (needs an internal-integration token and pages shared with it). Say exactly that.";
  }
  return `Notion call failed: ${e instanceof Error ? e.message : String(e)}`;
}

function c(): Client {
  if (!ready()) throw new Error("not connected");
  if (!client) client = new Client({ auth: token() });
  return client;
}

export async function search(query: string): Promise<string> {
  const r = await c().search({ query, page_size: 8 });
  if (r.results.length === 0) return `Nothing in Notion matches "${query}" (or it isn't shared with my integration).`;
  return r.results
    .map((item: any) => {
      const title =
        item.properties?.title?.title?.[0]?.plain_text ??
        item.properties?.Name?.title?.[0]?.plain_text ??
        item.title?.[0]?.plain_text ??
        "(untitled)";
      return `- [${item.object}] ${title} · ${item.url ?? ""}`;
    })
    .join("\n");
}
