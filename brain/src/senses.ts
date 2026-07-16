// HER SENSES (Phase 4, 05 §7): the app forwards incoming SMS and phone
// notifications here while it's open. Transient by LAW, not by laziness —
// 02 §7: raw SMS bodies stay OUT of long-term memory. Ring buffers only,
// capped at 100 each with a 24h TTL, never a database write. A brain restart
// wipes them, and that's fine: the phone is the source of truth.

export interface SensedText {
  address: string;
  body: string;
  dateMs: number;
}

export interface SensedNotification {
  package: string;
  title: string | null;
  text: string | null;
  postTimeMs: number;
}

const CAP = 100;
const TTL_MS = 24 * 60 * 60_000;

// receivedAt is OUR clock — TTL can't be skewed by a wrong phone timestamp.
const texts: (SensedText & { receivedAt: number })[] = [];
const notifications: (SensedNotification & { receivedAt: number })[] = [];

function prune<T extends { receivedAt: number }>(buf: T[]): void {
  const cutoff = Date.now() - TTL_MS;
  while (buf.length && buf[0].receivedAt < cutoff) buf.shift();
  while (buf.length > CAP) buf.shift();
}

export function addText(t: SensedText): void {
  texts.push({ ...t, receivedAt: Date.now() });
  prune(texts);
}

export function addNotification(n: SensedNotification): void {
  notifications.push({ ...n, receivedAt: Date.now() });
  prune(notifications);
}

/** Newest first. Only what the app forwarded while open, within 24h. */
export function recentTexts(n: number): SensedText[] {
  prune(texts);
  return texts
    .slice(-n)
    .reverse()
    .map(({ receivedAt: _r, ...t }) => t);
}

/** Newest first. Only what the app forwarded while open, within 24h. */
export function recentNotifications(n: number): SensedNotification[] {
  prune(notifications);
  return notifications
    .slice(-n)
    .reverse()
    .map(({ receivedAt: _r, ...t }) => t);
}
