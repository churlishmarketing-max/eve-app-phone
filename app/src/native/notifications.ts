import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

// TS wrapper for the app-local NotificationListener plugin
// (android/app/src/main/java/com/churlish/eve/plugins/). Guarded by
// Capacitor.isNativePlatform() so web/dev builds no-op cleanly.

export interface NotificationEvent {
  /** Source app package, e.g. "com.whatsapp". */
  package: string;
  /** May be null when the notification carries no title. */
  title: string | null;
  /** May be null when the notification carries no text. */
  text: string | null;
  postTimeMs: number;
}

interface NotificationListenerPlugin {
  isEnabled(): Promise<{ enabled: boolean }>;
  openSettings(): Promise<void>;
  addListener(
    eventName: "notificationReceived" | "notificationRemoved",
    listenerFunc: (event: NotificationEvent) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const NotificationListener =
  registerPlugin<NotificationListenerPlugin>("NotificationListener");

const NOOP_HANDLE: PluginListenerHandle = { remove: async () => {} };

/** True when the native NotificationListener plugin is available. */
export function notificationListenerSupported(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Whether EVE's NotificationListenerService is enabled in system settings.
 * This access is user-granted only (not a runtime permission). Web builds
 * report false.
 */
export async function isNotificationAccessEnabled(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const { enabled } = await NotificationListener.isEnabled();
  return enabled;
}

/** Open the system "Notification access" settings screen. No-op on web. */
export async function openNotificationAccessSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await NotificationListener.openSettings();
}

/**
 * Subscribe to posted notifications. Returns a handle; call .remove() to stop.
 * On web this resolves to a no-op handle.
 */
export async function onNotificationPosted(
  listener: (event: NotificationEvent) => void,
): Promise<PluginListenerHandle> {
  if (!Capacitor.isNativePlatform()) return NOOP_HANDLE;
  return NotificationListener.addListener("notificationReceived", listener);
}

/**
 * Subscribe to removed/dismissed notifications. Returns a handle; call .remove()
 * to stop. On web this resolves to a no-op handle.
 */
export async function onNotificationRemoved(
  listener: (event: NotificationEvent) => void,
): Promise<PluginListenerHandle> {
  if (!Capacitor.isNativePlatform()) return NOOP_HANDLE;
  return NotificationListener.addListener("notificationRemoved", listener);
}
