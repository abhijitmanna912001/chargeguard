import { ShieldCheck } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-lg text-base font-semibold tracking-tight">
      <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-ink text-ink-on">
        <ShieldCheck className="size-4" />
      </span>
      ChargeGuard
    </Link>
  );
}
