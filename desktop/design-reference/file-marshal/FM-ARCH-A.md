# FM-ARCH-A — Filing hands, Architecture A

**Optimised for: law purity and minimum new surface.**
Bias: reuse the shipped `clientAction` / confirm machinery as completely as possible. Zero new HTTP endpoints. Smallest brain diff that is still correct.

Assembled 2026-08-31 against the code as read (`brain/src/{confirm,connectors,chat,context,index,senses}.ts`, `desktop/{electron,src}/**`). Nothing in `C:\dev\eve` was modified.

---

## 0. The one-sentence shape

> **The desktop is an eye and a hand. The brain is the only mind.**
> The eye rides in the existing `POST /chat` body as a folder briefing (`desk`), so she can see filenames without the brain ever touching a disk. The hand is the existing `clientAction` path: one new RED-shaped tool queues one confirm carrying an explicit `from → to` list, and **Electron's main process executes it inside `ipcMain.handle(IPC.confirm)` — the same handler that already exists** — so the renderer never gains the power to move a file, only to approve one.

Three properties fall straight out of that and are the reason to pick this arm:

1. **The brain cannot name a path.** Every path in the plan is *folder-label-relative* (`"downloads/Invoice 4411.pdf"`). The label→root map lives only in the desktop's config. A hallucinating, prompt-injected, or outright hostile brain has no vocabulary for `C:\Windows`, `C:\Users\mrkin\.ssh`, or `\\server\share`. The Python prior art defended a deny-list of forbidden prefixes (`guardrails.py:31-39`); this design makes the forbidden prefixes *inexpressible*.
2. **The renderer cannot request a file operation.** There is no "move this file" IPC channel. The only path to `fs.renameSync` starts with a brain-minted, hash-bound confirm that main itself resolved against the brain. This is stricter than the phone's SMS path, where the renderer calls `sendSms` directly after approval (`EveApp.tsx:511`).
3. **Zero new brain endpoints, zero new DB tables, zero new env vars.** The diff is 6 changed files + 1 new file, all inside the existing agent-turn path.

---

## 1. THE LOOP — "sort my downloads", every hop

### Hop 0 (continuous, desktop-local) — the eye

`electron/desk/scan.ts` maintains an inventory of the wired folders. It is a *sense organ*, structurally identical to the phone's SMS/notification senses (`brain/src/senses.ts:1-5`: "Transient by LAW… Ring buffers only… never a database write") except the buffer lives on the desktop, not the brain.

- Watched via `fs.watch` on each root (debounced 750 ms) plus a floor re-scan every 60 s and one on window focus.
- Depth 2 max. Never follows a reparse point. Skips hidden/system entries and the never-touch list.
- Result cached in main. **It is never sent anywhere on its own.**

### Hop 1 — he types "sort my downloads" into the deck

Renderer: `window.eve.chat.start({ message })` — unchanged (`preload.ts:48`).
Main: `IPC.chatStart` → `api.startChat(...)` — unchanged handler, one changed line inside `api.ts`:

```ts
body: JSON.stringify({
  message: args.message,
  conversationId: args.conversationId ?? null,
  surface: "desktop",
  ...(desk.pack() ? { desk: desk.pack() } : {}),   // <- the only new field on the wire
}),
```

`desk.pack()` returns `null` when filing hands are off or no folder is wired. **This is the entire "how does she learn what files exist" answer: the listing rides the request he already made, in the request body that already exists.**

The `desk` block, as actually sent (real numbers from a busy Downloads):

```json
{
  "protocol": 1,
  "deskId": "a5f1…",                       // stable per-machine uuid, config.json
  "at": "2026-08-31T14:02:11.804Z",
  "limits": { "maxBatch": 500, "inlineMax": 20, "maxListing": 400 },
  "staging": { "label": "trash", "files": 6, "bytes": 44100310 },
  "folders": [
    {
      "label": "downloads",
      "files": 412,
      "bytes": 9114230122,
      "dirs": ["Old", "Clients", "Clients/Acme"],
      "listed": 300,
      "truncated": true,
      "omitted": 112,
      "recent": [
        { "n": "Invoice 4411.pdf", "d": "", "kb": 1204, "age": 0.2 },
        { "n": "acme-contract-v3.docx", "d": "", "kb": 88, "age": 1.1 }
        // … 150 newest, with size + age
      ],
      "names": ["setup_x64.exe", "IMG_2213.HEIC", "…"]   // names only, the rest, up to the cap
    },
    { "label": "desktop", "files": 37, "bytes": 210338911, "dirs": [], "listed": 37, "truncated": false, "recent": [ /* all 37 */ ], "names": [] }
  ],
  "recentBatches": [
    { "batchId": "b7f2…", "at": "2026-08-31T09:40:02Z", "op": "move", "intent": "clear July invoices",
      "moved": 14, "skipped": 1, "failed": 0, "undone": false }
  ]
}
```

Two deliberate properties:

- **Tiered detail, so she always knows what she cannot see.** The 150 newest entries carry size and age; every *remaining* filename is still present as a bare string. Over the cap, `truncated:true` + `omitted:N` is in the pack and the rendered briefing says so in words. She is never allowed to be silently half-blind — that is the honesty law applied to her own eyes.
- **`recentBatches` is the report-back channel.** No `/senses/desk-batch` endpoint is needed: the outcome of the last batches rides the next turn's briefing, exactly the way a phone-sent SMS becomes visible again through `read_texts`.

### Hop 2 — the brain route

`index.ts` `POST /chat`, 3 changed lines:

```ts
const { message, conversationId, surface, desk } = req.body ?? {};
…
const deskPack = deskFromBody(desk);         // defensive parse in the new desk.ts; returns null on anything odd
await runChat(convId, message, surf, events, abort, { desk: deskPack });
```

