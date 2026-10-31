"use client";

import { useActionState, useId, useState } from "react";
import { BLOCKING_FLAGS, type Action, type Flag } from "@/contracts";
import { humanizeEnum } from "@/lib/format";
import type { ActionState } from "@/app/disputes/[id]/schemas";

export type ResolveApprovalAction = (prev: ActionState | null, formData: FormData) => Promise<ActionState>;

const NOTE_MAX = 500;

const button =
  "rounded-md border px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} border-indigo-700 bg-indigo-700 text-white`;
const secondary = `${button} border-zinc-500 bg-transparent`;

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
  const warningId = useId();
  const noteId = useId();

  const blocking = flags.filter((f) => BLOCKING_FLAGS.includes(f));
  const canDefend = proposedAction === "defend" || proposedAction === "escalate";
  const showWarning = canDefend && blocking.length > 0;
  const describedBy = showWarning ? warningId : undefined;

  return (
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
        className="mt-1 w-full rounded-md border border-zinc-400 bg-transparent p-2 text-sm"
      />
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        {note.length}/{NOTE_MAX} characters
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        {proposedAction === "escalate" ? (
          <>
            <button type="submit" name="choice" value="approve:defend" disabled={pending} aria-describedby={describedBy} className={primary}>
              Defend
            </button>
            <button type="submit" name="choice" value="approve:accept" disabled={pending} className={primary}>
              Accept
            </button>
            <button type="submit" name="choice" value="reject" disabled={pending} className={secondary}>
              Reject (handle manually)
            </button>
          </>
        ) : (
          <>
            <button type="submit" name="choice" value="approve" disabled={pending} aria-describedby={describedBy} className={primary}>
              Approve {proposedAction}
            </button>
            <button type="submit" name="choice" value="reject" disabled={pending} className={secondary}>
              Reject
            </button>
          </>
        )}
      </div>

      {showWarning && (
        <p id={warningId} className="mt-3 rounded-md border-2 border-red-600 p-2 text-sm dark:border-red-400">
          <strong>Warning:</strong> defending overrides {blocking.length === 1 ? "a blocking flag" : "blocking flags"} (
          {blocking.map(humanizeEnum).join(", ")}). The rules advise against defending this dispute.
        </p>
      )}

      {pending && <p className="mt-3 text-sm font-medium">Saving your decision…</p>}
      <p aria-live="polite" className="mt-3 text-sm font-medium text-red-800 dark:text-red-300">
        {state && !state.ok ? state.message : ""}
      </p>
    </form>
  );
}
