import type { CollectionConfig } from 'payload';

export const Services: CollectionConfig = {
  slug: 'services',
  labels: { singular: 'Usługa', plural: 'Usługi' },
  admin: {
    useAsTitle: 'name',
    group: 'Treści',
    defaultColumns: ['name', 'priceLabel', 'order'],
  },
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text', required: true, label: 'Nazwa' },
    {
      name: 'icon',
      type: 'select',
      label: 'Ikona',
      defaultValue: 'server',
      options: [
        { label: 'Serwer (hosting)', value: 'server' },
        { label: 'Terminal (VPS)', value: 'terminal' },
        { label: 'Globus (domeny)', value: 'globe' },
        { label: 'Koperta (e-mail)', value: 'mail' },
        { label: 'Ludzie (reseller)', value: 'users' },
        { label: 'Przeprowadzka (migracja)', value: 'move' },
      ],
    },
    { name: 'summary', type: 'textarea', label: 'Opis', required: true },
    { name: 'priceLabel', type: 'text', label: 'Etykieta ceny', admin: { description: 'np. „39 zł/mies · 349 zł/rok brutto" albo „Wycena w panelu"' } },
    { name: 'ctaLabel', type: 'text', label: 'Tekst przycisku', defaultValue: 'Dowiedz się więcej →' },
    { name: 'ctaHref', type: 'text', label: 'Link przycisku', defaultValue: 'https://panel.verris.pl' },
    { name: 'highlighted', type: 'checkbox', label: 'Wyróżniona karta' },
    { name: 'order', type: 'number', label: 'Kolejność', admin: { position: 'sidebar' }, defaultValue: 0 },
  ],
};
