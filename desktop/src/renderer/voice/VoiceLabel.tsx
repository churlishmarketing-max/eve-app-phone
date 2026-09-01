// owner: stream V (her voice)
//
// THE RAIL'S VOICE LINE. One span, one job: name the voice she is ACTUALLY in.
//
// It resolves the name from the id the brain reports as configured (or from his
// saved pick once the brain proves it honours picks) — see useVoiceIdentity.
// When that id cannot be resolved to a name, this prints "VOICE: —" and stops.
// It never falls back to the first entry of /voice/voices, which is what used
// to make the rail say "ADAM" while she was configured as Lara.
//
// Uppercase is the mono chrome; the name itself is always hers, never baked in.

import { useVoiceIdentity } from "./useVoiceIdentity";

export default function VoiceLabel() {
  const v = useVoiceIdentity();

  const title = v.effectiveName
    ? v.usingOverride
      ? "Your pick, sent with every line she speaks from this desktop."
      : "The voice the brain is configured with."
    : v.error
      ? `Her voice list is unreachable: ${v.error}`
      : v.loading
        ? "Asking the brain which voice is live."
        : v.configuredVoiceId
          ? "The brain named a voice id that is not in her list — nothing true to print."
          : "This brain does not report which voice is live. Redeploy it to see her name here.";

  return <span title={title}>VOICE: {v.effectiveName ? v.effectiveName.toUpperCase() : "—"}</span>;
}
