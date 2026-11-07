/** Proste ikony liniowe 24×24 (stroke = currentColor). Wszystkie dekoracyjne – aria-hidden. */
const SCIEZKI: Record<string, string> = {
  check: 'M5 12.5l4.2 4.2L19 7',
  strzalka: 'M5 12h14M13 6l6 6-6 6',
  'strzalka-l': 'M19 12H5M11 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  zamknij: 'M6 6l12 12M18 6L6 18',
  telefon: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  zegar: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  menu: 'M4 7h16M4 12h16M4 17h16',
  nozyczki: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9L20 18M8.1 16.1L20 6',
  paleta: 'M12 3a9 9 0 0 0 0 18c1.2 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.2-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
  kalendarz: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  dom: 'M4 11l8-7 8 7v9H4zM10 20v-6h4v6',
  serce: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  dokument: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  kalkulator: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
  narzedzia: 'M14.7 6.3a4 4 0 0 0 5 5L12 19l-3 1 1-3 7.7-7.7M4 4l5 5',
  aparat: 'M4 8h4l2-3h4l2 3h4v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  lisc: 'M5 19C5 10 11 5 20 4c-1 9-6 15-15 15zM5 19l7-7',
  rozmowa: 'M4 5h16v11H9l-5 4z',
  paczka: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
  tarcza: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  osoba: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  gwiazdka: 'M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7',
  kubek: 'M5 8h11v7a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2',
  auto: 'M4 16v-4l2-5h12l2 5v4zM4 16v2h3v-2M17 16v2h3v-2M7.5 13h.01M16.5 13h.01',
  laptop: 'M5 5h14v10H5zM3 19h18',
  ksiazka: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16',
};

const SOCIAL: Record<string, string> = {
  facebook: 'M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v7h4v-7h3l1-4h-4V8z',
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01',
  linkedin: 'M4 9h4v11H4zM6 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 9h4v1.6A4 4 0 0 1 20 13v7h-4v-6a2 2 0 0 0-4 0v6h-2z',
  youtube: 'M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM10 9v6l5-3z',
  tiktok: 'M14 3v11a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 3 2.5 5 5.5 5',
  x: 'M4 4l16 16M20 4L4 20',
  pinterest: 'M12 3a9 9 0 0 0-3.3 17.4c0-1 .2-2 .5-3l1.3-5.4M10 12.5c0-2.5 1.2-4 3-4s2.6 1.2 2.6 2.8c0 2.3-1.3 4.2-3 4.2-1 0-1.6-.6-1.6-1.4',
};

export const NAZWY_SOCIAL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  x: 'X',
  pinterest: 'Pinterest',
};

export function czyIkona(nazwa: string | undefined): boolean {
  return !!nazwa && nazwa in SCIEZKI;
}

export function ikona(nazwa: string, klasa = 'ik'): string {
  const d = SCIEZKI[nazwa] ?? SOCIAL[nazwa];
  if (!d) return '';
  return `<svg class="${klasa}" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}
