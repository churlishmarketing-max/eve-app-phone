# FM-GROUND — ground truth for "Filing hands" (tier 1 of 4)

Assembled 2026-08-31. Every claim carries `file:line`. Nothing in `C:\dev\eve` was modified; no npm/electron run.
Repos read: `C:\dev\eve\brain`, `C:\dev\eve\desktop`, `C:\dev\eve\app` (one grep), plus the Python prior art in the scratchpad.

---

## 0. TL;DR for the architects

| Question | Answer | Evidence |
|---|---|---|
| Does a confirm-card mechanism exist brain-side? | Yes, complete and hardened. | `brain/src/confirm.ts:1-117` |
| Does a "brain decides, client executes locally" path exist? | Yes — `clientAction`, shipped for SMS on the phone. | `confirm.ts:24-27`, `:95-104`; `connectors.ts:300-324`; `app/src/EveApp.tsx:502-516` |
| Does the DESKTOP handle `clientAction`? | **No. Zero code.** The field is typed and then discarded. | `desktop/src/shared/contract.ts:33`; `ConfirmCard.tsx:50-54` |
| Does the brain know anything about King's local filesystem? | **No. Nothing. Not one line.** | §6 |
| Can the desktop renderer touch the filesystem? | No — `contextIsolation:true`, bridge is allowlist-only. | `windows.ts:141-151`; `preload.ts:37-99` |
| Is the renderer `sandbox:true`? | **No — `sandbox:false`, deliberately.** Correct the brief. | `windows.ts:145-147`; `main.ts:596` |
| Did King already write these exact rules once? | Yes, in Python, enforced in code. | `eve-desktop-v1/eve/guardrails.py`, `persona.py:35-46`, `config.py:28-58` |

---

## 1. The confirm machinery, brain-side

### 1.1 `C:\dev\eve\brain\src\confirm.ts` — read in full (117 lines)

**Header law** (`:3-9`): "RED-tier enforcement (02 §6): tools that send anything external NEVER execute directly. They register a pending confirm here; the app renders a confirm card; only POST /confirm with the matching payload hash executes. **There is deliberately NO flag that disables this.**" The store is in-memory by design — "a brain restart clears pending sends, and nothing external can fire without a fresh, explicit approval round-trip."

**`PendingConfirm`** — the public wire shape (`:11-19`):
```ts
id: string;
kind: string;      // e.g. "send_email" | "send_sms" | "send_slack"
summary: string;   // one human line: what will be sent, to whom
payload: Record<string, unknown>;  // the EXACT payload that will be sent
hash: string;      // sha256 of canonical payload — approval must echo it
createdAt: string;
expiresAt: string;
```

**`ClientAction`** (`:24-27`) — `{ type: string; payload: Record<string, unknown> }`. Comment `:21-23`: "Some sends execute on the PHONE, not the brain (SMS leaves from King's SIM, 02 §6 / 05 §7). Those confirms carry a clientAction instead of an execute: approval hands the action back to the app, which fires it natively."

**`StoredConfirm`** (`:29-32`) — `PendingConfirm` **plus** two fields that NEVER cross the wire: `execute: (() => Promise<string>) | null` ("runs the real send on approval; null → the app executes") and `clientAction?: ClientAction`.

**TTL / store** (`:34-35`): `const TTL_MS = 30 * 60_000;` — 30 minutes, "stale sends must be re-requested". `const pending = new Map<string, StoredConfirm>();` — process memory, single instance, no persistence.

**`sweep()`** (`:37-42`): lazy expiry — deletes every entry whose `expiresAt` has passed. Called at the top of `requestConfirm`, `resolveConfirm`, `listPending`. No timer; expiry only happens when something touches the module.

**`payloadHash()`** (`:44-48`):
```ts
const canonical = JSON.stringify(payload, Object.keys(payload).sort());
return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
```
Stable **top-level** key order, sha256, **truncated to 16 hex chars (64 bits)**.
*Reviewer note: `JSON.stringify(value, replacerArray)` applies the key filter **recursively** — any nested key not present in the top-level key list is dropped from the canonical string. For today's flat payloads (`{to,subject,body}`, `{phoneNumber,message}`, `{client_name}`) this is exact. A filing payload with nested structure (`{ moves: [{from,to},…] }`) would canonicalise to a form that omits `from`/`to` unless those names also exist at the top level — i.e. two different file lists could hash identically. **This is the single most load-bearing thing to get right when a filing confirm carries structured file lists.***

**`requestConfirm(kind, summary, payload, execute, clientAction?)`** (`:50-74`):
1. `sweep()`; 2. `id = randomUUID()`; 3. builds `StoredConfirm` with `hash: payloadHash(payload)`, `createdAt` now, `expiresAt` now+30min, the `execute` closure, and `clientAction` only if passed (`:69` conditional spread); 4. `pending.set(id, entry)`; 5. **`:72` strips `execute` and `clientAction` by destructuring** and returns only `publicEntry`. The caller never receives the closure or the action.

**`ConfirmResult`** (`:76-78`):
```ts
| { ok: true; executed: boolean; detail: string; clientAction?: ClientAction }
| { ok: false; error: string }
```

