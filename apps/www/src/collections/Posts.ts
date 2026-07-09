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
    {
      name: 'author',
      type: 'text',
      label: 'Autor',
      admin: { position: 'sidebar', description: 'Podpis autora (E-E-A-T, schema BlogPosting).' },
    },
    {
      name: 'keyword',
      type: 'text',
      label: 'Fraza główna',
      admin: { position: 'sidebar', description: 'Główne słowo kluczowe wpisu (SEO).' },
    },
    {
      name: 'cluster',
      type: 'text',
      label: 'Klaster tematyczny',
      admin: { position: 'sidebar', description: 'np. Migracja, Koszty, WordPress, Domeny.' },
    },
    {
      name: 'type',
      type: 'select',
      label: 'Typ wpisu',
      options: [
        { label: 'Pillar (filar klastra)', value: 'pillar' },
        { label: 'Spoke (wpis wspierający)', value: 'spoke' },
      ],
      admin: { position: 'sidebar' },
    },
    // Status (Draft/Published) zapewnia wersjonowanie Payload (`versions.drafts`) — nie dublujemy pola.
    {
      name: 'faq',
      type: 'json',
      label: 'FAQ (schema FAQPage)',
      admin: {
        description:
          'Pytania i odpowiedzi z końca wpisu — zasilają rich results i cytowania w AI. Format: [{"q":"Pytanie?","a":"Odpowiedź."}]',
      },
    },
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
