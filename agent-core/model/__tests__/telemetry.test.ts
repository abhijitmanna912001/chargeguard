import { describe, expect, it } from "vitest";
import { ModelError, type ResponseMetadata } from "../index";
import { readModelCallMetadata, toModelCallMetadata } from "../telemetry";

// Pure: no network, no clock.

const metadata = (extra: Partial<ResponseMetadata> = {}): ResponseMetadata => ({
  providerRequestId: "chatcmpl-1",
  model: "sarvam-105b",
  finishReason: "stop",
  usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
  latencyMs: 1_500,
  attemptCount: 1,
  ...extra,
});
const success = (m: ResponseMetadata) => ({ ok: true as const, value: { metadata: m } });
const failure = (error: ModelError) => ({ ok: false as const, error });

describe("toModelCallMetadata", () => {
  it("success: counts, latency, tokens and response fields", () => {
    expect(toModelCallMetadata(success(metadata()))).toEqual({
      status: "succeeded",
      attemptCount: 1,
      latencyMs: 1_500,
      totalTokens: 120,
      providerRequestId: "chatcmpl-1",
      model: "sarvam-105b",
      finishReason: "stop",
    });
  });

  it("success without usage: totalTokens null", () => {
    expect(toModelCallMetadata(success(metadata({ usage: undefined }))).totalTokens).toBeNull();
  });

  it("provider error: kind, attempts, latency, request id from the error body, no tokens", () => {
    const error = new ModelError("provider_error", "Sarvam server error (HTTP 500)", {
      status: 500,
      providerRequestId: "req_500",
      attemptCount: 3,
      latencyMs: 1_800,
    });
    expect(toModelCallMetadata(failure(error))).toEqual({
      status: "failed",
      failureKind: "provider_error",
      attemptCount: 3,
      latencyMs: 1_800,
      totalTokens: null,
      providerRequestId: "req_500",
    });
  });

  it("budget exhaustion and a missing key carry their own timing", () => {
    const budget = new ModelError("budget_exhausted", "budget", { attemptCount: 2, latencyMs: 24_500 });
    const missingKey = new ModelError("missing_api_key", "SARVAM_API_KEY is not set", { attemptCount: 0, latencyMs: 1 });
    expect(toModelCallMetadata(failure(budget))).toMatchObject({ failureKind: "budget_exhausted", attemptCount: 2, latencyMs: 24_500 });
    expect(toModelCallMetadata(failure(missingKey))).toEqual({
      status: "failed",
      failureKind: "missing_api_key",
      attemptCount: 0,
      latencyMs: 1,
      totalTokens: null,
    });
  });

  it("invalid response with metadata: keeps the response fields and tokens", () => {
    const error = new ModelError("schema_validation_failed", "Model output failed schema validation", {
      attemptCount: 1,
      latencyMs: 900,
      metadata: metadata({ latencyMs: 900 }),
    });
    expect(toModelCallMetadata(failure(error))).toMatchObject({ status: "failed", totalTokens: 120, finishReason: "stop" });
  });

  it("never carries the error message, issues or status text", () => {
    const error = new ModelError("auth_failed", "Sarvam rejected the API key (HTTP 401 sk_live_secret)", {
      status: 401,
      issues: [{ path: "x", message: "evidence text" }],
      attemptCount: 1,
      latencyMs: 10,
    });
    expect(JSON.stringify(toModelCallMetadata(failure(error)))).not.toMatch(/sk_live_secret|evidence text|rejected/);
  });
});

describe("readModelCallMetadata (untrusted dependency results)", () => {
  it("passes valid telemetry through unchanged", () => {
    expect(readModelCallMetadata(success(metadata()))).toEqual(toModelCallMetadata(success(metadata())));
  });

  it("drops free-text ids, models and finish reasons but keeps the numbers", () => {
    const leaky = metadata({
      providerRequestId: "Mera order nahi aaya, refund chahiye",
      model: "x".repeat(500),
      finishReason: "stop because the customer said <script>",
    });
    expect(readModelCallMetadata(success(leaky))).toEqual({
      status: "succeeded",
      attemptCount: 1,
      latencyMs: 1_500,
      totalTokens: 120,
    });
  });

  it("is null for an unknown failure kind", () => {
    const fake = { ok: false, error: { kind: "something the customer wrote", attemptCount: 1, latencyMs: 5 } };
    expect(readModelCallMetadata(fake)).toBeNull();
  });

  it("is null for malformed counts", () => {
    expect(readModelCallMetadata(success(metadata({ attemptCount: -1 })))).toBeNull();
    expect(readModelCallMetadata(success(metadata({ latencyMs: Number.NaN })))).toBeNull();
    expect(readModelCallMetadata(success(metadata({ usage: { promptTokens: 1, completionTokens: 1, totalTokens: 1.5 } })))).toBeNull();
  });

  it("is null for something that is not a result at all", () => {
    expect(readModelCallMetadata(undefined)).toBeNull();
    expect(readModelCallMetadata("ok")).toBeNull();
    expect(readModelCallMetadata({ ok: true })).toBeNull();
  });
});
