// owner: stream S3 — Artboard C, the RED confirm modal.
//
// Mounted by deck/App.tsx as a sibling of <Deck/> (see s3-contracts.ts +
// App.tsx): `<ConfirmLayer confirms={confirms} onResolved={onConfirmResolved} />`
// sits outside .frame entirely, which is why the scrim/wrap below are
// position:fixed (viewport-relative) rather than absolute against some
// assumed ancestor — see the note in confirm.css.
//
// The artboard's modal anatomy is ONE centered 480w card; the phone shows
// every pending confirm at once inline in the thread, but a modal can only
// front one at a time, so the rest queue behind it as "+N MORE WAITING"
// rather than being silently dropped.
import ConfirmCard from "./ConfirmCard";
import type { PendingConfirm } from "@shared/contract";
import "./confirm.css";

export interface ConfirmLayerProps {
  confirms: PendingConfirm[];
  onResolved: (id: string) => void;
}

export default function ConfirmLayer({ confirms, onResolved }: ConfirmLayerProps) {
  if (confirms.length === 0) return null;
  const [head, ...rest] = confirms;

  return (
    <>
      <div className="confirm-scrim" />
      {/* DESK/S3: a file batch is wider and taller than 480px by necessity — it
          renders every from → to pair with no grouping and no "+N more", and a
          path pair that wraps four times is a path pair he skims. The wrap gets
          its own scroll ceiling too, so a 50-row card can never run off the
          bottom of the screen with the buttons on it. */}
      <div className={`confirm-modal-wrap${head.kind === "file_batch" ? " wide" : ""}`}>
        <ConfirmCard confirm={head} variant="modal" onResolved={onResolved} />
        {rest.length > 0 && <div className="confirm-more">+{rest.length} MORE WAITING</div>}
      </div>
    </>
  );
}
