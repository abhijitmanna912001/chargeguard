import type { Action, Dispute } from "../contracts";

// Synthetic disputes for the demo. Names, ids and amounts are invented.
// Amounts are paise; timestamps are UTC. expectedAction is the intended final
// action for the full pipeline, not something the evidence module produces.

export type GarvitCase = { dispute: Dispute; expectedAction: Action };

export const garvitCases: GarvitCase[] = [
  // DEFEND: the customer says the order never arrived, but a signed receipt
  // records delivery two days before the complaint. The settlement is lower
  // than the payment only because of fees, which is not a contradiction.
  {
    expectedAction: "defend",
    dispute: {
      id: "dsp_gm_001",
      transactionId: "txn_gm_001",
      amount: 149_900,
      reasonCode: "GOODS_NOT_RECEIVED",
      deadline: "2026-11-25T18:29:59Z",
      createdAt: "2026-10-28T06:15:00Z",
      status: "gathering",
      evidence: [
        {
          id: "ev_gm_001_txn",
          disputeId: "dsp_gm_001",
          collectedAt: "2026-10-28T06:20:00Z",
          type: "transaction",
          transactionId: "txn_gm_001",
          amount: 149_900,
          status: "success",
          occurredAt: "2026-10-20T09:42:11Z",
        },
        {
          id: "ev_gm_001_pod",
          disputeId: "dsp_gm_001",
          collectedAt: "2026-10-28T06:21:00Z",
          type: "delivery_proof",
          kind: "signed_receipt",
          status: "delivered",
          deliveredAt: "2026-10-24T11:05:00Z",
          reference: "SYN-POD-77812",
        },
        {
          id: "ev_gm_001_set",
          disputeId: "dsp_gm_001",
          collectedAt: "2026-10-28T06:22:00Z",
          type: "settlement",
          settlementId: "set_gm_2026_10_21",
          amount: 146_902,
          status: "settled",
          settledAt: "2026-10-21T04:30:00Z",
        },
        {
          id: "ev_gm_001_msg",
          disputeId: "dsp_gm_001",
          collectedAt: "2026-10-28T06:23:00Z",
          type: "customer_message",
          channel: "whatsapp",
          sentAt: "2026-10-26T14:10:00Z",
          content: "Order abhi tak nahi mila, refund chahiye.",
          language: "hi",
        },
      ],
    },
  },

  // ACCEPT: the courier tracked the parcel in transit, then returned it to the
  // merchant, and no refund was issued. The customer never received the goods.
  {
    expectedAction: "accept",
    dispute: {
      id: "dsp_gm_002",
      transactionId: "txn_gm_002",
      amount: 89_900,
      reasonCode: "GOODS_NOT_RECEIVED",
      deadline: "2026-11-28T18:29:59Z",
      createdAt: "2026-10-29T08:00:00Z",
      status: "gathering",
      evidence: [
        {
          id: "ev_gm_002_txn",
          disputeId: "dsp_gm_002",
          collectedAt: "2026-10-29T08:05:00Z",
          type: "transaction",
          transactionId: "txn_gm_002",
          amount: 89_900,
          status: "success",
          occurredAt: "2026-10-15T17:30:45Z",
        },
        {
          id: "ev_gm_002_trk1",
          disputeId: "dsp_gm_002",
          collectedAt: "2026-10-18T10:00:00Z",
          type: "delivery_proof",
          kind: "courier_tracking",
          status: "in_transit",
          reference: "SYN-AWB-40027",
        },
        {
          id: "ev_gm_002_trk2",
          disputeId: "dsp_gm_002",
          collectedAt: "2026-10-29T08:06:00Z",
          type: "delivery_proof",
          kind: "courier_tracking",
          status: "returned_to_origin",
          reference: "SYN-AWB-40027",
        },
        {
          id: "ev_gm_002_msg",
          disputeId: "dsp_gm_002",
          collectedAt: "2026-10-29T08:07:00Z",
          type: "customer_message",
          channel: "email",
          sentAt: "2026-10-27T05:45:00Z",
          content: "My parcel was never delivered and tracking shows it went back to the seller.",
          language: "en",
        },
      ],
    },
  },

  // ESCALATE: one record says delivered, another says returned to origin, and
  // the contract has no shipment id to reconcile them. A partial refund was
  // also issued. A human has to look at this one.
  {
    expectedAction: "escalate",
    dispute: {
      id: "dsp_gm_003",
      transactionId: "txn_gm_003",
      amount: 249_900,
      reasonCode: "GOODS_NOT_RECEIVED",
      deadline: "2026-11-30T18:29:59Z",
      createdAt: "2026-10-30T07:30:00Z",
      status: "gathering",
      evidence: [
        {
          id: "ev_gm_003_txn",
          disputeId: "dsp_gm_003",
          collectedAt: "2026-10-30T07:35:00Z",
          type: "transaction",
          transactionId: "txn_gm_003",
          amount: 249_900,
          status: "success",
          occurredAt: "2026-10-12T12:00:00Z",
        },
        {
          id: "ev_gm_003_trk",
          disputeId: "dsp_gm_003",
          collectedAt: "2026-10-30T07:36:00Z",
          type: "delivery_proof",
          kind: "courier_tracking",
          status: "delivered",
          deliveredAt: "2026-10-16T15:20:00Z",
          reference: "SYN-AWB-51190",
        },
        {
          id: "ev_gm_003_rto",
          disputeId: "dsp_gm_003",
          collectedAt: "2026-10-30T07:37:00Z",
          type: "delivery_proof",
          kind: "service_log",
          status: "returned_to_origin",
          reference: "SYN-WH-RTO-0931",
        },
        {
          id: "ev_gm_003_ref",
          disputeId: "dsp_gm_003",
          collectedAt: "2026-10-30T07:38:00Z",
          type: "refund",
          amount: 50_000,
          status: "issued",
          issuedAt: "2026-10-22T09:00:00Z",
        },
        {
          id: "ev_gm_003_msg",
          disputeId: "dsp_gm_003",
          collectedAt: "2026-10-30T07:39:00Z",
          type: "customer_message",
          channel: "sms",
          sentAt: "2026-10-29T19:00:00Z",
          content: "Got Rs 500 back but the speaker never arrived.",
          language: "en",
        },
      ],
    },
  },
];
