import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { z } from "zod";
import {
  ActionLogEntrySchema,
  FlagSchema,
  RecommendationSchema,
  type ActionLogEntry,
  type Dispute,
  type ModelOutput,
  type Recommendation,
} from "../../contracts";
import {
  createMockCallSarvam,
  InvalidDisputeError,
  runAgent,
  type AgentRunResult,
  type MockReply,
  type RunAgentDependencies,
  type StructuredCallSarvam,
} from "../index";
import { MAX_TOKENS_CAP, ModelError, type ModelCallMetadata, type StructuredRequest } from "../model";
import { parseEnvelope, parseStructured } from "../model/parse";
import type { ModelContext } from "../model-context";

// Synthetic data only. The model is always a mock; no network, no database.

const NOW = "2026-11-05T10:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const HOUR = 3_600_000;
const DISPUTE_ID = "disp_run_001";
const TXN_ID = "txn_run_001";
const AMOUNT = 249_900;
const COLLECTED = "2026-11-02T04:31:00.000Z";
/** Sentinel customer text: it may reach the model, never the logs or errors. */
const CUSTOMER_TEXT = "SENTINEL-CUSTOMER-TEXT parcel nahi aaya";

const iso = (offsetMs: number) => new Date(NOW_MS + offsetMs).toISOString();
type Ev = Dispute["evidence"][number];

const base = (id: string, disputeId = DISPUTE_ID) => ({ id, disputeId, collectedAt: COLLECTED });

const txn = (id = "ev_txn", extra: Partial<Ev> = {}): Ev =>
  ({
    ...base(id),
    type: "transaction",
    transactionId: TXN_ID,
    amount: AMOUNT,
    status: "success",
    occurredAt: "2026-10-20T08:15:00.000Z",
    ...extra,
  }) as Ev;

const delivery = (id = "ev_pod", status: "delivered" | "returned_to_origin" | "in_transit" = "delivered"): Ev => ({
  ...base(id),
  type: "delivery_proof",
  kind: "courier_tracking",
  status,
  ...(status === "delivered" ? { deliveredAt: "2026-10-24T11:40:00.000Z" } : {}),
  reference: `AWB-${id}`,
});

const message = (id = "ev_msg", disputeId = DISPUTE_ID): Ev => ({
  ...base(id, disputeId),
  type: "customer_message",
  channel: "whatsapp",
  sentAt: "2026-10-24T13:05:00.000Z",
  content: CUSTOMER_TEXT,
  language: "hi",
});

const refund = (id = "ev_refund", amount = 50_000): Ev => ({
  ...base(id),
  type: "refund",
  amount,
  status: "issued",
  issuedAt: "2026-10-25T10:00:00.000Z",
});

function makeDispute(overrides: Partial<Dispute> = {}): Dispute {
  return {
    id: DISPUTE_ID,
    transactionId: TXN_ID,
    amount: AMOUNT,
    reasonCode: "GOODS_NOT_RECEIVED",
    deadline: iso(10 * 24 * HOUR),
    createdAt: "2026-11-02T04:30:00.000Z",
    status: "received",
    evidence: [txn(), delivery(), message()],
    ...overrides,
  };
}

const output = (overrides: Partial<ModelOutput> = {}): ModelOutput => ({
  action: "defend",
  confidence: 0.9,
  reasoning: "Courier tracking shows delivery before the complaint.",
  evidenceRefs: ["ev_txn", "ev_pod"],
  ...overrides,
});

/** A mock callSarvam that records every request it receives. */
function recordingModel(reply: MockReply) {
  const inner = createMockCallSarvam(reply);
  const requests: StructuredRequest<z.ZodType>[] = [];
  const call: StructuredCallSarvam = (request, options) => {
    requests.push(request);
    return inner(request, options);
  };
  return { call, requests };
}

function makeDeps(callSarvam: StructuredCallSarvam): RunAgentDependencies {
  let n = 0;
  return { callSarvam, now: () => new Date(NOW), createId: () => `id${++n}` };
}

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

async function run(dispute: Dispute, reply: MockReply = output()) {
  const model = recordingModel(reply);
  const result = await runAgent(dispute, makeDeps(model.call));
  const context = model.requests[0] ? (JSON.parse(model.requests[0].messages[0].content!) as ModelContext) : undefined;
  return { ...result, requests: model.requests, context };
}

const outcomes = (log: ActionLogEntry[]) => log.map((e) => e.outcome);

// Every test injects a mock callSarvam. As a backstop, any network attempt
// fails loudly instead of reaching Sarvam.
const networkGuard = vi.fn<typeof fetch>(async () => {
  throw new Error("network access is not allowed in unit tests");
});

beforeEach(() => {
  networkGuard.mockClear();
  vi.stubGlobal("fetch", networkGuard);
});

