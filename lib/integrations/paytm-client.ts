// The single interface to the payment provider. Nothing else may call it.
// Never throws for expected failures: callers get a result value.
import "server-only";
import { z } from "zod";
import type { DefensePackage } from "../../contracts";

export type ProviderResult =
  | { ok: true; providerRef: string }
  | { ok: false; retryable: boolean; message: string };

export type SubmitDefenseInput = { idempotencyKey: string; package: DefensePackage };

const ProviderResponseSchema = z.object({ providerRef: z.string().min(1) });

const TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const BACKOFF_MS = 200;
const RESPOND_PATH = "/api/paytm-sim/disputes/respond";

/** The one place PAYTM_API_BASE_URL is read. */
function baseUrl(): string {
  return (process.env.PAYTM_API_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export type PaytmClientDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function submitDefenseResponse(
  input: SubmitDefenseInput,
  deps: PaytmClientDeps = {},
): Promise<ProviderResult> {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const url = `${baseUrl()}${RESPOND_PATH}`;
  const body = JSON.stringify(input.package);

  let last: ProviderResult = { ok: false, retryable: true, message: "The provider could not be reached." };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS * attempt);

    let res: Response;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // Network error or timeout: worth another try.
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      last = {
        ok: false,
        retryable: true,
        message: timedOut ? "The provider timed out." : "The provider could not be reached.",
      };
      continue;
    }

    if (res.status >= 500) {
      last = { ok: false, retryable: true, message: `The provider is unavailable (HTTP ${res.status}).` };
      continue;
    }
    if (!res.ok) {
      // 4xx (and anything else non-2xx): the request itself is the problem. Never retried.
      return { ok: false, retryable: false, message: `The provider rejected the response (HTTP ${res.status}).` };
    }

    try {
      const parsed = ProviderResponseSchema.safeParse(await res.json());
      if (parsed.success) return { ok: true, providerRef: parsed.data.providerRef };
    } catch {
      // Unreadable body: falls through to the same result as an invalid one.
    }
    return { ok: false, retryable: false, message: "The provider returned an unexpected response." };
  }

  return last;
}
