import type { ReactNode } from "react";
import type {
  CustomerMessageEvidence,
  DeliveryProofEvidence,
  Evidence,
  RefundEvidence,
  SettlementEvidence,
  TransactionEvidence,
} from "@/contracts";
import { channelLabel, languageLabel } from "@/lib/evidence-display";
import { formatDateTime, formatPaise, humanizeEnum } from "@/lib/format";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function Time({ iso }: { iso: string }) {
  return <time dateTime={iso}>{formatDateTime(iso)}</time>;
}

function OptionalTime({ iso }: { iso: string | undefined }) {
  return iso ? <Time iso={iso} /> : <span className="text-zinc-600 dark:text-zinc-400">Not recorded</span>;
}

function Fields({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">{children}</dl>;
}

function TransactionBody({ evidence }: { evidence: TransactionEvidence }) {
  return (
    <Fields>
      <Field label="Transaction id"><span className="font-mono">{evidence.transactionId}</span></Field>
      <Field label="Amount">{formatPaise(evidence.amount)}</Field>
      <Field label="Status">{humanizeEnum(evidence.status)}</Field>
      <Field label="Occurred"><Time iso={evidence.occurredAt} /></Field>
    </Fields>
  );
}

function SettlementBody({ evidence }: { evidence: SettlementEvidence }) {
  return (
    <Fields>
      <Field label="Settlement id"><span className="font-mono">{evidence.settlementId}</span></Field>
      <Field label="Amount">{formatPaise(evidence.amount)}</Field>
      <Field label="Status">{humanizeEnum(evidence.status)}</Field>
      <Field label="Settled"><OptionalTime iso={evidence.settledAt} /></Field>
    </Fields>
  );
}

function DeliveryProofBody({ evidence }: { evidence: DeliveryProofEvidence }) {
  return (
    <Fields>
      <Field label="Proof type">{humanizeEnum(evidence.kind)}</Field>
      <Field label="Delivery status">{humanizeEnum(evidence.status)}</Field>
      <Field label="Delivered"><OptionalTime iso={evidence.deliveredAt} /></Field>
      <Field label="Reference"><span className="font-mono">{evidence.reference}</span></Field>
    </Fields>
  );
}

function CustomerMessageBody({ evidence }: { evidence: CustomerMessageEvidence }) {
  return (
    <div className="space-y-3">
      <Fields>
        <Field label="Channel">{channelLabel(evidence.channel)}</Field>
        <Field label="Sent"><Time iso={evidence.sentAt} /></Field>
        <Field label="Language">{languageLabel(evidence.language)}</Field>
      </Fields>
      {/* lang lets screen readers pronounce non-English messages correctly */}
      <blockquote
        lang={evidence.language}
        className="whitespace-pre-wrap border-l-4 border-zinc-300 pl-3 text-sm dark:border-zinc-600"
      >
        {evidence.content}
      </blockquote>
    </div>
  );
}

function RefundBody({ evidence }: { evidence: RefundEvidence }) {
  return (
    <Fields>
      <Field label="Amount">{formatPaise(evidence.amount)}</Field>
      <Field label="Status">{humanizeEnum(evidence.status)}</Field>
      <Field label="Issued"><OptionalTime iso={evidence.issuedAt} /></Field>
    </Fields>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled evidence type: ${JSON.stringify(value)}`);
}

// Exhaustive on evidence.type: adding a variant to the contract fails typecheck here.
function EvidenceBody({ evidence }: { evidence: Evidence }) {
  switch (evidence.type) {
    case "transaction":
      return <TransactionBody evidence={evidence} />;
    case "settlement":
      return <SettlementBody evidence={evidence} />;
    case "delivery_proof":
      return <DeliveryProofBody evidence={evidence} />;
    case "customer_message":
      return <CustomerMessageBody evidence={evidence} />;
    case "refund":
      return <RefundBody evidence={evidence} />;
    default:
      return assertNever(evidence);
  }
}

export function EvidenceCard({ evidence }: { evidence: Evidence }) {
  return (
    <article className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h4 className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold">
        <span className="font-mono">{evidence.id}</span>
        <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400">
          Collected <Time iso={evidence.collectedAt} />
        </span>
      </h4>
      <EvidenceBody evidence={evidence} />
    </article>
  );
}
