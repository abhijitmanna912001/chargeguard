"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { ActionState } from "@/app/disputes/[id]/schemas";

export type SubmitDefenseAction = () => Promise<ActionState>;

export function SubmitDefenseButton({ action, isRetry = false }: { action: SubmitDefenseAction; isRetry?: boolean }) {
  // useActionState passes (prevState, payload); the bound action needs neither.
  const [state, formAction, pending] = useActionState<ActionState | null>(() => action(), null);
  return (
    <form action={formAction} className="mt-4">
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting (simulated)…" : isRetry ? "Retry submission" : "Submit defense (simulated)"}
      </Button>
      <p aria-live="polite" className="mt-3 text-sm font-medium text-danger-fg">
        {state && !state.ok ? state.message : ""}
      </p>
    </form>
  );
}
