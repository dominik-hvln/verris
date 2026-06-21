/** Well-known platform configuration keys (stored in `platform_settings`). */
export const PLATFORM_SETTING_KEYS = {
  ECO_POINTS_PER_TREE: 'eco.pointsPerTree',
  ECO_BADGE_IMPRESSIONS_PER_POINT: 'eco.badgeImpressionsPerPoint',
  /** Punkty EKO wymieniane na 10 K portfela (np. 100). */
  ECO_POINTS_PER_10_CREDITS: 'eco.pointsPer10Credits',
  CLIENT_IDLE_MINUTES: 'session.clientIdleMinutes',
  STAFF_IDLE_MINUTES: 'session.staffIdleMinutes',
  ADMIN_IDLE_MINUTES: 'session.adminIdleMinutes',
  /** P-1 — base URL of the custom-branded Roundcube webmail (e.g. https://webmail.verris.pl). */
  WEBMAIL_URL: 'mail.webmailUrl',

  /** P-6 — comma-separated PHP versions selectable by clients (e.g. "8.3,8.2,8.1,8.0,7.4"). */
  PHP_AVAILABLE_VERSIONS: 'php.availableVersions',

  // UX-3 — oferta okresu próbnego (zarządzalna z panelu admina).
  TRIAL_FREE_ENABLED: 'trial.freeEnabled',
  TRIAL_CARD_ENABLED: 'trial.cardEnabled',
  TRIAL_ANNUAL_DISCOUNT_PCT: 'trial.annualDiscountPct',
  TRIAL_MONTHLY_DISCOUNT_PCT: 'trial.monthlyDiscountPct',
  TRIAL_ANNUAL_PROMO_CODE: 'trial.annualPromoCode',
  TRIAL_MONTHLY_PROMO_CODE: 'trial.monthlyPromoCode',
  /** BILL-1 — liczba pierwszych okresów objętych rabatem startowym (1 = tylko start). */
  TRIAL_INTRO_PERIODS: 'trial.introDiscountPeriods',

  // MON-3 — monitoring strony: interwały (min) per tier + cena płatnego.
  /** Darmowy interwał sprawdzania w minutach (default 30). */
  MONITORING_FREE_INTERVAL_MIN: 'monitoring.freeIntervalMinutes',
  /** Płatny interwał sprawdzania w minutach (default 1). */
  MONITORING_PAID_INTERVAL_MIN: 'monitoring.paidIntervalMinutes',
  /** Miesięczna cena płatnego monitoringu w K (default 5). */
  MONITORING_PAID_PRICE: 'monitoring.paidMonthlyPrice',
  /** Czy oferować klientom upgrade do płatnego monitoringu (1/0). */
  MONITORING_PAID_OFFERED: 'monitoring.paidOffered',

  /** Platform-default authoritative nameservers for provisioned hosting accounts. */
  HOSTING_NS1: 'hosting.ns1',
  HOSTING_NS2: 'hosting.ns2',
  HOSTING_NS3: 'hosting.ns3',

  // Dane sprzedawcy (Verris) na fakturach — edytowalne w panelu admina.
  COMPANY_NAME: 'company.name',
  COMPANY_NIP: 'company.nip',
  COMPANY_REGON: 'company.regon',
  COMPANY_KRS: 'company.krs',
  COMPANY_ADDRESS: 'company.address',
  COMPANY_CITY: 'company.city',
  COMPANY_POSTAL: 'company.postal',
  COMPANY_COUNTRY: 'company.country',
  COMPANY_EMAIL: 'company.email',
  COMPANY_BANK_ACCOUNT: 'company.bankAccount',

  // KSeF — konfiguracja i sekrety (token/klucz szyfrowane KMS at-rest).
  KSEF_ENABLED: 'ksef.enabled',
  KSEF_ENV: 'ksef.env',
  KSEF_NIP: 'ksef.nip',
  KSEF_TOKEN_ENC: 'ksef.tokenEnc',
  KSEF_PUBLIC_KEY_ENC: 'ksef.publicKeyEnc',
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];

