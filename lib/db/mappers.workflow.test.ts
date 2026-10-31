import { describe, expect, it } from "vitest";
import { Prisma } from "./generated/prisma/client";
import {
  approvalFromRow,
  approvalResolutionToUpdateData,
  approvalToCreateData,
  recommendationFromRow,
  recommendationToCreateData,
  submissionFromRow,
  submissionToCreateData,
} from "./mappers";
import type { ApprovalRequest, Recommendation, SubmissionResult } from "../../contracts";

const T = "2026-01-01T10:30:00.000Z";
const D = new Date(T);
const modelOutput = { action: "defend", confidence: 0.9, reasoning: "ok", evidenceRefs: ["e1"] };

const rec: Recommendation = {
  id: "r1",
  disputeId: "d1",
  createdAt: T,
  modelOutput: modelOutput as Recommendation["modelOutput"],
  finalAction: "defend",
  flags: [],
};

function recRow(o: Record<string, unknown> = {}) {
  return {
    id: "r1",
    disputeId: "d1",
    createdAt: D,
    modelOutput,
    finalAction: "defend",
    overrideReason: null,
    flags: [] as string[],
    ...o,
  };
}

describe("recommendation mappers", () => {
  it("round-trips a row with model output", () => {
    const data = recommendationToCreateData(rec);
    expect(data.createdAt).toEqual(D);
    expect(data.modelOutput).toEqual(modelOutput);
    expect(recommendationFromRow(recRow())).toEqual(rec);
  });

  it("maps a null modelOutput row to null and writes DbNull", () => {
    const failed: Recommendation = {
      ...rec,
      modelOutput: null,
      finalAction: "escalate",
      flags: ["model_failure"],
    };
    expect(recommendationToCreateData(failed).modelOutput).toBe(Prisma.DbNull);
    const out = recommendationFromRow(
      recRow({ modelOutput: null, finalAction: "escalate", flags: ["model_failure"] }),
    );
    expect(out).toEqual(failed);
    expect(out.overrideReason).toBeUndefined();
  });

  it("rejects writes that break superRefine rules", () => {
    expect(() =>
      recommendationToCreateData({ ...rec, modelOutput: null, flags: [] }),
    ).toThrow(); // model_failure missing, finalAction not escalate
    expect(() => recommendationToCreateData({ ...rec, finalAction: "accept" })).toThrow(); // no override reason
    expect(() => recommendationToCreateData({ ...rec, flags: ["missing_evidence"] })).toThrow(); // blocking flag + defend
  });

  it("throws on invalid stored data", () => {
    expect(() => recommendationFromRow(recRow({ modelOutput: { action: "nope" } }))).toThrow();
    expect(() => recommendationFromRow(recRow({ flags: ["bogus"] }))).toThrow();
  });
});

const pending: ApprovalRequest = {
  id: "a1",
  disputeId: "d1",
  recommendationId: "r1",
  requestedAt: T,
  flags: ["low_confidence"],
  proposedAction: "escalate",
  status: "pending",
};

function apRow(o: Record<string, unknown> = {}) {
  return {
    id: "a1",
    disputeId: "d1",
    recommendationId: "r1",
    requestedAt: D,
    flags: ["low_confidence"],
    proposedAction: "escalate",
    status: "pending",
    resolvedAction: null,
    decidedBy: null,
    decidedAt: null,
    note: null,
    ...o,
  };
}

describe("approval mappers", () => {
  it("round-trips a pending approval, null becoming undefined", () => {
    expect(approvalToCreateData(pending).decidedAt).toBeUndefined();
    const out = approvalFromRow(apRow());
    expect(out).toEqual(pending);
    expect(out.decidedBy).toBeUndefined();
  });

  it("round-trips an approved approval with dates as ISO", () => {
    const approved: ApprovalRequest = {
      ...pending,
      status: "approved",
      resolvedAction: "accept",
      decidedBy: "u1",
      decidedAt: "2026-01-02T00:00:00.000Z",
      note: "fine",
    };
    expect(approvalToCreateData(approved).decidedAt).toEqual(new Date(approved.decidedAt!));
    expect(
      approvalFromRow(
        apRow({
          status: "approved",
          resolvedAction: "accept",
          decidedBy: "u1",
          decidedAt: new Date(approved.decidedAt!),
          note: "fine",
        }),
      ),
    ).toEqual(approved);
  });

  it("throws on contract violations", () => {
    expect(() => approvalToCreateData({ ...pending, status: "approved" })).toThrow();
    expect(() => approvalFromRow(apRow({ status: "approved" }))).toThrow(); // no decider
    expect(() => approvalFromRow(apRow({ status: "weird" }))).toThrow();
  });
});

describe("approvalResolutionToUpdateData", () => {
  const now = new Date("2026-02-01T00:00:00.000Z");

  it("builds an approve update", () => {
    expect(
      approvalResolutionToUpdateData(
        { status: "approved", resolvedAction: "defend", decidedBy: "u1", note: "n" },
        now,
      ),
    ).toEqual({
      status: "approved",
      resolvedAction: "defend",
      decidedBy: "u1",
      decidedAt: now,
      note: "n",
    });
  });

  it("builds a reject update without resolvedAction", () => {
    const d = approvalResolutionToUpdateData({ status: "rejected", decidedBy: "u1" }, now);
    expect(d.resolvedAction).toBeUndefined();
    expect(d.status).toBe("rejected");
  });

  it("rejects bad resolutions", () => {
    expect(() => approvalResolutionToUpdateData({ status: "approved", decidedBy: "u1" }, now)).toThrow();
    expect(() =>
      approvalResolutionToUpdateData(
        { status: "rejected", resolvedAction: "accept", decidedBy: "u1" },
        now,
      ),
    ).toThrow();
    expect(() => approvalResolutionToUpdateData({ status: "approved", resolvedAction: "accept", decidedBy: "" }, now)).toThrow();
    expect(() =>
      approvalResolutionToUpdateData({ status: "pending" as never, decidedBy: "u1" }, now),
    ).toThrow();
  });
});

const sub: SubmissionResult = { id: "s1", disputeId: "d1", idempotencyKey: "k1", status: "pending" };

function subRow(o: Record<string, unknown> = {}) {
  return {
    id: "s1",
    disputeId: "d1",
    idempotencyKey: "k1",
    status: "pending",
    submittedAt: null,
    providerRef: null,
    errorMessage: null,
    ...o,
  };
}

describe("submission mappers", () => {
  it("round-trips pending and submitted", () => {
    expect(submissionFromRow(subRow())).toEqual(sub);
    const done: SubmissionResult = { ...sub, status: "submitted", submittedAt: T, providerRef: "p1" };
    expect(submissionToCreateData(done).submittedAt).toEqual(D);
    expect(submissionFromRow(subRow({ status: "submitted", submittedAt: D, providerRef: "p1" }))).toEqual(done);
  });

  it("throws when submitted has no submittedAt, or the status is unknown", () => {
    expect(() => submissionToCreateData({ ...sub, status: "submitted" })).toThrow();
    expect(() => submissionFromRow(subRow({ status: "submitted" }))).toThrow();
    expect(() => submissionFromRow(subRow({ status: "lost" }))).toThrow();
  });
});
