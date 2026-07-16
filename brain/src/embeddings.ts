// Embeddings adapter. Primary: Voyage AI (Anthropic's recommended embeddings
// partner). Fallback: none — callers use Postgres full-text search instead when
// no key is set, so recall works before Brandon supplies VOYAGE_API_KEY.
// Shape verified against live Voyage docs — see eve-memory-research workflow.

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
// PINNED: voyage-4 @ 1024 (API default dim). One-way once rows exist — changing
// model/dim means re-embedding the table. 200M free tokens covers years here.
const MODEL = process.env.VOYAGE_MODEL || "voyage-4";
export const EMBEDDING_DIM = 1024;

export function embeddingsAvailable(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

export async function embed(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key || texts.length === 0) return null;
  try {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        input: texts,
        model: MODEL,
        input_type: inputType,
      }),
    });
    if (!res.ok) {
      console.warn("[embeddings] voyage error", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    return json.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  } catch (err) {
    console.warn("[embeddings] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
