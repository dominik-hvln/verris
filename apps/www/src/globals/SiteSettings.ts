import type { GlobalConfig } from 'payload';

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Ustawienia serwisu',
  admin: { group: 'Konfiguracja' },
  access: { read: () => true },
  fields: [
    { name: 'brandName', type: 'text', defaultValue: 'Verris', label: 'Nazwa marki' },
    { name: 'tagline', type: 'text', defaultValue: 'Skaluj świadomie.', label: 'Tagline' },
    { name: 'claim', type: 'text', defaultValue: 'Hosting bez gwiazdek.', label: 'Claim brandowy' },
    { name: 'announce', type: 'text', label: 'Pasek ogłoszeń (announcement bar)' },
    {
      name: 'defaultSeo',
      type: 'group',
      label: 'Domyślne SEO',
      fields: [
        { name: 'title', type: 'text', label: 'Meta title' },
        { name: 'description', type: 'textarea', label: 'Meta description' },
        { name: 'ogImage', type: 'upload', relationTo: 'media', label: 'Domyślny obraz OG' },
      ],
    },
  ],
};