afterEach(() => {
  expect(networkGuard).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("input validation", () => {
  const rejects = async (dispute: unknown) => {
    const error = await runAgent(dispute as Dispute, makeDeps(createMockCallSarvam(output()))).catch((e) => e);
    expect(error).toBeInstanceOf(InvalidDisputeError);
    return error as InvalidDisputeError;
  };

  it("accepts a valid dispute", async () => {
    await expect(runAgent(makeDispute(), makeDeps(createMockCallSarvam(output())))).resolves.toBeDefined();
  });

  it("rejects an empty dispute id", async () => {
    const error = await rejects(makeDispute({ id: "" }));
    expect(error.issues.map((i) => i.path)).toContain("id");
  });

  it("rejects a non-integer or negative amount", async () => {
    expect((await rejects(makeDispute({ amount: 12.5 }))).issues[0].path).toBe("amount");
    expect((await rejects(makeDispute({ amount: -1 }))).issues[0].path).toBe("amount");
  });

  it("rejects an invalid timestamp", async () => {
    expect((await rejects(makeDispute({ deadline: "next tuesday" }))).issues[0].path).toBe("deadline");
  });

  it("rejects an invalid evidence record", async () => {
    const bad = { ...message(), sentAt: "yesterday" } as Ev;
    const error = await rejects(makeDispute({ evidence: [txn(), bad] }));
    expect(error.issues[0].path).toBe("evidence.1.sentAt");
  });

  it("rejects a malformed outer structure", async () => {
    await rejects(null);
    await rejects("disp_1");
    await rejects({ ...makeDispute(), evidence: "none" });
  });

  it("is a typed error carrying safe issues only", async () => {
    const bad = { ...message(), sentAt: "yesterday" } as Ev;
    const error = await rejects(makeDispute({ evidence: [bad], amount: -5 }));
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("InvalidDisputeError");
    for (const issue of error.issues) expect(Object.keys(issue).sort()).toEqual(["message", "path"]);
    const serialized = JSON.stringify({ message: error.message, issues: error.issues, stack: error.stack });
    expect(serialized).not.toContain("SENTINEL");
    expect(serialized).not.toContain("yesterday");
  });

  it("does not call the model for an invalid dispute", async () => {
    const model = recordingModel(output());
    await expect(runAgent(makeDispute({ id: "" }), makeDeps(model.call))).rejects.toThrow(InvalidDisputeError);
    expect(model.requests).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Evidence assessment
// ---------------------------------------------------------------------------

describe("evidence assessment", () => {
  it("complete evidence with a confident defend is defended with no flags", async () => {
    const r = await run(makeDispute());
    expect(r.recommendation).toMatchObject({ finalAction: "defend", flags: [] });
    expect(r.recommendation.overrideReason).toBeUndefined();
  });

  it("missing evidence is flagged and blocks defend", async () => {
    const r = await run(makeDispute({ evidence: [txn()] }), output({ evidenceRefs: ["ev_txn"] }));
    expect(r.recommendation.flags).toContain("missing_evidence");
    expect(r.recommendation.finalAction).toBe("escalate");
    expect(r.context!.evidenceCompleteness.missingEvidenceTypes).toEqual(["delivery_proof"]);
  });

  it("contradictory delivery evidence is flagged and blocks defend", async () => {
    const r = await run(makeDispute({ evidence: [txn(), delivery("ev_pod"), delivery("ev_rto", "returned_to_origin")] }));
    expect(r.recommendation.flags).toContain("contradictory_records");
    expect(r.recommendation.finalAction).toBe("escalate");
    expect(r.context!.delivery.statuses).toEqual(["delivered", "returned_to_origin"]);
  });

  it("excludes foreign evidence and flags the dispute", async () => {
    const r = await run(makeDispute({ evidence: [txn(), delivery(), message("ev_foreign", "disp_other")] }));
    expect(r.context!.evidence.map((e) => e.id)).toEqual(["ev_txn", "ev_pod"]);
    expect(r.recommendation.flags).toContain("contradictory_records");
    expect(JSON.stringify(r)).not.toContain("ev_foreign");
  });

  it("preserves evidence flags in the recommendation", async () => {
    const evidence = [txn("ev_txn", { status: "failed" }), delivery(), refund()];
    const r = await run(makeDispute({ evidence }), output({ action: "escalate" }));
    expect(r.recommendation.flags).toEqual(["refund_issued", "transaction_not_successful"]);
  });

  it("sends only trusted evidence records to the model", async () => {
    const evidence = [txn(), delivery(), message(), message("ev_msg_x", "disp_other")];
    const r = await run(makeDispute({ evidence }));
    expect(r.context!.evidence).toEqual([txn(), delivery(), message()]);
    expect(r.context!.evidence.every((e) => e.disputeId === DISPUTE_ID)).toBe(true);
    // Legitimate customer context does reach the model.
    expect(r.requests[0].messages[0].content).toContain(CUSTOMER_TEXT);
  });

  it("never puts untrusted references in the model context", async () => {
    const otherTxn = txn("ev_txn_other", { transactionId: "txn_someone_else" });
    const evidence = [txn(), delivery(), otherTxn, message("ev_foreign", "disp_other")];
    const r = await run(makeDispute({ evidence }));
    const request = JSON.stringify(r.requests[0]);
    expect(request).not.toContain("ev_txn_other");
    expect(request).not.toContain("txn_someone_else");
    expect(request).not.toContain("ev_foreign");
    // Issue codes reach the model; their messages (which name records) do not.
    expect(r.context!.evidenceIssues).toContainEqual({ code: "foreign_dispute", severity: "error" });
    expect(r.context!.evidenceIssues.every((i) => Object.keys(i).length === 2)).toBe(true);
  });

  it("gives the model minimal dispute metadata and the rule flags", async () => {
    const r = await run(makeDispute({ deadline: iso(20 * HOUR) }));
    expect(r.context!.dispute).toEqual({
      id: DISPUTE_ID,
      reasonCode: "GOODS_NOT_RECEIVED",
      amountPaise: AMOUNT,
      currency: "INR",
      deadline: iso(20 * HOUR),
      createdAt: "2026-11-02T04:30:00.000Z",
    });
    expect(r.context!.ruleFlags).toEqual(["deadline_at_risk"]);
  });

  it("an unsupported reason code still runs and blocks defend", async () => {
    const r = await run(makeDispute({ reasonCode: "UNKNOWN_CODE" }));
    expect(r.recommendation.flags).toContain("unsupported_reason_code");
    expect(r.recommendation.finalAction).toBe("escalate");
  });
});

// ---------------------------------------------------------------------------
// Model behaviour
// ---------------------------------------------------------------------------

describe("model behaviour", () => {
  it("sends a structured, capped request with the ModelOutput schema", async () => {
    const r = await run(makeDispute());
    const req = r.requests[0];
    expect(req.mode).toBe("structured");
    expect(req.maxTokens).toBe(MAX_TOKENS_CAP);
    expect(req.systemPrompt).toMatch(/recommendation only/i);
    expect(req.messages).toHaveLength(1);
  });

  it("successful defend", async () => {
    const r = await run(makeDispute());
    expect(r.recommendation.modelOutput).toEqual(output());
    expect(r.recommendation.finalAction).toBe("defend");
  });

  it("successful accept", async () => {
    const r = await run(makeDispute(), output({ action: "accept", evidenceRefs: [] }));
    expect(r.recommendation).toMatchObject({ finalAction: "accept", flags: [] });
  });

  it("successful escalate", async () => {
    const r = await run(makeDispute(), output({ action: "escalate" }));
    expect(r.recommendation.finalAction).toBe("escalate");
    expect(r.recommendation.overrideReason).toBeUndefined();
  });

  it("confidence exactly 0.7 is not low", async () => {
    const r = await run(makeDispute(), output({ confidence: 0.7 }));
    expect(r.recommendation.flags).not.toContain("low_confidence");
    expect(r.recommendation.finalAction).toBe("defend");
  });

  it("confidence below 0.7 is flagged and escalated", async () => {
    const r = await run(makeDispute(), output({ confidence: 0.69 }));
    expect(r.recommendation.flags).toEqual(["low_confidence"]);
    expect(r.recommendation.finalAction).toBe("escalate");
  });

  const failures: [string, ModelError, string][] = [
    ["API failure", new ModelError("provider_error", "Sarvam server error (HTTP 500)", { status: 500, attemptCount: 3 }), "provider_error"],
    ["rate limit exhaustion", new ModelError("rate_limited", "Sarvam rate limit hit (HTTP 429)", { attemptCount: 3 }), "rate_limited"],
    ["missing API key", new ModelError("missing_api_key", "SARVAM_API_KEY is not set"), "missing_api_key"],
    ["timeout", new ModelError("timeout", "No response from Sarvam within 30000ms", { retryable: true, attemptCount: 3 }), "timeout"],
    ["truncation", new ModelError("truncated", "Sarvam stopped at max_tokens; the output is incomplete"), "truncated"],
  ];
  for (const [label, error, kind] of failures) {
    it(`${label} escalates with model_failure and keeps evidence flags`, async () => {
      const r = await run(makeDispute({ evidence: [txn()] }), error);
      expect(r.recommendation).toMatchObject({ modelOutput: null, finalAction: "escalate" });
      expect(r.recommendation.flags).toEqual(["missing_evidence", "model_failure"]);
      expect(outcomes(r.actionLog)).toContain(`model_failure:${kind}`);
      expect(JSON.stringify(r.actionLog)).not.toContain(error.message);
    });
  }

  it("malformed model output is a model failure", async () => {
    const bad = { ...output(), action: "win" } as unknown as ModelOutput;
    const r = await run(makeDispute(), bad);
    expect(r.recommendation.modelOutput).toBeNull();
    expect(outcomes(r.actionLog)).toContain("model_failure:schema_validation_failed");
  });

  it("an output that invents finalAction is rejected", async () => {
    const bad = { ...output(), finalAction: "defend" } as unknown as ModelOutput;
    const r = await run(makeDispute(), bad);
    expect(r.recommendation.flags).toEqual(["model_failure"]);
  });

  it("a dependency that returns an invalid output despite ok: true is a model failure", async () => {
    const liar: StructuredCallSarvam = async () =>
      ({ ok: true, value: { mode: "structured", output: { action: "defend" }, metadata: { latencyMs: 0, attemptCount: 1 } } }) as never;
    const r = await runAgent(makeDispute(), makeDeps(liar));
    expect(r.recommendation.modelOutput).toBeNull();
    expect(outcomes(r.actionLog)).toContain("model_failure:schema_validation_failed");
  });

  it("a dependency that throws is a model failure and leaks nothing", async () => {
    const thrower: StructuredCallSarvam = async () => {
      throw new Error(`boom ${CUSTOMER_TEXT} sk_live_secret`);
    };
    const r = await runAgent(makeDispute(), makeDeps(thrower));
    expect(r.recommendation).toMatchObject({ modelOutput: null, finalAction: "escalate", flags: ["model_failure"] });
    expect(outcomes(r.actionLog)).toContain("model_failure:exception");
    expect(JSON.stringify(r)).not.toMatch(/boom|sk_live_secret|SENTINEL/);
  });

  it("citing an evidence id that does not exist is a model failure", async () => {
    const r = await run(makeDispute(), output({ evidenceRefs: ["ev_txn", "ev_made_up"] }));
    expect(r.recommendation).toMatchObject({ modelOutput: null, finalAction: "escalate", flags: ["model_failure"] });
    expect(outcomes(r.actionLog)).toContain("model_failure:untrusted_evidence_ref");
    expect(JSON.stringify(r)).not.toContain("ev_made_up");
  });

  it("citing an excluded foreign evidence id is a model failure", async () => {
    const evidence = [txn(), delivery(), message("ev_foreign", "disp_other")];
    const r = await run(makeDispute({ evidence }), output({ evidenceRefs: ["ev_pod", "ev_foreign"] }));
    expect(r.recommendation.modelOutput).toBeNull();
    expect(r.recommendation.flags).toEqual(["contradictory_records", "model_failure"]);
    expect(JSON.stringify(r)).not.toContain("ev_foreign");
  });

  it("regression: a truncated structured response (finish_reason=length) escalates", async () => {
    // A controlled mock that runs the provider's real response parser on a
    // canned truncated completion, so the finish_reason handling is exercised
    // without any transport.
    const completion = {
      id: "chatcmpl-test",
      model: "sarvam-105b",
      choices: [{ finish_reason: "length", message: { content: '{"action":"defend","confidence":0.9,"PARTIAL-OUTPUT' } }],
      usage: { prompt_tokens: 900, completion_tokens: MAX_TOKENS_CAP, total_tokens: 900 + MAX_TOKENS_CAP },
    };
    const requestedMaxTokens: (number | undefined)[] = [];
    const truncating: StructuredCallSarvam = async <Schema extends z.ZodType>(request: StructuredRequest<Schema>) => {
      requestedMaxTokens.push(request.maxTokens);
      const envelope = parseEnvelope(completion, 0, 1);
      if (!envelope.ok) return envelope;
      return parseStructured(envelope.choice, request.schema as unknown as z.ZodType<z.output<Schema>>, envelope.metadata);
    };

    const r = await runAgent(makeDispute(), makeDeps(truncating));

    expect(requestedMaxTokens).toEqual([MAX_TOKENS_CAP]);
    expect(r.recommendation).toMatchObject({ modelOutput: null, finalAction: "escalate", flags: ["model_failure"] });
    expect(outcomes(r.actionLog)).toContain("model_failure:truncated");
    expect(JSON.stringify(r)).not.toContain("PARTIAL-OUTPUT");
  });

  it("a long but valid evidence context grows the prompt, not max_tokens", async () => {
    const messages = Array.from({ length: 150 }, (_, i) => ({ ...message(`ev_msg_${i}`), content: "x".repeat(2_000) }) as Ev);
    const r = await run(makeDispute({ evidence: [txn(), delivery(), ...messages] }));
    expect(r.context!.evidence).toHaveLength(152);
    expect(r.requests[0].messages[0].content!.length).toBeGreaterThan(300_000);
    expect(r.requests[0].maxTokens).toBe(MAX_TOKENS_CAP);
    expect(r.recommendation.finalAction).toBe("defend");
  });

  it("always calls the injected callSarvam, exactly once", async () => {
    const model = recordingModel(output());
    await runAgent(makeDispute(), makeDeps(model.call));
    expect(model.requests).toHaveLength(1);
  });

  it("has no production Sarvam fallback", () => {
    // @ts-expect-error callSarvam is required.
    const missing: RunAgentDependencies = { now: () => new Date(NOW) };
    expect(missing).toBeDefined();
    // run-agent.ts neither imports the provider module nor calls callSarvam directly.
    const source = readFileSync(fileURLToPath(new URL("../run-agent.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/from\s+["']\.\/model(\/sarvam|\/index)?["']/);
    expect(source).not.toMatch(/(?<![.\w])callSarvam\s*\(/);
    expect(source).toMatch(/deps\?\.callSarvam\)/);
  });
});

// ---------------------------------------------------------------------------
// Deterministic policies, end to end
// ---------------------------------------------------------------------------

describe("deterministic policies", () => {
  it("amount exactly 1,000,000 paise is within the limit", async () => {
    const evidence = [txn("ev_txn", { amount: 1_000_000 }), delivery()];
    const r = await run(makeDispute({ amount: 1_000_000, evidence }));
    expect(r.recommendation.flags).not.toContain("amount_over_limit");
    expect(r.recommendation.finalAction).toBe("defend");
  });

  it("amount above 1,000,000 paise overrides a defend recommendation", async () => {
    const evidence = [txn("ev_txn", { amount: 1_000_001 }), delivery()];
    const r = await run(makeDispute({ amount: 1_000_001, evidence }));
    expect(r.recommendation).toMatchObject({ finalAction: "escalate", flags: ["amount_over_limit"] });
    expect(r.recommendation.overrideReason).toMatch(/limit/);
    expect(r.recommendation.modelOutput?.action).toBe("defend");
  });

  it("deadline exactly 48 hours away is not at risk", async () => {
    const r = await run(makeDispute({ deadline: iso(48 * HOUR) }));
    expect(r.recommendation.flags).toEqual([]);
    expect(outcomes(r.actionLog)).toContain("deadline_ok");
  });

  it("deadline less than 48 hours away is at risk", async () => {
    const r = await run(makeDispute({ deadline: iso(48 * HOUR - 1) }));
    expect(r.recommendation.flags).toEqual(["deadline_at_risk"]);
  });

  it("deadline under 24 hours away is at risk", async () => {
    const r = await run(makeDispute({ deadline: iso(5 * HOUR) }));
    expect(r.recommendation.flags).toEqual(["deadline_at_risk"]);
    expect(r.actionLog.find((e) => e.outcome === "deadline_at_risk")?.summary).toMatch(/5\.0 hour/);
  });

  it("expired deadline blocks defend but is not turned into accept", async () => {
    const r = await run(makeDispute({ deadline: iso(-HOUR) }));
    expect(r.recommendation).toMatchObject({ finalAction: "escalate", flags: ["deadline_expired"] });
    const accepted = await run(makeDispute({ deadline: iso(0) }), output({ action: "accept" }));
    expect(accepted.recommendation).toMatchObject({ finalAction: "accept", flags: ["deadline_expired"] });
  });

  it("deadline risk alone does not block defend", async () => {
    const r = await run(makeDispute({ deadline: iso(HOUR) }));
    expect(r.recommendation.finalAction).toBe("defend");
  });

  it("refund_issued alone does not block defend", async () => {
    const r = await run(makeDispute({ evidence: [txn(), delivery(), refund()] }));
    expect(r.recommendation).toMatchObject({ finalAction: "defend", flags: ["refund_issued"] });
  });

  it("low confidence overrides a defend recommendation", async () => {
    const r = await run(makeDispute(), output({ confidence: 0.4 }));
    expect(r.recommendation.overrideReason).toMatch(/confidence/);
    expect(r.recommendation.finalAction).toBe("escalate");
  });

  it("blocking evidence overrides a defend recommendation", async () => {
    const r = await run(makeDispute({ evidence: [txn("ev_txn", { status: "failed" }), delivery()] }));
    expect(r.recommendation.finalAction).toBe("escalate");
    expect(r.recommendation.overrideReason).toContain("transaction_not_successful");
  });

  it("accept is not changed when no confirmed rule applies", async () => {
    const r = await run(makeDispute({ evidence: [txn()] }), output({ action: "accept", evidenceRefs: ["ev_txn"] }));
    expect(r.recommendation).toMatchObject({ finalAction: "accept", flags: ["missing_evidence"] });
    expect(r.recommendation.overrideReason).toBeUndefined();
  });

  it("escalate stays escalate under every rule", async () => {
    const evidence = [txn("ev_txn", { amount: 2_000_000 }), delivery()];
    const r = await run(makeDispute({ amount: 2_000_000, evidence, deadline: iso(-1) }), output({ action: "escalate" }));
    expect(r.recommendation.finalAction).toBe("escalate");
    expect(r.recommendation.overrideReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Recommendation and action log
// ---------------------------------------------------------------------------

describe("recommendation and action log", () => {
  const scenarios: [string, () => Promise<AgentRunResult>][] = [
    ["defend", () => run(makeDispute())],
    ["blocked", () => run(makeDispute({ evidence: [txn()] }))],
    ["model failure", () => run(makeDispute(), new ModelError("timeout", "t"))],
    ["untrusted ref", () => run(makeDispute(), output({ evidenceRefs: ["nope"] }))],
  ];

  for (const [label, scenario] of scenarios) {
    describe(label, () => {
      it("passes the contract schemas", async () => {
        const r = await scenario();
        expect(RecommendationSchema.safeParse(r.recommendation).success).toBe(true);
        for (const e of r.actionLog) expect(ActionLogEntrySchema.safeParse(e).success).toBe(true);
      });

      it("uses rec_/log_ ids that are all unique", async () => {
        const r = await scenario();
        expect(r.recommendation.id).toMatch(/^rec_/);
        for (const e of r.actionLog) expect(e.id).toMatch(/^log_/);
        const ids = [r.recommendation.id, ...r.actionLog.map((e) => e.id)];
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("has strictly increasing timestamps for one dispute, and no persistence steps", async () => {
        const r = await scenario();
        const times = r.actionLog.map((e) => Date.parse(e.timestamp));
        for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
        expect(r.actionLog.every((e) => e.disputeId === DISPUTE_ID)).toBe(true);
        expect(r.recommendation.disputeId).toBe(DISPUTE_ID);
        for (const e of r.actionLog) expect(["detect", "gather", "validate", "decide"]).toContain(e.step);
      });

      it("never logs customer message content", async () => {
        const r = await scenario();
        expect(JSON.stringify(r.actionLog)).not.toContain("SENTINEL");
      });
    });
  }

  it("is deterministic with injected ids and clock", async () => {
    const r = await run(makeDispute());
    expect(r.actionLog.map((e) => e.id)).toEqual(r.actionLog.map((_, i) => `log_id${i + 1}`));
    expect(r.recommendation.id).toBe(`rec_id${r.actionLog.length + 1}`);
    expect(r.actionLog.map((e) => e.timestamp)).toEqual(r.actionLog.map((_, i) => iso(i)));
    expect(r.recommendation.createdAt).toBe(r.actionLog.at(-1)!.timestamp);
    const again = await run(makeDispute());
    expect({ recommendation: again.recommendation, actionLog: again.actionLog }).toEqual({
      recommendation: r.recommendation,
      actionLog: r.actionLog,
    });
  });

  it("logs every stage in execution order with the right actors", async () => {
    const r = await run(makeDispute());
    expect(r.actionLog.map((e) => [e.step, e.actor, e.outcome])).toEqual([
      ["detect", "system", "dispute_detected"],
      ["gather", "system", "evidence_assessed"],
      ["validate", "rule", "evidence_clear"],
      ["validate", "rule", "amount_within_limit"],
      ["validate", "rule", "deadline_ok"],
      ["decide", "agent", "model_recommended_defend"],
      ["validate", "rule", "model_evidence_refs_trusted"],
      ["validate", "rule", "confidence_ok"],
      ["decide", "rule", "defend"],
    ]);
    const final = r.actionLog.at(-1)!;
    expect(final).toMatchObject({ ruleId: "rule_model_recommendation", confidence: 0.9, evidenceRefs: ["ev_txn", "ev_pod"] });
  });

  it("log evidenceRefs only ever name trusted records", async () => {
    const evidence = [txn(), delivery(), message("ev_foreign", "disp_other")];
    const r = await run(makeDispute({ evidence }));
    const trusted = new Set(["ev_txn", "ev_pod"]);
    for (const e of r.actionLog) for (const ref of e.evidenceRefs) expect(trusted.has(ref)).toBe(true);
  });

  it("monotonic timestamps even if the clock goes backwards", async () => {
    let tick = 0;
    const deps: RunAgentDependencies = {
      now: () => new Date(NOW_MS - 1000 * tick++),
      callSarvam: createMockCallSarvam(output()),
    };
    const r = await runAgent(makeDispute(), deps);
    const times = r.actionLog.map((e) => Date.parse(e.timestamp));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it("override reason is present whenever the final action differs from the model", async () => {
    const runs = await Promise.all([
      run(makeDispute({ amount: 1_500_000, evidence: [txn("ev_txn", { amount: 1_500_000 }), delivery()] })),
      run(makeDispute(), output({ confidence: 0.1 })),
      run(makeDispute({ evidence: [txn()] }), output({ evidenceRefs: ["ev_txn"] })),
      run(makeDispute(), output({ action: "accept", confidence: 0.3 })),
    ]);
    for (const { recommendation: rec } of runs) {
      expect(rec.finalAction).not.toBe(rec.modelOutput!.action);
      expect(rec.overrideReason).toBeTruthy();
    }
  });

  it("deduplicates flags and keeps FlagSchema order", async () => {
    const evidence = [
      txn("ev_txn", { amount: 3_000_000, status: "failed" }),
      delivery("ev_pod"),
      delivery("ev_rto", "returned_to_origin"),
      message("ev_foreign", "disp_other"),
      refund("ev_refund", 100),
    ];
    const r = await run(makeDispute({ amount: 3_000_000, evidence, deadline: iso(HOUR) }), output({ confidence: 0.2 }));
    const flags = r.recommendation.flags;
    expect(new Set(flags).size).toBe(flags.length);
    expect(flags).toEqual(FlagSchema.options.filter((f) => flags.includes(f)));
    expect(flags).toEqual([
      "contradictory_records",
      "amount_over_limit",
      "low_confidence",
      "deadline_at_risk",
      "refund_issued",
      "transaction_not_successful",
    ]);
  });

  it("falls back to unique random ids when createId repeats or is omitted", async () => {
    const repeating = await runAgent(makeDispute(), {
      now: () => new Date(NOW),
      createId: () => "same",
      callSarvam: createMockCallSarvam(output()),
    });
    const omitted = await runAgent(makeDispute(), { now: () => new Date(NOW), callSarvam: createMockCallSarvam(output()) });
    for (const r of [repeating, omitted]) {
      const ids = [r.recommendation.id, ...r.actionLog.map((e) => e.id)];
      expect(new Set(ids).size).toBe(ids.length);
      expect(r.actionLog[0].id).toMatch(/^log_/);
    }
    expect(repeating.actionLog[0].id).toBe("log_same");
    expect(omitted.recommendation.id).toMatch(/^rec_[0-9a-f-]{36}$/);
  });

});

// ---------------------------------------------------------------------------
// Injected clock
// ---------------------------------------------------------------------------

describe("injected clock", () => {
  const withClock = (now: () => Date) =>
    runAgent(makeDispute(), { now, createId: ids(), callSarvam: createMockCallSarvam(output()) });

  function expectValidTimeline(r: AgentRunResult) {
    expect(RecommendationSchema.safeParse(r.recommendation).success).toBe(true);
    for (const e of r.actionLog) expect(ActionLogEntrySchema.safeParse(e).success).toBe(true);
    const times = r.actionLog.map((e) => Date.parse(e.timestamp));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  }

  /** The run used the system clock: timestamps fall around the real time of the call. */
  async function expectSystemClockFallback(now: () => Date) {
    const before = Date.now();
    const r = await withClock(now);
    const after = Date.now();
    expectValidTimeline(r);
    const fallbacks = r.actionLog.filter((e) => e.outcome === "clock_fallback");
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]).toMatchObject({ step: "detect", actor: "system", evidenceRefs: [] });
    expect(r.actionLog.slice(0, 2).map((e) => e.outcome)).toEqual(["dispute_detected", "clock_fallback"]);
    const first = Date.parse(r.actionLog[0].timestamp);
    expect(first).toBeGreaterThanOrEqual(before);
    expect(first).toBeLessThanOrEqual(after + 1);
    // The run itself is unaffected: same decision as with a working clock.
    expect(r.recommendation.finalAction).toBe("defend");
    return r;
  }

  it("uses the injected clock when it works, with no fallback entry", async () => {
    const r = await withClock(() => new Date(NOW));
    expectValidTimeline(r);
    expect(r.actionLog[0].timestamp).toBe(NOW);
    expect(outcomes(r.actionLog)).not.toContain("clock_fallback");
  });

  it("falls back to the system clock when now() returns an Invalid Date", async () => {
    await expectSystemClockFallback(() => new Date("nope"));
  });

  it("falls back to the system clock when now() throws, without logging the message", async () => {
    const r = await expectSystemClockFallback(() => {
      throw new Error("clock exploded sk_live_secret");
    });
    expect(JSON.stringify(r)).not.toMatch(/exploded|sk_live_secret/);
  });

  it("falls back when now() returns a Date outside the ISO timestamp range", async () => {
    await expectSystemClockFallback(() => new Date(Date.UTC(20000, 0, 1)));
  });

  it("falls back when now() returns something that is not a Date", async () => {
    await expectSystemClockFallback(() => "2026-11-05" as unknown as Date);
  });

  it("logs the fallback once when the clock breaks mid-run, and stays ordered", async () => {
    let calls = 0;
    const r = await withClock(() => (++calls <= 3 ? new Date(NOW) : new Date(Number.NaN)));
    expectValidTimeline(r);
    expect(outcomes(r.actionLog).filter((o) => o === "clock_fallback")).toHaveLength(1);
    expect(r.actionLog[0].timestamp).toBe(NOW);
  });

  it("still throws InvalidDisputeError, not a fallback result, when the clock is also broken", async () => {
    const broken = () => {
      throw new Error("clock");
    };
    const model = recordingModel(output());
    await expect(runAgent(makeDispute({ amount: -1 }), { now: broken, callSarvam: model.call })).rejects.toBeInstanceOf(
      InvalidDisputeError,
    );
    expect(model.requests).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Model-call telemetry
// ---------------------------------------------------------------------------

describe("model-call telemetry", () => {
  /** A controlled model that reports the given telemetry, as the real callSarvam would. */
  const timedModel = (metadata: { attemptCount: number; latencyMs: number; totalTokens?: number }): StructuredCallSarvam =>
    async <Schema extends z.ZodType>(request: StructuredRequest<Schema>) => {
      const output = request.schema.parse(defaultOutput) as z.output<Schema>;
      return {
        ok: true as const,
        value: {
          mode: "structured" as const,
          output,
          metadata: {
            providerRequestId: "chatcmpl-telemetry",
            model: "sarvam-105b",
            finishReason: "stop",
            ...(metadata.totalTokens !== undefined
              ? { usage: { promptTokens: 1, completionTokens: 1, totalTokens: metadata.totalTokens } }
              : {}),
            latencyMs: metadata.latencyMs,
            attemptCount: metadata.attemptCount,
          },
        },
      };
    };
  const defaultOutput = output();

  function expectContractValid(r: AgentRunResult) {
    expect(RecommendationSchema.safeParse(r.recommendation).success).toBe(true);
    for (const e of r.actionLog) expect(ActionLogEntrySchema.safeParse(e).success).toBe(true);
    // Telemetry never leaks into the persisted structures.
    expect(JSON.stringify([r.recommendation, r.actionLog])).not.toMatch(/attemptCount|latencyMs|totalTokens|chatcmpl-telemetry/);
  }

  it("exposes success telemetry to the caller, with the run unchanged", async () => {
    const r = await runAgent(makeDispute(), makeDeps(timedModel({ attemptCount: 2, latencyMs: 12_800, totalTokens: 432 })));
    expectContractValid(r);
    expect(r.recommendation.finalAction).toBe("defend");
    expect(r.modelCallMetadata).toEqual({
      status: "succeeded",
      attemptCount: 2,
      latencyMs: 12_800,
      totalTokens: 432,
      providerRequestId: "chatcmpl-telemetry",
      model: "sarvam-105b",
      finishReason: "stop",
    });
  });

  it("reports totalTokens as null when the provider sent no usage", async () => {
    const r = await runAgent(makeDispute(), makeDeps(timedModel({ attemptCount: 1, latencyMs: 900 })));
    expect(r.modelCallMetadata).toMatchObject({ status: "succeeded", attemptCount: 1, totalTokens: null });
  });

  it("exposes failure telemetry while the escalation stays unchanged", async () => {
    const error = new ModelError("budget_exhausted", "Model call budget of 25000ms used up after 2 attempt(s); last failure: timeout", {
      attemptCount: 2,
      latencyMs: 25_000,
    });
    const r = await runAgent(makeDispute(), makeDeps(createMockCallSarvam(error)));
    expectContractValid(r);
    expect(r.recommendation).toMatchObject({ modelOutput: null, finalAction: "escalate", flags: ["model_failure"] });
    expect(outcomes(r.actionLog)).toContain("model_failure:budget_exhausted");
    expect(r.modelCallMetadata).toEqual({
      status: "failed",
      failureKind: "budget_exhausted",
      attemptCount: 2,
      latencyMs: 25_000,
      totalTokens: null,
    });
  });

  it("keeps response telemetry for a malformed response", async () => {
    const r = await runAgent(makeDispute(), makeDeps(createMockCallSarvam({ ...output(), action: "win" } as unknown as ModelOutput)));
    expect(r.recommendation.modelOutput).toBeNull();
    expect(r.modelCallMetadata).toMatchObject({
      status: "failed",
      failureKind: "schema_validation_failed",
      attemptCount: 1,
      providerRequestId: "mock-chatcmpl-1",
    });
  });

  it("keeps success telemetry when the rules reject the model's evidence refs", async () => {
    const r = await runAgent(makeDispute(), makeDeps(createMockCallSarvam(output({ evidenceRefs: ["ev_unknown"] }))));
    expect(r.recommendation.flags).toEqual(["model_failure"]);
    // The provider call itself succeeded; the action log records the rejection.
    expect(r.modelCallMetadata).toMatchObject({ status: "succeeded", attemptCount: 1 });
  });

  it("is null when the model is never called", async () => {
    // Only reachable for a valid dispute if evidence assessment fails; see
    // run-agent-failures.test.ts. Here: a dependency that throws reports nothing.
    const thrower: StructuredCallSarvam = async () => {
      throw new Error("boom");
    };
    const r = await runAgent(makeDispute(), makeDeps(thrower));
    expect(r.modelCallMetadata).toBeNull();
  });

  it("is null when an injected dependency returns malformed telemetry", async () => {
    const liar: StructuredCallSarvam = async () =>
      ({ ok: true, value: { mode: "structured", output: output(), metadata: { latencyMs: -5 } } }) as never;
    const r = await runAgent(makeDispute(), makeDeps(liar));
    expect(r.modelCallMetadata).toBeNull();
    expect(r.recommendation.finalAction).toBe("defend");
  });
});

// ---------------------------------------------------------------------------
// Integration and architecture
// ---------------------------------------------------------------------------

describe("integration", () => {
  it("returns exactly recommendation, actionLog and the transient modelCallMetadata", async () => {
    const r = await runAgent(makeDispute(), makeDeps(createMockCallSarvam(output())));
    expect(Object.keys(r).sort()).toEqual(["actionLog", "modelCallMetadata", "recommendation"]);
    expectTypeOf(r).toEqualTypeOf<AgentRunResult>();
    expectTypeOf<AgentRunResult>().toEqualTypeOf<{
      recommendation: Recommendation;
      actionLog: ActionLogEntry[];
      modelCallMetadata: ModelCallMetadata | null;
    }>();
  });

  it("fits the recommendation/actionLog fields of SaveAgentRunInput", async () => {
    // Mirrors lib/services/save-agent-run.ts SaveAgentRunInput structurally;
    // agent-core may not import lib/, so the shape is restated here.
    type SaveAgentRunInputShape = {
      disputeId: string;
      recommendation: Recommendation;
      actionLog: ActionLogEntry[];
      approval: { id: string; requestedAt: string };
    };
    const r = await runAgent(makeDispute(), makeDeps(createMockCallSarvam(output())));
    const input: SaveAgentRunInputShape = { disputeId: DISPUTE_ID, ...r, approval: { id: "apr_1", requestedAt: NOW } };
    for (const item of [input.recommendation, ...input.actionLog]) expect(item.disputeId).toBe(input.disputeId);
  });

  it("requires callSarvam, so MockAgentDeps alone is no longer enough", () => {
    // Same fields as lib/mock/run-agent.ts MockAgentDeps, which stays unchanged.
    type MockAgentDepsShape = { now: () => Date; createId?: () => string };
    expectTypeOf<MockAgentDepsShape>().not.toExtend<RunAgentDependencies>();
    expectTypeOf<MockAgentDepsShape & { callSarvam: StructuredCallSarvam }>().toExtend<RunAgentDependencies>();
    expectTypeOf<RunAgentDependencies>().toEqualTypeOf<{
      callSarvam: StructuredCallSarvam;
      now: () => Date;
      createId?: () => string;
    }>();
  });

  it("agent-core imports nothing from lib/, app/, fixtures/ or Prisma", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(10);
    const specifier = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
    const forbidden = /(^|\/)(lib|app|fixtures)\/|^@\/(lib|app|fixtures)|prisma/i;
    for (const file of files) {
      const source = readFileSync(join(root, file), "utf8");
      for (const [, spec] of source.matchAll(specifier)) {
        expect(forbidden.test(spec), `${file} imports ${spec}`).toBe(false);
      }
    }
  });
});
