// owner: stream S4
//
// Registrations only — the components live in src/renderer/{summon,voice,
// tray-flyout}. Each key is a "?shot=<key>" URL scripts/shot.mjs can capture.
//
// The four summon scenarios render the SAME SummonPanel the live overlay
// renders, driven by props, so a receipt cannot drift from the shipped
// component. "voice-receipt" and "ls-probe" are diagnostics, not design.

import { mockState } from "@shared/fixtures";
import { MicStates, SummonTyping } from "../summon/probes";
import { SummonPanel, type SummonPanelProps } from "../summon/SummonApp";
import TrayFlyout from "../tray-flyout/TrayFlyout";
import LsProbe from "../voice/LsProbe";
import VoiceFailureModes from "../voice/VoiceFailureModes";
import VoiceReceipt from "../voice/VoiceReceipt";
import SpeakerTestShot from "../voice/SpeakerTestShot";

const SPOKEN = "eve, log a call with the rustic lumber guys";
const REPLY = "Logged. That's 3 of 3 — floor's closed for the week.";

const base: SummonPanelProps = {
  phase: "idle",
  transcript: "",
  reply: "",
  tool: null,
  confirm: null,
  note: null,
  error: null,
  typing: false,
  draft: "",
};

export const scenarios: Record<string, () => JSX.Element> = {
  // LISTENING. The comp shows a finished transcript here; the shipped law is
  // "never fake interim text", so a live mic shows the dim placeholder until
  // Deepgram answers. This is that honest state.
  "summon-listening": () => <SummonPanel {...base} phase="listening" />,

  "summon-thinking": () => (
    <SummonPanel {...base} phase="thinking" transcript={SPOKEN} tool="pulse_sweep" />
  ),

  "summon-streaming": () => (
    <SummonPanel {...base} phase="streaming" transcript={SPOKEN} reply={REPLY} />
  ),

  // The card itself is S3's (ConfirmCard). Until S3 lands, its placeholder
  // renders null and this slot is EMPTY — the orb and the red ALERT line are
  // what this scenario proves.
  "summon-confirm": () => (
    <SummonPanel
      {...base}
      phase="streaming"
      transcript={SPOKEN}
      confirm={mockState().pendingConfirms?.[0] ?? null}
    />
  ),

  flyout: () => <TrayFlyout />,
  "flyout-quiet": () => <TrayFlyout demoQuietHours />,

  "mic-states": () => <MicStates />,
  "summon-typing": () => <SummonTyping />,

  "voice-receipt": () => <VoiceReceipt />,
  // Every way her voice can fail, each saying something different. Driven by
  // verify/voice-failure-modes.mjs, which points EVE_BRAIN_URL at a server
  // that produces one failure per request. See VoiceFailureModes.tsx.
  "voice-failure-modes": () => <VoiceFailureModes />,
  // runSpeakerTest() itself, as the [ SPEAKER TEST ] button runs it, with its
  // receipt lines logged as SPEAKERTEST| for a --enable-logging launcher.
  "speaker-test": () => <SpeakerTestShot />,
  "ls-probe": () => <LsProbe />,
};
