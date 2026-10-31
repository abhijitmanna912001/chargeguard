import Link from "next/link";

export default function DisputeNotFound() {
  return (
    <div className="rounded-lg border border-zinc-300 p-6 dark:border-zinc-700">
      <h2 className="text-lg font-semibold">Dispute not found</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        We couldn&apos;t find a dispute with that id. It may have been mistyped or removed.
      </p>
      <Link
        href="/disputes"
        className="mt-4 inline-block text-sm font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Back to all disputes
      </Link>
    </div>
  );
}
