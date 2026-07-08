import type { CollectionConfig } from 'payload';

export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Strona', plural: 'Strony' },
  admin: {
    useAsTitle: 'title',
    group: 'Treści',
    defaultColumns: ['title', 'slug', 'updatedAt'],
    description: 'Strony statyczne (np. /reseller, /o-nas). Homepage renderowana jest z globalsów.',
  },
  access: { read: () => true },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true, label: 'Tytuł' },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Adres (slug)',
      admin: { position: 'sidebar', description: 'np. reseller → /reseller' },
    },
    {
      name: 'hero',
      type: 'group',
      label: 'Nagłówek',
      fields: [
        { name: 'eyebrow', type: 'text', label: 'Etykieta' },
        { name: 'heading', type: 'text', label: 'Nagłówek H1' },
        { name: 'lead', type: 'textarea', label: 'Lead' },
      ],
    },
    { name: 'content', type: 'richText', label: 'Treść' },
    {
      name: 'seo',
      type: 'group',
      label: 'SEO',
      fields: [
        { name: 'title', type: 'text', label: 'Meta title' },
        { name: 'description', type: 'textarea', label: 'Meta description' },
        { name: 'ogImage', type: 'upload', relationTo: 'media', label: 'Obraz OG' },
        { name: 'noindex', type: 'checkbox', label: 'Nie indeksuj (noindex)' },
      ],
    },
  ],
};
