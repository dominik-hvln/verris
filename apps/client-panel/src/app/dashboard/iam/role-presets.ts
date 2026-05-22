/** Szablony uprawnień subkonta (IAM-F.4). */
export const IAM_ROLE_PRESETS = [
  {
    id: 'support',
    label: 'Support (BOK)',
    description: 'Tickety — podgląd i odpowiedzi',
    permissions: ['TICKETS_READ', 'TICKETS_MANAGE'],
  },
  {
    id: 'billing',
    label: 'Księgowość',
    description: 'Faktury i płatności',
    permissions: ['BILLING_READ', 'BILLING_MANAGE'],
  },
  {
    id: 'devops',
    label: 'DevOps',
    description: 'Serwery, DNS, poczta, pliki',
    permissions: [
      'SERVICES_READ',
      'SERVICES_MANAGE',
      'DOMAINS_READ',
      'DNS_MANAGE',
      'EMAIL_MANAGE',
      'FILES_MANAGE',
    ],
  },
  {
    id: 'readonly',
    label: 'Podgląd',
    description: 'Tylko odczyt usług, domen i ticketów',
    permissions: ['SERVICES_READ', 'DOMAINS_READ', 'TICKETS_READ', 'BILLING_READ'],
  },
] as const;
