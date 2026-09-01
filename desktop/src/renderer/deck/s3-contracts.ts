// The S3 integration contracts — owning stream: S2 (this file only).
//
// S3 owns confirm/**, settings/**, body/** and wardrobe/**, and their current
// bodies are S1 placeholders that take no props. The prop shapes below are the
// FROZEN contracts S2 was handed; they are declared here (in S2's own file, per
// OWNERSHIP.md: "If a type is missing, define it in your own files") and the
// placeholder default exports are adapted to them.
//
// The casts are the seam. When S3 lands the real components with these exact
// prop types, nothing here changes and nothing here breaks — a cast to a
// signature the component already satisfies is a no-op. If S3 ships a DIFFERENT
// shape, this file is the one place that has to be reconciled.

import type { PendingConfirm } from "@shared/contract";
import ConfirmLayerImpl from "../confirm/ConfirmLayer";
import SettingsPaneImpl from "../settings/SettingsPane";
import BodyPaneImpl from "../body/BodyPane";
import WardrobePanelImpl from "../wardrobe/WardrobePanel";
import type { EveMode } from "./types";

export interface ConfirmLayerProps {
  confirms: PendingConfirm[];
  onResolved: (id: string) => void;
}

export interface PaneProps {
  onBack: () => void;
}

export interface WardrobePanelProps {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  /** null reverts the preview and hands the rail back to the real mode. */
  onPreviewState: (mode: EveMode | null) => void;
}

type FC<P> = (props: P) => JSX.Element | null;

export const ConfirmLayer = ConfirmLayerImpl as unknown as FC<ConfirmLayerProps>;
export const SettingsPane = SettingsPaneImpl as unknown as FC<PaneProps>;
export const BodyPane = BodyPaneImpl as unknown as FC<PaneProps>;
export const WardrobePanel = WardrobePanelImpl as unknown as FC<WardrobePanelProps>;
