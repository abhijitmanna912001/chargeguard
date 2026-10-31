import { Card } from "@/components/ui/Card";
import { overviewTiles } from "./tiles";
import type { DisputeStatus } from "@/contracts";

export function StatusTiles({ counts }: { counts: readonly { status: DisputeStatus; count: number }[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {overviewTiles(counts).map((t) => (
        <li key={t.key}>
          <Card className="h-full p-4">
            <p className="text-sm font-medium text-ink-muted">{t.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{t.count}</p>
            <p className="mt-1 text-xs text-ink-muted">{t.hint}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
