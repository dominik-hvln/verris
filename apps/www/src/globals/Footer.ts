import type { GlobalConfig } from 'payload';

export const Footer: GlobalConfig = {
  slug: 'footer',
  label: 'Stopka',
  admin: { group: 'Konfiguracja' },
  access: { read: () => true },
  fields: [
    {
      name: 'columns',
      type: 'array',
      label: 'Kolumny',
      fields: [
        { name: 'heading', type: 'text', required: true },
        {
          name: 'links',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'href', type: 'text', required: true },
          ],
        },
      ],
    },
    {
      name: 'legalLine',
      type: 'text',
      label: 'Linia prawna',
      defaultValue: '© 2026 Verris · Operator: HVLN Dominik Kowalski, Zielona Góra · NIP 9292069367',
    },
    {
      name: 'payLine',
      type: 'text',
      label: 'Linia płatności / SLA',
      defaultValue:
        'Płatności: karta · BLIK · Apple Pay · Google Pay · Stripe · SLA 99,5% z automatycznymi rekompensatami wg regulaminu',
    },
  ],
};
