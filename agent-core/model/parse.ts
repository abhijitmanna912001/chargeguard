import { z } from "zod";
import { ModelError, type ModelResult, type ValidationIssue } from "./errors";
import type {
  ResponseMetadata,
  StructuredOutput,
  ToolCallOf,
  ToolCallRequest,
  ToolChoice,
  ToolDefinition,
  ToolOutput,
} from "./types";

// Pure response parsing: no network, no environment. Every path that is not a
// fully validated output returns a ModelError; nothing is passed through.

// Only the fields we read. tool_calls entries are checked one by one later so
// a malformed call is reported as invalid_tool_call, not a broken envelope.
const CompletionSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z.array(
    z.object({
      finish_reason: z.string().nullable().optional(),
      message: z.object({
        content: z.string().nullable().optional(),
        tool_calls: z.array(z.unknown()).nullable().optional(),
      }),
    }),
  ),
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
type Completion = z.infer<typeof CompletionSchema>;
type Choice = Completion["choices"][number];

const WireToolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

export const NOT_JSON = Symbol("not-json");
const FENCED_JSON = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/i;
const MAX_ISSUES = 10;
const MAX_ISSUE_LENGTH = 200;

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return NOT_JSON;
  }
}

/** Accepts content wrapped in a single ```json fence; the inside is still schema-checked. */
function unwrapFence(content: string): string {
  const match = FENCED_JSON.exec(content);
  return match ? match[1].trim() : content;
}

export function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.slice(0, MAX_ISSUES).map((issue) => ({
    path: issue.path.map(String).join(".") || "(root)",
    message: issue.message.slice(0, MAX_ISSUE_LENGTH),
  }));
}

/**
 * Rejects unknown keys at the root instead of stripping them, so a model that
 * invents fields such as finalAction fails loudly. Nested objects follow the
 * schema's own setting.
 */
export function strictRoot<T>(schema: z.ZodType<T>): z.ZodType<T> {
  return schema instanceof z.ZodObject ? (schema.strict() as unknown as z.ZodType<T>) : schema;
}

type ParsedEnvelope = { ok: true; choice: Choice; metadata: ResponseMetadata } | { ok: false; error: ModelError };

export function parseEnvelope(body: unknown, latencyMs: number, attempts: number): ParsedEnvelope {
  const parsed = CompletionSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: new ModelError("invalid_envelope", "Sarvam response did not match the chat completion shape", {
        attempts,
        issues: toIssues(parsed.error),
      }),
    };
  }
  const completion = parsed.data;
  const choice = completion.choices[0];
  const usage = completion.usage;
  const metadata: ResponseMetadata = {
    providerRequestId: completion.id,
    model: completion.model,
    finishReason: choice?.finish_reason ?? null,
    usage: usage
      ? {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? undefined,
        }
      : undefined,
    latencyMs,
    attempts,
  };
  if (!choice) {
    return { ok: false, error: failure("empty_response", "Sarvam returned no choices", metadata) };
  }
  return { ok: true, choice, metadata };
}

function failure(
  kind: ConstructorParameters<typeof ModelError>[0],
  message: string,
  metadata: ResponseMetadata,
  extra: { issues?: ValidationIssue[]; toolName?: string } = {},
): ModelError {
  return new ModelError(kind, message, {
    attempts: metadata.attempts,
    providerRequestId: metadata.providerRequestId,
    metadata,
    ...extra,
  });
}

function checkFinish(choice: Choice, allowed: readonly string[], metadata: ResponseMetadata): ModelError | undefined {
  const reason = choice.finish_reason ?? null;
  if (reason === "length") {
    return failure("truncated", "Sarvam stopped at max_tokens; the output is incomplete", metadata);
  }
  if (reason === null || !allowed.includes(reason)) {
    return failure("unexpected_finish_reason", `Sarvam finished with finish_reason=${String(reason)}`, metadata);
  }
  return undefined;
}

