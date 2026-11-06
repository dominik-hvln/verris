/** Szablony uprawnień subkonta (IAM-F.4). */
export const IAM_ROLE_PRESETS = [
  {
    id: 'support',
    label: 'Support (BOK)',
    description: 'Zgłoszenia do pomocy – podgląd i odpowiedzi',
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
    description: 'Usługi, DNS, poczta, pliki – bez płatności i bez rezygnacji z usług',
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
    // P3-05 — opis mówił „usług, domen i ticketów”, a szablon dawał też płatności i portfel.
    id: 'readonly',
    label: 'Podgląd',
    description: 'Tylko odczyt usług, domen i zgłoszeń – bez płatności i portfela',
    permissions: ['SERVICES_READ', 'DOMAINS_READ', 'TICKETS_READ'],
  },
] as const;
