import { apiFetch } from '@/lib/api';

export interface EcoProfileDto {
  ecoPoints: number;
  referralCode: string | null;
  ecoBadgeToken: string | null;
  hasActiveEcoSubscription: boolean;
  referredByUserId: string | null;
}

export interface EcoLedgerRowDto {
  id: string;
  delta: number;
  reason: string;
  subscriptionId: string | null;
  createdAt: string;
}

export async function getEcoDashboardData(): Promise<{
  profile: EcoProfileDto;
  ledger: EcoLedgerRowDto[];
}> {
  const [profile, ledger] = await Promise.all([
    apiFetch<EcoProfileDto>('/users/me'),
    apiFetch<EcoLedgerRowDto[]>('/users/me/eco-ledger'),
  ]);
  return {
    profile: {
      ecoPoints: profile.ecoPoints,
      referralCode: profile.referralCode ?? null,
      ecoBadgeToken: profile.ecoBadgeToken ?? null,
      hasActiveEcoSubscription: Boolean(profile.hasActiveEcoSubscription),
      referredByUserId: profile.referredByUserId ?? null,
    },
    ledger,
  };
}
