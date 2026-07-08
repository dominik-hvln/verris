import type { GlobalConfig } from 'payload';

export const Pricing: GlobalConfig = {
  slug: 'pricing',
  label: 'Cennik hostingu',
  admin: { group: 'Konfiguracja' },
  access: { read: () => true },
  fields: [
    { name: 'planName', type: 'text', defaultValue: 'Hosting Verris z autoskalowaniem' },
    { name: 'priceMonthly', type: 'number', defaultValue: 39, label: 'Cena miesięczna (brutto PLN)' },
    { name: 'priceYearly', type: 'number', defaultValue: 349, label: 'Cena roczna (brutto PLN)' },
    {
      name: 'resources',
      type: 'array',
      label: 'Zasoby bazowe (baza → max autoskalowania)',
      admin: { description: 'np. Dysk NVMe · 50 GB · → 1000 GB' },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'base', type: 'text', required: true },
        { name: 'max', type: 'text' },
      ],
    },
    {
      name: 'featureGroups',
      type: 'array',
      label: 'Grupy funkcji',
      fields: [
        { name: 'group', type: 'text', required: true },
        {
          name: 'items',
          type: 'array',
          fields: [{ name: 'item', type: 'text', required: true }],
        },
      ],
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Nota (fair use / autoskalowanie)',
      defaultValue:
        '„Bez limitu" oznacza brak sztywnego licznika — realnym ogranicznikiem są zasoby konta (CPU/RAM/dysk) i zasady uczciwego korzystania. Autoskalowanie ponad bazę rozliczane jest godzinowo według stawek z cennika.',
    },
  ],
};
