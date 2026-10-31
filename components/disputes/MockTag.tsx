/** Marks a recommendation as coming from the mock agent. Dashed, so it never reads as a status. */
export function MockTag() {
  return (
    <span className="rounded-md border border-dashed border-field-line px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-muted">
      Mock
    </span>
  );
}
