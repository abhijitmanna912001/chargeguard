import { z } from "zod";
import { MODEL_ERROR_KINDS, type ModelError, type ModelErrorKind, type ModelResult } from "./errors";
import { SAFE_PROVIDER_TOKEN } from "./parse";
import type { ResponseMetadata } from "./types";

/**
 * Telemetry for one model call, for the caller to log or measure. Transient:
 * it is not part of the Recommendation or the action log and is never stored.
 * Holds no prompt, output, evidence or credential.
 */
export type ModelCallMetadata = {
  status: "succeeded" | "failed";
  /** Set only when status is "failed". */
  failureKind?: ModelErrorKind;
  /** Provider attempts actually made; 0 when the call failed before the network. */
  attemptCount: number;
  /** Elapsed time of the whole call: every attempt, body reads and backoff. */
  latencyMs: number;
  /** From provider usage when a response carried it; null otherwise, never estimated. */
  totalTokens: number | null;
  /** Only when a provider response (an HTTP error body included) named one. */
  providerRequestId?: string;
  model?: string;
  finishReason?: string | null;
};

/** Builds the telemetry from a callSarvam result (success or ModelError). */
export function toModelCallMetadata(result: ModelResult<{ metadata: ResponseMetadata }>): ModelCallMetadata {
  if (result.ok) {
    const m = result.value.metadata;
    return {
      status: "succeeded",
      attemptCount: m.attemptCount,
      latencyMs: m.latencyMs,
      totalTokens: m.usage?.totalTokens ?? null,
      ...responseFields(m),
    };
  }
  const error: ModelError = result.error;
  // error.metadata exists when a response arrived but failed validation:
  // complete for a valid envelope (truncated, bad JSON, schema failure, ...),
  // salvaged field by field for an invalid one (see parseEnvelope), absent
  // for a non-JSON body. An HTTP error body may still name Sarvam's request id.
  return {
    status: "failed",
    failureKind: error.kind,
    attemptCount: error.attemptCount,
    latencyMs: error.latencyMs,
    totalTokens: error.metadata?.usage?.totalTokens ?? null,
    ...(error.metadata
      ? responseFields(error.metadata)
      : error.providerRequestId !== undefined
        ? { providerRequestId: error.providerRequestId }
        : {}),
  };
}

const safeToken = z.string().regex(SAFE_PROVIDER_TOKEN);

// The numbers must be right or there is no telemetry. The descriptive strings
// are dropped one by one when they are not plain tokens, so free text (an
// echoed body, a prompt) can never ride along into logs.
const ModelCallMetadataSchema = z
  .object({
    status: z.enum(["succeeded", "failed"]),
    failureKind: z.enum(MODEL_ERROR_KINDS).optional(),
    attemptCount: z.number().int().nonnegative(),
    latencyMs: z.number().nonnegative(),
    totalTokens: z.number().int().nonnegative().nullable(),
    providerRequestId: safeToken.optional().catch(undefined),
    model: safeToken.optional().catch(undefined),
    finishReason: z.string().regex(/^[a-z_]{1,40}$/).nullable().optional().catch(undefined),
  })
  .strict();

/**
 * toModelCallMetadata for a result from an injectable dependency, which may
 * not honour the types. null when the counts are malformed; unsafe optional
 * strings are omitted.
 */
export function readModelCallMetadata(result: unknown): ModelCallMetadata | null {
  try {
    const parsed = ModelCallMetadataSchema.safeParse(
      toModelCallMetadata(result as ModelResult<{ metadata: ResponseMetadata }>),
    );
    if (!parsed.success) return null;
    return Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    ) as ModelCallMetadata;
  } catch {
    return null;
  }
}

function responseFields(m: ResponseMetadata): Pick<ModelCallMetadata, "providerRequestId" | "model" | "finishReason"> {
  return {
    ...(m.providerRequestId !== undefined ? { providerRequestId: m.providerRequestId } : {}),
    ...(m.model !== undefined ? { model: m.model } : {}),
    ...(m.finishReason !== undefined ? { finishReason: m.finishReason } : {}),
  };
}
