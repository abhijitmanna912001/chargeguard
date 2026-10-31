import { z } from "zod";

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** A tool call the model asked for, already validated. Never executed here. */
export type ToolCallRequest<Name extends string = string, Args = unknown> = {
  id: string;
  name: Name;
  arguments: Args;
};

/**
 * Conversation turns after the system prompt. Assistant turns can carry the
 * tool calls a previous response returned, and tool turns carry the
 * orchestrator's results, so a tool round trip can be replayed.
 */
export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCallRequest[] }
  | { role: "tool"; toolCallId: string; content: string };

const ToolCallRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.unknown(),
});

export const ChatMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().min(1) }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().nullable(),
    toolCalls: z.array(ToolCallRequestSchema).optional(),
  }),
  z.object({ role: z.literal("tool"), toolCallId: z.string().min(1), content: z.string() }),
]);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/** Sarvam/OpenAI function names: letters, digits, underscores, dashes. */
export const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export type ToolDefinition<
  Name extends string = string,
  Params extends z.ZodObject = z.ZodObject,
> = {
  name: Name;
  description: string;
  parameters: Params;
};

/** Identity helper that keeps the tool name as a literal type. */
export function defineTool<const Name extends string, Params extends z.ZodObject>(
  tool: ToolDefinition<Name, Params>,
): ToolDefinition<Name, Params> {
  return tool;
}

/** Union of validated calls, one variant per tool, with typed arguments. */
export type ToolCallOf<Tools extends readonly ToolDefinition[]> = {
  [K in keyof Tools]: Tools[K] extends ToolDefinition<infer Name, infer Params>
    ? ToolCallRequest<Name, z.output<Params>>
    : never;
}[number];

export type ToolChoice<Tools extends readonly ToolDefinition[]> =
  | "auto"
  | "none"
  | "required"
  | { name: Tools[number]["name"] };

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

type GenerationConfig = {
  /** Capped at MAX_TOKENS_CAP; larger values are clamped. */
  maxTokens?: number;
  /** 0 to 2; defaults to DEFAULT_TEMPERATURE. */
  temperature?: number;
};

export type StructuredRequest<Schema extends z.ZodType> = GenerationConfig & {
  mode: "structured";
  systemPrompt: string;
  messages: ChatMessage[];
  /** For ChargeGuard dispute analysis this is ModelOutputSchema. */
  schema: Schema;
  /** Sent as json_schema.name. Letters, digits, underscores, dashes. */
  schemaName?: string;
};

export type ToolRequest<Tools extends readonly ToolDefinition[]> = GenerationConfig & {
  mode: "tools";
  systemPrompt?: string;
  messages: ChatMessage[];
  tools: Tools;
  toolChoice?: ToolChoice<Tools>;
};

export type ModelRequest =
  | StructuredRequest<z.ZodType>
  | ToolRequest<readonly ToolDefinition[]>;

export const GenerationConfigSchema = z.object({
  systemPrompt: z.string().min(1).optional(),
  messages: z.array(ChatMessageSchema).min(1),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const SchemaNameSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
};

/** Safe to log: contains no prompt, output or credential. */
export type ResponseMetadata = {
  /** Chat completion id returned by Sarvam. */
  providerRequestId?: string;
  model?: string;
  finishReason?: string | null;
  usage?: TokenUsage;
  /** Latency of the attempt that produced this response. */
  latencyMs: number;
  attempts: number;
};

export type StructuredOutput<T> = {
  mode: "structured";
  output: T;
  metadata: ResponseMetadata;
};

export type ToolOutput<Tools extends readonly ToolDefinition[]> =
  | {
      mode: "tools";
      type: "tool_calls";
      toolCalls: ToolCallOf<Tools>[];
      /** Any text the model sent alongside the calls. */
      content: string | null;
      metadata: ResponseMetadata;
    }
  | {
      mode: "tools";
      type: "message";
      content: string;
      metadata: ResponseMetadata;
    };
