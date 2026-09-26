export type ClientNavContext = {
  isSubaccount: boolean;
  customerPermissions: string[] | null | undefined;
  /** PB-20 — dostęp tylko do wybranych usług; pusta lista / brak = całe konto. */
  serviceScope?: string[] | null;
  /** PB-28 — konto rozliczane przez właściciela poza Verris: bez portfela, płatności i zamówień z panelu. */
  billingOutside?: boolean;
};

/**
 * PB-20 — przy zakresie usług zostają tylko ekrany pracy na usłudze, pomoc i własne ustawienia.
 * Portfel, domeny, zamówienia, migracje, VPS, dodatki itp. są całego konta (API i tak odmówi).
 */
const W_ZAKRESIE = [
  '/dashboard/services', '/dashboard/dns', '/dashboard/email', '/dashboard/file-manager', '/dashboard/ftp',
  '/dashboard/cron', '/dashboard/backups', '/dashboard/databases', '/dashboard/ssl', '/dashboard/php',
  '/dashboard/apps', '/dashboard/support', '/dashboard/knowledge', '/dashboard/settings', '/dashboard/notifications',
];

/** PB-28 — przy rozliczeniu poza Verris klient nie płaci w panelu i nie zamawia sam nowych usług. */
const POZA_VERRIS = ['/dashboard/billing', '/dashboard/services/new', '/dashboard/calculator'];

function hasAny(permissions: Set<string>, keys: string[]): boolean {
  return keys.some((key) => permissions.has(key));
}

/**
 * Czy subkonto (lub właściciel) może widzieć dany link w nawigacji panelu.
 * Właściciel (`isSubaccount === false`) widzi wszystko poza flagami feature.
 */
export function canAccessDashboardRoute(
  href: string,
  ctx: ClientNavContext,
): boolean {
  if (ctx.billingOutside && POZA_VERRIS.some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`))) {
    return false;
  }
  if (!ctx.isSubaccount) return true;

  const perms = new Set(ctx.customerPermissions ?? []);

  if (href === '/dashboard') return true;
  // Zamówienie nowej usługi to wydatek całego konta.
  if (ctx.serviceScope?.length && href.startsWith('/dashboard/services/new')) return false;
  if (ctx.serviceScope?.length && !W_ZAKRESIE.some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`))) {
    return false;
  }
  if (
    href === '/dashboard/iam' ||
    href === '/dashboard/referral' ||
    href === '/dashboard/eco'
  ) {
    return false;
  }
  if (href === '/dashboard/settings' || href.startsWith('/dashboard/settings')) {
    return true;
  }
  // Baza wiedzy — pomoc/poradniki, dostępne dla każdego (też subkont).
  if (href.startsWith('/dashboard/knowledge')) {
    return true;
  }
  if (href.startsWith('/dashboard/billing')) {
    return hasAny(perms, ['BILLING_READ', 'BILLING_MANAGE']);
  }
  if (href === '/dashboard/calculator') {
    return false;
  }
  if (
    href.startsWith('/dashboard/services') ||
    href.startsWith('/dashboard/migrations') ||
    href.startsWith('/dashboard/autoscaling')
  ) {
    return hasAny(perms, ['SERVICES_READ', 'SERVICES_MANAGE']);
  }
  if (href.startsWith('/dashboard/domains')) {
    return hasAny(perms, ['DOMAINS_READ', 'DOMAINS_MANAGE']);
  }
  if (href.startsWith('/dashboard/dns')) {
    return perms.has('DNS_MANAGE');
  }
  if (href.startsWith('/dashboard/email')) {
    return perms.has('EMAIL_MANAGE');
  }
  if (
    href.startsWith('/dashboard/file-manager') ||
    href.startsWith('/dashboard/ftp') ||
    href.startsWith('/dashboard/cron') ||
    href.startsWith('/dashboard/backups')
  ) {
    return perms.has('FILES_MANAGE');
  }
  // Bazy trzymają treść i hasła strony — API wymaga FILES_MANAGE (jak menedżer plików).
  if (href.startsWith('/dashboard/databases')) {
    return perms.has('FILES_MANAGE');
  }
  if (href.startsWith('/dashboard/ssl')) {
    return hasAny(perms, [
      'DOMAINS_READ',
      'DOMAINS_MANAGE',
      'DNS_MANAGE',
      'SERVICES_READ',
      'SERVICES_MANAGE',
    ]);
  }
  if (href.startsWith('/dashboard/support')) {
    return hasAny(perms, ['TICKETS_READ', 'TICKETS_MANAGE']);
  }
  if (href.startsWith('/dashboard/vps')) {
    return hasAny(perms, ['SERVICES_READ', 'SERVICES_MANAGE']);
  }
  if (href.startsWith('/dashboard/php')) {
    return hasAny(perms, ['SERVICES_READ', 'SERVICES_MANAGE', 'FILES_MANAGE']);
  }
  // Instalator nadpisuje katalog strony — API wymaga FILES_MANAGE.
  if (href.startsWith('/dashboard/apps')) {
    return perms.has('FILES_MANAGE');
  }
  if (href.startsWith('/dashboard/addons')) {
    return hasAny(perms, ['BILLING_MANAGE', 'SERVICES_MANAGE']);
  }

  return false;
}

export function canShowWalletBalance(ctx: ClientNavContext): boolean {
  if (ctx.billingOutside) return false;
  if (!ctx.isSubaccount) return true;
  const perms = new Set(ctx.customerPermissions ?? []);
  return hasAny(perms, ['BILLING_READ', 'BILLING_MANAGE']);
}

export function clientNavContextFromSidebar(
  user: {
    isSubaccount?: boolean;
    customerPermissions?: string[] | null;
    serviceScope?: string[] | null;
    billingOutside?: boolean;
  } | null,
): ClientNavContext | null {
  if (!user) return null;
  return {
    isSubaccount: Boolean(user.isSubaccount),
    customerPermissions: user.customerPermissions ?? null,
    serviceScope: user.serviceScope ?? null,
    billingOutside: Boolean(user.billingOutside),
  };
}
