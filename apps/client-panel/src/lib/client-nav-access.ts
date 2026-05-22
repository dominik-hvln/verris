export type ClientNavContext = {
  isSubaccount: boolean;
  customerPermissions: string[] | null | undefined;
};

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
  if (!ctx.isSubaccount) return true;

  const perms = new Set(ctx.customerPermissions ?? []);

  if (href === '/dashboard') return true;
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
  if (href.startsWith('/dashboard/billing')) {
    return hasAny(perms, ['BILLING_READ', 'BILLING_MANAGE']);
  }
  if (
    href.startsWith('/dashboard/services') ||
    href === '/dashboard/calculator' ||
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
  if (href.startsWith('/dashboard/databases')) {
    return hasAny(perms, ['SERVICES_READ', 'SERVICES_MANAGE']);
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

  return false;
}

export function canShowWalletBalance(ctx: ClientNavContext): boolean {
  if (!ctx.isSubaccount) return true;
  const perms = new Set(ctx.customerPermissions ?? []);
  return hasAny(perms, ['BILLING_READ', 'BILLING_MANAGE']);
}

export function clientNavContextFromSidebar(
  user: {
    isSubaccount?: boolean;
    customerPermissions?: string[] | null;
  } | null,
): ClientNavContext | null {
  if (!user) return null;
  return {
    isSubaccount: Boolean(user.isSubaccount),
    customerPermissions: user.customerPermissions ?? null,
  };
}
