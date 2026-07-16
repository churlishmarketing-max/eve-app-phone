import dotenv from "dotenv";

// override:true so the brain always uses its OWN .env config, never an ambient
// credential it happened to be spawned with. Imported first in index.ts, so env
// is loaded before any module reads process.env at import time.
dotenv.config({ override: true });
