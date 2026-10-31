/**
 * Sarvam AI smoke test. Throwaway: not part of the agent pipeline and not a
 * shared contract. It checks the raw API behaviour the real provider
 * interface in agent-core/ will depend on.
 *
 * Run: npm run smoke:sarvam
 *   Offline tests (D, E) always run against a local mock server.
 *   Live tests (A, B, C, live E) need SARVAM_API_KEY in .env.local.
 *
 * API reference: https://docs.sarvam.ai/api-reference/chat/chat-completions-v1
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";

const SARVAM_BASE_URL = "https://api.sarvam.ai";
const CHAT_PATH = "/v1/chat/completions";
const MODEL = "sarvam-105b";
// Reasoning tokens count toward max_tokens and reasoning cannot be disabled
// (the API rejects reasoning_effort "none"). A short classification used
// ~1000 reasoning tokens live, so 1024 truncated; 2048 is the API default.
const MAX_TOKENS_CAP = 2048;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_BACKOFF_MS = 4_000;
// Per Sarvam's error guide: retry 429/500/502/503, never 400/402/403/422.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503]);
const NON_RETRYABLE_CODES = new Set(["seat_budget_exhausted_error", "insufficient_quota_error"]);

const apiKey = process.env.SARVAM_API_KEY?.trim() || undefined;
const redact = (text: string) => (apiKey ? text.split(apiKey).join("[REDACTED]") : text);

// ---------------------------------------------------------------------------
// Response validation (only the fields we read)
// ---------------------------------------------------------------------------

const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

const ChatCompletionSchema = z.object({
  id: z.string(),
  model: z.string(),
  choices: z
    .array(
      z.object({
        index: z.number(),
        finish_reason: z.string().nullable(),
        message: z.object({
          role: z.literal("assistant"),
          content: z.string().nullable().optional(),
          reasoning_content: z.string().nullable().optional(),
          tool_calls: z.array(ToolCallSchema).nullable().optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      total_tokens: z.number(),
      completion_tokens_details: z
        .object({ reasoning_tokens: z.number().nullable().optional() })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});
type ChatCompletion = z.infer<typeof ChatCompletionSchema>;

const ErrorBodySchema = z.object({
  error: z.object({ message: z.string().optional(), code: z.string().optional() }),
});

// ---------------------------------------------------------------------------
// The single Sarvam call: timeout per attempt, limited retries, typed failure
// ---------------------------------------------------------------------------

type FailureKind =
  | "auth"
  | "bad_request"
  | "quota"
  | "rate_limited"
  | "upstream"
  | "timeout"
  | "network"
  | "invalid_response";

type Failure = { ok: false; kind: FailureKind; status?: number; code?: string; message: string; attempts: number };
// A Failure is the escalation signal: the caller hands off to a human.
type CallResult = { ok: true; completion: ChatCompletion; attempts: number } | Failure;

type ChatRequest = { messages: unknown[]; max_tokens: number; [param: string]: unknown };

// Local to this script. Unlike agent-core's CallOptions it takes the key
// explicitly, so the fake-key auth test can run beside the live ones.
type SmokeCallOptions = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
};

function classify(status: number, code: string | undefined): FailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 402 || (code && NON_RETRYABLE_CODES.has(code))) return "quota";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream";
  return "bad_request";
}

function parseRetryAfterMs(header: string | null): number | undefined {
  const seconds = header === null ? NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callSarvam(request: ChatRequest, opts: SmokeCallOptions): Promise<CallResult> {
  const {
    baseUrl = SARVAM_BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    backoffBaseMs = 500,
  } = opts;
  const body = JSON.stringify({
    model: MODEL,
    ...request,
    max_tokens: Math.min(request.max_tokens, MAX_TOKENS_CAP),
  });

  let last: Failure | undefined;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    let retryAfterMs: number | undefined;
    try {
      const res = await fetch(baseUrl + CHAT_PATH, {
        method: "POST",
        headers: { "content-type": "application/json", "api-subscription-key": opts.apiKey },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();

      if (res.ok) {
        const parsed = ChatCompletionSchema.safeParse(safeJson(text));
        if (parsed.success) return { ok: true, completion: parsed.data, attempts: attempt };
        return {
          ok: false,
          kind: "invalid_response",
          status: res.status,
          message: `response envelope failed validation: ${z.prettifyError(parsed.error)}`,
          attempts: attempt,
        };
      }

      const err = ErrorBodySchema.safeParse(safeJson(text));
      const code = err.success ? err.data.error.code : undefined;
      const message = redact(err.success && err.data.error.message ? err.data.error.message : `HTTP ${res.status}`);
      last = { ok: false, kind: classify(res.status, code), status: res.status, code, message, attempts: attempt };
      const retryable = RETRYABLE_STATUS.has(res.status) && !(code && NON_RETRYABLE_CODES.has(code));
      if (!retryable) return last;
      retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
    } catch (error) {
      const isTimeout = (error as Error | undefined)?.name === "TimeoutError";
      last = {
        ok: false,
        kind: isTimeout ? "timeout" : "network",
        message: isTimeout ? `no response within ${timeoutMs}ms` : redact(String(error)),
        attempts: attempt,
      };
    }
    if (attempt <= maxRetries) {
      await sleep(Math.min(retryAfterMs ?? backoffBaseMs * 2 ** (attempt - 1), MAX_BACKOFF_MS));
    }
  }
  return last!;
}

// ---------------------------------------------------------------------------
// Structured-output parsing: reject anything that is not exactly the schema
// ---------------------------------------------------------------------------

type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

function parseStructuredContent<T>(completion: ChatCompletion, schema: z.ZodType<T>): ParseResult<T> {
  const choice = completion.choices[0];
  if (choice.finish_reason === "length") {
    return { ok: false, reason: "truncated (finish_reason=length; reasoning may have used max_tokens)" };
  }
  const content = choice.message.content?.trim();
  if (!content) return { ok: false, reason: "empty content" };
  const json = safeJson(content);
  if (json === undefined) return { ok: false, reason: "content is not valid JSON" };
  const parsed = schema.safeParse(json);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, reason: `schema mismatch: ${z.prettifyError(parsed.error)}` };
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

type Outcome = { name: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };
const outcomes: Outcome[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function test(name: string, fn: () => Promise<string>) {
  try {
    outcomes.push({ name, status: "PASS", detail: await fn() });
  } catch (error) {
    outcomes.push({ name, status: "FAIL", detail: redact(error instanceof Error ? error.message : String(error)) });
  }
}

function skip(name: string, reason: string) {
  outcomes.push({ name, status: "SKIP", detail: reason });
}

function describeFailure(result: CallResult): string {
  return result.ok
    ? "ok"
    : `${result.kind} status=${result.status ?? "-"} code=${result.code ?? "-"} attempts=${result.attempts}: ${result.message}`;
}

function describeUsage(completion: ChatCompletion): string {
  const u = completion.usage;
  if (!u) return "usage=none";
  const reasoning = u.completion_tokens_details?.reasoning_tokens ?? "n/a";
  return `tokens prompt=${u.prompt_tokens} completion=${u.completion_tokens} (reasoning=${reasoning}) total=${u.total_tokens}`;
}

// Synthetic sample used by Test C and Test D.
const TicketSchema = z
  .object({
    category: z.enum(["billing", "technical", "other"]),
    urgency: z.number().int().min(1).max(5),
    summary: z.string().min(1),
  })
  .strict();

const TICKET_JSON_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["billing", "technical", "other"] },
    urgency: { type: "integer", minimum: 1, maximum: 5 },
    summary: { type: "string" },
  },
  required: ["category", "urgency", "summary"],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Local mock server for offline tests
// ---------------------------------------------------------------------------

type MockReply = { status: number; body?: unknown; headers?: Record<string, string>; hang?: boolean };
let mockQueue: MockReply[] = [];
let mockHits = 0;
let mockLastBody: unknown;

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    mockHits++;
    mockLastBody = safeJson(raw);
    const reply = mockQueue.shift() ?? { status: 500, body: { error: { message: "mock queue empty" } } };
    if (reply.hang) return;
    res.writeHead(reply.status, { "content-type": "application/json", ...reply.headers });
    res.end(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? {}));
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const mockUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const mockOpts: SmokeCallOptions = { apiKey: "mock-key", baseUrl: mockUrl, timeoutMs: 300, maxRetries: 2, backoffBaseMs: 10 };

function mock(...replies: MockReply[]) {
  mockQueue = replies;
  mockHits = 0;
}

const OK_BODY = {
  id: "mock-1",
  object: "chat.completion",
  created: 0,
  model: MODEL,
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "pong" } }],
  usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
};
const PING: ChatRequest = { messages: [{ role: "user", content: "ping" }], max_tokens: 64 };

function fakeCompletion(content: string | null, finishReason = "stop"): ChatCompletion {
  return { id: "fake", model: MODEL, choices: [{ index: 0, finish_reason: finishReason, message: { role: "assistant", content } }] };
}

// ---------------------------------------------------------------------------
// Test D: malformed or empty model output (offline)
// ---------------------------------------------------------------------------

const VALID_TICKET = '{"category":"billing","urgency":4,"summary":"Charged twice"}';
const parseCases: [string, ChatCompletion, boolean][] = [
  ["null content", fakeCompletion(null), false],
  ["empty string", fakeCompletion(""), false],
  ["whitespace only", fakeCompletion("  \n\t"), false],
  ["prose, not JSON", fakeCompletion("Sure! Here is the JSON you asked for."), false],
  ["markdown-fenced JSON", fakeCompletion("```json\n" + VALID_TICKET + "\n```"), false],
  ["truncated (finish_reason=length)", fakeCompletion('{"category":"bill', "length"), false],
  ["enum value not allowed", fakeCompletion('{"category":"refund","urgency":4,"summary":"x"}'), false],
  ["urgency out of range", fakeCompletion('{"category":"billing","urgency":9,"summary":"x"}'), false],
  ["missing field", fakeCompletion('{"category":"billing","urgency":4}'), false],
  ["extra field", fakeCompletion('{"category":"billing","urgency":4,"summary":"x","won":true}'), false],
  ["JSON array instead of object", fakeCompletion("[1,2,3]"), false],
  ["valid object", fakeCompletion(VALID_TICKET), true],
];
for (const [label, completion, shouldPass] of parseCases) {
  await test(`D parse: ${label}`, async () => {
    const result = parseStructuredContent(completion, TicketSchema);
    assert(result.ok === shouldPass, `expected ok=${shouldPass}, got ${JSON.stringify(result)}`);
    return result.ok ? "accepted" : `rejected: ${result.reason.split("\n")[0]}`;
  });
}

await test("D envelope: 200 with empty object", async () => {
  mock({ status: 200, body: {} });
  const r = await callSarvam(PING, mockOpts);
  assert(!r.ok && r.kind === "invalid_response" && r.attempts === 1, describeFailure(r));
  return describeFailure(r).split("\n")[0];
});

await test("D envelope: 200 with choices=[]", async () => {
  mock({ status: 200, body: { ...OK_BODY, choices: [] } });
  const r = await callSarvam(PING, mockOpts);
  assert(!r.ok && r.kind === "invalid_response", describeFailure(r));
  return describeFailure(r).split("\n")[0];
});

await test("D envelope: 200 with HTML body", async () => {
  mock({ status: 200, body: "<html>gateway</html>" });
  const r = await callSarvam(PING, mockOpts);
  assert(!r.ok && r.kind === "invalid_response", describeFailure(r));
  return describeFailure(r).split("\n")[0];
});

// ---------------------------------------------------------------------------
// Test E: timeout, retry and API failure handling (offline)
// ---------------------------------------------------------------------------

await test("E timeout: server never responds", async () => {
  mock({ status: 0, hang: true }, { status: 0, hang: true }, { status: 0, hang: true });
  const started = Date.now();
  const r = await callSarvam(PING, mockOpts);
  const elapsed = Date.now() - started;
  assert(!r.ok && r.kind === "timeout" && r.attempts === 3 && mockHits === 3, describeFailure(r));
  return `${describeFailure(r)} elapsed=${elapsed}ms`;
});

await test("E retry: 503 then success", async () => {
  mock({ status: 503, body: { error: { code: "model_overloaded", message: "busy" } } }, { status: 200, body: OK_BODY });
  const r = await callSarvam(PING, mockOpts);
  assert(r.ok && r.attempts === 2, describeFailure(r));
  return `ok after attempts=${r.attempts}`;
});

await test("E retry: 429 with Retry-After then success", async () => {
  mock(
    { status: 429, headers: { "retry-after": "0" }, body: { error: { code: "rate_limit_exceeded_error" } } },
    { status: 200, body: OK_BODY },
  );
  const r = await callSarvam(PING, mockOpts);
  assert(r.ok && r.attempts === 2, describeFailure(r));
  return `ok after attempts=${r.attempts}`;
});

await test("E retries exhausted: 500 x3", async () => {
  mock(...Array.from({ length: 3 }, () => ({ status: 500, body: { error: { code: "internal_server_error" } } })));
  const r = await callSarvam(PING, mockOpts);
  assert(!r.ok && r.kind === "upstream" && r.attempts === 3 && mockHits === 3, describeFailure(r));
  return describeFailure(r);
});

const noRetryCases: [string, MockReply, FailureKind][] = [
  ["400 invalid_request_error", { status: 400, body: { error: { code: "invalid_request_error", message: "bad" } } }, "bad_request"],
  ["402 insufficient_quota_error", { status: 402, body: { error: { code: "insufficient_quota_error" } } }, "quota"],
  ["403 invalid_api_key_error", { status: 403, body: { error: { code: "invalid_api_key_error" } } }, "auth"],
  ["422 unprocessable_entity_error", { status: 422, body: { error: { code: "unprocessable_entity_error" } } }, "bad_request"],
  ["429 seat_budget_exhausted_error", { status: 429, body: { error: { code: "seat_budget_exhausted_error" } } }, "quota"],
];
for (const [label, reply, kind] of noRetryCases) {
  await test(`E no retry: ${label}`, async () => {
    mock(reply, { status: 200, body: OK_BODY });
    const r = await callSarvam(PING, mockOpts);
    assert(!r.ok && r.kind === kind && r.attempts === 1 && mockHits === 1, describeFailure(r));
    return describeFailure(r);
  });
}

await test("E network error: connection refused", async () => {
  const r = await callSarvam(PING, { ...mockOpts, baseUrl: "http://127.0.0.1:1" });
  assert(!r.ok && r.kind === "network" && r.attempts === 3, describeFailure(r));
  return `network attempts=${r.attempts}`;
});

await test("Token cap: max_tokens clamped before sending", async () => {
  mock({ status: 200, body: OK_BODY });
  await callSarvam({ ...PING, max_tokens: 99_999 }, mockOpts);
  const sent = (mockLastBody as { max_tokens?: number; model?: string } | undefined) ?? {};
  assert(sent.max_tokens === MAX_TOKENS_CAP && sent.model === MODEL, `sent ${JSON.stringify(sent)}`);
  return `requested 99999, sent max_tokens=${sent.max_tokens}`;
});

server.closeAllConnections();
server.close();

// ---------------------------------------------------------------------------
// Live tests against api.sarvam.ai
// ---------------------------------------------------------------------------

// Uses a deliberately fake key, so it runs with or without credentials.
await test("E live: invalid key is rejected without retry", async () => {
  const r = await callSarvam(PING, { apiKey: "sk_invalid_smoke_test", timeoutMs: 15_000 });
  assert(!r.ok && r.kind === "auth" && r.attempts === 1, describeFailure(r));
  return describeFailure(r);
});

if (!apiKey) {
  const reason = "SARVAM_API_KEY not set in .env.local; not tested";
  for (const name of ["A live: basic response", "B live: tool calling round trip", "C live: json_schema structured output", "E live: 1ms timeout"]) {
    skip(name, reason);
  }
} else {
  const live: SmokeCallOptions = { apiKey };

  await test("A live: basic response", async () => {
    const r = await callSarvam(
      { messages: [{ role: "user", content: "Reply with the single word: pong" }], max_tokens: 512, reasoning_effort: "low" },
      live,
    );
    assert(r.ok, describeFailure(r));
    const choice = r.completion.choices[0];
    const content = choice.message.content?.trim();
    assert(content, `empty content (finish_reason=${choice.finish_reason}; ${describeUsage(r.completion)})`);
    return `content=${JSON.stringify(content.slice(0, 60))} finish=${choice.finish_reason} ${describeUsage(r.completion)}`;
  });

  await test("B live: tool calling round trip", async () => {
    const AddArgsSchema = z.object({ a: z.number(), b: z.number() }).strict();
    const tools = [
      {
        type: "function",
        function: {
          name: "add_numbers",
          description: "Add two numbers and return their sum.",
          parameters: {
            type: "object",
            properties: { a: { type: "number" }, b: { type: "number" } },
            required: ["a", "b"],
            additionalProperties: false,
          },
        },
      },
    ];
    const messages: unknown[] = [
      { role: "user", content: "What is 17 plus 25? Use the add_numbers tool; do not compute it yourself." },
    ];

    const first = await callSarvam({ messages, tools, tool_choice: "auto", max_tokens: 1024, reasoning_effort: "low" }, live);
    assert(first.ok, describeFailure(first));
    const firstChoice = first.completion.choices[0];
    const call = firstChoice.message.tool_calls?.[0];
    assert(call, `no tool_calls (finish_reason=${firstChoice.finish_reason}, content=${JSON.stringify(firstChoice.message.content)})`);
    assert(call.function.name === "add_numbers", `unexpected tool ${call.function.name}`);
    const args = AddArgsSchema.safeParse(safeJson(call.function.arguments));
    assert(args.success, `bad tool arguments: ${call.function.arguments}`);
    const sum = args.data.a + args.data.b;

    const second = await callSarvam(
      {
        messages: [
          ...messages,
          { role: "assistant", content: firstChoice.message.content ?? null, tool_calls: firstChoice.message.tool_calls },
          { role: "tool", tool_call_id: call.id, content: JSON.stringify({ sum }) },
        ],
        tools,
        max_tokens: 1024,
        reasoning_effort: "low",
      },
      live,
    );
    assert(second.ok, describeFailure(second));
    const answer = second.completion.choices[0].message.content ?? "";
    assert(answer.includes(String(sum)), `final answer missing ${sum}: ${JSON.stringify(answer.slice(0, 120))}`);
    return `call1 finish=${firstChoice.finish_reason} args=${call.function.arguments}; call2 answer=${JSON.stringify(answer.trim().slice(0, 60))} | ${describeUsage(first.completion)}`;
  });

  await test("C live: json_schema structured output", async () => {
    const r = await callSarvam(
      {
        messages: [
          { role: "system", content: "Classify the customer message. Respond only with JSON matching the schema." },
          { role: "user", content: "I was charged twice for order A123 yesterday. Please fix this today." },
        ],
        response_format: { type: "json_schema", json_schema: { name: "ticket", strict: true, schema: TICKET_JSON_SCHEMA } },
        max_tokens: 2048,
        reasoning_effort: "low",
      },
      live,
    );
    assert(r.ok, describeFailure(r));
    const parsed = parseStructuredContent(r.completion, TicketSchema);
    assert(
      parsed.ok,
      `${parsed.ok ? "" : parsed.reason} raw=${JSON.stringify(r.completion.choices[0].message.content)} ${describeUsage(r.completion)}`,
    );
    return `${JSON.stringify(parsed.value)} ${describeUsage(r.completion)}`;
  });

  await test("E live: 1ms timeout", async () => {
    const r = await callSarvam(PING, { ...live, timeoutMs: 1, maxRetries: 1, backoffBaseMs: 10 });
    assert(!r.ok && r.kind === "timeout" && r.attempts === 2, describeFailure(r));
    return describeFailure(r);
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

for (const o of outcomes) console.log(`${o.status.padEnd(4)}  ${o.name}\n      ${o.detail.split("\n")[0]}`);
const count = (s: Outcome["status"]) => outcomes.filter((o) => o.status === s).length;
console.log(`\n${count("PASS")} passed, ${count("FAIL")} failed, ${count("SKIP")} skipped`);
process.exitCode = count("FAIL") > 0 ? 1 : 0;
