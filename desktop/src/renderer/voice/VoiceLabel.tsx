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

  // A MISSING PROFILE IS NOT AN OLD BRAIN. {ok:true, configuredVoiceId:null,
  // configuredVoiceName:"X"} is the relay saying his Voicebox has no profile
  // named X — "redeploy the brain" would send him to fix the wrong machine.
  const missing = !v.effectiveName && !v.error && v.missingProfile ? v.missingProfile : null;

  const title = v.effectiveName
    ? v.usingOverride
      ? "Your pick, sent with every line she speaks from this desktop."
      : v.pickIgnored
        ? "Your saved pick is not a voice the one speaking now can use, so she is in the brain's own voice."
        : "The voice the brain is configured with."
    : v.error
      ? `Her voice list is unreachable: ${v.error}`
      : v.loading
        ? "Asking the brain which voice is live."
        : missing
          ? `Her brain looks for a Voicebox profile named "${missing}" and the Voicebox on this PC has none. Create or rename one in Voicebox, or pick another voice in Settings → VOICE.`
          : v.configuredVoiceId
            ? "The brain named a voice id that is not in her list — nothing true to print."
            : "This brain does not report which voice is live. Redeploy it to see her name here.";

  return (
    <span title={title}>
      VOICE: {v.effectiveName ? v.effectiveName.toUpperCase() : missing ? `NO PROFILE "${missing.toUpperCase()}"` : "—"}
    </span>
  );
}
