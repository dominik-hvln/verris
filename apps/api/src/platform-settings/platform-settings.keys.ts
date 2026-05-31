/** Well-known platform configuration keys (stored in `platform_settings`). */
export const PLATFORM_SETTING_KEYS = {
  ECO_POINTS_PER_TREE: 'eco.pointsPerTree',
  ECO_BADGE_IMPRESSIONS_PER_POINT: 'eco.badgeImpressionsPerPoint',
  /** Punkty EKO wymieniane na 10 K portfela (np. 100). */
  ECO_POINTS_PER_10_CREDITS: 'eco.pointsPer10Credits',
  CLIENT_IDLE_MINUTES: 'session.clientIdleMinutes',
  STAFF_IDLE_MINUTES: 'session.staffIdleMinutes',
  ADMIN_IDLE_MINUTES: 'session.adminIdleMinutes',
  /** Platform-default authoritative nameservers for provisioned hosting accounts. */
  HOSTING_NS1: 'hosting.ns1',
  HOSTING_NS2: 'hosting.ns2',
  HOSTING_NS3: 'hosting.ns3',
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];

export const PLATFORM_SETTING_DEFAULTS: Record<PlatformSettingKey, string> = {
  [PLATFORM_SETTING_KEYS.ECO_POINTS_PER_TREE]: '1000',
  [PLATFORM_SETTING_KEYS.ECO_BADGE_IMPRESSIONS_PER_POINT]: '100',
  [PLATFORM_SETTING_KEYS.ECO_POINTS_PER_10_CREDITS]: '100',
  [PLATFORM_SETTING_KEYS.CLIENT_IDLE_MINUTES]: '60',
  [PLATFORM_SETTING_KEYS.STAFF_IDLE_MINUTES]: '30',
  [PLATFORM_SETTING_KEYS.ADMIN_IDLE_MINUTES]: '15',
  [PLATFORM_SETTING_KEYS.HOSTING_NS1]: '',
  [PLATFORM_SETTING_KEYS.HOSTING_NS2]: '',
  [PLATFORM_SETTING_KEYS.HOSTING_NS3]: '',
};
