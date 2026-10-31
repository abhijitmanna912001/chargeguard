// Synthetic seed cases. No real customers, merchants or transactions.
// Money is integer paise; timestamps are UTC ISO strings in toISOString() form
// (milliseconds + Z) so they round-trip through the database unchanged.
import {
  DisputeSchema,
  type Action,
  type Dispute,
} from "../contracts";

export type FixtureCase = { dispute: Dispute; expectedAction: Action };

const rawCases: { dispute: unknown; expectedAction: Action }[] = [
  {
    // (a) Clear defend: complete evidence, delivered, nothing blocking.
    expectedAction: "defend",
    dispute: {
      id: "disp_demo_001",
      transactionId: "txn_demo_001",
      amount: 249900, // INR 2,499.00
      reasonCode: "13.1", // merchandise / services not received
      deadline: "2026-11-14T18:29:59.000Z",
      createdAt: "2026-11-02T04:30:00.000Z",
      status: "received",
      evidence: [
        {
          id: "ev_demo_001_txn",
          disputeId: "disp_demo_001",
          type: "transaction",
          collectedAt: "2026-11-02T04:31:00.000Z",
          transactionId: "txn_demo_001",
          amount: 249900,
          status: "success",
          occurredAt: "2026-10-20T08:15:00.000Z",
        },
        {
          id: "ev_demo_001_settle",
          disputeId: "disp_demo_001",
          type: "settlement",
          collectedAt: "2026-11-02T04:31:10.000Z",
          settlementId: "stl_demo_001",
          amount: 249900,
          status: "settled",
          settledAt: "2026-10-22T06:00:00.000Z",
        },
        {
          id: "ev_demo_001_delivery",
          disputeId: "disp_demo_001",
          type: "delivery_proof",
          collectedAt: "2026-11-02T04:31:20.000Z",
          kind: "courier_tracking",
          status: "delivered",
          deliveredAt: "2026-10-24T11:40:00.000Z",
          reference: "AWB-DEMO-100245",
        },
        {
          id: "ev_demo_001_msg",
          disputeId: "disp_demo_001",
          type: "customer_message",
          collectedAt: "2026-11-02T04:31:30.000Z",
          channel: "whatsapp",
          sentAt: "2026-10-24T13:05:00.000Z",
          content: "सामान मिल गया है, धन्यवाद!",
          language: "hi",
        },
      ],
    },
  },
  {
    // (b) Escalate: high amount and delivery proof shows the parcel is still in transit.
    expectedAction: "escalate",
    dispute: {
      id: "disp_demo_002",
      transactionId: "txn_demo_002",
      amount: 4500000, // INR 45,000.00
      reasonCode: "13.1",
      deadline: "2026-11-12T18:29:59.000Z",
      createdAt: "2026-11-03T05:00:00.000Z",
      status: "received",
      evidence: [
        {
          id: "ev_demo_002_txn",
          disputeId: "disp_demo_002",
          type: "transaction",
          collectedAt: "2026-11-03T05:01:00.000Z",
          transactionId: "txn_demo_002",
          amount: 4500000,
          status: "success",
          occurredAt: "2026-10-28T10:00:00.000Z",
        },
        {
          id: "ev_demo_002_settle",
          disputeId: "disp_demo_002",
          type: "settlement",
          collectedAt: "2026-11-03T05:01:10.000Z",
          settlementId: "stl_demo_002",
          amount: 4500000,
          status: "settled",
          settledAt: "2026-10-30T06:00:00.000Z",
        },
        {
          id: "ev_demo_002_delivery",
          disputeId: "disp_demo_002",
          type: "delivery_proof",
          collectedAt: "2026-11-03T05:01:20.000Z",
          kind: "courier_tracking",
          status: "in_transit",
          reference: "AWB-DEMO-200981",
        },
        {
          id: "ev_demo_002_msg",
          disputeId: "disp_demo_002",
          type: "customer_message",
          collectedAt: "2026-11-03T05:01:30.000Z",
          channel: "email",
          sentAt: "2026-11-01T09:20:00.000Z",
          content: "I still have not received my order. Please refund me.",
          language: "en",
        },
      ],
    },
  },
];

// Parse at module load so a bad fixture fails loudly, not at seed time.
export const cases: FixtureCase[] = rawCases.map(({ dispute, expectedAction }) => ({
  dispute: DisputeSchema.parse(dispute),
  expectedAction,
}));
