import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

export function CaseFileSkeleton() {
  return (
    <SkeletonGroup label="Loading dispute…" className="space-y-8">
      <Skeleton className="h-44 w-full rounded-lg sm:h-36" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <Skeleton className="h-56 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </SkeletonGroup>
  );
}
