"use client";

import { useActionState, useId, useState } from "react";
import { BLOCKING_FLAGS, type Action, type Flag } from "@/contracts";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { humanizeEnum } from "@/lib/format";
import type { ActionState } from "@/app/disputes/[id]/schemas";

export type ResolveApprovalAction = (prev: ActionState | null, formData: FormData) => Promise<ActionState>;

const NOTE_MAX = 500;

export function ApprovalForm({
  disputeId,
  approvalId,
  proposedAction,
  flags,
  action,
}: {
  disputeId: string;
  approvalId: string;
  proposedAction: Action;
  flags: readonly Flag[];
  /** The Server Action, passed in so tests can supply a fake. */
  action: ResolveApprovalAction;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  // Controlled: React resets uncontrolled fields after every action, which would
  // wipe the note when the server returns an error.
  const [note, setNote] = useState("");
  // UX only. The server still validates every decision exactly as before.
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const noteId = useId();
  const confirmId = useId();
  const checkId = useId();

  const blocking = flags.filter((f) => BLOCKING_FLAGS.includes(f));
  const canDefend = proposedAction === "defend" || proposedAction === "escalate";
  // Defending over a blocking flag takes an extra, explicit step.
  const defendNeedsConfirm = canDefend && blocking.length > 0;
  const defendChoice = proposedAction === "escalate" ? "approve:defend" : "approve";
  const defendLabel = proposedAction === "escalate" ? "Defend" : `Approve ${proposedAction}`;

  function cancelConfirm() {
    setConfirming(false);
    setUnderstood(false);
  }

  const defendButton = defendNeedsConfirm ? (
    <Button
      type="button"
      disabled={pending}
      aria-expanded={confirming}
      aria-controls={confirmId}
      onClick={() => setConfirming(true)}
    >
      {defendLabel}
    </Button>
  ) : (
    <Button type="submit" name="choice" value={defendChoice} disabled={pending}>
      {defendLabel}
    </Button>
  );

  return (
    <Card className="p-5">
      <h3 className="text-lg font-semibold">Your decision</h3>
      <p className="mt-1 text-sm text-ink-muted">The agent only recommends. You decide what happens to this dispute.</p>

      <form action={formAction} className="mt-5">
        <input type="hidden" name="disputeId" value={disputeId} />
        <input type="hidden" name="approvalId" value={approvalId} />

        <label htmlFor={noteId} className="block text-sm font-medium">
          Note (optional)
        </label>
        <textarea
          id={noteId}
          name="note"
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-lg border border-field-line bg-surface p-2 text-sm"
        />
        <p className="mt-1 text-xs text-ink-muted">
          {note.length}/{NOTE_MAX} characters
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {proposedAction === "escalate" ? (
            <>
              {defendButton}
              <Button type="submit" name="choice" value="approve:accept" variant="secondary" disabled={pending}>
                Accept
              </Button>
              <span aria-hidden="true" className="hidden h-6 w-px bg-line sm:block" />
              <Button type="submit" name="choice" value="reject" variant="danger-ghost" disabled={pending}>
                Reject (handle manually)
              </Button>
            </>
          ) : (
            <>
              {proposedAction === "defend" ? (
                defendButton
              ) : (
                <Button type="submit" name="choice" value="approve" variant="secondary" disabled={pending}>
                  Approve {proposedAction}
                </Button>
              )}
              <span aria-hidden="true" className="hidden h-6 w-px bg-line sm:block" />
              <Button type="submit" name="choice" value="reject" variant="danger-ghost" disabled={pending}>
                Reject
              </Button>
            </>
          )}
        </div>

        {defendNeedsConfirm && confirming && (
          <div id={confirmId} role="group" aria-labelledby={`${confirmId}-title`} className="mt-4 rounded-lg border-2 border-danger-solid bg-danger-bg p-4 text-danger-fg">
            <p id={`${confirmId}-title`} className="text-sm">
              <strong>Warning:</strong> defending overrides {blocking.length === 1 ? "a blocking flag" : "blocking flags"} (
              {blocking.map(humanizeEnum).join(", ")}). The rules advise against defending this dispute.
            </p>
            <label htmlFor={checkId} className="mt-3 flex items-start gap-2 text-sm font-medium">
              <input
                id={checkId}
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-danger-solid"
              />
              I understand the rules advise against defending this dispute
            </label>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button type="submit" name="choice" value={defendChoice} variant="danger" disabled={pending || !understood}>
                Confirm and defend
              </Button>
              <Button type="button" variant="secondary" disabled={pending} onClick={cancelConfirm}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {pending && <p className="mt-3 text-sm font-medium">Saving your decision…</p>}
        <p aria-live="polite" className="mt-3 text-sm font-medium text-danger-fg">
          {state && !state.ok ? state.message : ""}
        </p>
      </form>
    </Card>
  );
}