export const PLATFORM_SETTING_DEFAULTS: Record<PlatformSettingKey, string> = {
  [PLATFORM_SETTING_KEYS.ECO_POINTS_PER_TREE]: '1000',
  [PLATFORM_SETTING_KEYS.ECO_BADGE_IMPRESSIONS_PER_POINT]: '100',
  [PLATFORM_SETTING_KEYS.ECO_POINTS_PER_10_CREDITS]: '100',
  [PLATFORM_SETTING_KEYS.CLIENT_IDLE_MINUTES]: '60',
  [PLATFORM_SETTING_KEYS.WEBMAIL_URL]: '',
  [PLATFORM_SETTING_KEYS.PHP_AVAILABLE_VERSIONS]: '8.3,8.2,8.1,8.0,7.4',
  [PLATFORM_SETTING_KEYS.TRIAL_FREE_ENABLED]: '1',
  [PLATFORM_SETTING_KEYS.TRIAL_CARD_ENABLED]: '1',
  [PLATFORM_SETTING_KEYS.TRIAL_ANNUAL_DISCOUNT_PCT]: '15',
  [PLATFORM_SETTING_KEYS.TRIAL_MONTHLY_DISCOUNT_PCT]: '10',
  [PLATFORM_SETTING_KEYS.TRIAL_ANNUAL_PROMO_CODE]: '',
  [PLATFORM_SETTING_KEYS.TRIAL_MONTHLY_PROMO_CODE]: '',
  [PLATFORM_SETTING_KEYS.TRIAL_INTRO_PERIODS]: '1',
  [PLATFORM_SETTING_KEYS.MONITORING_FREE_INTERVAL_MIN]: '30',
  [PLATFORM_SETTING_KEYS.MONITORING_PAID_INTERVAL_MIN]: '1',
  [PLATFORM_SETTING_KEYS.MONITORING_PAID_PRICE]: '5',
  [PLATFORM_SETTING_KEYS.MONITORING_PAID_OFFERED]: '1',
  [PLATFORM_SETTING_KEYS.STAFF_IDLE_MINUTES]: '30',
  [PLATFORM_SETTING_KEYS.ADMIN_IDLE_MINUTES]: '15',
  [PLATFORM_SETTING_KEYS.HOSTING_NS1]: '',
  [PLATFORM_SETTING_KEYS.HOSTING_NS2]: '',
  [PLATFORM_SETTING_KEYS.HOSTING_NS3]: '',
  [PLATFORM_SETTING_KEYS.COMPANY_NAME]: '',
  [PLATFORM_SETTING_KEYS.COMPANY_NIP]: '',
  [PLATFORM_SETTING_KEYS.COMPANY_REGON]: '',
  [PLATFORM_SETTING_KEYS.COMPANY_KRS]: '',
  [PLATFORM_SETTING_KEYS.COMPANY_ADDRESS]: '',
  [PLATFORM_SETTING_KEYS.COMPANY_CITY]: '',
  [PLATFORM_SETTING_KEYS.COMPANY_POSTAL]: '',
  [PLATFORM_SETTING_KEYS.COMPANY_COUNTRY]: 'PL',
  [PLATFORM_SETTING_KEYS.COMPANY_EMAIL]: '',
  [PLATFORM_SETTING_KEYS.COMPANY_BANK_ACCOUNT]: '',
  [PLATFORM_SETTING_KEYS.KSEF_ENABLED]: '0',
  [PLATFORM_SETTING_KEYS.KSEF_ENV]: 'test',
  [PLATFORM_SETTING_KEYS.KSEF_NIP]: '',
  [PLATFORM_SETTING_KEYS.KSEF_TOKEN_ENC]: '',
  [PLATFORM_SETTING_KEYS.KSEF_PUBLIC_KEY_ENC]: '',
};