**`resolveConfirm(id, hash, approve)`** (`:80-111`) — the whole enforcement:
- `:85-87` unknown id → `{ok:false, error:"no such pending confirm (expired or already resolved)"}`.
- `:88-92` **hash mismatch → refuse AND KEEP the entry** ("the app is approving a different payload than what would send… so the app can re-fetch and retry"). Error: `"payload hash mismatch — refresh and re-approve"`.
- `:93` **`pending.delete(id)` — single-use "either way"**, and it happens *before* execution: approve, cancel, and a throwing `execute` all consume the confirm. A failed send cannot be retried on the same id.
- `:94` `approve === false` → `{ok:true, executed:false, detail:"cancelled"}`.
- `:95-104` **`execute === null` → the clientAction branch.** Returns `{ok:true, executed:false, detail:"approved — executes on the phone", clientAction}`. `executed:false` is deliberate: `:97` "executed:false is honest — nothing has left the brain."
- `:105-110` otherwise `await entry.execute()` → `{ok:true, executed:true, detail}`; a throw → `{ok:false, error:"send failed: …"}`.

**`listPending()`** (`:113-116`): sweeps, returns every pending entry with `execute` and `clientAction` stripped.

### 1.2 The `POST /confirm` handler — `C:\dev\eve\brain\src\index.ts:108-120`
```ts
app.post("/confirm", async (req, res) => {
  const { id, hash, approve } = req.body ?? {};
  if (typeof id !== "string" || typeof hash !== "string" || typeof approve !== "boolean")
    return res.status(400).json({ error: "id (string), hash (string), approve (boolean) required" });
  res.json(await resolveConfirm(id, hash, approve));
});
```
Thin. Types only, no authorization beyond the global bearer gate at `index.ts:66-74` (timing-safe compare of the full `Bearer <token>` string; `/health`, `/console`, and `GET /wardrobe*` are the only exemptions, `:67-68`). **`resolveConfirm`'s response — including `clientAction` — goes to the HTTP client verbatim.**

### 1.3 How a confirm reaches a surface — two independent paths
1. **Live, during the turn (SSE):** the tool calls `emitConfirm(pending)` → `chat.ts:60` wires `buildConnectorServer((c) => events.onConfirm?.(c))` → `index.ts:466` `onConfirm: (confirm) => send("confirm_request", confirm)`. Frame name: `confirm_request`. Event contract at `chat.ts:19-20`.
2. **Ambient, via polling:** `state.ts:15,32,72` puts `pendingConfirms: listPending()` into every `/state` response — including both degraded returns. A confirm raised in one surface's turn is visible to every surface on its next poll.

---

## 2. Tools brain-side: definition, dispatch, and what it takes to add one

### 2.1 The two in-process MCP servers
| Server | Builder | File | Tool-name prefix |
|---|---|---|---|
| `eve_memory` | `buildMemoryServer(getConversationId)` | `brain/src/tools.ts:15-76` | `mcp__eve_memory__*` |
| `eve_hands` | `buildConnectorServer(emitConfirm)` | `brain/src/connectors.ts:81-690` | `mcp__eve_hands__*` |

Both use `createSdkMcpServer` + `tool` from `@anthropic-ai/claude-agent-sdk` (`tools.ts:1`, `connectors.ts:1`). `tools.ts:13-14`: "Underscore server name — tool names the model sees follow `mcp__{server_name}__{tool_name}` (verified against live SDK docs)."

### 2.2 The exact shape of a tool definition
Positional, 4 or 5 arguments (`tools.ts:21-45` is the canonical annotated example):
```ts
tool(
  "search_memory",                     // 1. name (no prefix — the server adds it)
  "Search EVE's long-term memory … NEVER invent a memory.",   // 2. description: the MODEL'S ONLY
                                       //    instructions. Tier language lives HERE ("GREEN — read-only",
                                       //    "RED tier — this NEVER sends directly"): connectors.ts:89,
                                       //    :132-134, :302-304.
  { query: z.string().describe("…") }, // 3. a PLAIN OBJECT of zod schemas — NOT z.object().
                                       //    Constraints are real: .int().min(1).max(25).default(10)
                                       //    (connectors.ts:90), z.enum([...]) (tools.ts:52),
                                       //    .optional() (connectors.ts:177)
  async ({ query }) => {               // 4. handler — destructured, returns the MCP content envelope
    return text("…");
  },
  { annotations: { readOnlyHint: true } },  // 5. OPTIONAL. Present on every read-only tool;
                                            //    absent on every mutating one.
)
```
The return envelope is a 3-line helper, duplicated in both files (`tools.ts:9-11`, `connectors.ts:47-49`):
```ts
function text(s: string, isError = false) {
  return { content: [{ type: "text" as const, text: s }], ...(isError ? { isError: true } : {}) };
}
```

### 2.3 How `chat.ts` wires tools into the agent loop — `brain/src/chat.ts:59-95`
- `:59-60` both servers are built **per turn** (`memoryServer` closes over the conversation id; `connectorServer` closes over the `onConfirm` emitter).
- `:71` `mcpServers: { eve_memory: memoryServer, eve_hands: connectorServer }`. Comment `:69-70`: "Re-passed on every call including resumes — in-process MCP servers don't persist with the session transcript."
- `:77-84` **`allowedTools` is an explicit, hand-maintained string allowlist**: the three memory names spelled out literally, then `...connectorToolNames`, then `"WebSearch"`, `"WebFetch"`.
- `:85` **`disallowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]`**. Comment `:76`: **"File/shell tools stay off — her body is the phone, not this box."** This is the current explicit statement that the brain container's own filesystem is not hers.
- `:72-75`, verbatim: "Memory + connector tools are pre-approved at the SDK layer. RED-tier enforcement lives INSIDE the send tools (confirm.ts): they queue a pending confirm and return — they cannot send."
- `:86-88` `maxTurns: 12`; `:89` `includePartialMessages: true`; `:92` shared `AbortController` (100 s outage deadline `:41-44`, plus socket-close abort from `index.ts:446-450`).
- Model: `chat.ts:9` `process.env.EVE_MODEL || "claude-sonnet-5"`.
- System prompt: `persona.ts:20-24` — Character Bible + doctrine digest, read from `brain/prompts/{character-bible.md,doctrine-digest.md}` at module load, static for prompt caching.
- Volatile context rides in the user turn: `chat.ts:65` `prompt: \`${contextPack}\n\n${userMessage}\``. `context.ts:15-20` stamps `Now: {day}, {time} (King's local time). Surface: {surface}.` — **`surface` is already in the prompt** (`"desktop"` is sent by `desktop/electron/api.ts:379`).

