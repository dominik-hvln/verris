import type { CollectionConfig } from 'payload';

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: 'Wpis bloga', plural: 'Blog' },
  admin: {
    useAsTitle: 'title',
    group: 'Treści',
    defaultColumns: ['title', 'slug', 'publishedAt'],
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
      admin: { position: 'sidebar' },
    },
    // TODO: pole „author" (E-E-A-T) dodać RAZEM z migracją Payload (nowa kolumna).
    { name: 'excerpt', type: 'textarea', label: 'Zajawka', maxLength: 300 },
    { name: 'coverImage', type: 'upload', relationTo: 'media', label: 'Obraz wyróżniający' },
    { name: 'content', type: 'richText', label: 'Treść' },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Data publikacji',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'seo',
      type: 'group',
      label: 'SEO',
      fields: [
        { name: 'title', type: 'text', label: 'Meta title' },
        { name: 'description', type: 'textarea', label: 'Meta description' },
        { name: 'ogImage', type: 'upload', relationTo: 'media', label: 'Obraz OG' },
      ],
    },
  ],
};
