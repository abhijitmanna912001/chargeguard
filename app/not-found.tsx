import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageShell } from "@/components/ui/PageShell";

export const metadata: Metadata = {
  title: "Page not found | ChargeGuard",
};

export default function NotFound() {
  return (
    <PageShell>
      <EmptyState
        icon={<SearchX className="size-6" />}
        titleAs="h1"
        title="Page not found"
        description="We couldn't find the page you were looking for. It may have moved, or the address may be mistyped."
        action={
          <Link href="/" className={buttonClasses("secondary")}>
            Back to overview
          </Link>
        }
      />
    </PageShell>
  );
}
