"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

export default function MetricsError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div
        role="alert"
        className="rounded-lg border border-red-300 bg-red-50 p-6 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
      >
        <h2 className="text-lg font-semibold">We couldn&apos;t load the metrics</h2>
        <p className="mt-1 text-sm">
          Something went wrong on our side. Your data is safe. Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-4 rounded-md border border-red-700 bg-white px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:bg-red-900 dark:text-red-50 dark:hover:bg-red-800"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
