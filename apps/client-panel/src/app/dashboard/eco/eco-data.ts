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

export type EcoPlatformConfig = {
  ecoPointsPerTree: number;
  ecoPointsPer10Credits: number;
  ecoBadgeImpressionsPerPoint: number;
};

export type EcoBadgeStats = {
  impressions: number;
  impressionsPerPoint: number;
  impressionsUntilNextPoint: number;
  pointsEarnedFromBadge: number;
};

export type EcoProgramOverview = {
  ecoPoints: number;
  ecoModeOnActiveServices: number;
  ecoModeOnServices: number;
  hasEcoModeOnActiveService: boolean;
  referralProgramStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  referralProgramApproved: boolean;
  isEcoProgramParticipant: boolean;
};

export async function getEcoDashboardData(): Promise<{
  profile: EcoProfileDto;
  ledger: EcoLedgerRowDto[];
  platform: EcoPlatformConfig;
  badgeStats: EcoBadgeStats;
  program: EcoProgramOverview;
}> {
  const [profile, ledger, platform, badgeStats, program] = await Promise.all([
    apiFetch<EcoProfileDto>('/users/me'),
    apiFetch<EcoLedgerRowDto[]>('/users/me/eco-ledger'),
    apiFetch<EcoPlatformConfig>('/platform-settings/client').catch(() => ({
      ecoPointsPerTree: 1000,
      ecoPointsPer10Credits: 100,
      ecoBadgeImpressionsPerPoint: 100,
      clientIdleSessionMinutes: 60,
    })),
    apiFetch<EcoBadgeStats>('/users/me/eco-badge-stats').catch(() => ({
      impressions: 0,
      impressionsPerPoint: 100,
      impressionsUntilNextPoint: 100,
      pointsEarnedFromBadge: 0,
    })),
    apiFetch<EcoProgramOverview>('/users/me/eco-program'),
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
    platform: {
      ecoPointsPerTree: platform.ecoPointsPerTree,
      ecoPointsPer10Credits: platform.ecoPointsPer10Credits,
      ecoBadgeImpressionsPerPoint: platform.ecoBadgeImpressionsPerPoint,
    },
    badgeStats,
    program,
  };
}
