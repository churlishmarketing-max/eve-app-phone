#!/usr/bin/env node
// One-time Google OAuth mint for EVE (single user — Brandon's own account).
// ⚑VERIFIED 2026-07-16: OOB flow is REMOVED; desktop apps must use the
// loopback redirect. Run this ONCE after creating the OAuth client, from the
// brain directory (it resolves googleapis from brain/node_modules):
//
//   cd C:\dev\eve\brain
//   node scripts/google-auth.mjs <CLIENT_ID> <CLIENT_SECRET>
//
// Never paste real credentials into this file — they belong in .env only.
//
// It opens the consent URL, catches the redirect on 127.0.0.1:53682, and
// prints the three lines to paste into brain/.env. Requires the OAuth
// consent screen to be PUBLISHED TO PRODUCTION (Testing mode refresh tokens
// die every 7 days).

import http from "node:http";
import { exec } from "node:child_process";
import { google } from "googleapis";

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error("usage: node scripts/google-auth.mjs <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/cb`;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT);
const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // force refresh-token reissue even on re-runs
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== "/cb") return res.end();
  const code = u.searchParams.get("code");
  if (!code) {
    res.end("No code — try again.");
    return;
  }
  res.end("EVE is connected. You can close this tab.");
  server.close();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      "\nNo refresh_token returned. Revoke EVE's access at myaccount.google.com/permissions and run again.",
    );
    process.exit(1);
  }
  console.log("\nPaste these into C:\\dev\\eve\\brain\\.env:\n");
  console.log(`GOOGLE_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("\nThen restart the brain. Gmail + Calendar tiles go LIVE.");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Waiting for consent on " + REDIRECT + " …\nOpening browser. IMPORTANT: tick ALL scope checkboxes.");
  // Quoted start handles & fine; caret-escaping inside quotes corrupts the URL.
  exec(`start "" "${url}"`);
  console.log("\nIf the browser didn't open, paste this URL yourself:\n\n" + url + "\n");
});
