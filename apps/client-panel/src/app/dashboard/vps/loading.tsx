import { PanelCard, Skeleton, SkeletonList } from '@/components/panel';

export default function VpsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <PanelCard className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <SkeletonList rows={3} />
      </PanelCard>
    </div>
  );
}