### 2.4 What it takes to ADD a tool — the exact checklist, from the code
1. Write the `tool(...)` block inside `buildConnectorServer`'s `tools: [...]` array (`connectors.ts:85-688`).
2. **Add its `mcp__eve_hands__<name>` string to `connectorToolNames`** (`connectors.ts:53-79`). Comment `:51-52`: "kept in sync with the definitions below and re-passed to allowedTools on every query (chat.ts)." **A tool omitted here is invisible to the model — the one silent failure mode.**
3. For a RED tool: call `requestConfirm(...)`, then `emitConfirm(pending)`, then return a `text()` saying *queued, NOT done, id, expiry*. Three worked examples: `gmail_send` `:130-154`, `calendar_create_event` (conditional RED when `attendees.length > 0`) `:169-198`, `os_send_pending_email` `:640-661`.
4. Nothing else. No route, no registry, no schema file. **There is no per-tool permission callback in the TS brain** — see §7.1.

### 2.5 The clientAction precedent, in full — `connectors.ts:300-324`
```ts
tool(
  "send_sms",
  "Queue an SMS SEND. RED tier — this NEVER sends directly: it queues the exact message for King's " +
    "explicit confirmation, and on approve HIS PHONE transmits it from his SIM. Dictate → read it " +
    "back → his approve IS the confirmation (02 §6). Tell him it's queued and awaiting his approve.",
  { phoneNumber: z.string()…, message: z.string()… },
  async ({ phoneNumber, message }) => {
    const payload = { phoneNumber, message };
    const pending = requestConfirm(
      "send_sms",
      `Text to ${phoneNumber}: "${…truncated to 80 chars…}"`,   // :313 summary truncates, payload does not
      payload,
      null,                          // :315 no brain-side execute — the app fires it natively on approve
      { type: "send_sms", payload }, // :316 the clientAction, same payload object
    );
    emitConfirm(pending);
    return text(`Queued for King's confirmation (id ${pending.id}). NOT sent — his approve fires it from his phone; it expires ${pending.expiresAt}.`);
  },
)
```
**The pattern in one sentence: pass `null` for `execute`, pass `{type, payload}` as the 5th argument, and the same `payload` object is what gets hashed, what the card displays, and what comes back to the client.**

The phone's side of the same contract — `C:\dev\eve\app\src\EveApp.tsx:498-528`:
```ts
const decideConfirm = async (c: PendingConfirm, approve: boolean) => {          // :498
  const r = await resolveConfirm(c.id, c.hash, approve);                        // :500
  if (r.ok && r.clientAction?.type === "send_sms") {                            // :502
    // "Only reachable through an explicit approve — the ONLY path that ever calls sendSms."  :504-505
    const p = r.clientAction.payload as { phoneNumber: string; message: string };
    try {
      let { sms } = await checkSendSmsPermissions();                            // :508
      if (sms !== "granted") ({ sms } = await requestSendSmsPermissions());     // :509
      if (sms !== "granted") throw new Error("SEND_SMS permission denied");     // :510
      await sendSms({ phoneNumber: p.phoneNumber, message: p.message });        // :511
      void reportSmsSent(p.phoneNumber, p.message);                             // :512 → POST /senses/sms-sent
      note = "SENT from your phone";
    } catch (err) { note = `FAILED — ${…}`; }
  } else { note = r.ok ? (r.executed ? `SENT — …` : "CANCELLED") : `FAILED — …`; }
  … 5s hold, then drop the card, then refetch state (:521-528)
};
```
Four properties a filing implementation should copy: **(a)** the local capability is checked/requested at approve-time, not earlier; **(b)** a denied capability becomes a visible FAILED note, never a silent no-op; **(c)** the client reports the real outcome back to the brain (`POST /senses/sms-sent`, `index.ts:148-157` — today log-only); **(d)** the card holds its result on screen for 5 s before disappearing.

---

## 3. Desktop-side confirm handling

### 3.1 `desktop/src/renderer/confirm/ConfirmCard.tsx` (188 lines)
- **Declared FROZEN** (`:1-7`): "S2 (deck inline slot), S3 (modal) and S4 (summon) all compile against this exact shape. Keep `ConfirmCardProps` and the default export's signature exact or the other streams break." Changing this interface is a three-stream change.
- Props (`:19-23`): `{ confirm: PendingConfirm; variant: "inline" | "modal" | "summon"; onResolved: (id) => void }`.
- **`Resolution`** (`:25-29`) — a typed union: `pending | sent | cancelled | failed`. Header note `:11-14`: this is the ONE deliberate deviation from the phone, which string-matches `startsWith("SENT")`.
- **`toResolution`** (`:50-54`) — **this is where `clientAction` dies**:
```ts
function toResolution(r: ConfirmResolution): Resolution {
  if (r.ok && r.executed) return { status: "sent", detail: r.detail };
  if (r.ok) return { status: "cancelled" };     // ← a clientAction approval lands HERE
  return { status: "failed", error: r.error };
}
```
Because `resolveConfirm` returns `executed:false` for every client-executed confirm (`confirm.ts:98-103`), **an approved clientAction renders the word "CANCELLED"** (`:159`). That is the exact bug an unmodified filing implementation would ship with.
- Constants: `RESOLVE_HOLD_MS = 5000` (`:31`), `EXPIRY_TICK_MS = 15_000` (`:32`).
- Expiry (`:64-74`): `expired` recomputed on a 15 s tick; expired cards render `"EXPIRED — SHE'LL RE-RAISE IT IF IT STILL MATTERS"` (`:163`) with **no buttons at all**. Comment `:67-68`: "A desktop modal can sit open for the full ~35-minute window."
- `decide()` (`:94-108`): `resolvingRef` dedupes double-clicks (`:96`); calls **`window.eve.confirm(confirm.id, confirm.hash, approve)`** (`:100`) — the renderer never sees a URL; a thrown IPC error becomes `{status:"failed"}` (`:102-103`); then a 5 s `setTimeout` before `onResolved(id)` (`:105`).
- Focus (`:83-92`): "This is the ONE place desktop may steal focus (handoff, Artboard C law)." Focused on mount for `modal`/`summon`, never for `inline`.
- Keyboard (`:110-122`): Enter = approve, Escape = cancel, both `stopPropagation()`; inert for `inline`, for a resolved card, and for an expired card; Enter additionally suppressed when `isSendSms`.
- **The `send_sms` special case** — the only client-execution awareness that exists on desktop (`:63`, `:166-169`):
```tsx
const isSendSms = confirm.kind === "send_sms";
…
{isSendSms ? (
  <button className="cbtn locked" disabled type="button">
    APPROVE ON YOUR PHONE — THIS ONE SENDS FROM YOUR SIM
  </button>
) : ( <button className="cbtn ok" …>{approveLabel}</button> )}
```
It is a **hardcoded `kind` string check that disables approve**, not a capability negotiation. Mandated by `contract.ts:25-27`: "Desktop has no SIM: S3 must disable APPROVE on send_sms-kind cards rather than silently no-op." CANCEL stays live for `send_sms` (`:175-177`).
- Rendering (`:145-153`): header `▲ RED TIER · {KIND} — NOTHING SENDS WITHOUT YOU`; the summary; then **every payload key as an uppercase-labelled row, each value clamped to 240 chars** (`clamp240`, `:39-42`, non-strings `JSON.stringify`'d); then `expires HH:MM`.
  *Architect note: a filing payload with 20 file paths renders as one 240-char truncated blob under a single key. Artboard C's anatomy has no list view. This needs a design decision.*

### 3.2 `desktop/src/renderer/confirm/ConfirmLayer.tsx` (35 lines)
The whole file: empty array → `null` (`:23`); otherwise `const [head, ...rest] = confirms` (`:24`) and render a fixed scrim + one centered `ConfirmCard variant="modal"`, with `+{rest.length} MORE WAITING` below (`:26-33`). Comment `:9-12`: "a modal can only front one at a time, so the rest queue behind it… rather than being silently dropped."

### 3.3 Is there ANY `clientAction` branch on desktop?
**No.** Exhaustive grep of `desktop/src` + `desktop/electron` returns exactly two hits, both inert: `contract.ts:25-27` (the comment) and `contract.ts:33` (the optional field on `ConfirmResolution`). No renderer, hook, or main-process file reads `.clientAction`. `api.ts:151-156` passes the object through untouched; `ConfirmCard.tsx:50-54` drops it. **A filing implementation must add this branch from zero.**

### 3.4 `desktop/electron/api.ts` — `postConfirm` and the surrounding law
```ts
export async function postConfirm(id, hash, approve): Promise<ConfirmResolution> {   // :151
  if (isMock()) return fx.mockConfirmResolution(approve);                             // :152
  const r = await callJson<ConfirmResolution>("/confirm", { method: "POST", body: { id, hash, approve } }); // :153
  if ("error" in r) return { ok: false, error: r.error };                             // :154
  return r.data;                                                                      // :155 verbatim, clientAction and all
}
```
File-level laws any new call must obey:
- `:1-3` "ALL BRAIN HTTP. Every call in this file runs in the MAIN process; the renderer never sees a URL with a token on it, never sees the token, and never holds a fetch of its own."
- `:17-19` **"NOTHING IN HERE THROWS TO THE RENDERER."** Reads return `{online:false}`; writes return `{ok:false, error}`. "A dead link is a state to render, not an exception to catch."
- `:42` `JSON_TIMEOUT_MS = 10_000` on every JSON call; the SSE stream deliberately has none.
- `:54-58` `safeMessage()` scrubs `/Bearer\s+\S+/gi` out of every error string before it can surface.
- `:71-98` `callJson` is the single JSON door; 401 is specially named ("unauthorized — check the brain token").
- `:289-328` `parseFrame` — the SSE parser. `:315-316` maps `confirm_request` → `{type:"confirm_request", confirm}` with a bare cast (`p as unknown as PendingConfirm`, **no field validation**). A torn frame is dropped, never guessed at (`:302`).
- `:344-424` `startChat` posts `{message, conversationId, surface:"desktop"}` (`:376-380`) and pumps frames.

### 3.5 The IPC contract — `desktop/src/shared/contract.ts` (462 lines)
- `PendingConfirm` `:15-23` — a byte-for-byte mirror of the brain's public shape.
- `ConfirmResolution` `:28-34` — `{ok, executed?, detail?, error?, clientAction?: {type, payload}}`.
- `EveState` `:110-121` — 10 keys, **only `online` is guaranteed**; `pendingConfirms?: PendingConfirm[]` at `:119`.
- `ChatFrame` `:248-254` — the 6-arm union; `confirm_request` at `:252`. Frames are wrapped in `ChatFrameEvent {chatId, frame}` (`:258-261`) so two live turns can't cross-contaminate.
- **`IPC` channel map `:346-386`** — `:343` "IPC channel names. Strings live HERE and nowhere else." Confirm channel: `confirm: "eve:confirm"` (`:356`). Invoke channels `:348-379`; main→renderer channels `:381-385`.
- **`EveBridge` `:397-454`** — the complete `window.eve` surface. `:391-393`: "the ONLY surface the renderer gets. No token, no Authorization header, no raw fetch." Confirm entry point: `confirm(id, hash, approve): Promise<ConfirmResolution>` (`:419`). Note the existing precedent for a main-side allowlist at `:449-450`: **"Main-side allowlist ONLY — the renderer sends a key, never a URL"** (`openExternal(target: "os" | "gmail")`).
- Config types `:274-301`: `EveConfig {brainUrl, silentAtDesk, pttMode, hotkey, osUrl?}`; `ConfigView extends EveConfig {tokenSet, quietHours, harness}`; `ConfigPatch extends Partial<EveConfig> {token?}` — `:291-292` "`token` is write-only and is peeled off in main".

**The stated procedure for adding a channel** — `preload.ts:12-13`: "Adding a channel means adding it to contract.ts's IPC map, to main.ts's handlers, and here — **in that order**."

### 3.6 How confirms flow through the desktop today
| Step | Location |
|---|---|
| SSE `confirm_request` → `frameConfirms` + attached to the streaming message | `hooks/useChat.ts:101-112` |
| `/state.pendingConfirms` polled every 30 s in main | `electron/poll.ts:28`, `:40-48` |
| New poll-visible confirm fires an OS toast "EVE — waiting on your thumb" | `poll.ts:43-47` |
| Tray badge counts `pendingConfirms + tripwires` | `poll.ts:67-71` |
| Deck merges frame confirms ∪ state confirms, minus locally resolved ids | `deck/App.tsx:190-199` |
| Resolution → mark resolved, prune, refresh state | `deck/App.tsx:201-208` |
| Modal rendered as a sibling of `<Deck/>`, outside `.frame` | `ConfirmLayer.tsx:1-7` |
| Summon holds at most one confirm | `summon/SummonApp.tsx:120`, `:228` |
| Voice never auto-speaks a turn containing a confirm | `voice/useVoiceTurn.ts:12-13`, `:226` |

---

## 4. PRIOR ART — King's own Python build of exactly this feature

Location: `…\scratchpad\eve-desktop-v1\`. Files: `eve/{__init__,brain,config,guardrails,listen,persona,voice}.py`, `run_eve.py`, `smoke_test.py`, `SPEC.md`, `README.md`.
**This is a single-process local agent with real file tools — the topology the one-brain law now forbids. Its VALUE is the rule set, not the architecture.**

### 4.1 `eve/guardrails.py` — read in full (69 lines)
Docstring (`:1-5`): "EVE's guardrails — **Prime Laws enforced in code, not just in the prompt.** The SDK calls `can_use_tool` before every tool execution. **Deny is final:** the model gets the message and must find a compliant path."

**Rule 1 — the destructive-command regex** (`:19-28`), applied to `Bash` only:
```python
_DESTRUCTIVE = re.compile(
    r"(?ix)\b("
    r"rm\s|rmdir\b|del\s|erase\s|format\s|mkfs|dd\s+if=|shred\b"
    r"|remove-item|rd\s+/s"
    r"|shutdown\b|reboot\b"
    r"|curl\s+[^|]*-d\s|wget\s+--post"      # outbound posts
    r"|git\s+push|npm\s+publish"            # nothing ships from EVE
    r")"
)
```
Four families in one rule: **delete** (`rm`, `rmdir`, `del`, `erase`, `remove-item`, `rd /s`, `shred`), **destroy** (`format`, `mkfs`, `dd if=`), **halt the machine** (`shutdown`, `reboot`), **exfiltrate/publish** (`curl -d`, `wget --post`, `git push`, `npm publish`). Case-insensitive, verbose, word-boundary anchored. Note `rm\s` / `del\s` require a trailing space.

Denial message (`:50-56`), verbatim — **the tone the filing tools should reuse**:
> "Prime Law: EVE never deletes, sends, or ships. **Move files to the staging trash directory instead,** or draft the action for Brandon to run himself."

**Rule 2 — forbidden write prefixes** (`:31-39`), applied to `Write | Edit | MultiEdit | NotebookEdit`:
```python
_FORBIDDEN_WRITE_PREFIXES = (
    "/etc", "/usr", "/bin", "/sbin", "/boot", "/system",
    "c:\\windows", "c:\\program files", "c:\\program files (x86)",
)
def _is_forbidden_path(raw):
    p = str(Path(raw).expanduser()).lower()
    return any(p.startswith(pref) for pref in _FORBIDDEN_WRITE_PREFIXES)
