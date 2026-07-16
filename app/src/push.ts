import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { Channel } from "@capacitor/push-notifications";
import { BRAIN_URL, BRAIN_TOKEN } from "./config";

// EVE's three independently-tunable Android channels (04_PROACTIVE_ENGINE §5).
// importance: 5=MAX/heads-up, 3=DEFAULT(sound), 2=LOW(silent). visibility: 1=PUBLIC, 0=PRIVATE.
const EVE_CHANNELS: Channel[] = [
  { id: "brief", name: "Morning Brief", description: "The 7am brief and daily check-ins",
    importance: 3, visibility: 1, sound: "default", lights: true, lightColor: "#1CB9C8", vibration: true },
  { id: "nudge", name: "Nudges", description: "Reminders that shrink the task, never shout",
    importance: 2, visibility: 0, lights: false, vibration: false },
  { id: "tripwire", name: "Tripwires", description: "Urgent, time-critical alerts only",
    importance: 5, visibility: 1, sound: "default", lights: true, lightColor: "#C41E3A", vibration: true },
];

// Native-only. On web/dev this is a no-op so the browser build keeps working.
export async function initPush(onDeeplink: (link: string) => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  for (const channel of EVE_CHANNELS) {
    try {
      await PushNotifications.createChannel(channel);
    } catch (e) {
      console.warn("createChannel failed", channel.id, e);
    }
  }

  // Attach listeners BEFORE register() so the token isn't missed.
  await PushNotifications.addListener("registration", (t) => {
    fetch(`${BRAIN_URL}/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRAIN_TOKEN}` },
      body: JSON.stringify({ token: t.value, platform: "android" }),
    }).catch((e) => console.warn("register-push failed", e));
  });
  await PushNotifications.addListener("registrationError", (e) =>
    console.error("push registration error", e.error),
  );
  await PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
    const n = a.notification;
    const deeplink = n.link ?? (n.data && n.data.deeplink);
    if (deeplink) onDeeplink(deeplink);
  });

  // Android 13+ runtime permission.
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive === "granted") {
    await PushNotifications.register();
  } else {
    console.warn("push permission not granted:", perm.receive);
  }
}
