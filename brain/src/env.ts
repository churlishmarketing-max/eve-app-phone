import dotenv from "dotenv";

// override:true so the brain always uses its OWN .env config, never an ambient
// credential it happened to be spawned with. Imported first in index.ts, so env
// is loaded before any module reads process.env at import time.
dotenv.config({ override: true });

// TOOL SEARCH OFF (2026-09-22). The Claude Code binary the Agent SDK spawns
// defaults, on a first-party host, to DEFERRING every MCP tool behind a
// ToolSearch step: she has to search for corpus_read before she can call it.
// Five behaviour drives caught her looping on that step — sixteen ToolSearch
// calls, zero real tool calls, `error_max_turns` — on ordinary questions like
// "what's the offer ladder?" and "draft Dana's package email". That is an
// error screen on his deck, not a slow answer. With it off, every allowed tool
// is in her context from the first token: a longer (cached) prefix, no search
// round-trips, and no loop to fall into. The binary reads "false"/"0"/"no"/"off"
// as off (its Zc() check → mode "standard"). Set before any query() spawns a
// child, which inherits this env. An explicit value in .env or the host wins.
process.env.ENABLE_TOOL_SEARCH ??= "false";