```
Denial message (`:65-67`): `"Prime Law: system directories are off-limits."` The target is read from `file_path` **or** `path` (`:59-63`) — it tolerates both key names.
*Reviewer note: `expanduser()` + `.lower()` + `startswith`. **No `resolve()`, so `..` traversal and symlinks are not normalised**, and it is a deny-list, not an allow-list. A TS reimplementation should use `path.resolve` + `fs.realpath` and an **allow**-list of King's named folders.*

**Rule 3 — default allow** (`:69`): `return PermissionResultAllow()`. Everything unnamed is permitted, including all `Read`/`Glob`/`Grep` — and including **`mv` / `Move-Item` / `copy` / `rename`: moves and renames were never gated at all.** Batch size was NOT enforced in code; the 20-file threshold lived only in the prompt (§4.3). Nothing outside the watched dirs was gated in code either; `add_dirs` (§4.4) was the only structural boundary.

### 4.2 `eve/config.py` — watched dirs and the staging trash (77 lines)
```python
def _default_watched() -> list[Path]:                     # :28-31
    home = Path.home()
    candidates = [home / "Downloads", home / "Desktop"]
    return [p for p in candidates if p.exists()] or [home]
```
- `watched_dirs` (`:42-46`): `EVE_WATCHED_DIRS` — a **comma-separated** list, each `.expanduser()`'d, blanks dropped; falls back to `_default_watched()`. **Downloads + Desktop, exactly King's tier-1 wording.**
- `staging_dir` (`:48-50`): `EVE_STAGING`, **default `~/EVE/trash`**.
- `notes_file` (`:52-54`): `EVE_NOTES`, default `~/EVE/notes.md`.
- `ensure_dirs()` (`:56-58`): `mkdir(parents=True, exist_ok=True)` on the staging dir and the notes parent — called once at boot (`run_eve.py:52`), so **the trash always exists before she needs it**.
- **`runtime_context()` (`:60-68`)** — machine facts appended to the system prompt:
```
# This machine
- Watched directories: {comma-joined}
- Staging trash (EVE_STAGING): {path}
- Notes file: {path}
```
**She was TOLD her boundaries in the prompt and CONSTRAINED to them by `add_dirs` — belt and braces.**
- `max_budget_usd` (`:40`): `EVE_MAX_BUDGET_USD`, default **1.50** per session.
- `validate()` (`:70-77`): returns a list of human problems; only checks the API key.

### 4.3 `eve/persona.py` — the Prime Laws in prose (53 lines)
Job 1 of 3 (`:22-27`): "**FILE MARSHAL.** Sort, rename, move, and find files in the watched directories. Group by project/type/date when asked to 'clean up.' When asked to find something, find it, say where it is, and offer to open or move it." (Jobs 2–3: LOOKUP DESK `:28-29`, DAILY BRIEF `:30-33`.)

**`# Prime Laws (non-negotiable)` — `:35-46`, verbatim:**
> - **NEVER delete.** "Delete" means move to the staging trash directory (EVE_STAGING). **Say what you staged; Brandon empties it, not you.**
> - **NEVER send, post, publish, purchase, or submit anything external.** You draft; Brandon sends.
> - **CONFIRM FIRST before:** moving more than 20 files in one action, **overwriting an existing file**, or touching anything outside the watched directories or home folder. **Ask out loud, wait for a yes.**
> - **HONESTY CLAUSE.** You do not pretend to capabilities this session lacks. No claiming to have monitored things overnight, sent things, or run in the background. If you don't know a current fact, search or say so — never decorate a guess as knowledge.

