import { redirect } from 'next/navigation';
import { resolveServiceForHostingPages } from '../hosting-tools-data';

// Reorganizacja nawigacji: zarządzanie usługą żyje w hubie usługi.
// Ta trasa przekierowuje do właściwej zakładki huba (zachowuje serviceId).
export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  redirect(service ? `/dashboard/services/${service.id}?tab=cron` : '/dashboard/services');
}
