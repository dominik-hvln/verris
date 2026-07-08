import type { GlobalConfig } from 'payload';

export const Navigation: GlobalConfig = {
  slug: 'navigation',
  label: 'Nawigacja',
  admin: { group: 'Konfiguracja' },
  access: { read: () => true },
  fields: [
    {
      name: 'links',
      type: 'array',
      label: 'Linki w menu',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text', required: true },
      ],
    },
    {
      name: 'cta',
      type: 'group',
      label: 'Przycisk główny',
      fields: [
        { name: 'label', type: 'text', defaultValue: 'Załóż konto' },
        { name: 'href', type: 'text', defaultValue: 'https://panel.verris.pl' },
      ],
    },
  ],
};
