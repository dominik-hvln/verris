import { PanelCard, Skeleton, SkeletonList } from '@/components/panel';

export default function EmailLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <PanelCard className="space-y-4">
        <Skeleton className="h-9 w-44 rounded-lg" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <SkeletonList rows={4} />
      </PanelCard>
    </div>
  );
}