Also `:48-52`: "If Brandon asks for something against the Prime Laws, **hold the line and offer the compliant version**." And the voice contract `:13-21`: first paragraph ≤ ~50 words is spoken; anything after a line containing only `---` is printed but never spoken — **"no file paths unless asked"**, paths go below the fold.

**The confirm-first law has THREE triggers; King's tier-1 brief names two.** He carried the >20 batch and the outside-named-folders case. **`overwriting an existing file` is the third and it is missing from the brief.** Architects should carry it.

### 4.4 `eve/brain.py` — the structural boundary (94 lines)
```python
ALLOWED_TOOLS = ["Read","Write","Edit","Glob","Grep","Bash","WebSearch","WebFetch","TodoWrite"]  # :23-26
options = ClaudeAgentOptions(
    system_prompt=EVE_SYSTEM_PROMPT + config.runtime_context(),   # :33  laws + machine facts
    model=config.model, allowed_tools=ALLOWED_TOOLS,              # :34-35
    can_use_tool=eve_can_use_tool,                                # :36  the code-level gate
    cwd=str(config.watched_dirs[0]),                              # :37  starts inside Downloads
    add_dirs=[str(p) for p in config.watched_dirs]
             + [str(config.staging_dir), str(config.notes_file.parent)],  # :38-39
    max_turns=40, max_budget_usd=config.max_budget_usd,           # :40-41
)
```
`:38-39` is the real containment: **the only directories she could reach were the watched dirs, the staging trash, and the notes folder.** Tool activity was echoed live to the console (`:63-65`, `_tool_line` `:71-85`, surfacing `command | file_path | path | pattern | query`, truncated at 70 chars) — **a visible-hands principle the desktop has no equivalent of today.** `split_spoken` (`:88-94`) implements the `---` fold.

