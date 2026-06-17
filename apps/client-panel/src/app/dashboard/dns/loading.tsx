import { PanelCard, Skeleton, SkeletonList } from '@/components/panel';

export default function DnsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <PanelCard className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
        <SkeletonList rows={5} />
      </PanelCard>
    </div>
  );
}
