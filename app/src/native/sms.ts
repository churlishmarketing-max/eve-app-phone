import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PermissionState, PluginListenerHandle } from "@capacitor/core";

// TS wrappers for the app-local SmsReader + SmsSender plugins
// (android/app/src/main/java/com/churlish/eve/plugins/). Every entry point is
// guarded by Capacitor.isNativePlatform() so web/dev builds no-op cleanly —
// same pattern as src/push.ts.

export interface SmsMessage {
  id: string;
  address: string;
  body: string;
  dateMs: number;
  read: boolean;
  threadId: string;
}

export interface GetInboxOptions {
  /** Max messages to return (newest first). Omit for all. */
  limit?: number;
  /** Only messages with date >= this epoch-ms. */
  sinceMs?: number;
}

export interface GetInboxResult {
  messages: SmsMessage[];
}

export interface SmsPermissionStatus {
  sms: PermissionState;
}

export interface SmsReceivedEvent {
  address: string;
  body: string;
  dateMs: number;
}

// ---- native plugin proxies ----

interface SmsReaderPlugin {
  getInbox(options: GetInboxOptions): Promise<GetInboxResult>;
  checkPermissions(): Promise<SmsPermissionStatus>;
  requestPermissions(): Promise<SmsPermissionStatus>;
  addListener(
    eventName: "smsReceived",
    listenerFunc: (event: SmsReceivedEvent) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

interface SmsSenderPlugin {
  send(options: { phoneNumber: string; message: string }): Promise<{ ok: true }>;
  checkPermissions(): Promise<SmsPermissionStatus>;
  requestPermissions(): Promise<SmsPermissionStatus>;
}

const SmsReader = registerPlugin<SmsReaderPlugin>("SmsReader");
const SmsSender = registerPlugin<SmsSenderPlugin>("SmsSender");

const DENIED: SmsPermissionStatus = { sms: "denied" };
const NOOP_HANDLE: PluginListenerHandle = { remove: async () => {} };

/** True when the native SMS plugins are available (Android app shell). */
export function smsSupported(): boolean {
  return Capacitor.isNativePlatform();
}

// ---- SmsReader ----

/** Read the SMS inbox, newest first. Web builds return an empty list. */
export async function getInbox(options: GetInboxOptions = {}): Promise<GetInboxResult> {
  if (!Capacitor.isNativePlatform()) return { messages: [] };
  return SmsReader.getInbox(options);
}

/** Current READ_SMS + RECEIVE_SMS state ({ sms }). Web builds report denied. */
export async function checkReadSmsPermissions(): Promise<SmsPermissionStatus> {
  if (!Capacitor.isNativePlatform()) return DENIED;
  return SmsReader.checkPermissions();
}

/** Runtime-request READ_SMS + RECEIVE_SMS. Web builds report denied. */
export async function requestReadSmsPermissions(): Promise<SmsPermissionStatus> {
  if (!Capacitor.isNativePlatform()) return DENIED;
  return SmsReader.requestPermissions();
}

/**
 * Subscribe to live incoming SMS. Returns a handle; call .remove() to stop.
 * On web this resolves to a no-op handle.
 */
export async function onSmsReceived(
  listener: (event: SmsReceivedEvent) => void,
): Promise<PluginListenerHandle> {
  if (!Capacitor.isNativePlatform()) return NOOP_HANDLE;
  return SmsReader.addListener("smsReceived", listener);
}

// ============================================================================
// SmsSender — RED TIER. DO NOT WIRE THIS TO ANYTHING AUTOMATIC.
// ----------------------------------------------------------------------------
// sendSms() physically transmits a text message from Brandon's SIM and cannot be
// undone. It must ONLY be called from the explicit app-side confirm flow (the
// user tapping "Confirm" on a RED-tier card). Never call it from a stream
// handler, a timer, a notification callback, or any other automatic path.
// ============================================================================

/** RED TIER — see the warning above. Only call after the app-side confirm flow. */
export async function sendSms(options: {
  phoneNumber: string;
  message: string;
}): Promise<{ ok: true }> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("sendSms is only available on the native Android build");
  }
  return SmsSender.send(options);
}

/** Current SEND_SMS state ({ sms }). Web builds report denied. */
export async function checkSendSmsPermissions(): Promise<SmsPermissionStatus> {
  if (!Capacitor.isNativePlatform()) return DENIED;
  return SmsSender.checkPermissions();
}

/** Runtime-request SEND_SMS. Web builds report denied. */
export async function requestSendSmsPermissions(): Promise<SmsPermissionStatus> {
  if (!Capacitor.isNativePlatform()) return DENIED;
  return SmsSender.requestPermissions();
}
