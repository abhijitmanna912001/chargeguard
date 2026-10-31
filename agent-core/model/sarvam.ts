import "server-only";
import { z } from "zod";
import { ModelError, type ModelErrorKind, type ModelResult, type ModelErrorDetails } from "./errors";
import { NOT_JSON, parseEnvelope, parseJson, parseStructured, parseToolCalls, toIssues } from "./parse";
import {
  GenerationConfigSchema,
  SchemaNameSchema,
  TOOL_NAME_PATTERN,
  type ChatMessage,
  type ModelRequest,
  type StructuredOutput,
  type StructuredRequest,
  type ToolChoice,
  type ToolDefinition,
  type ToolOutput,
  type ToolRequest,
} from "./types";

// The single entry point to Sarvam. No other module calls the API.
// API reference: https://docs.sarvam.ai/api-reference/chat/chat-completions-v1

export const SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions";
export const SARVAM_MODEL = "sarvam-105b";
export const MAX_TOKENS_CAP = 2048;
// Sarvam's own default; nothing in the smoke tests argued for another value.
export const DEFAULT_TEMPERATURE = 0.2;
/** Per attempt, response-body read included. Clipped further by the remaining budget. */
export const DEFAULT_TIMEOUT_MS = 12_000;
/**
 * The whole call: every attempt, body reads, backoff and the time between
 * attempts. No attempt or wait may run past it, Retry-After included.
 */
export const DEFAULT_TOTAL_BUDGET_MS = 25_000;
/** A retry starts only if at least this much budget would remain for it after the wait. */
export const MIN_ATTEMPT_MS = 1_000;
/** Hard ceiling: at most 3 attempts per call, whatever the caller asks. */
export const MAX_RETRIES = 2;
export const INITIAL_BACKOFF_MS = 500;
export const MAX_BACKOFF_MS = 4_000;
export const DEFAULT_SCHEMA_NAME = "chargeguard_model_output";

// Per Sarvam's error guide: retry 429/500/502/503, never 400/402/403/422.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503]);
// Budget errors come back as 429 or 402; waiting does not clear them.
const QUOTA_CODES = new Set(["seat_budget_exhausted_error", "insufficient_quota_error"]);

const ErrorBodySchema = z.object({
  error: z.object({ code: z.string().optional(), request_id: z.string().optional() }),
});

