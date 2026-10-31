import "server-only";
import type { z } from "zod";
import type { ModelOutput } from "../../contracts";
import { ModelError, type ModelResult } from "./errors";
import { strictRoot, toIssues } from "./parse";
import type { CallOptions } from "./sarvam";
import type { ResponseMetadata, StructuredOutput, StructuredRequest } from "./types";

// A stand-in for callSarvam in structured mode, for the app and tests. It
// never reaches the network and needs no API key. Tool mode is not mocked.

/**
 * The structured-mode overload of callSarvam as an injectable dependency.
 * callSarvam itself is assignable to it.
 */
export type StructuredCallSarvam = <Schema extends z.ZodType>(
  request: StructuredRequest<Schema>,
  options?: CallOptions,
) => Promise<ModelResult<StructuredOutput<z.output<Schema>>>>;

/** What the mock answers: a model output, or the exact error to fail with. */
export type MockReply = ModelOutput | ModelError;

export const MOCK_METADATA: ResponseMetadata = {
  providerRequestId: "mock-chatcmpl-1",
  model: "sarvam-105b",
  finishReason: "stop",
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  latencyMs: 0,
  attemptCount: 1,
};

export function createMockCallSarvam(reply: MockReply): StructuredCallSarvam {
  return async function mockCallSarvam<Schema extends z.ZodType>(
    request: StructuredRequest<Schema>,
  ): Promise<ModelResult<StructuredOutput<z.output<Schema>>>> {
    if (reply instanceof ModelError) return { ok: false, error: reply };
    // Same check as the real call: strict at the root, then the caller's schema.
    // strictRoot only adds .strict(), so the output type is still Schema's.
    const schema = request.schema as unknown as z.ZodType<z.output<Schema>>;
    const parsed = strictRoot(schema).safeParse(reply);
    if (!parsed.success) {
      return {
        ok: false,
        error: new ModelError("schema_validation_failed", "Model output failed schema validation", {
          attemptCount: MOCK_METADATA.attemptCount,
          latencyMs: MOCK_METADATA.latencyMs,
          metadata: MOCK_METADATA,
          issues: toIssues(parsed.error),
        }),
      };
    }
    return { ok: true, value: { mode: "structured", output: parsed.data, metadata: MOCK_METADATA } };
  };
}
