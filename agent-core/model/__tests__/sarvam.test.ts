import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { z } from "zod";
import { ModelOutputSchema } from "../../../contracts";
import {
  callSarvam,
  defineTool,
  DEFAULT_SCHEMA_NAME,
  MAX_TOKENS_CAP,
  ModelError,
  SARVAM_MODEL,
  type CallOptions,
  type StructuredRequest,
  type ToolRequest,
} from "../index";

// All tests use a mocked fetch. Nothing here reaches api.sarvam.ai.

const API_KEY = "sk_test_SECRET_key_never_leak_42";
const SARVAM_URL = "https://api.sarvam.ai/v1/chat/completions";

let fetchMock: Mock<typeof fetch>;
let sleeps: number[];
let opts: CallOptions;

beforeEach(() => {
  vi.stubEnv("SARVAM_API_KEY", API_KEY);
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  sleeps = [];
  opts = { sleep: async (ms) => void sleeps.push(ms) };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

type WireMessage = { content?: string | null; tool_calls?: unknown[] };

function completion(message: WireMessage, finishReason: string | null = "stop") {
  return {
    id: "chatcmpl-test-1",
    object: "chat.completion",
    created: 0,
    model: SARVAM_MODEL,
    choices: [{ index: 0, finish_reason: finishReason, message: { role: "assistant", ...message } }],
    usage: {
      prompt_tokens: 120,
      completion_tokens: 45,
      total_tokens: 165,
      completion_tokens_details: { reasoning_tokens: null },
    },
  };
}

const VALID_OUTPUT = {
  action: "defend",
  confidence: 0.82,
  reasoning: "Delivery proof and a settled transaction support the merchant.",
  evidenceRefs: ["ev_txn_1", "ev_delivery_1"],
};

function okContent(content: string | null, finishReason: string | null = "stop") {
  return reply(200, completion({ content }, finishReason));
}

const structured: StructuredRequest<typeof ModelOutputSchema> = {
  mode: "structured",
  systemPrompt: "You analyse synthetic payment disputes. Reply only with JSON.",
  messages: [{ role: "user", content: "Dispute D-1 (synthetic). Evidence: ev_txn_1, ev_delivery_1." }],
  schema: ModelOutputSchema,
};

const lookupTransaction = defineTool({
  name: "lookup_transaction",
  description: "Fetch a synthetic transaction record.",
  parameters: z.object({ transactionId: z.string().min(1) }),
});
const getSettlement = defineTool({
  name: "get_settlement",
  description: "Fetch a synthetic settlement record.",
  parameters: z.object({ settlementId: z.string().min(1), includeFees: z.boolean().optional() }),
});
const tools = [lookupTransaction, getSettlement] as const;
const toolRequest: ToolRequest<typeof tools> = {
  mode: "tools",
  systemPrompt: "Gather evidence for synthetic dispute D-1.",
  messages: [{ role: "user", content: "Collect the transaction and settlement." }],
  tools,
};

function toolCall(id: string, name: string, args: unknown) {
  return {
    id,
    type: "function",
    function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
  };
}

function sentBody(call = 0): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[call][1]?.body));
}

async function expectError(promise: Promise<{ ok: boolean }>, kind: string): Promise<ModelError> {
  const result = await promise;
  expect(result.ok).toBe(false);
  const error = (result as { ok: false; error: ModelError }).error;
  expect(error).toBeInstanceOf(ModelError);
  expect(error.kind).toBe(kind);
  return error;
}

// ---------------------------------------------------------------------------
// Structured output
// ---------------------------------------------------------------------------