`deskFromBody` is a hard validator, not a cast (contrast `api.ts:315`'s bare `p as unknown as PendingConfirm`): wrong protocol, missing labels, non-array `folders`, or a pack over 64 KB → `null`, and the feature is simply absent for that turn.

### Hop 3 — context assembly

`chat.ts` passes it two places:

```ts
const [contextPack] = await Promise.all([
  buildContextPack(surface, userMessage, conversationId, !resumeSession, opts?.desk),
  ensureConversation(conversationId, surface),
]);
…
const connectorServer = buildConnectorServer((c) => events.onConfirm?.(c), opts?.desk);
```

`context.ts` pushes `...renderDeskBlock(desk)` into `lines`. Rendered, it looks like this (mirroring `config.py:60-68`'s `runtime_context()`, which is the prior art that worked):

```
# His desk (you are at it — Surface: desktop)
Folders you can touch, and NOTHING else: downloads, desktop. Staging trash: trash.
You never delete. "Delete" means move to trash/… ; he empties it, you do not.
  downloads — 412 files, 8.5 GB, subfolders: Old, Clients, Clients/Acme
    newest: Invoice 4411.pdf (1.2 MB, today) · acme-contract-v3.docx (88 KB, yesterday) · …
    also present: setup_x64.exe, IMG_2213.HEIC, … (300 of 412 listed; 112 older files
    NOT listed — if he wants those, say so plainly and ask him to narrow it or raise the cap)
  desktop — 37 files, 200 MB
    …
Last batch: 14 moved, 1 skipped (name taken), 09:40 today, not undone.
```

Note it lives in the **context pack**, which `memory.ts` does *not* persist (`chat.ts:66` stores `userMessage` alone). His filenames therefore never enter Supabase.

### Hop 4 — she plans, and calls one tool

She reads the briefing, decides the sort, and calls `mcp__eve_hands__desk_file_plan` with folder-relative pairs. The handler validates brain-side against the very inventory in the pack (every `from` must actually be a filename she was shown), stamps each move with the `size`/`mtimeMs` from that inventory, and queues a confirm. It cannot move anything: like every RED tool it passes `null` for `execute` (`connectors.ts:315` precedent).

Payload minted — this exact object is what gets hashed, what the card renders, and what comes back to the desktop:

```json
{
  "protocol": 1,
  "batchId": "3c9a7e2b-…",
  "deskId": "a5f1…",
  "op": "move",
  "intent": "put the Acme invoices with the rest of Acme's paperwork",
  "gate": "inline",
  "count": 14,
  "bytes": 222298112,
  "createdFolders": ["downloads/Clients/Acme"],
  "moves": [
    { "from": "downloads/Invoice 4411.pdf", "to": "downloads/Clients/Acme/Invoice 4411.pdf", "size": 1233408, "mtimeMs": 1756645331000 },
    { "from": "downloads/Invoice 4412.pdf", "to": "downloads/Clients/Acme/Invoice 4412.pdf", "size": 1180160, "mtimeMs": 1756645402000 }
  ]
}
```

Her turn ends with the shipped wording pattern (`connectors.ts:318-321`):
> "Queued for your approve (14 files, 212 MB). Nothing has moved — your approve does it on your machine. It expires 14:32."

### Hop 5 — the card reaches him

Untouched machinery. `emitConfirm` → `chat.ts:60` → `index.ts` `send("confirm_request", pending)` → `api.ts:315` `parseFrame` → `broadcast(IPC.chatFrame)` → `useChat.ts:101-112` → inline card in the thread (`TalkColumn.tsx:176`) and/or the modal (`ConfirmLayer.tsx:30`). If the deck was shut, `poll.ts:40-48` picks it up off `/state.pendingConfirms` within 30 s and toasts "EVE — waiting on your thumb". All of that is free.

Before painting, the card calls `window.eve.desk.preflight(confirm.payload)` — main re-stats every source and destination and hands back verified counts (see §5). The card renders the verified numbers, not the planned ones.

### Hop 6 — he approves

`ConfirmCard.decide(true)` → `window.eve.confirm(id, hash, true)` → `IPC.confirm` in main. **This is the one changed handler in the whole desktop:**

```ts
ipcMain.handle(IPC.confirm, async (_e, a: { id: string; hash: string; approve: boolean }) => {
  const r = await api.postConfirm(a.id, a.hash, a.approve);
  if (!r.ok || !r.clientAction) return r;
  if (r.clientAction.type !== "apply_file_batch") return r;   // unknown type: hand it back untouched, never guess
  const outcome = await desk.applyBatch(r.clientAction.payload);
  return { ...r, deskOutcome: outcome };                       // `executed` is NOT rewritten — the brain's honesty stands
});
```

Brain side, unchanged: `resolveConfirm` sweeps, checks the hash, `pending.delete(id)` (single-use), sees `execute === null`, returns `{ok:true, executed:false, detail:"approved — executes on the phone", clientAction}` (`confirm.ts:95-104`). The `detail` string is stale wording ("the phone") for a desk batch — one-line fix in the brain diff, §2.

`desk.applyBatch()` runs the guard **again** from scratch (§7.2 of the ground truth: a brain-side check is advisory once the payload is on the wire), writes the journal plan line, moves, writes the result line, and returns:

```ts
interface DeskOutcome {
  batchId: string;
  status: "applied" | "refused" | "nothing";
  refusal?: string;                 // set only for "refused" — the rule, in his language
  moved: number; skipped: number; failed: number; bytes: number;
  undoable: boolean;
  results: { i: number; status: "moved" | "skipped" | "failed"; why?: string }[];
}
```

### Hop 7 — he sees the truth immediately, and she sees it next turn

The card renders `deskOutcome` (never the word CANCELLED — see §5) and offers UNDO for 20 s. Main's journal is written. On his next message the DeskPack's `recentBatches` carries the outcome, so she can say what happened *because she can see it*, not because she remembers claiming it.

### The listing step, stated without hand-waving

- She learns what exists **only** from the `desk` block on the turn she is answering. It is built by main, from a real `readdir`, at the moment the message is sent.
- She **cannot** learn about a folder that is not wired, at any depth, by any means. There is no scan tool, no glob tool, no path she can name.
- Files she was not shown cannot be planned: `validatePlan` rejects any `from` that is not in the pack she was given for *this* turn. This is what stops "sort my downloads" from producing a plan hallucinated out of last week's transcript.
- Staleness between scan and execute is closed by the `size`/`mtimeMs` stamps (§4.7), not by hope.

### The alternative I rejected, and why

A brain-side `list_folder` tool that reaches back down to the desktop mid-turn would be the "natural" design. It requires a **brain→desktop request channel with a response**: a websocket, a long-poll, or a queue plus a new endpoint pair, plus per-request correlation, plus a timeout policy inside the agent loop, plus a story for two desktops. That is the single largest new surface available in this design space, it puts a synchronous dependency on King's laptop being awake in the middle of an agent turn, and it buys nothing the request body does not already carry. Architecture A refuses it.

---

## 2. THE BRAIN DIFF

**One new file. Six changed. Zero endpoints. Zero migrations. Zero env vars.**

### 2.1 `brain/src/confirm.ts` — CHANGED (mandatory, ~14 lines)

`payloadHash` (`:44-48`) is broken for any nested payload and a file batch is nested. `JSON.stringify(payload, Object.keys(payload).sort())` applies the replacer array **recursively**: `{"moves":[{from,to}],"op":"move"}` canonicalises to `{"moves":[{}],"op":"move"}`. Every 14-move batch with the same top-level keys hashes identically. In a UI that deliberately queues multiple confirms (`ConfirmLayer.tsx:24`, "+N MORE WAITING"), approving card B with card A's hash would be accepted and the wrong batch would run.

```ts
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

export function payloadHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(canonical(payload)).digest("hex").slice(0, 32);
}
```

Backward compatibility, stated precisely: for the three shipped flat payloads (`{to,subject,body}`, `{phoneNumber,message}`, `{client_name}`) the canonical *string* is byte-identical to what the old line produced, so nothing about meaning changes. Only the truncation widens, 16→32 hex (64→128 bits). Clients echo whatever hash they were handed (`ConfirmCard.tsx:100`, `EveApp.tsx:500`), so length is transparent to them; the store is in-memory (`confirm.ts:35`) and a deploy restarts it, so there are no in-flight confirms to strand.

Second, cosmetic but it is a truth claim on a card (`:101`):

```ts
detail: entry.clientAction?.type === "apply_file_batch"
  ? "approved — running on your desk"
  : "approved — executes on the phone",
```

### 2.2 `brain/src/desk.ts` — NEW (~110 lines)

The only new brain file. Pure functions, no I/O, no state.

```ts
export interface DeskEntry { n: string; d: string; kb: number; age: number }
export interface DeskFolder { label: string; files: number; bytes: number; dirs: string[];
                              listed: number; truncated: boolean; omitted: number;
                              recent: DeskEntry[]; names: string[] }
export interface DeskPack { protocol: 1; deskId: string; at: string;
                            limits: { maxBatch: number; inlineMax: number; maxListing: number };
                            staging: { label: string; files: number; bytes: number };
                            folders: DeskFolder[];
                            recentBatches: { batchId: string; at: string; op: string; intent: string;
                                             moved: number; skipped: number; failed: number; undone: boolean }[] }

export function deskFromBody(raw: unknown): DeskPack | null;    // hard validator; null on anything unexpected
export function renderDeskBlock(desk: DeskPack | null): string[];  // the context-pack lines in §1 hop 3
export function validatePlan(desk: DeskPack, op: "move"|"rename"|"stage",
                             moves: {from:string;to:string}[]): PlanVerdict;
```

`validatePlan` is the brain's half of the guard (the desktop re-runs the whole thing independently). Rules, all refusals, each with a sentence she can say out loud:

| # | Rule | Refusal |
|---|---|---|
| 1 | First segment of every `from`/`to` is a label in this pack (or `trash`) | "'documents' isn't a folder on your desk." |
| 2 | No segment is `.`, `..`, absolute, a drive letter, or UNC | "I can't name a path outside your folders." |
| 3 | Every `from` appears in that folder's `recent`+`names` (case-insensitive) | "I can't see 'x.pdf' from here." |
| 4 | `extname(from).toLowerCase() === extname(to).toLowerCase()` | "I don't change what a file is." |
| 5 | No `to` collides with an existing name in the pack, and no two `to`s collide inside the batch | "That name is already taken — pick another." |
| 6 | No duplicate `from` | — |
| 7 | `op:"stage"` ⇒ every `to` starts `trash/`; `op:"move"`/`"rename"` ⇒ no `to` starts `trash/` | "If you want it gone it goes to trash, and you empty that." |
| 8 | `moves.length ≤ limits.maxBatch` (500) | "That's more than one batch — let me do it in passes." |
| 9 | Every source is a *file* per the pack (dirs are never listed as entries) | "I don't move whole folders yet." |

On success it stamps `size`/`mtimeMs` from the pack onto each move, computes `bytes`, computes `createdFolders` (destination dirs absent from `folder.dirs`), and sets:

```ts
gate = (moves.length <= limits.inlineMax && createdFolders.length === 0 && op !== "stage") ? "inline" : "modal";
```

That is King's threshold — "any batch over ~20 files, or anything outside the named folders, raises a confirm card first" — expressed on the **existing** card machinery. Every batch gets a card; the threshold decides whether the card sits quietly in the thread or fronts the screen behind a scrim. His third trigger, the one the brief dropped and `persona.py:41` had, is rule 5: **overwriting an existing file** — here it is not a confirm trigger, it is a flat refusal, which is stricter.

### 2.3 `brain/src/context.ts` — CHANGED (~6 lines)

```ts
export async function buildContextPack(
  surface: string, incomingMessage: string, conversationId: string | null = null,
  includeHistory = false, desk: DeskPack | null = null,   // <- new, defaulted
): Promise<string> {
```
and `...renderDeskBlock(desk)` inserted into `lines` after `...wornLine()`.

### 2.4 `brain/src/chat.ts` — CHANGED (~5 lines)

`runChat(..., abort?: AbortController, opts?: { desk?: DeskPack | null })`; forward `opts?.desk` to `buildContextPack` and to `buildConnectorServer`. Add `"mcp__eve_hands__desk_file_plan"` — no: it comes in through `...connectorToolNames` (`chat.ts:81`), unchanged. **`disallowedTools: ["Bash","Read","Write","Edit","Glob","Grep"]` (`:85`) stays exactly as it is**, and the comment at `:76` ("her body is the phone, not this box") stays true: the brain box's own filesystem remains untouchable. Amend it to `"— her hands are on his desk, never on this box."`

### 2.5 `brain/src/connectors.ts` — CHANGED (~75 lines)

```ts
export function buildConnectorServer(emitConfirm: (c: PendingConfirm) => void, desk: DeskPack | null = null) {
```
`+1` line in `connectorToolNames` (`:53-79`) — **the one silent failure mode; omit it and the tool is invisible to the model**:
```ts
  "mcp__eve_hands__desk_file_plan",
```
and the tool itself, in the house shape:

```ts
tool(
  "desk_file_plan",
  "Plan a batch of file moves on King's own machine and queue it for his approve. This is the ONLY way " +
    "you ever touch a file, and it NEVER moves anything itself: it queues the exact from→to list, and " +
    "HIS DESKTOP performs the moves locally on approve. Rules enforced in code — don't fight them, work " +
    "inside them:\n" +
    "• Every path is FOLDER-RELATIVE and must start with a folder label from your desk briefing " +
    "('downloads/…', 'desktop/…', 'trash/…'). You cannot name a drive, a home directory, or anything else. " +
    "There is no path that reaches the rest of his machine.\n" +
    "• You NEVER delete. To get rid of something use op:'stage' into 'trash/…' — his staging folder. " +
    "Say what you staged; HE empties it, not you.\n" +
    "• You never change a file's extension, and you never overwrite: if a destination name is taken, " +
    "choose a different name or leave that file alone.\n" +
    "• Plan ONLY from files listed in this turn's desk briefing. Never from memory, never from a guess " +
    "at what is probably in there. If the briefing says files were not listed, say so and ask him to narrow it.\n" +
    "• Max 500 files per batch. Over 20 files, a new destination folder, or any staging fronts a " +
    "full-screen card; smaller moves sit inline in the thread.\n" +
    "Tell him it's queued, say the count and the size, and say plainly that nothing has moved yet.",
  {
    intent: z.string().describe("One line in your voice: what this batch accomplishes"),
    op: z.enum(["move", "rename", "stage"]).describe("stage = his 'delete' — into the trash folder, never gone"),
    moves: z.array(z.object({
      from: z.string().describe("Folder-relative source, e.g. 'downloads/Invoice 4411.pdf'"),
      to: z.string().describe("Folder-relative destination — same extension, must not already exist"),
    })).min(1).max(500).describe("Every file, explicitly. No patterns, no wildcards — he reads this list."),
  },
  async ({ intent, op, moves }) => {
    if (!desk) return text(
      "I can't see any folders from here — filing hands only work at his desk, and this turn didn't " +
      "arrive with a desk briefing. Say so plainly; don't pretend.", true);
    const v = validatePlan(desk, op, moves);
    if (!v.ok) return text(`Refused before it reached him — ${v.reason}`, true);
    const payload = {
      protocol: 1, batchId: randomUUID(), deskId: desk.deskId, op, intent,
      gate: v.gate, count: v.moves.length, bytes: v.bytes,
      createdFolders: v.createdFolders, moves: v.moves,
    };
    const pending = requestConfirm(
      "file_batch",
      `${op === "stage" ? "Stage" : op === "rename" ? "Rename" : "Move"} ${v.moves.length} file` +
        `${v.moves.length === 1 ? "" : "s"} (${human(v.bytes)}) — ${intent}`,
      payload,
      null,                                 // no brain-side execute — his desk fires it
      { type: "apply_file_batch", payload },
    );
    emitConfirm(pending);
    return text(
      `Queued for his approve (id ${pending.id}) — ${v.moves.length} files, ${human(v.bytes)}. ` +
      `NOTHING has moved; his approve does it on his machine. Expires ${pending.expiresAt}.`,
    );
  },
)
```

No `readOnlyHint` annotation, correctly — every read-only tool in the file carries it and every mutating one omits it.

### 2.6 `brain/src/index.ts` — CHANGED (3 lines)

Destructure `desk` from the `/chat` body, `deskFromBody` it, pass it through in **both** the streaming and `?stream=false` branches.

### 2.7 `brain/prompts/doctrine-digest.md` — CHANGED (~8 lines)

The Prime Laws in prose, belt to the code's braces, lifted almost verbatim from `persona.py:35-46` because that wording already worked:

> **FILING HANDS (tier 1).** You can sort, rename and move files in the folders on his desk briefing, and nowhere else.
> You NEVER delete. "Delete" means stage to his trash folder. Say what you staged; he empties it, not you.
> You never overwrite an existing file and you never change what a file is.
> Everything you plan, he sees as a from→to list and approves before a single byte moves. You never say a file moved until the desk tells you it did.
> If he asks for something outside these folders, hold the line and offer the compliant version.

---

## 3. THE DESKTOP MODULE

### 3.1 New files under `electron/`

| File | ~LOC | Job |
|---|---|---|
| `electron/desk/roster.ts` | 130 | Label → realpath'd root map. Loads from config, validates at boot, refuses bad roots loudly. Exposes `resolve(rel)` and nothing that takes an absolute path from outside. |
| `electron/desk/guard.ts` | 210 | **Pure.** Every verdict in §4. Takes `(payload, roster, statFn)`, returns per-item verdicts. No writes, no side effects, unit-testable without a filesystem. |
| `electron/desk/scan.ts` | 170 | The eye: watchers, debounce, depth-2 walk, tiering, `pack()`. Owns the token budget. |
| `electron/desk/journal.ts` | 130 | Append-only JSONL in `userData`, fsync'd, rotation, boot reconcile. |
| `electron/desk/execute.ts` | 190 | `applyBatch(payload)`: re-guard → journal plan → move loop → journal result → `DeskOutcome`. The only module that can write to his disk. |
| `electron/desk/undo.ts` | 100 | `undoBatch(batchId)` from the journal. Reverse order, re-guarded, one-shot. |
| `electron/desk/index.ts` | 45 | The façade `main.ts` imports: `init()`, `pack()`, `preflight()`, `applyBatch()`, `undoBatch()`, `log()`. |

`execute.ts` is the blast radius. It is the only file in the repo allowed to import `renameSync`, `copyFileSync`, `mkdirSync`, `rmdirSync` or `unlinkSync`, and that should be enforced by a lint rule (`no-restricted-imports` scoped by path) so a future stream cannot quietly widen it.

### 3.2 Changed files

- **`electron/main.ts`** — `desk.init()` + `journal.reconcile()` in `app.whenReady()`; the one rewritten `IPC.confirm` handler (§1 hop 6); three new handlers.
- **`electron/api.ts`** — `ChatArgs` gains `desk?: DeskPack | null`; `startChat` spreads it into the body. Nothing else. (`postConfirm` at `:151-156` is untouched — it already passes `clientAction` through verbatim.)
- **`electron/config.ts`** — `coerce()` gains five fields, defaulted so an existing `config.json` upgrades silently:
  ```ts
  deskEnabled: o.deskEnabled === true,                       // OFF until he turns it on
  deskId: typeof o.deskId === "string" && o.deskId ? o.deskId : randomUUID(),
  deskFolders: coerceFolders(o.deskFolders),                 // [{label,path}] — default []
  deskStaging: typeof o.deskStaging === "string" && o.deskStaging.trim()
      ? o.deskStaging.trim() : path.join(app.getPath("home"), "EVE", "trash"),
  deskMaxListing: clampInt(o.deskMaxListing, 50, 2000, 400),
  ```
  Default folder suggestions offered in settings (not auto-enabled): `app.getPath("downloads")` and `app.getPath("desktop")`. **Use Electron's `getPath`, never `%USERPROFILE%\Desktop`** — on this machine the Desktop is OneDrive-redirected (`C:\Users\mrkin\OneDrive\Desktop`) and a hand-built path would point at a stale folder.
- **`electron/preload.ts`** — three members, added in the documented order (contract → main → preload, `preload.ts:12-13`).

### 3.3 The IPC surface — three channels, each justified

```ts
// contract.ts IPC map additions
deskPreflight: "eve:desk:preflight",
deskUndo:      "eve:desk:undo",
deskLog:       "eve:desk:log",
```

```ts
// EveBridge additions
desk: {
  preflight(payload: FileBatchPayload): Promise<DeskPreflight>;  // read-only stat; card honesty
  undo(batchId: string): Promise<DeskOutcome>;                   // batchId ONLY — never a path
  log(limit?: number): Promise<DeskBatchRecord[]>;               // read-only journal
};
```

- **`deskPreflight`** exists because requirement 5 demands the card be honest about *how many files and how much data*, and only main can stat. Read-only; every path in the payload is folder-relative and guard-checked, so it cannot be used to probe the disk outside the roster.
- **`deskUndo`** takes a **batchId, never a path** — the exact `openExternal` allowlist precedent (`main.ts:274-282`: "the renderer sends a target key, never a URL"). Main reads the journal and reverses only what the journal says it moved.
- **`deskLog`** is a read of the journal for the log panel.

There is deliberately **no** `desk.move(...)`. The renderer cannot express a file operation. Compare the phone, where `EveApp.tsx:511` calls `sendSms` from the renderer after approval — this is strictly tighter than the shipped precedent.

### 3.4 Renderer

- `src/renderer/confirm/ConfirmCard.tsx` — **body only.** `ConfirmCardProps` and the default export signature are untouched, so the FROZEN contract (`:1-7`) holds and S2/S3/S4 keep compiling. Changes in §5.
- `src/renderer/confirm/ConfirmLayer.tsx` — one filter so an inline-gated batch does not also front a modal:
  ```ts
  const modal = confirms.filter((c) => !(c.kind === "file_batch" && c.payload?.gate === "inline"));
  ```
  Zero behaviour change for every existing kind.
- `src/renderer/confirm/FileMoveList.tsx` — NEW (~90 lines). The scrollable from→to table.
- `src/renderer/confirm/confirm.css` — the list styles.
- `src/renderer/deck/DeskLogPanel.tsx` — NEW (~120 lines). Batch history with per-batch UNDO. Lives in the settings drawer, not the deck's main column.

---

## 4. GUARDRAILS IN CODE

Every rule below is a function, not a sentence in a prompt. The Python prior art enforced exactly two families in code (`guardrails.py`) and left the >20 ceiling, the overwrite rule, the outside-folder rule, path normalisation and any audit trail to prose. All five of those gaps close here.

The guard runs **three times**: brain-side (`validatePlan`, advisory), desktop-side at preflight (read-only, drives the card), and desktop-side at execute (binding). Only the third one matters for safety; the first two exist so he is never shown a plan that will die.

### 4.1 Allowlist, not deny-list

```ts
// roster.ts — at boot, once
for (const { label, path: configured } of cfg.deskFolders) {
  const real = realpathSync.native(configured);              // resolves junctions, mapped drives, 8.3 names
  if (!statSync(real).isDirectory()) reject(label, "not a directory");
  if (!withinReal(homeReal, real)) reject(label, "outside your user profile");
  if (SYSTEM_ROOT.test(real)) reject(label, "system directory");   // ^[A-Za-z]:\\(Windows|Program Files)
  if (real.startsWith("\\\\")) reject(label, "network path");
  roots.set(label.toLowerCase(), { label, real });
}
roots.set("trash", { label: "trash", real: ensureDir(cfg.deskStaging) });   // config.py:56 — the trash always exists before she needs it
```

A rejected root is **not silently dropped**: it is logged, excluded from `pack()`, and surfaced in settings as `LABEL — REFUSED: outside your user profile`. Silence here would let her plan against a folder that does not exist.

`ensureDir(staging)` at boot copies `config.py:56-58`'s `ensure_dirs()` — the single most load-bearing line in the never-delete rule, because a staging move that fails for want of a directory is a delete she was not allowed to do.

### 4.2 Path traversal — resolve to a real path and prove containment

```ts
// guard.ts
const BAD_SEG   = /^(\.|\.\.)$/;
const BAD_CHARS = /[:*?"<>|\u0000-\u001f]/;
const RESERVED  = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

export function resolveRel(rel: string, roster: Roster): Verdict<string> {
  const segs = rel.normalize("NFC").replace(/\\/g, "/").split("/").filter(Boolean);
  if (segs.length < 2) return no("a path needs a folder and a file name");
  const root = roster.roots.get(segs[0].toLowerCase());
  if (!root) return no(`'${segs[0]}' is not a folder on this desk`);
  for (const s of segs.slice(1)) {
    if (BAD_SEG.test(s))   return no("no '.' or '..' segments");
    if (BAD_CHARS.test(s)) return no("illegal character in a name");
    if (RESERVED.test(s))  return no(`'${s}' is a reserved device name`);
    if (/[ .]$/.test(s))   return no("a name can't end in a space or a dot");
  }
  const abs = path.resolve(root.real, ...segs.slice(1));
  if (!withinReal(root.real, abs)) return no("that lands outside the folder");
  if (abs.length > 250)            return no("that path is too long for Windows");
  return yes(abs);
}

function withinReal(root: string, child: string): boolean {
  const rel = path.relative(root, child);            // NOT startsWith — that passes "…\Downloads2"
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
```

The prior art's containment was `str(Path(raw).expanduser()).lower().startswith(prefix)` (`guardrails.py:35-39`) — no `resolve()`, a deny-list, and a `startsWith` that `Downloads2` walks straight through. This is the correction: allow-list, `path.resolve`, `realpath` on the roots, and `path.relative` for the test.

For **sources**, containment is proved twice — once on the constructed path, once on the *real* path after `realpathSync.native`, so a symlinked file inside the folder that points outside cannot be moved by its inside name.

### 4.3 Symlinks, junctions, reparse points (Windows)

```ts
const st = lstatSync(abs);                                  // lstat, never stat — do not follow
if (st.isSymbolicLink())  return no("that's a shortcut to somewhere else, not a file");  // libuv reports NTFS junctions here too
if (!st.isFile())         return no("I only move files, not folders");
const real = realpathSync.native(abs);
if (!withinReal(root.real, real)) return no("that file really lives outside the folder");
```

- Directory **junctions** and **mount points** inside a root are never descended by `scan.ts` (it checks `dirent.isSymbolicLink()` before recursing), so they never appear in the pack and she can never plan against them.
- A junctioned *root* is fine: `realpathSync.native` resolves it once at boot and containment is measured against the resolved root.
- `\\?\`-prefixed and UNC paths are unreachable: they cannot be expressed as a folder-relative path, and the roster refuses them at boot.
- Alternate data streams are blocked by `BAD_CHARS` (`:` is illegal in a segment).

### 4.4 Never delete — the staging rule, enforced structurally

- `execute.ts` has **no delete primitive on his files**. The operations are `mkdirSync(dirname(to), {recursive:true})` and `renameSync(from, to)`. That is the whole vocabulary of a same-volume move.
- "Delete" is `op:"stage"`, which is a move whose destination root is `trash`, laid out `trash/YYYY-MM-DD/<batchId>/<original relative path>` so two same-named files from different folders cannot collide and the origin is recoverable by eye.
- The trash is **never a source** for anything except `undo`. `validatePlan` rule 7 and the desktop guard both refuse a `from` under `trash/` for `op:"move"`.
- Nothing in the codebase empties the trash. Not on a schedule, not on a size threshold, not on approval. `README.md:38` of the prior art was right: "Brandon empties it, not you." Settings shows the trash size and an **Open in Explorer** button — his hands, his mouse.
- The single exception, and it must be reviewed as such: on a **cross-volume** move `renameSync` throws `EXDEV`, and the fallback is `copyFileSync(from, to.eve-part)` → verify `size` matches → `renameSync(to.eve-part, to)` → `unlinkSync(from)`. That `unlinkSync` is the only line in the design that removes one of his files, it runs only after a byte-count-verified copy exists at the destination, and the journal records both halves. It is guarded by an assertion and should carry a comment naming it as the one dangerous line.
- `rmdirSync` is permitted **only** in undo, **only** for directories listed in that batch's `createdDirs`, and **only** when `readdirSync` returns empty.

### 4.5 Batch thresholds

| Constant | Value | Where enforced | Effect |
|---|---|---|---|
| `INLINE_MAX` | 20 | brain `validatePlan` + desktop guard | ≤20, no new dirs, not staging → inline card. Otherwise modal + scrim. |
| `MAX_BATCH` | 500 | zod `.max(500)`, `validatePlan`, guard | Hard refusal. "That's more than one batch." |
| `MAX_BYTES` | 20 GB | guard | Hard refusal; she must split. |
| `WARN_BYTES` | 1 GB | card | The card shows the total in red and the button reads `APPROVE — MOVE 212 FILES · 4.1 GB`. |
| `maxListing` | 400 (50–2000) | `scan.ts` | How much of a folder she can see at all. |

The threshold is *presentation weight*, never permission: **every** batch is hash-bound and single-use. Nothing in this design can move a file without an approve.

### 4.6 Name collisions

**Never overwrite, and never silently rename.** If `existsSync(to)`:

- `validatePlan` refuses the batch brain-side (she had the listing; she should have known).
- Preflight marks that row `NAME TAKEN — WILL BE SKIPPED` and drops it from the button's count.
- Execute skips it: `{ status: "skipped", why: "collision" }`.

Auto-suffixing to `Invoice 4411 (2).pdf` is rejected on purpose: he approved a from→to pair, and writing to a *different* destination than the one on the card breaks the only promise the card makes. The skip surfaces on the card and in `recentBatches`, and she can propose the renamed version next turn — where he can read it.

One benign case is separated out: if `from` and `to` `realpath` to the same file, it is `{status:"skipped", why:"already there"}`, not an error.

Windows case-insensitivity is handled explicitly — `existsSync` is case-insensitive on NTFS, so `a.PDF` → `a.pdf` is detected as a collision rather than an accidental in-place case change. A genuine case-only rename is refused for now with "Windows won't let me do a rename that only changes case in one step."

### 4.7 Time-of-check / time-of-use

Every move carries `size` and `mtimeMs` from the scan that she planned against. At preflight and again at execute:

```ts
const st = statSync(from);
if (st.size !== m.size || Math.abs(st.mtimeMs - m.mtimeMs) > 2000)   // 2s: FAT/network mtime slop
  return skip("changed since she looked");
```

Missing source → `skip("gone")`. This is what makes a 30-minute-old plan safe and a busy Downloads honest instead of surprising.

### 4.8 Refused outright

| Refused | Why |
|---|---|
| Anything outside a wired root (source **or** destination) | §4.2 |
| Directories | Tier 1 is files. Moving a tree is a different blast radius. |
| Symlinks, junctions, reparse points | §4.3 |
| Any move where the extension changes | `invoice.pdf` → `invoice.exe` is a real hazard vector, and `.txt` → `.ps1` more so. Extension is immutable in tier 1. |
| `desktop.ini`, `Thumbs.db`, `.DS_Store`, `ntuser.dat*` | Shell/OS bookkeeping; moving them breaks folders. |
| `*.crdownload`, `*.part`, `*.partial`, `*.tmp`, `*.download` | A browser or installer is still writing to it. |
| Hidden **and** system-attributed files | Not his working files. |
| Zero-length names, names ending in space or dot, reserved device names | §4.2 |
| Destination paths over 250 chars | Windows will fail the rename halfway through a batch. |
| Any payload whose `deskId` is not this machine's | Stops a confirm raised on one desk being applied on another. |
| Any payload whose `protocol` is not 1 | Forward compatibility, refuse rather than guess. |

Refusals are **never silent**. A whole-batch refusal returns `{status:"refused", refusal}` and the card shows `REFUSED — <rule>` with APPROVE disabled, the same shape as the shipped `send_sms` lock (`ConfirmCard.tsx:166-169`). A per-item refusal shows on that row.

---

## 5. THE CONFIRM CARD

`ConfirmCardProps` and the export signature are **unchanged**; only the body changes, so the FROZEN contract holds.

### 5.1 Anatomy (modal variant, 480w)

```
▲ RED TIER · FILE BATCH — NOTHING MOVES WITHOUT YOU
Move 14 files (212 MB) — put the Acme invoices with the rest of Acme's paperwork

FROM      downloads
INTO      downloads\Clients\Acme          (will be created)
CHECKED   planned 14:02 · re-checked 14:07 — 12 of 14 still there
NOTHING IS DELETED. NOTHING IS OVERWRITTEN.

┌──────────────────────────────────────────────────────── scrolls ──┐
│  Invoice 4411.pdf                 1.2 MB  →  Clients\Acme\        │
│  Invoice 4412.pdf                 1.1 MB  →  Clients\Acme\        │
│  Acme…statement-Q3.pdf            8.4 MB  →  Clients\Acme\        │
│  Invoice 4415.pdf                  ——     →  GONE SINCE SHE LOOKED│
│  Invoice 4416.pdf                 0.9 MB  →  NAME TAKEN — SKIPPED │
│  … 9 more                                                          │
└───────────────────────────────────────────────────────────────────┘

12 files · 209 MB will move.   2 will not.
expires 14:32
[ APPROVE — MOVE 12 FILES ]   [ CANCEL ]              ⏎  ESC
```

Rules the anatomy encodes:

- **Every from→to pair is present.** No `clamp240` blob. The list is a `max-height:260px; overflow-y:auto` region — the ground truth's "the card cannot render a list" gap, closed. `clamp240` stays for every other kind, untouched.
- **Long names middle-ellipsize**, never end-ellipsize, so the extension is always visible. Full relative path in `title=`.
- **Shared destination hoisted.** When every `to` shares a directory it is shown once in `INTO` and each row shows only what differs. A mixed batch shows the full relative destination per row.
- **The numbers are verified, not planned.** `CHECKED` names both times. The button count is what will *actually* move. A card that says 14 when 2 are gone is a lie by arithmetic, and the honesty law does not have an arithmetic exemption.
- **The button states the verb and the count**: `APPROVE — MOVE 12 FILES`, `APPROVE — STAGE 3 FILES TO TRASH`, `APPROVE — RENAME 6 FILES`. Never a bare "APPROVE — SEND IT" (`:125`), which is wrong language for a move.
- **The header verb follows the kind.** `humanizeKind` stays; the trailing clause becomes `NOTHING MOVES WITHOUT YOU` for `file_batch` and `NOTHING SENDS WITHOUT YOU` for everything else.
- **Refused batch**: the list still renders (he should see what she wanted) but the button is `disabled className="cbtn locked"` reading `REFUSED — THAT'S OUTSIDE YOUR FOLDERS`, CANCEL stays live. Identical shape to the shipped `send_sms` lock.
- **Offline**: preflight returns `{ok:false}` if main can't stat — the card says `CAN'T CHECK THESE RIGHT NOW` and APPROVE is disabled. Never approve blind.
- **Expiry** is unchanged: the 15 s tick and the "EXPIRED — SHE'LL RE-RAISE IT IF IT STILL MATTERS" state with no buttons (`:162-163`).
- **Keyboard** unchanged, plus: Enter is suppressed when the batch is refused or `gate === "modal"` with `count > 100` — a hundred-file move should cost a deliberate click.

### 5.2 The resolution — killing the CANCELLED bug

`toResolution` (`:50-54`) currently collapses `{ok:true, executed:false}` into `"cancelled"`, so **an approved client-executed confirm renders the word CANCELLED**. That is the exact bug an unmodified filing implementation ships with, and it is a lie on the face of the card.

```ts
type Resolution =
  | { status: "pending" }
  | { status: "sent"; detail?: string }
  | { status: "cancelled" }
  | { status: "failed"; error?: string }
  | { status: "applied"; outcome: DeskOutcome };      // <- new arm

function toResolution(r: ConfirmResolution): Resolution {
  if (r.ok && r.deskOutcome) return { status: "applied", outcome: r.deskOutcome };  // checked FIRST
  if (r.ok && r.executed)    return { status: "sent", detail: r.detail };
  if (r.ok)                  return { status: "cancelled" };
  return { status: "failed", error: r.error };
}
```

`executed` is left alone. The brain's `executed:false` stays honest ("nothing has left the brain"), and the desktop's `deskOutcome` is the honest statement of what happened on the disk. Two truths, neither overwritten.

Rendered:

```
MOVED 12 · SKIPPED 2 (1 GONE, 1 NAME TAKEN) · FAILED 0        209 MB
[ UNDO THIS BATCH ]
```

and for a refusal reached only at execute time:

```
REFUSED — 'Invoice 4415.pdf' is a shortcut, not a file. NOTHING MOVED.
```

`RESOLVE_HOLD_MS` stays 5 s for every existing kind; a `file_batch` with `undoable:true` holds for `DESK_HOLD_MS = 20_000` so the UNDO button is reachable. After it drops, undo lives in the desk log.

---

## 6. AUDIT AND UNDO

### 6.1 The journal

`app.getPath("userData")/desk-journal.jsonl`, append-only, one JSON object per line, `fsync`'d.

```jsonl
{"v":1,"kind":"plan","batchId":"3c9a…","at":"2026-08-31T14:07:41.220Z","confirmId":"…","confirmHash":"…","deskId":"a5f1…","op":"move","intent":"put the Acme invoices with the rest of Acme's paperwork","roots":{"downloads":"C:\\Users\\mrkin\\Downloads","trash":"C:\\Users\\mrkin\\EVE\\trash"},"items":[{"from":"downloads/Invoice 4411.pdf","to":"downloads/Clients/Acme/Invoice 4411.pdf","size":1233408,"mtimeMs":1756645331000}]}
{"v":1,"kind":"result","batchId":"3c9a…","at":"2026-08-31T14:07:41.902Z","createdDirs":["downloads/Clients/Acme"],"moved":12,"skipped":2,"failed":0,"bytes":219217920,"results":[{"i":0,"status":"moved"},{"i":3,"status":"skipped","why":"gone"},{"i":4,"status":"skipped","why":"collision"}]}
{"v":1,"kind":"undo","batchId":"3c9a…","at":"2026-08-31T14:12:03.114Z","restored":12,"failed":0,"removedDirs":["downloads/Clients/Acme"]}
```

- **The plan line is written and flushed BEFORE the first `renameSync`.** A crash mid-batch can therefore never leave a move that is not recorded. The inverse (a recorded move that did not happen) is recoverable by stat; the reverse is not.
- The `roots` snapshot is stored per batch so an undo after he re-points a label is detectable and refused rather than acting on the wrong disk.
- Rotation at 5 MB → `desk-journal.1.jsonl`, keep 3. Never deleted on its own beyond that.
- **Boot reconcile** (`journal.reconcile()` in `whenReady`): any `plan` with no matching `result` gets one written now, with each item stat'd into `reconciled-moved` / `reconciled-untouched` / `reconciled-unknown`. Interrupted batches are visible in the log as `INTERRUPTED — RECONCILED`, never quietly forgotten.

### 6.2 How he reviews it

Three ways, in descending immediacy:

1. **On the card** — the outcome line for 20 s.
2. **The desk log panel** — `window.eve.desk.log(50)`, rendered in the settings drawer: date, intent, counts, per-item from→to on expand, and an UNDO button per batch. This is the one place he sees absolute paths; the brain never does.
3. **From her** — `recentBatches` is in every DeskPack, so "what did you move this morning?" is answered from the journal, in the pack, not from her recollection. If the pack does not show it, she says she cannot see it. That is the honesty law made mechanical: she is physically unable to claim a move she has no record of.

The journal never leaves the machine. Only the last five batch *summaries* (counts, intent, timestamps — no paths) ride the DeskPack.

### 6.3 Undo

`undoBatch(batchId)`:

1. Read the last `plan` + `result` + any `undo` for that batchId. A batch already undone is refused ("that one's already back"). Undo is one-shot; a redo is a fresh plan she raises, which he approves, which he can read.
2. Refuse if the `roots` snapshot no longer matches the live roster.
3. Take only `status:"moved"` items, **in reverse order**.
4. Per item, re-run the full guard on both endpoints, then require:
   - `to` still exists, `lstat` says a regular file, and its `size` matches, and `mtimeMs` is within 2 s of the recorded value (`renameSync` preserves mtime, so a mismatch means he edited it — refuse that item as `MODIFIED SINCE`, never clobber his work);
   - `from` does **not** exist (something took the name back — refuse as `ORIGINAL SPOT TAKEN`).
5. `renameSync(to, from)`.
6. Remove directories from `createdDirs`, deepest first, **only** if `readdirSync` is empty.
7. Write the `undo` line. Return a `DeskOutcome` with the same shape as an apply, so the log panel and the card render it with the same component.

Undo works across a reboot, across a brain restart, and with the brain offline — it is pure desktop machinery reading a local file. That matters: the moment he most wants undo is the moment something went wrong.

**Staging is its own undo.** Nothing is destroyed, so the worst outcome of a bad batch is files in the wrong place, which is exactly what undo reverses, or files in `EVE\trash`, which he can drag back with a mouse.

---

## 7. DEPLOYMENT

### 7.1 Ships to Railway

`confirm.ts`, `desk.ts` (new), `context.ts`, `chat.ts`, `connectors.ts`, `index.ts`, `prompts/doctrine-digest.md`. A normal push. No route added, no schema change, no new env var, no new dependency. The in-memory confirm store restarts empty, which is its documented design (`confirm.ts:8-9`), so there is no migration window.

### 7.2 Desktop-only

Everything else: the roster, the scan, the guard, the executor, the journal, undo, the log panel, the card's list, the three IPC channels, the five config keys. His filenames, his paths, his journal and his trash never leave the machine except as the specific list on a card he is reading.

### 7.3 Degradation matrix

| Desktop | Brain | Behaviour |
|---|---|---|
| new | new | The feature. |
| **new** | **old** | `desk` is an unrecognised key in the `/chat` body; Express hands it to a destructure that ignores it. No desk briefing, so no folder knowledge; no `desk_file_plan` tool, so no confirm can be raised; the desktop's `apply_file_batch` branch never fires. **The feature is simply absent. Nothing breaks and nothing lies.** |
| **old** | **new** | No `desk` in the body ⇒ `buildConnectorServer(emit, null)` ⇒ the tool's first line returns "I can't see any folders from here". **She cannot raise a filing confirm at all**, so an old desktop can never be handed a `clientAction` it does not understand. This is why the tool gates on the pack rather than on a config flag. |
| new | new, filing off | `deskEnabled:false` ⇒ `pack()` returns null ⇒ same as the row above. One switch, one honest failure mode. |
| new | brain unreachable | `postConfirm` returns `{ok:false, error}` (`api.ts:154`); the card shows FAILED; nothing moves. Undo and the log still work — they never needed the brain. |

There is **no positive capability handshake** and that is a real gap (§8.3). The cheapest honest fix, if it is wanted: one line in `/health` — `filingHands: true` — giving the desktop a probe without an endpoint. Architecture A leaves it out of v1 to keep the diff at zero-behavioural-additions, and flags it.

### 7.4 The one cross-surface diff this design requires

**`C:\dev\eve\app\src\EveApp.tsx`, ~6 lines.** A `file_batch` confirm is visible in `/state.pendingConfirms` on **every** surface. If he approves one on the phone, `decideConfirm` (`:498-528`) falls to the `else` branch, reads `executed:false`, prints **"CANCELLED"** — and the confirm is already consumed by `pending.delete(id)` (`confirm.ts:93`). Nothing moves (safe) but the phone told him the opposite of the truth (a lie), and the batch is burned.

The fix is the exact mirror of the desktop's `send_sms` lock, which is the shipped precedent for a surface refusing a confirm it cannot execute (`contract.ts:25-27`):

```tsx
const locked = c.kind === "file_batch";   // no filesystem here
… locked
  ? <button disabled>APPROVE AT YOUR DESK — THIS ONE MOVES FILES ON YOUR MACHINE</button>
  : <button onClick={() => decideConfirm(c, true)}>APPROVE</button>
```

CANCEL stays live on the phone, exactly as it does for `send_sms` on the desktop (`ConfirmCard.tsx:175-177`), so he can kill a batch from anywhere and only apply it where the hands are. **Ship this in the same release or the honesty law has a hole in it.**

---

## 8. HONEST WEAKNESSES, AND WHAT I WOULD TEST

### 8.1 The briefing is expensive, and it is on every desktop turn

A 400-file Downloads produces roughly 16 KB of pack ≈ 4–5k tokens, on **every** desktop message including "what's on my calendar". The context pack targets "well under ~4–6k tokens" (`context.ts:12`); this doubles it at the top end. Mitigations in the design: a `maxListing` knob, names-only tiering past the newest 150, and a hard 64 KB pack ceiling with a census fallback. Mitigations deliberately **not** taken: keyword-sniffing the message to decide whether to attach (that is client-side reasoning, and the one-brain law is worth more than the tokens), and a delta protocol keyed on the resumed SDK session (correct while the session lives, silently wrong after a brain restart — a bug that only appears under load is worse than a bill).
*Measure before shipping: median and p95 pack size on his real Downloads, and the latency delta on `/chat` first token.*

### 8.2 Filenames go to the model

This is the privacy cost of the architecture and it should be said in plain language rather than buried. The pack is not persisted to Supabase (the context pack is not what `appendMessage` stores) but it is sent to Anthropic on every desktop turn. `deskEnabled` defaults **off**; folders are opt-in one at a time; nothing outside them is ever enumerated. He should be shown one screen listing exactly what leaves, once, before he turns it on.

### 8.3 No capability handshake

The desktop cannot tell whether the brain in front of it understands `desk`, and the brain cannot tell whether the desktop can execute `apply_file_batch` beyond "a pack arrived". The design fails closed in both directions (§7.3), but "fails closed" here means "silently does nothing", and a silent nothing is the failure mode King's honesty law hates most. The `/health` line in §7.3 is the three-line fix and I would probably take it in week two.

### 8.4 `payloadHash` is a security primitive and I am changing it

The change is correct and byte-compatible for the three existing payloads, but it touches the code path of *every* confirm in the system, including money-adjacent ones. It needs its own test file before it needs a review.

### 8.5 The cross-volume `unlinkSync`

One line in `execute.ts` can remove one of his files. It runs only after a size-verified copy exists at the destination, and it is journalled — but it is the single point where "never delete" depends on a code path being right rather than on a primitive being absent. If `Downloads` and the staging trash ever land on different volumes, that path becomes the *common* case for staging, not the rare one. Mitigation worth considering: refuse cross-volume moves entirely in v1 and tell him to point the staging dir at the same drive.

### 8.6 She sorts by name, extension and date, and nothing else

No file contents ever reach the brain, so "file the Acme invoices" works exactly as well as his filenames do. This is the real ceiling of tier 1, it is inherent to the one-brain law, and reading contents is a bigger privacy decision than the one he made. Expect the first real session to hit it inside ten minutes.

### 8.7 Windows-specific hazards I have designed for but not proven

- **OneDrive.** His Desktop *is* in OneDrive (`C:\Users\mrkin\OneDrive\Desktop`). Moving an online-only placeholder can trigger a full hydration download, and a move between sync roots can trigger a re-upload. `app.getPath("desktop")` gets the right folder; detecting placeholder status from Node is a heuristic (`blocks*512 < size`) and I do not trust it yet. Worst realistic case: an approved 40-file move quietly pulls 12 GB down a home connection.
- **Controlled Folder Access / antivirus** can `EPERM` a rename into Desktop or Documents. Handled per-item as FAILED, but a batch that fails 100% for this reason must say *why* in a way he can act on.
- **Junction detection.** libuv maps `IO_REPARSE_TAG_MOUNT_POINT` to `isSymbolicLink()`, so `lstat` should catch junctions — should. Unproven on this machine.
- **`path.relative` case-insensitivity** on win32 is what makes containment work for `c:\users\...` vs `C:\Users\...`. Correct as far as I know; a wrong assumption here is a containment bypass, so it gets a test, not a belief.

### 8.8 Two directions of latent scope

`clientAction.type` is an open discriminator and `main.ts` is the only place that maps a type to a local capability — a future tier could add a type there without touching the confirm machinery; nothing in this build anticipates opening apps or reading the screen, and the guard's allow-list means a new type would have to bring its own.

### 8.9 What I would need to test to trust it

The prior art's suite is the model: **6 of 15 checks were guardrail rulings, and two of those asserted an ALLOW, not a deny** (`smoke_test.py:64` staging move allowed, `:68` reads allowed). Copy that discipline — every deny test needs its allow twin, or you ship a filing agent that refuses everything.

**Guard unit tests (pure, no filesystem, `statFn` injected) — every one has a twin:**

| Deny | Allow twin |
|---|---|
| `downloads/../../Windows/system32/x.dll` | `downloads/Old/x.dll` |
| `C:\Windows\notepad.exe` as `from` | `downloads/notepad-backup.exe` |
| root `C:\Users\mrkin\Downloads2` against root `…\Downloads` | `…\Downloads\sub\a.pdf` |
| `documents/x.pdf` (label not wired) | `downloads/x.pdf` |
| `downloads/x.pdf` → `downloads/x.exe` | `downloads/x.pdf` → `downloads/Old/x.pdf` |
| `downloads/x.pdf` → `downloads/y.pdf` where y exists | → `downloads/y2.pdf` where it does not |
| `from` is a symlink / junction | `from` is a regular file under a junctioned *root* |
| `downloads/CON.pdf`, `downloads/x .pdf`, `downloads/x.pdf.` | `downloads/x (1).pdf`, `downloads/Ünïcode.pdf` |
| `op:"move"` with `to` under `trash/` | `op:"stage"` with `to` under `trash/` |
| 501 moves | 500 moves |
| `deskId` mismatch | `deskId` match |
| `*.crdownload` source | `*.pdf` source |
| source whose size/mtime changed | source that matches its stamp |

**Hash tests:** two 14-move batches differing only inside `moves` must produce different hashes (this fails today); the three shipped flat payloads must hash to the same canonical string as before; a hash mismatch must refuse **and keep** the entry (`confirm.ts:88-92`).

**Executor integration tests** against a temp roster: same-volume move; cross-volume EXDEV fallback including a mid-copy kill (assert no source loss and a `.eve-part` left, not a truncated destination); a locked file (open a handle, assert per-item FAILED and the batch continues); a mid-batch process kill (assert the plan line is on disk and boot reconcile classifies every item correctly); a full batch + undo + assert byte-identical restoration and empty created dirs removed; undo refused after an edit to a moved file.

**End-to-end, once, by hand, on his machine:** "sort my downloads" with 400 real files in a OneDrive-backed Desktop, on a metered connection, watching the network graph. That is the test that finds §8.7, and no unit test will.

**One thing I would refuse to ship without:** a dry run against a *copy* of his real Downloads, with the executor's rename swapped for a logger, and King reading the resulting from→to list out loud. If the plan does not survive him reading it, the card will not either.
