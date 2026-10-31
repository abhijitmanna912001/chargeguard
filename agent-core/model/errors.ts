import type { ResponseMetadata } from "./types";

export type ModelErrorKind =
  // Configuration and request
  | "missing_api_key"
  | "invalid_request"
  // HTTP and transport
  | "auth_failed"
  | "quota_exhausted"
  | "rate_limited"
  | "provider_error"
  | "network_error"
  | "timeout"
  // Response envelope
  | "empty_response"
  | "invalid_envelope"
  | "truncated"
  | "unexpected_finish_reason"
  // Model output
  | "invalid_json"
  | "schema_validation_failed"
  | "invalid_tool_call"
  | "unknown_tool";

/** Path and message only; never the rejected value, which may echo evidence. */
export type ValidationIssue = { path: string; message: string };

export type ModelErrorDetails = {
  retryable?: boolean;
  status?: number;
  providerCode?: string;
  providerRequestId?: string;
  attempts?: number;
  retryAfterMs?: number;
  /** Present when Sarvam returned a 200 that failed validation. */
  metadata?: ResponseMetadata;
  issues?: ValidationIssue[];
  toolName?: string;
};

/**
 * Every model failure. Messages are written here, never copied from prompts
 * or model output, so the error is safe to log and store in the audit trail.
 * The orchestrator maps any ModelError to the model_failure flag.
 */
export class ModelError extends Error {
  readonly kind: ModelErrorKind;
  readonly retryable: boolean;
  readonly status?: number;
  readonly providerCode?: string;
  readonly providerRequestId?: string;
  readonly attempts: number;
  readonly retryAfterMs?: number;
  readonly metadata?: ResponseMetadata;
  readonly issues?: ValidationIssue[];
  readonly toolName?: string;

  constructor(kind: ModelErrorKind, message: string, details: ModelErrorDetails = {}) {
    super(message);
    this.name = "ModelError";
    this.kind = kind;
    this.retryable = details.retryable ?? false;
    this.status = details.status;
    this.providerCode = details.providerCode;
    this.providerRequestId = details.providerRequestId;
    this.attempts = details.attempts ?? 0;
    this.retryAfterMs = details.retryAfterMs;
    this.metadata = details.metadata;
    this.issues = details.issues;
    this.toolName = details.toolName;
  }

  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      retryable: this.retryable,
      status: this.status,
      providerCode: this.providerCode,
      providerRequestId: this.providerRequestId,
      attempts: this.attempts,
      retryAfterMs: this.retryAfterMs,
      metadata: this.metadata,
      issues: this.issues,
      toolName: this.toolName,
    };
  }
}

export type ModelResult<T> = { ok: true; value: T } | { ok: false; error: ModelError };
