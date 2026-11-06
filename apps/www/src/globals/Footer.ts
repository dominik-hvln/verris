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
      // A2-09 (3.11.2026): stopka bierze dane sprzedawcy z kodu (apps/www/src/lib/sprzedawca.ts) — pole zostaje
      // w bazie, ale nie jest wyświetlane.
      admin: { description: 'Nieużywane – dane sprzedawcy w stopce pochodzą z kodu strony.' },
      defaultValue: '© 2026 Verris · Operator: HVLN Dominik Kowalski, Zielona Góra · NIP 9292069367',
    },
    {
      name: 'payLine',
      type: 'text',
      label: 'Linia płatności / SLA',
      defaultValue:
        'Płatności: karta · BLIK · Przelewy24 · Paynow · SLA 99,5% z rekompensatami przyznawanymi automatycznie wg regulaminu',
    },
  ],
};
