"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { ActionState } from "@/app/disputes/[id]/schemas";

export type RunAgentAction = () => Promise<ActionState>;

type Props = {
  action: RunAgentAction;
  /** Same flag the pages pass elsewhere. The live model can take a while, so only live mode shows the wait note. */
  isMockAgent?: boolean;
};

export function RunAgentButton({ action, isMockAgent = true }: Props) {
  // useActionState passes (prevState, payload); the bound action needs neither.
  const [state, formAction, pending] = useActionState<ActionState | null>(() => action(), null);
  return (
    <form action={formAction} className="mt-4">
      <Button type="submit" loading={pending}>
        {pending ? "Running agent…" : "Run agent"}
      </Button>
      <p aria-live="polite" className="mt-3 text-sm text-ink-muted">
        {pending && !isMockAgent ? "Analysing the evidence. This can take up to 30 seconds." : ""}
      </p>
      <p aria-live="polite" className="mt-3 text-sm font-medium text-danger-fg">
        {state && !state.ok ? state.message : ""}
      </p>
    </form>
  );
}
