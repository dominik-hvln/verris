import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: '/admin' },
      // Boty AI cytujące treść w odpowiedziach — jawnie dozwolone (AEO/GEO).
      {
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'OAI-SearchBot',
          'PerplexityBot',
          'ClaudeBot',
          'Claude-Web',
          'Google-Extended',
          'Applebot-Extended',
        ],
        allow: '/',
        disallow: '/admin',
      },
    ],
    sitemap: 'https://verris.pl/sitemap.xml',
    host: 'https://verris.pl',
  };
}
