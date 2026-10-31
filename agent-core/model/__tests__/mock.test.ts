import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { ModelOutputSchema, type ModelOutput } from "../../../contracts";
import {
  callSarvam,
  ModelError,
  type CallOptions,
  type ModelResult,
  type StructuredOutput,
  type StructuredRequest,
  type ToolRequest,
} from "../index";
import { createMockCallSarvam, MOCK_METADATA, type StructuredCallSarvam } from "../mock";

// ---------------------------------------------------------------------------
// Compile-time checks. tsc --noEmit covers test files, so a mismatch fails
// the build even though these lines do nothing at runtime.
// ---------------------------------------------------------------------------

// The real structured overload and the mock both satisfy the dependency type.
const realDependency: StructuredCallSarvam = callSarvam;
const mockDependency: StructuredCallSarvam = createMockCallSarvam(new ModelError("timeout", "test"));

// An app-side consumer written against the dependency accepts either.
async function analyse(deps: { callSarvam: StructuredCallSarvam }, request: StructuredRequest<typeof ModelOutputSchema>) {
  return deps.callSarvam(request, { timeoutMs: 5_000, maxRetries: 0 });
}

const output: ModelOutput = {
  action: "defend",
  confidence: 0.82,
  reasoning: "Signed receipt shows delivery before the complaint.",
  evidenceRefs: ["ev_gm_001_pod"],
};

const request: StructuredRequest<typeof ModelOutputSchema> = {
  mode: "structured",
  systemPrompt: "Recommend only; rules decide.",
  messages: [{ role: "user", content: "{}" }],
  schema: ModelOutputSchema,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StructuredCallSarvam", () => {
  it("types match the real callSarvam structured overload", () => {
    expectTypeOf(createMockCallSarvam).returns.toEqualTypeOf<StructuredCallSarvam>();
    expectTypeOf(mockDependency).parameter(1).toEqualTypeOf<CallOptions | undefined>();
    expectTypeOf(mockDependency<typeof ModelOutputSchema>).returns.toEqualTypeOf<
      Promise<ModelResult<StructuredOutput<ModelOutput>>>
    >();
    expectTypeOf(realDependency<typeof ModelOutputSchema>).returns.toEqualTypeOf<
      ReturnType<typeof mockDependency<typeof ModelOutputSchema>>
    >();
  });

  it("does not offer the tool-mode overload", () => {
    const toolRequest = {} as ToolRequest<readonly []>;
    // Never invoked; exists so tsc proves tool requests are rejected.
    const callWithTools = () =>
      // @ts-expect-error the mock implements structured mode only
      mockDependency(toolRequest);
    expect(typeof callWithTools).toBe("function");
  });
});

describe("createMockCallSarvam", () => {
  it("returns the reply as structured output, with options accepted, without fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const result = await analyse({ callSarvam: createMockCallSarvam(output) }, request);
    expect(result).toEqual({ ok: true, value: { mode: "structured", output, metadata: MOCK_METADATA } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails with the exact ModelError it was given", async () => {
    const error = new ModelError("timeout", "No response from Sarvam within 5000ms", { retryable: true, attemptCount: 3 });
    const result = await createMockCallSarvam(error)(request);
    expect(result).toEqual({ ok: false, error });
    if (!result.ok) expect(result.error).toBe(error);
  });

  it("rejects output that fails the schema, like the real call", async () => {
    const bad = { ...output, confidence: 2 };
    const result = await createMockCallSarvam(bad)(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("schema_validation_failed");
      expect(result.error.issues).toEqual([{ path: "confidence", message: expect.any(String) }]);
    }
  });

  it("rejects invented root fields such as finalAction", async () => {
    const extra = { ...output, finalAction: "defend" } as ModelOutput;
    const result = await createMockCallSarvam(extra)(request);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("schema_validation_failed");
  });
});
