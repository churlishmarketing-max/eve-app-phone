# EVE Desktop — First Run

A checklist, not a story. Work top to bottom.

## Prereqs

All three are already done — kept here so you know what she depends on.

- [x] Node 20+ installed, dependencies installed, app built.
- [x] The Railway brain is live (verified read-only: `/health`, `/state`, `/wardrobe`, `/voice/voices` all answering).
- [x] Your brain token is linked into the Windows vault, encrypted. Nothing to paste.

If you ever need to re-link the token (new machine, rotated token):
`EVE_SETUP_TOKEN=<the token> node_modules\electron\dist\electron.exe scripts/link-token.cjs`
— or just paste it into THE WIRE inside the app, which does the same thing.


## Boot

Double-click **EVE** on your desktop. That's it — she opens.

Her token is already linked into the Windows vault, so there is nothing to paste.
Watch the title-bar dot: **LINK** (teal) means she's talking to her brain.
**DOWN** (red) means she isn't — see Troubleshooting.

If the icon ever goes missing, `C:\dev\eve\desktop\start-eve.bat` does the same job,
and `npm run dev` in that folder is the developer path (live reload, console output).


## First-flight hardware checklist

None of this runs offline or in mock mode — this is the real brain, your real mic, your real OS. Check each one yourself.

- [ ] **Deck renders live data.** Floor count, today's three, approvals — real numbers, not placeholders.
- [ ] **`Ctrl+Space` summons from another app.** Switch to your browser or editor, hit it, the overlay appears on top.
- [ ] **Tap-to-talk records, tap again sends.** Your words land in the deck as a `YOU` bubble — the transcript, not a guess at one.
- [ ] **She answers in the deck.** The reply streams in token-by-token, not all at once.
- [ ] **A voice-in turn speaks aloud** — unless `SILENT AT THE DESK` is toggled on.
- [ ] **Typed turns never speak.** Type a message and confirm there's no audio out.
- [ ] **Tray icon shows her state and changes when she does.** Click it — the flyout opens with approvals in it, and APPROVE works right from there.
- [ ] **A RED confirm steals focus once, and only once.** Trigger one, approve or cancel it, confirm the round-trip completes and focus isn't stolen a second time.
- [ ] **Quiet hours hold.** After 21:30, no toasts fire and the tray dims.
- [ ] **Wardrobe panel opens on a portrait click** and shows her real closet count — not a placeholder number.

## Troubleshooting

- **Dot shows DOWN.** Check the token, check the brain URL in THE WIRE, check that the Railway brain is actually up (`/health` in a browser).
- **No voice out.** Check `SILENT AT THE DESK` first, then the ElevenLabs connector status on THE WIRE, then your output device in Windows sound settings.
- **Summon won't appear.** Something else on your machine owns `Ctrl+Space`. Change the hotkey in settings.
- **You see a "shell" screen.** A pane says `Her brain is unreachable, so this screen is a shell. It fills in the moment she answers.` That's not a bug — that's the honesty law working.

---

See you at the Friday Five.
