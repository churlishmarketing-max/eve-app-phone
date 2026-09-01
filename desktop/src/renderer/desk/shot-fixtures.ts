// owner: stream S3 (DESK/UI) — fixtures for the ?shot= scenarios ONLY.
//
// Nothing here is his data and nothing here is asserted fact. Every path is
// under a plausible-but-invented tree, the client name is Acme, and the numbers
// are round. They exist so a still capture can photograph a STATE the live app
// only reaches with real files under it.
//
// Two of these fixtures are deliberately hostile, because the card's job is to
// survive them:
//
//   BIDI_NAME  contains U+202E RIGHT-TO-LEFT OVERRIDE. Pasted into almost any
//              other UI it renders as "Invoice-2026-08exe.pdf" — a PDF. It is
//              an .exe. (PATH-3)
//   HOMOGLYPH  contains Cyrillic А (U+0410), so "Аcme" and "Acme" are two
//              folders on disk that no human eye separates. (PATH-3)
//
// If a capture of these scenarios ever shows either of them reading as
// innocent, the defence has regressed and the PNG says so.
import type {
  DeskBatchRecord,
  DeskOutcome,
  DeskPreflight,
  DeskRootView,
  DeskStatus,
  FileBatchPayload,
  FileMove,
  PendingConfirm,
  PreflightRow,
} from "@shared/contract";

/** U+202E RIGHT-TO-LEFT OVERRIDE, mid-name. The bytes end in `.exe`. */
export const BIDI_NAME = "Invoice-2026-08\u202Efdp.exe";
/** Cyrillic А (U+0410) in place of Latin A. */
export const HOMOGLYPH_DIR = "Clients/\u0410cme";

// The clock is RELATIVE, not frozen. A frozen timestamp made every capture
// render `EXPIRED — SHE'LL RE-RAISE IT IF IT STILL MATTERS` instead of the
// action row, which meant the receipts could not show the one thing the
// scroll-gate scenario exists to prove: APPROVE, disabled. The card's expiry
// logic is real and correct; the fixture was the thing that was wrong.
const NOW = Date.now();