describe("structured output", () => {
  it("returns validated ModelOutput", async () => {
    fetchMock.mockResolvedValueOnce(okContent(JSON.stringify(VALID_OUTPUT)));
    const result = await callSarvam(structured, opts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ModelOutputSchema.parse(result.value.output)).toEqual(VALID_OUTPUT);
    // Typed as ModelOutput: action is the contract enum.
    const action: "defend" | "accept" | "escalate" = result.value.output.action;
    expect(action).toBe("defend");
  });

  it("extracts usage metadata", async () => {
    fetchMock.mockResolvedValueOnce(okContent(JSON.stringify(VALID_OUTPUT)));
    const result = await callSarvam(structured, opts);
    if (!result.ok) throw result.error;
    expect(result.value.metadata).toMatchObject({
      providerRequestId: "chatcmpl-test-1",
      model: SARVAM_MODEL,
      finishReason: "stop",
      usage: { promptTokens: 120, completionTokens: 45, totalTokens: 165 },
      attempts: 1,
    });
    expect(result.value.metadata.usage?.reasoningTokens).toBeUndefined();
    expect(result.value.metadata.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("sends the agreed Sarvam configuration", async () => {
    fetchMock.mockResolvedValueOnce(okContent(JSON.stringify(VALID_OUTPUT)));
    await callSarvam({ ...structured, maxTokens: 99_999 }, opts);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(SARVAM_URL);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["api-subscription-key"]).toBe(API_KEY);

    const body = sentBody();
    expect(body).toMatchObject({
      model: "sarvam-105b",
      max_tokens: MAX_TOKENS_CAP,
      temperature: 0.2,
      reasoning_effort: null,
    });
    expect(body).toHaveProperty("reasoning_effort", null);
    expect(body.messages).toEqual([
      { role: "system", content: structured.systemPrompt },
      { role: "user", content: structured.messages[0].content },
    ]);
    expect(body.tools).toBeUndefined();
  });

  it("sends a strict json_schema without the root $schema keyword", async () => {
    fetchMock.mockResolvedValueOnce(okContent(JSON.stringify(VALID_OUTPUT)));
    await callSarvam(structured, opts);
    const format = sentBody().response_format as {
      type: string;
      json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
    };
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.name).toBe(DEFAULT_SCHEMA_NAME);
    expect(format.json_schema.strict).toBe(true);
    expect(format.json_schema.schema).not.toHaveProperty("$schema");
    expect(format.json_schema.schema).toMatchObject({
      type: "object",
      required: ["action", "confidence", "reasoning", "evidenceRefs"],
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["defend", "accept", "escalate"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    });
    // The model is never asked for rule-owned fields.
    const properties = Object.keys(format.json_schema.schema.properties as object);
    expect(properties).not.toContain("finalAction");
    expect(properties).not.toContain("overrideReason");
    expect(properties).not.toContain("flags");
  });

  it("does not leave the API key in the request body", async () => {
    fetchMock.mockResolvedValueOnce(okContent(JSON.stringify(VALID_OUTPUT)));
    await callSarvam(structured, opts);
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain(API_KEY);
  });

  it("accepts JSON wrapped in a single markdown fence", async () => {
    fetchMock.mockResolvedValueOnce(okContent("```json\n" + JSON.stringify(VALID_OUTPUT) + "\n```"));
    const result = await callSarvam(structured, opts);
    expect(result.ok).toBe(true);
  });

  it.each([
    ["null content", null],
    ["empty string", ""],
    ["whitespace only", "  \n\t"],
  ])("rejects %s as empty_response", async (_label, content) => {
    fetchMock.mockResolvedValueOnce(okContent(content));
    await expectError(callSarvam(structured, opts), "empty_response");
  });

  it.each([
    ["prose", "Sure! Here is the JSON you asked for."],
    ["truncated object", '{"action":"defe'],
    ["fence with prose around it", "Here:\n```json\n{}\n```"],
  ])("rejects %s as invalid_json", async (_label, content) => {
    fetchMock.mockResolvedValueOnce(okContent(content));
    const error = await expectError(callSarvam(structured, opts), "invalid_json");
    expect(error.message).not.toContain(content);
  });

  it.each([
    ["extra property", { ...VALID_OUTPUT, finalAction: "defend" }, "(root)"],
    ["invalid enum value", { ...VALID_OUTPUT, action: "refund" }, "action"],
    ["confidence above 1", { ...VALID_OUTPUT, confidence: 1.4 }, "confidence"],
    ["confidence below 0", { ...VALID_OUTPUT, confidence: -0.1 }, "confidence"],
    ["missing field", { action: "accept", confidence: 0.5, reasoning: "x" }, "evidenceRefs"],
    ["empty reasoning", { ...VALID_OUTPUT, reasoning: "" }, "reasoning"],
    ["array instead of object", [1, 2, 3], "(root)"],
  ])("rejects %s as schema_validation_failed", async (_label, output, path) => {
    fetchMock.mockResolvedValueOnce(okContent(JSON.stringify(output)));
    const error = await expectError(callSarvam(structured, opts), "schema_validation_failed");
    expect(error.issues?.map((i) => i.path)).toContain(path);
    expect(error.metadata?.providerRequestId).toBe("chatcmpl-test-1");
    expect(error.retryable).toBe(false);
  });

  it("treats finish_reason=length as truncated even when the JSON is complete", async () => {
    fetchMock.mockResolvedValueOnce(okContent(JSON.stringify(VALID_OUTPUT), "length"));
    const error = await expectError(callSarvam(structured, opts), "truncated");
    expect(error.metadata?.usage?.completionTokens).toBe(45);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["content_filter", "tool_calls", null])("rejects finish_reason=%s", async (reason) => {
    fetchMock.mockResolvedValueOnce(okContent(JSON.stringify(VALID_OUTPUT), reason));
    await expectError(callSarvam(structured, opts), "unexpected_finish_reason");
  });
});

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

describe("response envelope", () => {
  it("rejects a body without choices", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { id: "x", model: SARVAM_MODEL }));
    const error = await expectError(callSarvam(structured, opts), "invalid_envelope");
    expect(error.status).toBeUndefined();
  });

  it("rejects an empty choices array as empty_response", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ...completion({ content: "{}" }), choices: [] }));
    await expectError(callSarvam(structured, opts), "empty_response");
  });

  it("rejects a choice without a message", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { id: "x", choices: [{ index: 0, finish_reason: "stop" }] }));
    await expectError(callSarvam(structured, opts), "invalid_envelope");
  });

  it("rejects a 200 with a non-JSON body without retrying", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, "<html>gateway</html>"));
    const error = await expectError(callSarvam(structured, opts), "invalid_envelope");
    expect(error.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a response without usage", async () => {
    const { usage: _usage, ...body } = completion({ content: JSON.stringify(VALID_OUTPUT) });
    void _usage;
    fetchMock.mockResolvedValueOnce(reply(200, body));
    const result = await callSarvam(structured, opts);
    if (!result.ok) throw result.error;
    expect(result.value.metadata.usage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Request validation and configuration
// ---------------------------------------------------------------------------

describe("request validation", () => {
  it("fails with missing_api_key and makes no request", async () => {
    vi.stubEnv("SARVAM_API_KEY", "");
    const error = await expectError(callSarvam(structured, opts), "missing_api_key");
    expect(error.retryable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores NEXT_PUBLIC_SARVAM_API_KEY", async () => {
    vi.stubEnv("SARVAM_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SARVAM_API_KEY", API_KEY);
    await expectError(callSarvam(structured, opts), "missing_api_key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no messages", { ...structured, messages: [] }],
    ["empty system prompt", { ...structured, systemPrompt: "" }],
    ["zero maxTokens", { ...structured, maxTokens: 0 }],
    ["fractional maxTokens", { ...structured, maxTokens: 10.5 }],
    ["temperature above 2", { ...structured, temperature: 3 }],
    ["bad schema name", { ...structured, schemaName: "has spaces" }],
    ["unrepresentable schema", { ...structured, schema: z.object({ at: z.date() }) }],
  ])("rejects %s as invalid_request before calling Sarvam", async (_label, request) => {
    await expectError(callSarvam(request as typeof structured, opts), "invalid_request");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no tools", { ...toolRequest, tools: [] }],
    ["bad tool name", { ...toolRequest, tools: [{ ...lookupTransaction, name: "look up" }] }],
    ["duplicate tool name", { ...toolRequest, tools: [lookupTransaction, lookupTransaction] }],
    ["toolChoice not offered", { ...toolRequest, toolChoice: { name: "refund_customer" } }],
  ])("rejects %s as invalid_request before calling Sarvam", async (_label, request) => {
    await expectError(callSarvam(request as unknown as typeof toolRequest, opts), "invalid_request");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// HTTP errors, retries and timeouts
// ---------------------------------------------------------------------------

const errorBody = (code: string, message = "provider says no") => ({ error: { code, message } });

describe("HTTP failures", () => {
  it.each([
    [400, "invalid_request_error", "invalid_request"],
    [401, "invalid_api_key_error", "auth_failed"],
    [403, "invalid_api_key_error", "auth_failed"],
    [402, "insufficient_quota_error", "quota_exhausted"],
    [422, "unprocessable_entity_error", "invalid_request"],
    [429, "seat_budget_exhausted_error", "quota_exhausted"],
    [504, "gateway_timeout", "provider_error"],
  ])("HTTP %i %s -> %s, no retry", async (status, code, kind) => {
    fetchMock.mockResolvedValue(reply(status, errorBody(code)));
    const error = await expectError(callSarvam(structured, opts), kind);
    expect(error).toMatchObject({ status, providerCode: code, attempts: 1, retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("captures Sarvam's error request_id", async () => {
    fetchMock.mockResolvedValue(
      reply(400, { error: { code: "invalid_request_error", message: "bad", request_id: "20261031_abc" } }),
    );
    const error = await expectError(callSarvam(structured, opts), "invalid_request");
    expect(error.providerRequestId).toBe("20261031_abc");
  });

  it.each([
    [429, "rate_limit_exceeded_error", "rate_limited"],
    [500, "internal_server_error", "provider_error"],
    [502, "model_call_failed", "provider_error"],
    [503, "model_overloaded", "provider_error"],
    [503, "rate_limit_exceeded_error", "rate_limited"],
  ])("HTTP %i %s is retried, then succeeds", async (status, code) => {
    fetchMock
      .mockResolvedValueOnce(reply(status, errorBody(code)))
      .mockResolvedValueOnce(okContent(JSON.stringify(VALID_OUTPUT)));
    const result = await callSarvam(structured, opts);
    if (!result.ok) throw result.error;
    expect(result.value.metadata.attempts).toBe(2);
    expect(sleeps).toEqual([500]);
  });

  it("stops after 3 attempts with exponential backoff", async () => {
    fetchMock.mockImplementation(async () => reply(503, errorBody("model_overloaded")));
    const error = await expectError(callSarvam(structured, opts), "provider_error");
    expect(error).toMatchObject({ attempts: 3, retryable: true, status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it("clamps maxRetries so a caller cannot loop forever", async () => {
    fetchMock.mockImplementation(async () => reply(500, errorBody("internal_server_error")));
    const error = await expectError(callSarvam(structured, { ...opts, maxRetries: 1_000 }), "provider_error");
    expect(error.attempts).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("honours maxRetries: 0", async () => {
    fetchMock.mockImplementation(async () => reply(500, errorBody("internal_server_error")));
    await expectError(callSarvam(structured, { ...opts, maxRetries: 0 }), "provider_error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits for Retry-After instead of the backoff", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(429, errorBody("model_rate_limit_exceeded_error"), { "retry-after": "2" }))
      .mockResolvedValueOnce(okContent(JSON.stringify(VALID_OUTPUT)));
    const result = await callSarvam(structured, opts);
    expect(result.ok).toBe(true);
    expect(sleeps).toEqual([2000]);
  });

  it("returns rate_limited when Retry-After exceeds the backoff cap", async () => {
    fetchMock.mockResolvedValue(reply(429, errorBody("rate_limit_exceeded_error"), { "retry-after": "30" }));
    const error = await expectError(callSarvam(structured, opts), "rate_limited");
    expect(error).toMatchObject({ retryable: true, retryAfterMs: 30_000, attempts: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("retries network errors and reports the cause code only", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }));
    const error = await expectError(callSarvam(structured, opts), "network_error");
    expect(error).toMatchObject({ attempts: 3, retryable: true });
    expect(error.message).toContain("ECONNREFUSED");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("times out each attempt and retries", async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const error = await expectError(callSarvam(structured, { ...opts, timeoutMs: 5 }), "timeout");
    expect(error).toMatchObject({ attempts: 3, retryable: true });
    expect(error.message).toContain("5ms");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it("recovers when a timed-out attempt is followed by success", async () => {
    fetchMock
      .mockImplementationOnce(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      )
      .mockResolvedValueOnce(okContent(JSON.stringify(VALID_OUTPUT)));
    const result = await callSarvam(structured, { ...opts, timeoutMs: 5 });
    if (!result.ok) throw result.error;
    expect(result.value.metadata.attempts).toBe(2);
  });

  it("does not retry invalid model output", async () => {
    fetchMock.mockResolvedValue(okContent("not json"));
    await expectError(callSarvam(structured, opts), "invalid_json");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Tool calling
// ---------------------------------------------------------------------------

describe("tool calling", () => {
  function toolReply(calls: unknown[], finishReason = "tool_calls", content: string | null = null) {
    return reply(200, completion({ content, tool_calls: calls }, finishReason));
  }

  it("sends tool definitions and no response_format", async () => {
    fetchMock.mockResolvedValueOnce(toolReply([toolCall("c1", "lookup_transaction", { transactionId: "T1" })]));
    await callSarvam(toolRequest, opts);
    const body = sentBody();
    expect(body.response_format).toBeUndefined();
    expect(body.tool_choice).toBe("auto");
    expect(body.reasoning_effort).toBeNull();
    const sentTools = body.tools as { type: string; function: { name: string; parameters: Record<string, unknown> } }[];
    expect(sentTools.map((t) => t.function.name)).toEqual(["lookup_transaction", "get_settlement"]);
    expect(sentTools[0].type).toBe("function");
    expect(sentTools[0].function.parameters).not.toHaveProperty("$schema");
    expect(sentTools[0].function.parameters).toMatchObject({
      type: "object",
      required: ["transactionId"],
      additionalProperties: false,
    });
  });

  it("sends a named tool choice in the wire format", async () => {
    fetchMock.mockResolvedValueOnce(toolReply([toolCall("c1", "get_settlement", { settlementId: "S1" })]));
    const result = await callSarvam({ ...toolRequest, toolChoice: { name: "get_settlement" } }, opts);
    expect(result.ok).toBe(true);
    expect(sentBody().tool_choice).toEqual({ type: "function", function: { name: "get_settlement" } });
  });

  it("returns a validated tool call", async () => {
    fetchMock.mockResolvedValueOnce(toolReply([toolCall("c1", "lookup_transaction", { transactionId: "T1" })]));
    const result = await callSarvam(toolRequest, opts);
    if (!result.ok) throw result.error;
    expect(result.value.type).toBe("tool_calls");
    if (result.value.type !== "tool_calls") return;
    expect(result.value.toolCalls).toEqual([{ id: "c1", name: "lookup_transaction", arguments: { transactionId: "T1" } }]);
    expect(result.value.metadata.finishReason).toBe("tool_calls");
  });

  it("returns multiple tool calls with typed arguments", async () => {
    fetchMock.mockResolvedValueOnce(
      toolReply([
        toolCall("c1", "lookup_transaction", { transactionId: "T1" }),
        toolCall("c2", "get_settlement", { settlementId: "S1", includeFees: true }),
      ]),
    );
    const result = await callSarvam(toolRequest, opts);
    if (!result.ok) throw result.error;
    if (result.value.type !== "tool_calls") throw new Error("expected tool calls");
    const summary = result.value.toolCalls.map((call) =>
      // Narrowing by name gives each tool's own argument type.
      call.name === "lookup_transaction" ? call.arguments.transactionId : call.arguments.settlementId,
    );
    expect(summary).toEqual(["T1", "S1"]);
  });

  it("returns a plain message when the model answers without tools", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, completion({ content: "All evidence collected." })));
    const result = await callSarvam(toolRequest, opts);
    if (!result.ok) throw result.error;
    expect(result.value).toMatchObject({ type: "message", content: "All evidence collected." });
  });

  it.each([
    ["wrong argument type", { transactionId: 42 }],
    ["missing argument", {}],
    ["extra argument", { transactionId: "T1", refund: true }],
    ["arguments not JSON", "{transactionId: T1"],
  ])("rejects %s as invalid_tool_call", async (_label, args) => {
    fetchMock.mockResolvedValueOnce(toolReply([toolCall("c1", "lookup_transaction", args)]));
    const error = await expectError(callSarvam(toolRequest, opts), "invalid_tool_call");
    expect(error.toolName).toBe("lookup_transaction");
  });

  it("rejects an unknown tool name", async () => {
    fetchMock.mockResolvedValueOnce(toolReply([toolCall("c1", "issue_refund", { amount: 100 })]));
    const error = await expectError(callSarvam(toolRequest, opts), "unknown_tool");
    expect(error.toolName).toBeUndefined();
  });

  it("rejects the whole response when one of several calls is invalid", async () => {
    fetchMock.mockResolvedValueOnce(
      toolReply([
        toolCall("c1", "lookup_transaction", { transactionId: "T1" }),
        toolCall("c2", "get_settlement", { settlementId: "" }),
      ]),
    );
    const error = await expectError(callSarvam(toolRequest, opts), "invalid_tool_call");
    expect(error.toolName).toBe("get_settlement");
  });

  it.each([
    ["malformed call", [{ id: "c1", type: "function" }]],
    ["duplicate ids", [toolCall("c1", "lookup_transaction", { transactionId: "T1" }), toolCall("c1", "lookup_transaction", { transactionId: "T2" })]],
    ["finish_reason=tool_calls with no calls", []],
  ])("rejects %s as invalid_tool_call", async (_label, calls) => {
    fetchMock.mockResolvedValueOnce(toolReply(calls));
    await expectError(callSarvam(toolRequest, opts), "invalid_tool_call");
  });

  it("rejects a message when a tool call was required", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, completion({ content: "No tools needed." })));
    await expectError(callSarvam({ ...toolRequest, toolChoice: "required" }, opts), "invalid_tool_call");
  });

  it("rejects a call to a different tool than the named choice", async () => {
    fetchMock.mockResolvedValueOnce(toolReply([toolCall("c1", "lookup_transaction", { transactionId: "T1" })]));
    await expectError(callSarvam({ ...toolRequest, toolChoice: { name: "get_settlement" } }, opts), "invalid_tool_call");
  });

  it("rejects tool calls when tool_choice is none", async () => {
    fetchMock.mockResolvedValueOnce(toolReply([toolCall("c1", "lookup_transaction", { transactionId: "T1" })]));
    await expectError(callSarvam({ ...toolRequest, toolChoice: "none" }, opts), "invalid_tool_call");
  });

  it("treats a truncated tool response as truncated", async () => {
    fetchMock.mockResolvedValueOnce(toolReply([toolCall("c1", "lookup_transaction", '{"transac')], "length"));
    await expectError(callSarvam(toolRequest, opts), "truncated");
  });

  it("replays tool round trips in the wire format", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, completion({ content: "Transaction T1 succeeded." })));
    await callSarvam(
      {
        ...toolRequest,
        messages: [
          ...toolRequest.messages,
          {
            role: "assistant",
            content: null,
            toolCalls: [{ id: "c1", name: "lookup_transaction", arguments: { transactionId: "T1" } }],
          },
          { role: "tool", toolCallId: "c1", content: '{"status":"success"}' },
        ],
      },
      opts,
    );
    expect((sentBody().messages as unknown[]).slice(2)).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "c1", type: "function", function: { name: "lookup_transaction", arguments: '{"transactionId":"T1"}' } }],
      },
      { role: "tool", tool_call_id: "c1", content: '{"status":"success"}' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

describe("security", () => {
  it("never puts the API key or evidence in errors or logs", async () => {
    const logSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const evidence = "Customer Priya Sharma, phone 98XXXXXX10";
    const leaky = `invalid key ${API_KEY} for request mentioning ${evidence}`;
    const scenarios: [() => void, typeof structured][] = [
      [() => fetchMock.mockResolvedValue(reply(403, { error: { code: "invalid_api_key_error", message: leaky } })), structured],
      [() => fetchMock.mockResolvedValue(reply(500, { error: { code: "internal_server_error", message: leaky } })), structured],
      [() => fetchMock.mockRejectedValue(new TypeError(leaky, { cause: { code: leaky } })), structured],
      [() => fetchMock.mockResolvedValue(okContent(leaky)), structured],
      [() => fetchMock.mockResolvedValue(okContent(JSON.stringify({ ...VALID_OUTPUT, action: leaky }))), structured],
      [() => fetchMock.mockResolvedValue(reply(200, leaky)), structured],
    ];

    for (const [arrange, request] of scenarios) {
      fetchMock.mockReset();
      arrange();
      const result = await callSarvam({ ...request, messages: [{ role: "user", content: evidence }] }, opts);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      const serialized = [result.error.message, result.error.stack, JSON.stringify(result.error)].join("\n");
      expect(serialized).not.toContain(API_KEY);
      expect(serialized).not.toContain(evidence);
    }

    for (const spy of logSpies) expect(spy).not.toHaveBeenCalled();
  });
});
