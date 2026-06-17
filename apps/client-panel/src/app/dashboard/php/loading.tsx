import { PanelCard, Skeleton } from '@/components/panel';

export default function PhpLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <PanelCard className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </PanelCard>
    </div>
  );
}
