"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { PROVIDER_REJECTED_MESSAGE, type ActionState } from "@/app/disputes/[id]/schemas";

export type SubmitDefenseAction = () => Promise<ActionState>;

type Props = {
  action: SubmitDefenseAction;
  isRetry?: boolean;
  /** The recorded reason the last submission failed, if it did. Shown next to Retry. */
  lastFailure?: string | null;
};

export function SubmitDefenseButton({ action, isRetry = false, lastFailure = null }: Props) {
  // useActionState passes (prevState, payload); the bound action needs neither.
  const [state, formAction, pending] = useActionState<ActionState | null>(() => action(), null);

  // ONE message. The action's generic "provider did not accept" text would only
  // repeat the specific recorded reason, so it is dropped when a reason exists.
  // Any other action error (not ready, invalid, ...) is still shown.
  const actionMessage = state && !state.ok ? state.message : null;
  const showActionMessage = actionMessage !== null && !(lastFailure && actionMessage === PROVIDER_REJECTED_MESSAGE);
  const message = showActionMessage ? actionMessage : lastFailure ? `The last simulated submission failed: ${lastFailure}` : "";

  return (
    <form action={formAction} className="mt-4">
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting (simulated)…" : isRetry ? "Retry submission" : "Submit defense (simulated)"}
      </Button>
      <p aria-live="polite" className="mt-3 text-sm font-medium text-danger-fg">
        {message}
      </p>
    </form>
  );
}
