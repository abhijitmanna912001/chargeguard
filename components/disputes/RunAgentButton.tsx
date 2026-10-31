"use client";

import { useActionState } from "react";
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
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-indigo-700 bg-indigo-700 px-3 py-1.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Running agent…" : "Run agent"}
      </button>
      <p aria-live="polite" className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
        {pending && !isMockAgent ? "Analysing the evidence. This can take up to 30 seconds." : ""}
      </p>
      <p aria-live="polite" className="mt-3 text-sm font-medium text-red-800 dark:text-red-300">
        {state && !state.ok ? state.message : ""}
      </p>
    </form>
  );
}