function iso(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

// ---------------------------------------------------------------------------
// Roots + status
// ---------------------------------------------------------------------------

export const SHOT_ROOTS: DeskRootView[] = [
  {
    label: "downloads",
    path: "C:\\Users\\mrkin\\Downloads",
    real: "C:\\Users\\mrkin\\Downloads",
    trash: "C:\\Users\\mrkin\\EVE\\trash\\downloads",
    dryRun: true,
    synced: false,
    attrSweepOk: true,
    writeProbeOk: true,
    sameVolume: true,
    freeOnVolume: 214_000_000_000,
    trashFiles: 0,
    trashBytes: 0,
  },
  {
    label: "desktop",
    path: "C:\\Users\\mrkin\\OneDrive\\Desktop",
    real: "C:\\Users\\mrkin\\OneDrive\\Desktop",
    trash: "C:\\Users\\mrkin\\EVE\\trash\\desktop",
    dryRun: false,
    synced: true,
    attrSweepOk: true,
    writeProbeOk: true,
    sameVolume: true,
    freeOnVolume: 214_000_000_000,
    trashFiles: 3,
    trashBytes: 41_200_000,
  },
  {
    label: "archive",
    path: "D:\\Archive",
    real: "D:\\Archive",
    trash: "",
    dryRun: true,
    synced: false,
    attrSweepOk: false,
    writeProbeOk: false,
    sameVolume: false,
    freeOnVolume: 0,
    trashFiles: 0,
    trashBytes: 0,
    refusal:
      "that folder is on a different drive from the trash it would need, so staging there would be a copy and then a delete — and there is no delete. Move the folder to C: or pick another one.",
  },
];

export const SHOT_NEVER_LIST = [
  "**/.ssh/**",
  "**/.aws/**",
  "**/.gnupg/**",
  "id_rsa*",
  "*.pem",
  "*.p12",
  "*.pfx",
  "*.ovpn",
  "*.kdbx",
  ".env*",
  "credentials",
  "*.keystore",
  "**/.git/**",
  "**/node_modules/**",
  "**/AppData/**",
  "**/Personal Vault/**",
];

export const SHOT_STATUS_ARMED: DeskStatus = {
  enabled: true,
  ready: true,
  attrSweepOk: true,
  deskId: "a5f1c0de-9b21-4f77-8e0a-6d1c2f9b4e33",
  journalPath: "C:\\Users\\mrkin\\AppData\\Roaming\\eve-desktop\\desk-journal.jsonl",
  rootCount: 2,
  refusedRoots: [
    { label: "archive", path: "D:\\Archive", refusal: "trash cannot live on the same volume" },
  ],
  lastRefusal: "",
  killAccel: "CommandOrControl+Alt+Shift+F",
  neverList: SHOT_NEVER_LIST,
};

export const SHOT_STATUS_OFF: DeskStatus = {
  ...SHOT_STATUS_ARMED,
  enabled: false,
  rootCount: 0,
};

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

function move(i: number, fromRel: string, toRel: string, size: number, f = ""): FileMove {
  return {
    i,
    fromRoot: "downloads",
    fromRel,
    toRoot: "downloads",
    toRel,
    size,
    mtimeMs: NOW - i * 90_000,
    f,
  };
}

const SMALL_MOVES: FileMove[] = [
  move(0, "Invoice 4411.pdf", "Clients/Acme/Invoice 4411.pdf", 1_233_408),
  move(1, "Invoice 4412.pdf", "Clients/Acme/Invoice 4412.pdf", 1_118_000),
  move(2, "Acme-statement-Q3.pdf", "Clients/Acme/Acme-statement-Q3.pdf", 8_412_000),
  move(3, "Invoice 4415.pdf", "Clients/Acme/Invoice 4415.pdf", 980_000),
  move(4, "Invoice 4416.pdf", "Clients/Acme/Invoice 4416.pdf", 902_000),
  // The two hostile rows. Note the second one's destination folder: Cyrillic А.
  move(5, BIDI_NAME, `Clients/Acme/${BIDI_NAME}`, 1_402_880, "~"),
  move(6, "Acme-terms-signed.pdf", `${HOMOGLYPH_DIR}/Acme-terms-signed.pdf`, 240_000, "~"),
];

export function shotPayload(over: Partial<FileBatchPayload> = {}): FileBatchPayload {
  return {
    protocol: 1,
    batchId: "3c9a7e2b-51d0-4a6c-9f22-77ba0e1d4c58",
    deskId: SHOT_STATUS_ARMED.deskId,
    indexRev: "9c41e0a2",
    op: "move",
    dryRun: true,
    intent: "put the Acme invoices with the rest of Acme's paperwork",
    count: SMALL_MOVES.length,
    bytes: SMALL_MOVES.reduce((a, m) => a + m.size, 0),
    distinctDests: 2,
    newFolders: ["downloads\\Clients\\Acme"],
    extensions: [".pdf"],
    crossesSyncBoundary: false,
    sanitisedNames: 2,
    moves: SMALL_MOVES,
    ...over,
  };
}

/** 50 rows — the hard cap, and the batch the scroll gate exists for. */
export function shotLargePayload(): FileBatchPayload {
  const moves: FileMove[] = [];
  for (let i = 0; i < 50; i++) {
    const n = String(i + 1).padStart(2, "0");
    moves.push(
      move(i, `20260605_0956${n}.mp4`, `Video/2026-06/20260605_0956${n}.mp4`, 148_000_000 + i * 3_100_000),
    );
  }
  return {
    ...shotPayload(),
    batchId: "b41f0d77-2ac3-4e15-91d6-0b8e5c31aa02",
    dryRun: false,
    intent: "clear the June screen recordings out of the root of downloads",
    count: 50,
    bytes: moves.reduce((a, m) => a + m.size, 0),
    distinctDests: 1,
    newFolders: ["downloads\\Video\\2026-06"],
    extensions: [".mp4"],
    sanitisedNames: 0,
    moves,
  };
}

export function shotConfirm(payload: FileBatchPayload, over: Partial<PendingConfirm> = {}): PendingConfirm {
  return {
    id: `confirm-${payload.batchId}`,
    kind: "file_batch",
    summary: "A filing plan is waiting on you.",
    payload: payload as unknown as Record<string, unknown>,
    hash: "3c9a7e2b51d04a6c9f2277ba0e1d4c58",
    createdAt: iso(-5 * 60_000),
    expiresAt: iso(5 * 60_000),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

export function shotPreflight(p: FileBatchPayload, over: Partial<DeskPreflight> = {}): DeskPreflight {
  const rows: PreflightRow[] = p.moves.map((m, idx) => ({
    idx,
    name: m.fromRel,
    altered: (m.f ?? "").includes("~"),
    toRel: m.toRel,
    size: m.size,
    status: "will-move",
    why: "",
    rule: "",
  }));
  return {
    ok: true,
    batchId: p.batchId,
    hashPrefix: "3c9a7e2b",
    dryRun: p.dryRun,
    plannedCount: p.moves.length,
    verifiedCount: p.moves.length,
    verifiedBytes: p.moves.reduce((a, m) => a + m.size, 0),
    rows,
    newFolders: p.newFolders ?? [],
    extensions: p.extensions ?? [],
    distinctDests: p.distinctDests ?? 1,
    crossesSyncBoundary: p.crossesSyncBoundary === true,
    checkedAt: iso(0),
    ...over,
  };
}

/** The small batch, re-checked: two of it is no longer there to move. */
export function shotPreflightSmall(): DeskPreflight {
  const p = shotPayload();
  const base = shotPreflight(p);
  const rows = base.rows.map((r) => {
    if (r.idx === 3) {
      return { ...r, status: "gone" as const, size: 0, why: "it is not in that folder any more", rule: "G-T2" };
    }
    if (r.idx === 4) {
      return {
        ...r,
        status: "collision" as const,
        why: "a file with that name is already there. she does not rename around a collision — she will propose a new name next turn",
        rule: "G-D6",
      };
    }
    return r;
  });
  const verified = rows.filter((r) => r.status === "will-move");
  return {
    ...base,
    rows,
    verifiedCount: verified.length,
    verifiedBytes: verified.reduce((a, r) => a + r.size, 0),
  };
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

export function shotDryRunOutcome(): DeskOutcome {
  const p = shotPayload();
  return {
    ok: true,
    batchId: p.batchId,
    jobId: "job-7f0c21",
    dryRun: true,
    verb: "WOULD HAVE MOVED",
    moved: 5,
    skipped: 2,
    failed: 0,
    refused: 0,
    bytes: 12_406_288,
    items: p.moves.map((m, idx) => ({
      idx,
      status: idx === 3 || idx === 4 ? ("skipped" as const) : ("would-have-moved" as const),
      rule: idx === 3 ? "G-T2" : idx === 4 ? "G-D6" : "",
      why: idx === 3 ? "gone before she got to it" : idx === 4 ? "name taken" : "",
      fromAbs: `C:\\Users\\mrkin\\Downloads\\${m.fromRel}`,
      toAbs: `C:\\Users\\mrkin\\Downloads\\${m.toRel.replace(/\//g, "\\")}`,
      size: m.size,
    })),
    createdDirs: [],
    rollbackRecommended: false,
    startedAt: iso(60_000),
    finishedAt: iso(60_400),
    hashPrefix: "3c9a7e2b",
  };
}

/** PART-1 / PART-2: ten landed, twenty did not, and Windows is the reason. */
export function shotHalfFailedOutcome(): DeskOutcome {
  const items: DeskOutcome["items"] = [];
  // Interleaved on purpose. A contiguous run would let the capture show ten
  // green rows and nothing else, and the whole point of the per-row outcome is
  // that WHICH ten is visible without scrolling to hunt for it.
  for (let i = 0; i < 30; i++) {
    const moved = i % 3 === 0;
    items.push({
      idx: i,
      status: moved ? "moved" : "failed",
      rule: moved ? "" : "G-C13",
      why: moved ? "" : "EPERM — Windows refused the write",
      fromAbs: `C:\\Users\\mrkin\\Downloads\\Invoice 44${String(11 + i).padStart(2, "0")}.pdf`,
      toAbs: `C:\\Users\\mrkin\\Downloads\\Clients\\Acme\\Invoice 44${String(11 + i).padStart(2, "0")}.pdf`,
      size: 1_100_000 + i * 4000,
    });
  }
  return {
    ok: false,
    batchId: "9d2e77aa-4c11-4b33-8f90-1e5b7a2c9d40",
    jobId: "job-c31b90",
    dryRun: false,
    verb: "MOVED",
    moved: 10,
    skipped: 0,
    failed: 20,
    refused: 0,
    bytes: 11_180_000,
    items,
    createdDirs: ["C:\\Users\\mrkin\\Downloads\\Clients\\Acme"],
    rollbackRecommended: true,
    massRefusal:
      "Windows blocked 20 of these. That is Controlled Folder Access: Settings → Privacy & security → Windows Security → Virus & threat protection → Ransomware protection → Allow an app through Controlled folder access.",
    startedAt: iso(60_000),
    finishedAt: iso(64_000),
    hashPrefix: "9d2e77aa",
  };
}

export function shotHalfFailedConfirm(): PendingConfirm {
  const moves: FileMove[] = [];
  for (let i = 0; i < 30; i++) {
    const name = `Invoice 44${String(11 + i).padStart(2, "0")}.pdf`;
    moves.push(move(i, name, `Clients/Acme/${name}`, 1_100_000 + i * 4000));
  }
  return shotConfirm({
    ...shotPayload(),
    batchId: "9d2e77aa-4c11-4b33-8f90-1e5b7a2c9d40",
    dryRun: false,
    intent: "file the August invoices under Acme",
    count: 30,
    bytes: moves.reduce((a, m) => a + m.size, 0),
    distinctDests: 1,
    newFolders: ["downloads\\Clients\\Acme"],
    extensions: [".pdf"],
    sanitisedNames: 0,
    moves,
  });
}

// ---------------------------------------------------------------------------
// The journal
// ---------------------------------------------------------------------------

export const SHOT_BATCHES: DeskBatchRecord[] = [
  {
    batchId: "9d2e77aa-4c11-4b33-8f90-1e5b7a2c9d40",
    jobId: "job-c31b90",
    at: iso(-40 * 60_000),
    op: "move",
    dryRun: false,
    intent: "file the August invoices under Acme",
    hashPrefix: "9d2e77aa",
    moved: 10,
    skipped: 0,
    failed: 20,
    refused: 0,
    bytes: 11_180_000,
    undone: false,
    interrupted: false,
    items: [
      {
        idx: 0,
        fromAbs: "C:\\Users\\mrkin\\Downloads\\Invoice 4411.pdf",
        toAbs: "C:\\Users\\mrkin\\Downloads\\Clients\\Acme\\Invoice 4411.pdf",
        status: "moved",
        why: "",
      },
      {
        idx: 1,
        fromAbs: `C:\\Users\\mrkin\\Downloads\\${BIDI_NAME}`,
        toAbs: `C:\\Users\\mrkin\\Downloads\\Clients\\Acme\\${BIDI_NAME}`,
        status: "moved",
        why: "",
      },
      {
        idx: 2,
        fromAbs: "C:\\Users\\mrkin\\Downloads\\Invoice 4421.pdf",
        toAbs: "C:\\Users\\mrkin\\Downloads\\Clients\\Acme\\Invoice 4421.pdf",
        status: "failed",
        why: "EPERM — Windows refused the write (Controlled Folder Access)",
      },
    ],
  },
  {
    batchId: "3c9a7e2b-51d0-4a6c-9f22-77ba0e1d4c58",
    jobId: "job-7f0c21",
    at: iso(-3 * 60 * 60_000),
    op: "move",
    dryRun: true,
    intent: "put the Acme invoices with the rest of Acme's paperwork",
    hashPrefix: "3c9a7e2b",
    moved: 5,
    skipped: 2,
    failed: 0,
    refused: 0,
    bytes: 12_406_288,
    undone: false,
    interrupted: false,
    items: [],
  },
  {
    batchId: "0af31c58-88b2-4d07-a1e4-2c6f90bb1177",
    jobId: "job-11ee02",
    at: iso(-9 * 60 * 60_000),
    op: "stage",
    dryRun: false,
    intent: "move the finished installers into the trash so the folder reads clean",
    hashPrefix: "0af31c58",
    moved: 7,
    skipped: 0,
    failed: 0,
    refused: 0,
    bytes: 2_140_000_000,
    undone: true,
    interrupted: false,
    items: [],
  },
  {
    batchId: "5b7c04e9-6a31-4c88-b0d2-3f1a95ce7788",
    jobId: "job-9a4d17",
    at: iso(-26 * 60 * 60_000),
    op: "move",
    dryRun: false,
    intent: "sort the June screen recordings by month",
    hashPrefix: "5b7c04e9",
    moved: 7,
    skipped: 0,
    failed: 0,
    refused: 7,
    bytes: 1_040_000_000,
    undone: false,
    interrupted: true,
    items: [
      {
        idx: 0,
        fromAbs: "C:\\Users\\mrkin\\Downloads\\20260605_095601.mp4",
        toAbs: "C:\\Users\\mrkin\\Downloads\\Video\\2026-06\\20260605_095601.mp4",
        status: "moved",
        why: "reconciled at boot — the file is at the destination and not at the source",
      },
      {
        idx: 8,
        fromAbs: "C:\\Users\\mrkin\\Downloads\\20260605_095609.mp4",
        toAbs: "C:\\Users\\mrkin\\Downloads\\Video\\2026-06\\20260605_095609.mp4",
        status: "cancelled",
        why: "AMBIGUOUS — TWO COPIES, CHECK BOTH. Both paths exist with the same size and time.",
      },
    ],
  },
];