export type CallOptions = {
  /** Per attempt. Defaults to DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Whole call. Defaults to DEFAULT_TOTAL_BUDGET_MS. */
  totalBudgetMs?: number;
  /** 0 to MAX_RETRIES; anything else is clamped. */
  maxRetries?: number;
  /** Backoff wait. Replaceable so tests run without real delays. */
  sleep?: (ms: number) => Promise<void>;
  /** Monotonic milliseconds for elapsed time. Defaults to performance.now(). */
  clock?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
// Read at call time, not import time, so fake timers that replace performance work.
const defaultClock = () => performance.now();

/**
 * Calls sarvam-105b once (plus limited retries on transient failures, within
 * the total budget) and returns validated output. Never throws, and never
 * executes tools: tool mode only returns validated tool-call requests for the
 * orchestrator to run. Success metadata and every ModelError carry the whole
 * call's attemptCount and latencyMs.
 */
export function callSarvam<Schema extends z.ZodType>(
  request: StructuredRequest<Schema>,
  options?: CallOptions,
): Promise<ModelResult<StructuredOutput<z.output<Schema>>>>;
export function callSarvam<const Tools extends readonly ToolDefinition[]>(
  request: ToolRequest<Tools>,
  options?: CallOptions,
): Promise<ModelResult<ToolOutput<Tools>>>;
export async function callSarvam(
  request: ModelRequest,
  options: CallOptions = {},
): Promise<ModelResult<StructuredOutput<unknown> | ToolOutput<readonly ToolDefinition[]>>> {
  const clock = options.clock ?? defaultClock;
  const startedAt = clock();
  const elapsed = () => clock() - startedAt;
  // Failures before the network: zero attempts, time spent so far.
  const beforeNetwork = (error: ModelError) => ({ ok: false as const, error: retimed(error, 0, elapsed()) });

  const invalid = validateRequest(request);
  if (invalid) return beforeNetwork(invalid);

  // Read per call, server-side only. Never NEXT_PUBLIC_*.
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey) return beforeNetwork(new ModelError("missing_api_key", "SARVAM_API_KEY is not set"));

  const payload = buildPayload(request);
  if (payload instanceof ModelError) return beforeNetwork(payload);

  const response = await postWithRetries(payload, apiKey, options, elapsed);
  if (!response.ok) return response;

  const envelope = parseEnvelope(response.body, roundMs(elapsed()), response.attemptCount);
  if (!envelope.ok) return envelope;

  return request.mode === "structured"
    ? parseStructured(envelope.choice, request.schema, envelope.metadata)
    : parseToolCalls(envelope.choice, request.tools, request.toolChoice ?? "auto", envelope.metadata);
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

function validateRequest(request: ModelRequest): ModelError | undefined {
  const config = GenerationConfigSchema.safeParse({
    systemPrompt: request.systemPrompt,
    messages: request.messages,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
  });
  if (!config.success) {
    return new ModelError("invalid_request", "Model request failed validation", { issues: toIssues(config.error) });
  }

  if (request.mode === "structured") {
    if (!request.systemPrompt) return new ModelError("invalid_request", "Structured requests need a system prompt");
    if (!(request.schema instanceof z.ZodType)) return new ModelError("invalid_request", "schema must be a Zod schema");
    if (request.schemaName !== undefined && !SchemaNameSchema.safeParse(request.schemaName).success) {
      return new ModelError("invalid_request", "schemaName may only use letters, digits, underscores and dashes");
    }
    return undefined;
  }

  if (request.tools.length === 0) return new ModelError("invalid_request", "Tool requests need at least one tool");
  const names = new Set<string>();
  for (const tool of request.tools) {
    if (!TOOL_NAME_PATTERN.test(tool.name)) {
      return new ModelError("invalid_request", "Tool names may only use letters, digits, underscores and dashes");
    }
    if (names.has(tool.name)) return new ModelError("invalid_request", `Duplicate tool name ${tool.name}`);
    if (!(tool.parameters instanceof z.ZodObject)) {
      return new ModelError("invalid_request", `Tool ${tool.name} parameters must be a Zod object`);
    }
    names.add(tool.name);
  }
  const choice = request.toolChoice;
  if (typeof choice === "object" && !names.has(choice.name)) {
    return new ModelError("invalid_request", "toolChoice names a tool that is not offered");
  }
  return undefined;
}

/** Zod 4 JSON Schema without the root $schema keyword, which Sarvam does not need. */
export function toProviderJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function toWireMessage(message: ChatMessage) {
  switch (message.role) {
    case "user":
      return { role: "user", content: message.content };
    case "tool":
      return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
    case "assistant":
      return {
        role: "assistant",
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
              })),
            }
          : {}),
      };
  }
}

function toWireToolChoice(choice: ToolChoice<readonly ToolDefinition[]>) {
  return typeof choice === "object" ? { type: "function", function: { name: choice.name } } : choice;
}

function buildPayload(request: ModelRequest): string | ModelError {
  try {
    const modeFields =
      request.mode === "structured"
        ? {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: request.schemaName ?? DEFAULT_SCHEMA_NAME,
                strict: true,
                schema: toProviderJsonSchema(request.schema),
              },
            },
          }
        : {
            tools: request.tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: toProviderJsonSchema(tool.parameters),
              },
            })),
            tool_choice: toWireToolChoice(request.toolChoice ?? "auto"),
          };

    return JSON.stringify({
      model: SARVAM_MODEL,
      messages: [
        ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
        ...request.messages.map(toWireMessage),
      ],
      max_tokens: Math.min(request.maxTokens ?? MAX_TOKENS_CAP, MAX_TOKENS_CAP),
      temperature: request.temperature ?? DEFAULT_TEMPERATURE,
      // Reasoning disabled. In our dispute tests this beat "low", and reasoning
      // tokens would otherwise eat into max_tokens.
      reasoning_effort: null,
      ...modeFields,
    });
  } catch {
    // toJSONSchema throws on unrepresentable types (transforms, dates, ...),
    // JSON.stringify on circular tool-call arguments.
    return new ModelError("invalid_request", "Request could not be converted to the Sarvam payload");
  }
}

