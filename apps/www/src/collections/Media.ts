import type { CollectionConfig } from 'payload';

export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  admin: { group: 'Treści' },
  upload: {
    staticDir: 'public/media',
    // Bez imageSizes — auto-skalowanie wymaga sharp (wyłączony, patrz payload.config.ts).
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
