import type { CollectionConfig } from 'payload';

export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  admin: { group: 'Treści' },
  upload: {
    staticDir: 'public/media',
    imageSizes: [
      { name: 'thumbnail', width: 480 },
      { name: 'card', width: 900 },
      { name: 'hero', width: 1600 },
    ],
    mimeTypes: ['image/*'],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      label: 'Tekst alternatywny',
      admin: { description: 'Wymagany dla dostępności (EAA) i SEO.' },
    },
  ],
};
