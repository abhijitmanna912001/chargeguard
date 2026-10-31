import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";

export default function DisputeNotFound() {
  return (
    <EmptyState
      title="Dispute not found"
      description="We couldn't find a dispute with that id. It may have been mistyped or removed."
      action={
        <Link href="/disputes" className={buttonClasses("secondary")}>
          Back to all disputes
        </Link>
      }
    />
  );
}
