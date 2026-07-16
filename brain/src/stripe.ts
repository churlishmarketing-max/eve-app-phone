import Stripe from "stripe";

// Stripe READ-ONLY snapshot. Use a RESTRICTED key (read-only on charges,
// customers, subscriptions) — never the full secret key. STRIPE_API_KEY.

let client: Stripe | null = null;

function key(): string | undefined {
  return process.env.STRIPE_KEY || process.env.STRIPE_API_KEY;
}

export function ready(): boolean {
  return !!key();
}

export function statusDetail(): string {
  return ready() ? "restricted key set" : "needs STRIPE_KEY (rk_… restricted, read-only)";
}

export function explainError(e: unknown): string {
  if (!ready()) return "Stripe isn't wired up yet (needs a restricted read-only key). Say exactly that.";
  return `Stripe call failed: ${e instanceof Error ? e.message : String(e)}`;
}

function c(): Stripe {
  if (!ready()) throw new Error("not connected");
  if (!client) client = new Stripe(key()!);
  return client;
}

export async function snapshot(): Promise<string> {
  const s = c();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [charges, subs] = await Promise.all([
    s.charges.list({ limit: 100, created: { gte: Math.floor(monthStart.getTime() / 1000) } }),
    s.subscriptions.list({ status: "active", limit: 100 }),
  ]);
  const paid = charges.data.filter((ch) => ch.paid && !ch.refunded);
  const volume = paid.reduce((sum, ch) => sum + ch.amount, 0) / 100;
  const currency = (paid[0]?.currency ?? "usd").toUpperCase();
  const mrr =
    subs.data.reduce((sum, sub) => {
      const item = sub.items.data[0];
      const amount = (item?.price?.unit_amount ?? 0) * (item?.quantity ?? 1);
      const interval = item?.price?.recurring?.interval;
      return sum + (interval === "year" ? amount / 12 : amount);
    }, 0) / 100;
  return [
    `This month so far: ${paid.length} paid charges, ${volume.toFixed(2)} ${currency}.`,
    `Active subscriptions: ${subs.data.length} (≈${mrr.toFixed(2)} ${currency}/mo).`,
    ...paid.slice(0, 5).map((ch) => `- ${(ch.amount / 100).toFixed(2)} ${ch.currency.toUpperCase()} · ${ch.description ?? ch.billing_details?.name ?? ch.id}`),
  ].join("\n");
}
