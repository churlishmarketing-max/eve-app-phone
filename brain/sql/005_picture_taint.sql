-- 005_picture_taint.sql — THE DURABLE PICTURE TAINT (audit 5, B1)
--
-- Purely ADDITIVE and IDEMPOTENT. Safe to run twice. No drops, no data
-- rewrites, no change to any existing column.
--
-- ---------------------------------------------------------------------------
-- WHY A COLUMN AND NOT A MAP
--
-- "This conversation has carried a picture" used to live in an in-memory Map in
-- brain/src/image-ledger.ts, which dies with the process. The desktop keeps ONE
-- conversationId in localStorage forever. Audit 5 proved the gap live: picture
-- on turn 1 refused, turn 2 refused, brain restarted, turn 3 of the SAME
-- conversation raised a REAL CARD stamped "I looked and there was no picture".
-- Three ordinary triggers reached it — a Railway redeploy, any failed turn, and
-- LEDGER_CAP eviction.
--
-- Worse, the DURABLE message history rehydrates on exactly the turn the memory
-- row is missing (chat.ts passed `!resumeSession` as includeHistory), replaying
-- her own words about the picture into the context pack. The gate and the
-- replay were keyed on the same missing row, in opposite directions.
--
-- So the fact moves NEXT TO THE HISTORY IT MUST AGREE WITH: same store, same
-- table, same row, same lifetime. A restart cannot separate them, because
-- neither of them is in this process.
--
-- ---------------------------------------------------------------------------
-- THE COLUMN IS MONOTONIC AGAINST EVERY WRITER. Nothing in the brain ever writes
-- `false` to it — there is exactly one writer (src/taint.ts markPictureSeen) and
-- it only ever writes `true`. It is not cleared by endSession, by the catch, by
-- eviction, by a restart, or by a redeploy.
--
-- IT IS NOT MONOTONIC AGAINST ABSENCE, AND AUDIT 6 (D6-B) PROVED IT. The
-- sentence that used to end this paragraph — "it ends when the conversationId
-- ends" — quietly assumed the ROW survives. It may not. `ensureConversation`
-- upserts {id, surface} with ignoreDuplicates, and this column's `not null
-- default false` then RE-MINTS a lost row as clean; chat.ts awaited that upsert
-- before reading the column, so the very next select answered `clean` with
-- source "row" — a witness swearing it had read a row the reader had created a
-- millisecond earlier. The fix is not in this file: chat.ts now READS BEFORE IT
-- MINTS, and src/taint.ts readPictureTaintBeforeMint is the only thing allowed
-- to interpret a missing row (no row + a surviving transcript = orphan, and it
-- REFUSES; no row + nothing at all = a genuinely new conversation, source "new",
-- never "row"). Read that function before trusting anything here.
--
-- AND THE READ FAILS CLOSED. If this column is absent, the select errors, and
-- src/taint.ts reports UNKNOWN — which refuses filing rather than allowing it.
-- An unknown answer is not a clean answer. So until this file is applied,
-- filing is OFF and /health.pictureTaintReady says false. That is deliberate:
-- the alternative is a brain that files while unable to say whether a
-- screenshot is in the room.
-- ---------------------------------------------------------------------------

alter table conversations
  add column if not exists saw_image boolean not null default false;

comment on column conversations.saw_image is
  'MONOTONIC AGAINST EVERY WRITER. True once any turn of this conversation carried an image. Written before the model sees the picture; nothing ever writes false. NOT monotonic against a LOST ROW: this default would re-mint one as clean, so brain/src/chat.ts reads the taint BEFORE ensureConversation and readPictureTaintBeforeMint interprets a missing row (audit 6, D6-B). An unreadable answer refuses filing.';
