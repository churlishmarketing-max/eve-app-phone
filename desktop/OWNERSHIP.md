# EVE Desktop — stream file ownership

Five streams build this app in parallel. **Touch only the files your stream
owns.** If you need something from another stream's file, ask for it rather
than editing across the line — that is how two streams silently overwrite each
other.

Repo rule for all streams: build only inside `desktop/`. Never touch `app/`,
`brain/`, or anything else in `C:\dev\eve`.

---

## S1 — CORE SCAFFOLD (built; this is the authoritative list from the S1 spec)

Owns the shell, the wire, and the harnesses. Everything below is S1's.

| file | what it is |
|---|---|
| `package.json` | scripts: `dev`, `build`, `typecheck`, `smoke`, `shots` |
| `tsconfig.json` | renderer + shared (`src/`) |
| `tsconfig.node.json` | main/preload + shared + the vite config (`electron/`) |
| `electron.vite.config.ts` | three builds: main, preload, renderer (two HTML entries) |
| `index.html` | deck entry |
| `summon.html` | summon entry |
| `electron/main.ts` | lifecycle, single-instance lock, windows, IPC table, global hotkey, tray wiring, smoke + shots harness blocks |
| `electron/windows.ts` | deck + summon window factories, geometry persistence, broadcast |
| `electron/api.ts` | ALL brain HTTP, SSE pump, never throws to renderer |
| `electron/secrets.ts` | safeStorage token: encrypt at rest, main-process only |
| `electron/config.ts` | `userData/config.json`, atomic writes, env overrides |
| `electron/quiet.ts` | quiet-hours law, pure and unit-testable |
| `electron/tray.ts` | tray icon + tooltip + click (v1 stub; icon art is S4's) |
| `electron/toasts.ts` | toast policy engine |
| `electron/poll.ts` | 30s `/state` poll, cache, diffing |
| `electron/preload.ts` | `contextBridge` → `window.eve` |
| `src/shared/contract.ts` | every shared type + the IPC channel constants |
| `src/shared/fixtures.ts` | `EVE_MOCK=1` fixture data |
| `src/renderer/deck.main.tsx` | deck React entry (**stub — S2 replaces the body**) |
| `src/renderer/summon.main.tsx` | summon React entry (**stub — S4 replaces the body**) |
| `scripts/smoke.mjs` | `npm run smoke` launcher |
| `scripts/shots.mjs` | `npm run shots` launcher + verifier |
| `OWNERSHIP.md` | this file |

**Shared files that only S1 edits.** `contract.ts` and `fixtures.ts` are read by
everyone and written by S1. Need a type or a fixture? Ask S1 to add it. Do not
edit them in place — a merge conflict there breaks all four other streams at
once.

---

## S1b — BRIDGE (added; wave-2 kickoff)

Small surgical additions so S2/S3/S4 can start with zero shared-file edits.
Did not restructure anything S1 built.

| file | what it is |
|---|---|
| `flyout.html` | third renderer HTML entry — flyout, mirrors `summon.html` |
| `src/renderer/flyout-main.tsx` | flyout React entry (**stub — S4 replaces the body**) |
| `scripts/shot.mjs` | generic `node scripts/shot.mjs <url> <outPath> [WxH]` screenshot harness (any `?shot=<key>` URL), companion to `shots.mjs` |
| `src/renderer/shots/index.ts` | merges s3/s4 scenario maps, `resolveShot()` — **S1b, do not edit; add scenarios in your own s3/s4 file** |

New IPC channels (contract.ts + preload.ts + main.ts handler table): `deckFocus()`,
`openExternal(target)` (main-side allowlist: "os"/"gmail" only — never accepts
a raw URL from the renderer), `flyoutHide()` (no-ops safely until S4 creates
the flyout window and calls `windows.registerWindow("flyout", win)`).

Voice mocks under `EVE_MOCK=1` (fixtures.ts + api.ts): `voices()` now returns
`id:"mock-rachel"`; `speak()` now returns a real (hand-built, silent)
`audio/mpeg` ArrayBuffer instead of `null`; `transcribe()` was already
spec-conformant, unchanged.

**FROZEN for wave 2 — S2/S3/S4 must not edit these:** `package.json`,
`electron.vite.config.ts`, `electron/preload.ts`, `electron/main.ts`,
`electron/windows.ts`, `electron/config.ts`, `src/shared/contract.ts`,
`src/shared/fixtures.ts`. Need a change to any of these? Ask, do not edit —
same rule as `contract.ts`/`fixtures.ts` above, now extended to the rest of
the S1 surface plus this wave's additions.

---

## S2 — DECK UI

- `src/renderer/deck/**` (starting from the `Deck.tsx` placeholder)
- the body of `src/renderer/deck.main.tsx` (keep the root mount and the
  `window.__RENDER_DONE` flag — `shots.mjs` waits on it)

Artboard A: presence rail, TALK column, DATA column (TODAY / OPS / BODY strip).

## S3 — SCREENS

- `src/renderer/confirm/**` — Artboard C, the RED confirm modal, including the
  frozen `ConfirmCard.tsx` (S1b placeholder — S2/S4 already compile against
  its `ConfirmCardProps`; replace the body, keep the signature)
- `src/renderer/settings/**` — Artboard F, SETTINGS/WIRE
- `src/renderer/body/**` — Artboard D, the full BODY pane
- `src/renderer/wardrobe/**` — her closet
- `src/renderer/shots/s3-scenarios.tsx` — your `?shot=<key>` scenarios;
  `src/renderer/shots/index.ts` merges this in but is not yours to edit

## S4 — SUMMON, TRAY, VOICE

- `src/renderer/summon/**` and the body of `src/renderer/summon.main.tsx`
- `src/renderer/tray-flyout/**` — Artboard E, the 360x480 flyout, including
  the frozen `TrayFlyout.tsx` placeholder; the body of `flyout-main.tsx`
  (S1b scaffold, mirrors summon.main.tsx — keep the root mount and the
  `window.__RENDER_DONE` flag). When you create the real flyout `BrowserWindow`,
  call `windows.registerWindow("flyout", win)` right after construction so
  `flyoutHide()` (and anything else keyed by name later) can reach it.
- `src/renderer/voice/**` — the frozen `events.ts` (fully working, not a
  placeholder — extend, do not replace the emitter shape) and `MicButton.tsx`
  placeholder
- `src/renderer/shots/s4-scenarios.tsx` — your `?shot=<key>` scenarios; same
  note as S3's — `shots/index.ts` is not yours to edit
- tray **icon art**: the four variants behind `setTrayState()` in
  `electron/tray.ts` (S1 left a `TODO` at the exact seam — that one function is
  yours; the rest of the file is not)
- the voice loop in the renderer (mic capture → `window.eve.voice.transcribe` →
  `chat.start` → `window.eve.voice.speak`)
- the push-to-talk refinement decision (see the PTT limitation note in
  `electron/main.ts`) — a native keyboard hook is a **dependency decision for
  the boss**, not a thing to add unilaterally

## S5 — DESIGN SYSTEM

- the plain-CSS design system / token sheet the other renderer streams import

> ⚑ Only the **S1** table above is transcribed from a spec. The S2–S5 lines are
> derived from the roles the S1 spec names ("S2 deck UI, S3 screens, S4
> summon/tray/voice") plus the placeholder files it told S1 to create, and from
> its note that "design system css arrives from another stream". They are a
> starting map, not an authoritative one — **confirm the S2–S5 boundaries with
> the boss before relying on them.**

---

## House rules for every stream

1. **All brain HTTP is main-process work.** The renderer talks IPC only. There
   is no `fetch` in the renderer and no `connect-src` to the brain in the CSP.
2. **The token never crosses the bridge.** `config.get()` returns the boolean
   `tokenSet` and the non-secret `brainUrl`, and that is the whole story.
3. **Prove it with `npm run shots`.** Both PNGs land in `desktop/verify/`.
   Windows stay hidden — a test run never takes King's screen.
4. **`npm run typecheck` and `npm run smoke` must stay green** before you hand
   your stream off.
