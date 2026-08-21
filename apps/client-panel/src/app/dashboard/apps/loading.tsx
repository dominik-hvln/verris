import { PanelCard, Skeleton, SkeletonList } from '@/components/panel';

export default function AppsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-44" />
      <PanelCard className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
        <SkeletonList rows={2} />
      </PanelCard>
    </div>
  );
}