export function parseStructured<T>(
  choice: Choice,
  schema: z.ZodType<T>,
  metadata: ResponseMetadata,
): ModelResult<StructuredOutput<T>> {
  const finishError = checkFinish(choice, ["stop"], metadata);
  if (finishError) return { ok: false, error: finishError };

  const content = choice.message.content?.trim();
  if (!content) {
    return { ok: false, error: failure("empty_response", "Sarvam returned no content", metadata) };
  }
  const json = parseJson(unwrapFence(content));
  if (json === NOT_JSON) {
    return { ok: false, error: failure("invalid_json", "Model content is not valid JSON", metadata) };
  }
  const parsed = strictRoot(schema).safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: failure("schema_validation_failed", "Model output failed schema validation", metadata, {
        issues: toIssues(parsed.error),
      }),
    };
  }
  return { ok: true, value: { mode: "structured", output: parsed.data, metadata } };
}

export function parseToolCalls<Tools extends readonly ToolDefinition[]>(
  choice: Choice,
  tools: Tools,
  toolChoice: ToolChoice<Tools>,
  metadata: ResponseMetadata,
): ModelResult<ToolOutput<Tools>> {
  const finishError = checkFinish(choice, ["stop", "tool_calls"], metadata);
  if (finishError) return { ok: false, error: finishError };

  const fail = (kind: "invalid_tool_call" | "unknown_tool", message: string, extra = {}) =>
    ({ ok: false, error: failure(kind, message, metadata, extra) }) as const;
  const rawCalls = choice.message.tool_calls ?? [];
  const content = choice.message.content?.trim() || null;

  if (rawCalls.length === 0) {
    if (choice.finish_reason === "tool_calls") {
      return fail("invalid_tool_call", "finish_reason=tool_calls but no tool calls were returned");
    }
    if (toolChoice !== "auto" && toolChoice !== "none") {
      return fail("invalid_tool_call", "A tool call was required but none was returned");
    }
    if (!content) {
      return { ok: false, error: failure("empty_response", "Sarvam returned neither content nor tool calls", metadata) };
    }
    return { ok: true, value: { mode: "tools", type: "message", content, metadata } };
  }

  if (toolChoice === "none") {
    return fail("invalid_tool_call", "Model returned tool calls although tool_choice was none");
  }

  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const seenIds = new Set<string>();
  const calls: ToolCallRequest[] = [];
  for (const [index, raw] of rawCalls.entries()) {
    const wire = WireToolCallSchema.safeParse(raw);
    if (!wire.success) {
      return fail("invalid_tool_call", `Tool call ${index} is malformed`, { issues: toIssues(wire.error) });
    }
    const { id, function: fn } = wire.data;
    if (seenIds.has(id)) return fail("invalid_tool_call", `Tool call ${index} reuses an id`);
    seenIds.add(id);

    const tool = byName.get(fn.name);
    if (!tool) {
      return fail("unknown_tool", `Tool call ${index} names a tool that was not offered`);
    }
    if (typeof toolChoice === "object" && fn.name !== toolChoice.name) {
      return fail("invalid_tool_call", `Tool call ${index} is not the required tool`, { toolName: tool.name });
    }
    const args = parseJson(fn.arguments);
    if (args === NOT_JSON) {
      return fail("invalid_tool_call", `Tool call ${index} arguments are not valid JSON`, { toolName: tool.name });
    }
    const parsedArgs = strictRoot(tool.parameters).safeParse(args);
    if (!parsedArgs.success) {
      return fail("invalid_tool_call", `Tool call ${index} arguments failed schema validation`, {
        toolName: tool.name,
        issues: toIssues(parsedArgs.error),
      });
    }
    calls.push({ id, name: tool.name, arguments: parsedArgs.data });
  }

  return {
    ok: true,
    value: {
      mode: "tools",
      type: "tool_calls",
      // Each call's name and arguments were checked against its own tool above.
      toolCalls: calls as ToolCallOf<Tools>[],
      content,
      metadata,
    },
  };
}
