// DESK — types. Re-export only.
//
// The real definitions live in src/shared/desk-contract.ts so the renderer and
// the main process cannot drift apart. This file exists so nothing under
// electron/desk/ has to reach across the tree in every import.
//
// Owning stream: DESK/S1.

export * from "../../src/shared/desk-contract.js";
