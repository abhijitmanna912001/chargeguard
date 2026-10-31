import { CreditCard, Landmark, MessageSquare, Truck, Undo2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { evidenceStatus } from "./evidence-status";
import type {
  CustomerMessageEvidence,
  DeliveryProofEvidence,
  Evidence,
  RefundEvidence,
  SettlementEvidence,
  TransactionEvidence,
} from "@/contracts";
import { channelLabel, evidenceTypeLabel, languageLabel } from "@/lib/evidence-display";
import { formatDateTime, formatPaise, humanizeEnum } from "@/lib/format";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function Time({ iso }: { iso: string }) {
  return <time dateTime={iso}>{formatDateTime(iso)}</time>;
}

function OptionalTime({ iso }: { iso: string | undefined }) {
  return iso ? <Time iso={iso} /> : <span className="text-ink-muted">Not recorded</span>;
}

function Fields({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">{children}</dl>;
}

function TransactionBody({ evidence }: { evidence: TransactionEvidence }) {
  return (
    <Fields>
      <Field label="Transaction id"><span className="font-mono">{evidence.transactionId}</span></Field>
      <Field label="Amount">{formatPaise(evidence.amount)}</Field>
      <Field label="Occurred"><Time iso={evidence.occurredAt} /></Field>
    </Fields>
  );
}

function SettlementBody({ evidence }: { evidence: SettlementEvidence }) {
  return (
    <Fields>
      <Field label="Settlement id"><span className="font-mono">{evidence.settlementId}</span></Field>
      <Field label="Amount">{formatPaise(evidence.amount)}</Field>
      <Field label="Settled"><OptionalTime iso={evidence.settledAt} /></Field>
    </Fields>
  );
}

function DeliveryProofBody({ evidence }: { evidence: DeliveryProofEvidence }) {
  return (
    <Fields>
      <Field label="Proof type">{humanizeEnum(evidence.kind)}</Field>
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
        className="whitespace-pre-wrap rounded-r-lg border-l-4 border-accent-line bg-canvas px-3 py-2 text-sm italic"
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

const TYPE_ICON: Record<Evidence["type"], LucideIcon> = {
  transaction: CreditCard,
  settlement: Landmark,
  delivery_proof: Truck,
  customer_message: MessageSquare,
  refund: Undo2,
};

export function EvidenceCard({ evidence }: { evidence: Evidence }) {
  const Icon = TYPE_ICON[evidence.type];
  const status = evidenceStatus(evidence);
  return (
    <Card as="article" className="h-full p-4">
      <header className="mb-3 flex items-start gap-3">
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-muted">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold">{evidenceTypeLabel(evidence.type)}</h4>
          <p className="break-all font-mono text-xs text-ink-muted">{evidence.id}</p>
        </div>
        {status && <Badge tone={status.tone}>{status.label}</Badge>}
      </header>
      <EvidenceBody evidence={evidence} />
      <p className="mt-3 text-xs text-ink-muted">
        Collected <Time iso={evidence.collectedAt} />
      </p>
    </Card>
  );
}