// ---------------------------------------------------------------------------
// Transport: per-attempt timeout, total budget, bounded retries, typed failures
// ---------------------------------------------------------------------------

type Failure = { kind: ModelErrorKind; message: string; details: ModelErrorDetails };
type Attempt = { ok: true; body: unknown } | { ok: false; failure: Failure };
type Posted = { ok: true; body: unknown; attemptCount: number } | { ok: false; error: ModelError };

function clampRetries(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return MAX_RETRIES;
  return Math.min(Math.max(0, Math.floor(value)), MAX_RETRIES);
}

function positiveMs(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Telemetry is reported in whole milliseconds; budget checks use the exact clock. */
function roundMs(ms: number): number {
  return Math.max(0, Math.round(ms));
}

/** The same error with this call's timing; used for failures raised before the network. */
function retimed(error: ModelError, attemptCount: number, latencyMs: number): ModelError {
  return new ModelError(error.kind, error.message, {
    retryable: error.retryable,
    status: error.status,
    providerCode: error.providerCode,
    providerRequestId: error.providerRequestId,
    retryAfterMs: error.retryAfterMs,
    metadata: error.metadata,
    issues: error.issues,
    toolName: error.toolName,
    attemptCount,
    latencyMs: roundMs(latencyMs),
  });
}

async function postWithRetries(
  payload: string,
  apiKey: string,
  options: CallOptions,
  elapsed: () => number,
): Promise<Posted> {
  const timeoutMs = positiveMs(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const budgetMs = positiveMs(options.totalBudgetMs, DEFAULT_TOTAL_BUDGET_MS);
  const maxRetries = clampRetries(options.maxRetries);
  const sleep = options.sleep ?? defaultSleep;

  /** attemptCount is the number of requests actually started, never one that was not. */
  const exhausted = (attemptCount: number, last: Failure | undefined) => ({
    ok: false as const,
    error: new ModelError(
      "budget_exhausted",
      last
        ? `Model call budget of ${budgetMs}ms used up after ${attemptCount} attempt(s); last failure: ${last.kind}`
        : `Model call budget of ${budgetMs}ms used up before the first attempt`,
      {
        status: last?.details.status,
        providerCode: last?.details.providerCode,
        providerRequestId: last?.details.providerRequestId,
        retryAfterMs: last?.details.retryAfterMs,
        attemptCount,
        latencyMs: roundMs(elapsed()),
      },
    ),
  });

  let last: Failure | undefined;
  for (let attempt = 1; ; attempt++) {
    // Re-measured right before every request, after any wait: a sleep can
    // overshoot its delay. The first attempt needs some budget left; a retry
    // needs at least MIN_ATTEMPT_MS.
    const remainingMs = budgetMs - elapsed();
    if (remainingMs <= 0 || (attempt > 1 && remainingMs < MIN_ATTEMPT_MS)) return exhausted(attempt - 1, last);

    // The abort timer covers the request and the body read, and cancels the
    // fetch itself, so nothing keeps running once the attempt is given up.
    const attemptTimeoutMs = Math.min(timeoutMs, remainingMs);
    const result = await attemptOnce(payload, apiKey, attemptTimeoutMs);
    if (result.ok) return { ok: true, body: result.body, attemptCount: attempt };

    const failure = result.failure;
    last = failure;
    // Cut short by the remaining budget rather than by its own timeout.
    if (failure.kind === "timeout" && attemptTimeoutMs < timeoutMs) return exhausted(attempt, failure);

    const error = new ModelError(failure.kind, failure.message, {
      ...failure.details,
      attemptCount: attempt,
      latencyMs: roundMs(elapsed()),
    });
    if (!error.retryable || attempt > maxRetries) return { ok: false, error };

    const requestedDelay = error.retryAfterMs ?? Math.min(INITIAL_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
    // Sarvam asked for a longer wait than we allow inside one call: hand the
    // decision to the orchestrator rather than hammering the API early.
    if (requestedDelay > MAX_BACKOFF_MS) return { ok: false, error };

    // Budget limits. The total budget stops new provider requests from
    // starting after the deadline. Event-loop or OS scheduling delays can
    // still make a retry sleep finish late, so the call may return after the
    // nominal budget. That is accepted: a timer-based hard return would be
    // delayed by the same event loop.
    //
    // The wait is never longer than the remaining budget, and is skipped
    // when MIN_ATTEMPT_MS would not be left after it. The check at the top of
    // the loop still decides after the wait, using the real elapsed time.
    const remainingBeforeWaitMs = budgetMs - elapsed();
    const delay = Math.min(requestedDelay, Math.max(0, remainingBeforeWaitMs));
    if (remainingBeforeWaitMs - delay < MIN_ATTEMPT_MS) return exhausted(attempt, failure);
    await sleep(delay);
  }
}

async function attemptOnce(payload: string, apiKey: string, timeoutMs: number): Promise<Attempt> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(SARVAM_CHAT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "api-subscription-key": apiKey },
      body: payload,
      signal: controller.signal,
    });
    const text = await res.text();
    const body = parseJson(text);

    if (res.ok) {
      if (body === NOT_JSON) {
        return fail("invalid_envelope", `Sarvam returned HTTP ${res.status} with a non-JSON body`, { status: res.status });
      }
      return { ok: true, body };
    }
    return { ok: false, failure: httpFailure(res, body) };
  } catch (error) {
    if (timedOut) return fail("timeout", `No response from Sarvam within ${timeoutMs}ms`, { retryable: true });
    // Only the error code or class name: messages can echo request details.
    return fail("network_error", `Network request to Sarvam failed (${networkCause(error)})`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

function fail(kind: ModelErrorKind, message: string, details: ModelErrorDetails = {}): Attempt {
  return { ok: false, failure: { kind, message, details } };
}

function httpFailure(res: Response, body: unknown): Failure {
  const parsed = ErrorBodySchema.safeParse(body);
  const providerCode = parsed.success ? parsed.data.error.code : undefined;
  const providerRequestId = parsed.success ? parsed.data.error.request_id : undefined;
  const status = res.status;
  const label = `HTTP ${status}${providerCode ? ` ${providerCode}` : ""}`;
  const base = { status, providerCode, providerRequestId };

  if (status === 402 || (providerCode && QUOTA_CODES.has(providerCode))) {
    return { kind: "quota_exhausted", message: `Sarvam credits or budget exhausted (${label})`, details: base };
  }
  if (status === 401 || status === 403) {
    return { kind: "auth_failed", message: `Sarvam rejected the API key (${label})`, details: base };
  }
  const retryable = RETRYABLE_STATUS.has(status);
  if (status === 429 || (status === 503 && providerCode?.includes("rate_limit"))) {
    return {
      kind: "rate_limited",
      message: `Sarvam rate limit hit (${label})`,
      details: { ...base, retryable, retryAfterMs: parseRetryAfterMs(res.headers.get("retry-after")) },
    };
  }
  if (status >= 500) {
    return { kind: "provider_error", message: `Sarvam server error (${label})`, details: { ...base, retryable } };
  }
  return { kind: "invalid_request", message: `Sarvam rejected the request (${label})`, details: base };
}

/** Retry-After as seconds or an HTTP date; undefined when absent or unreadable. */
export function parseRetryAfterMs(header: string | null): number | undefined {
  if (header === null || header.trim() === "") return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : undefined;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function networkCause(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown } } | undefined)?.cause?.code;
  if (typeof cause === "string" && /^[A-Z0-9_]{1,40}$/.test(cause)) return cause;
  return error instanceof Error ? error.name : "unknown";
}