### 4.5 `smoke_test.py` — 15 checks, and which covered file safety
Every `check(...)` call, in order:

| # | Line | Check | File safety? |
|---|---|---|---|
| 1 | `:34` | imports | — |
| 2 | `:41` | config constructs (reports model + watched-dir count) | indirect |
| 3 | `:44` | `validate()` flags missing API key | — |
| 4 | `:47` | persona: spoken-line contract present | — |
| 5 | `:49` | persona: prime laws present (`"NEVER delete" in EVE_SYSTEM_PROMPT`) | **YES** |
| 6 | `:58` | **guardrail denies `rm`** — input `rm -rf ~/Downloads` | **YES** |
| 7 | `:60` | **guardrail denies `Remove-Item`** — input `Remove-Item -Recurse temp` | **YES** |
| 8 | `:62` | guardrail denies `git push` | ships/sends |
| 9 | `:64` | **guardrail ALLOWS the staging move** — input `mv report.pdf ~/EVE/trash/` | **YES** |
| 10 | `:66` | **guardrail denies system-dir write** — `Write {file_path: "C:\Windows\system32\x"}` | **YES** |
| 11 | `:68` | **guardrail ALLOWS reads** — `Read {file_path: "~/Downloads/inv.pdf"}` | **YES** |
| 12 | `:72` | `split_spoken` honours the `---` fold | — |
| 13 | `:79` | brain constructs with verified SDK options | indirect |
| 14 | `:83` | voice module constructs (lazy deps) | — |
| 15 | `:84` | tool roster sane (`Bash` and `WebSearch` in `ALLOWED_TOOLS`) | — |

