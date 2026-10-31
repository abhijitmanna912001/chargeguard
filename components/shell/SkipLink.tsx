export const MAIN_CONTENT_ID = "main-content";

/** The first focusable element on every page. Hidden until it has keyboard focus. */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-on"
    >
      Skip to content
    </a>
  );
}
