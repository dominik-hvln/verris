import type {
  HostingBackupsResponseDto,
  HostingCronJobsResponseDto,
  HostingDaLinksResponseDto,
  HostingDnsRecordsResponseDto,
  HostingEmailAccountsResponseDto,
  HostingFtpAccountsResponseDto,
  HostingMysqlDatabasesResponseDto,
  HostingSslResponseDto,
  ServiceSummaryDto,
} from "@ekohost/contracts";
import { apiFetch } from "@/lib/api";

export async function listUserServices(): Promise<ServiceSummaryDto[]> {
  return apiFetch<ServiceSummaryDto[]>("/services");
}

export async function getPrimaryService(): Promise<ServiceSummaryDto | null> {
  const services = await listUserServices();
  return services[0] ?? null;
}

/**
 * Wybór usługi na stronach hostingu: jawny `serviceId` z URL (musi istnieć)
 * lub pierwsza z listy gdy brak parametru.
 */
export async function resolveServiceForHostingPages(
  serviceIdParam: string | undefined,
): Promise<ServiceSummaryDto | null> {
  const services = await listUserServices();
  if (serviceIdParam) {
    return services.find((s) => s.id === serviceIdParam) ?? null;
  }
  return services[0] ?? null;
}

export async function getHostingDns(serviceId: string, domain?: string) {
  const q = domain ? `?domain=${encodeURIComponent(domain)}` : "";
  return apiFetch<HostingDnsRecordsResponseDto>(`/services/${serviceId}/hosting-dns${q}`);
}

export async function getHostingDatabases(serviceId: string) {
  return apiFetch<HostingMysqlDatabasesResponseDto>(`/services/${serviceId}/hosting-databases`);
}

export async function getHostingFtp(serviceId: string) {
  return apiFetch<HostingFtpAccountsResponseDto>(`/services/${serviceId}/hosting-ftp`);
}

export async function getHostingEmail(serviceId: string) {
  return apiFetch<HostingEmailAccountsResponseDto>(`/services/${serviceId}/hosting-email`);
}

export async function getHostingCron(serviceId: string) {
  return apiFetch<HostingCronJobsResponseDto>(`/services/${serviceId}/hosting-cron`);
}

export async function getHostingSsl(serviceId: string) {
  return apiFetch<HostingSslResponseDto>(`/services/${serviceId}/hosting-ssl`);
}

export async function getHostingBackups(serviceId: string) {
  return apiFetch<HostingBackupsResponseDto>(`/services/${serviceId}/hosting-backups`);
}

export async function getHostingDaLinks(serviceId: string) {
  return apiFetch<HostingDaLinksResponseDto>(`/services/${serviceId}/hosting-da-links`);
}

export interface HostingMigrationTimelineRow {
  id: string;
  type: string;
  createdAt: string;
  details: Record<string, unknown> | null;
}

export async function getHostingMigrationTimeline(serviceId: string) {
  return apiFetch<HostingMigrationTimelineRow[]>(`/services/${serviceId}/migrations`);
}