**6 of 15 are direct guardrail rulings (`:57-68`); 5 of those are file safety proper (#6, 7, 9, 10, 11), and #5 is a prose assertion on the Prime Laws.** Two of the five assert an **ALLOW**, not a deny — the suite deliberately proves the compliant path still works (staging move, read). Copy that pattern: every deny test needs its allow twin, or you ship a filing agent that refuses everything.
`SPEC.md:20` states the same claim as an acceptance criterion: "Prime Laws enforced in code | `smoke_test.py`: rm / Remove-Item / git push denied, staging move allowed, system-dir writes denied."
`README.md:38`: "**Delete.** Anything 'deleted' is staged to `~/EVE/trash` for you to empty."
`SPEC.md:9` / `:11` and `run_eve.py:11,34,38` confirm the two operational commands: `/sort` (file-marshal pass on watched dirs) and `/brief` (last-24h sweep of watched dirs + notes).

**What the prior art did NOT enforce in code (all prompt-only):** the >20-file batch ceiling; the overwrite-existing-file confirm; the outside-watched-dirs confirm (only `add_dirs` limited reach — not an approval flow); any rename/move validation; any path normalisation against `..`/symlinks; any audit log of what was moved where. **All six are gaps the new build must close in code, not prose.**

---

## 5. What the desktop main process can already do safely

- **Windows are `contextIsolation:true`, `nodeIntegration:false`, and — correcting the brief — `sandbox:FALSE`**: `windows.ts:141-151` (deck), `:213-218` (summon), `main.ts:592-596` (the shot-url harness window). Reason stated at `windows.ts:145-146`: "sandbox MUST stay false: the preload needs node's `require` to reach ipcRenderer through contextBridge in this build setup." **Practical effect is unchanged for the architects — the renderer still has no `fs`, no `fetch`, no `ipcRenderer`, because `preload.ts:99` `contextBridge.exposeInMainWorld("eve", eve)` exposes exactly the `EveBridge` object and nothing else — but the security reviewer must know the flag is `false`, not `true`.**
- **The IPC handler pattern** — `main.ts:152-290`, one table, ~35 handlers. Shapes actually in use:
  - one-liner passthrough: `ipcMain.handle(IPC.confirm, (_e, a: {id;hash;approve}) => api.postConfirm(a.id, a.hash, a.approve))` (`:207-209`);
  - single scalar: `ipcMain.handle(IPC.routineArchive, (_e, id: string) => api.postRoutineArchive(id))` (`:224`);
  - **try/catch returning `{ok:false,error}` and never throwing**: `configSet` `:163-180`;
  - **the allowlist pattern to copy** — `openExternal` `:274-282`: "ALLOWLIST ONLY — the renderer sends a target key, never a URL. This is the one place that turns a key into an actual destination." An unknown key returns `{ok:false}` and nothing happens;
  - `senderWindow(e)` (`:148-150`) when a handler must know which window called.
- **Existing main-process `fs`**: `main.ts:11` imports `mkdirSync, writeFileSync`, used only by the screenshot harnesses (`:474`, `:484`, `:579`, `:635`). `electron/config.ts:14` imports the full set for `userData/config.json` with **atomic writes** (temp file + `renameSync`, `:74-89`) and a corrupt-file fallback to defaults (`:55-61`). **There is a working, reviewed model for durable main-process file I/O to copy.**
- **The one secret** — `secrets.ts` (94 lines): `safeStorage` (DPAPI on Windows), base64 into `config.json`'s `tokenEnc`; `getToken()` documented MAIN-PROCESS ONLY (`:37-40`); if `safeStorage.isEncryptionAvailable()` is false **it refuses to store, no plaintext fallback** (`:71-79`); errors deliberately generic so an exception can never carry the token (`:84-85`); `EVE_BRAIN_TOKEN` env override for CI (`:18-21`). Only the boolean `tokenSet` crosses to the renderer (`main.ts:142`).
- **Config keys that exist today** (`contract.ts:274-280`, `electron/config.ts:25-48`): `brainUrl, tokenEnc?, silentAtDesk, pttMode, hotkey, osUrl?`. `coerce()` (`:38-48`) validates and defaults every field — **a `watchedDirs`/`stagingDir` addition belongs here and must go through `coerce`.** Default brain URL `:23` = `https://eve-app-phone-production.up.railway.app`.
- **Polling** — `poll.ts:28` `INTERVAL_MS = 30_000`; `pollOnce()` / `startPoll()` / `stopPoll()`; `lastState()` cache; `broadcast(IPC.stateUpdate, …)` to every window.
- **Other main-process facts**: single-instance lock and tray in `main.ts`; `broadcast()` sends a frame to every live window (`main.ts:195`, comment `:190-194`); `voiceRelay` (`:246-251`) is the precedent for main as a dumb window-to-window repeater that never echoes to its sender.

---

## 6. Does the brain know anything about King's local filesystem?

**No. There is no notion of a local file, a watched folder, a path on his machine, or file context anywhere in `brain/src`. Reporting this honestly, as asked: the ground is bare.**

Every `node:fs` use in the brain concerns the brain's own Railway container, never King's machine:

| File:line | What it touches | Whose disk |
|---|---|---|
| `persona.ts:11-18` | `brain/prompts/character-bible.md`, `doctrine-digest.md` | brain container |
| `index.ts:82` | `brain/public/console.html` | brain container |
| `fleet.ts:47` | `brain/data/fleet-roster.json` | brain container |
| `dispatch.ts:16`, `:188-200` | `brain/data/deliverables/{jobId}.md`; path stored as `result_ref` | brain container |
| `push.ts:13`, `:28-34`, `:49`, `:73-75` | `data/push-tokens.json` fallback (Supabase is primary) | brain container |
| `firebase.ts:12-53` | service-account / ADC credential JSON | brain container |
| `wardrobe.ts` / `index.ts:245-265` | look **filenames** in Supabase Storage, served by URL | cloud bucket |

Corroborating negatives:
- `chat.ts:85` **`disallowedTools: ["Bash","Read","Write","Edit","Glob","Grep"]`**; `chat.ts:76` "File/shell tools stay off — her body is the phone, not this box."
- `connectorToolNames` (`connectors.ts:53-79`) — **25 tools, not one names a file, folder, or path.**
- The only `folder` hit in all of `brain/src` is `wardrobe.ts:11`, about the local PNG sync folder for renders.
- `/senses/*` (`index.ts:122-157`) covers SMS and notifications only — transient ring buffers, "no database writes" (`:123-124`).
- `/state` (`state.ts`) returns brief, tasks, floor, attention, clients, jobs, routines, pendingConfirms, connectors — **no file or folder key**.
- `getConnectorStatus()` (`connectors.ts:36-45`) lists gmail, gcal, churlish_os, notebook, deepgram, elevenlabs — **no "filesystem" or "desktop" connector**.

**Consequence:** the brain has no way today to know Downloads exists, what is in it, or that a desktop is even attached. Everything — the folder roster, the file inventory, the staging-trash location, the capability advertisement — is new surface. The one thing it already knows is *which* surface is speaking: `context.ts:15-20` stamps `Surface: desktop` into the context pack, and `desktop/electron/api.ts:379` is what sends it.

---

## 7. Structural gaps between the prior art and the current architecture

Flagged because this is where the two designs will differ — not prescribing a solution.

1. **No `can_use_tool` equivalent in the TS brain.** The Python build's entire enforcement layer was a per-call permission callback (`guardrails.py:42-69`, wired at `brain.py:36`). The TS brain has **no such hook** — `chat.ts:62-95` passes `allowedTools`/`disallowedTools` and nothing else. Enforcement today lives *inside each tool body* (`confirm.ts:3-6`). Any denial rule for filing must be written into the tool handler, or into whatever executes locally, or both.
2. **The executor is on the far side of a network hop.** The Python guardrail inspected the command in the same process that would run it. In the new topology the brain raises the confirm and *the desktop* moves the file. **The desktop must re-enforce every rule at execution time** — a brain-side check is advisory once the payload is on the wire. The phone's SMS path already models this (`EveApp.tsx:508-510` re-checks its own permission at approve-time).
3. **`executed:false` is ambiguous.** `confirm.ts:98-103` returns `executed:false` for both "cancelled" and "approved, now go do it locally", and `ConfirmCard.tsx:50-54` collapses both to "CANCELLED". Any client-executed filing confirm needs this disambiguated — a new `Resolution` arm, or a discriminator on the response.
4. **Single-use deletion happens before execution** (`confirm.ts:93`). If the desktop's local move fails after approval, the confirm is already gone and cannot be retried — she must re-raise a fresh one. Correct for sends; the architects should decide whether it is correct for filing, and it must be a decision, not an accident.
5. **`payloadHash` truncates to 64 bits and canonicalises top-level keys only** (`confirm.ts:44-48`, see §1.1). Both properties matter far more for a structured file-move payload than they ever did for `{to,subject,body}`.
6. **The card cannot render a list.** `ConfirmCard.tsx:126`, `:147-152`, `clamp240` at `:39-42` — one row per payload key, 240 chars each. A 20-file batch has no representation today.
7. **No audit trail.** The brain logs a client-executed SMS at `index.ts:150-157` ("Log only") and nothing persists. There is no equivalent of "what did she move, where, when" — and unlike a sent text, a filing action is silent unless something records it. The prior art's only version was printing tool lines to the console (`brain.py:63-65`).
8. **The 20-file ceiling and the overwrite rule were never in code**, in either build: prompt-only in Python (`persona.py:40-42`), nonexistent in TS.

*Where the design leaves room later (one line, as instructed): `clientAction.type` is an open discriminator and the desktop main process is the only place that maps a type to a local capability — a future tier could add types there without touching the confirm machinery, but nothing in this build should anticipate opening apps or reading the screen.*
