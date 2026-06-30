'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Rocket,
  Download,
  Loader2,
  Check,
  AlertTriangle,
  Monitor,
  Smartphone,
  LayoutTemplate,
  GripVertical,
  Image as ImageIcon,
  Folder,
  X,
  FileText,
  Upload,
  Copy,
} from 'lucide-react';
import { fmWrite, fmRead, fmList, fmUpload, type FmEntry } from '@/app/dashboard/file-manager/data';

/* ============================ MODEL ============================ */
type SectionType =
  | 'navbar' | 'banner' | 'hero' | 'stats' | 'features' | 'steps' | 'imagetext' | 'gallery' | 'portfolio' | 'pricing' | 'menu'
  | 'testimonials' | 'quote' | 'team' | 'timeline' | 'tabs' | 'table' | 'faq' | 'logos' | 'about' | 'richtext'
  | 'blog' | 'article' | 'video' | 'map' | 'hours' | 'countdown' | 'download' | 'social' | 'cta' | 'newsletter'
  | 'contact' | 'embed' | 'divider' | 'cookies' | 'footer';

type Section = { id: string; type: SectionType; data: Record<string, unknown> };
type ThemeFont = 'sans' | 'serif' | 'mono' | 'rounded' | 'condensed';
type Theme = { primary: string; accent: string; bg: 'light' | 'dark'; font: ThemeFont; radius: 'sm' | 'md' | 'xl'; width: 'normal' | 'wide' };
const FONT_STACK: Record<ThemeFont, string> = {
  sans: 'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  rounded: '"Trebuchet MS", "Segoe UI", Verdana, system-ui, sans-serif',
  condensed: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", system-ui, sans-serif',
};
type Page = { id: string; name: string; slug: string; title: string; sections: Section[] };
type PageModel = { meta: { description: string }; theme: Theme; pages: Page[] };

const uid = () => Math.random().toString(36).slice(2, 9);
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[ąàä]/g, 'a').replace(/[ćč]/g, 'c').replace(/[ęé]/g, 'e').replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/[óö]/g, 'o').replace(/[śš]/g, 's').replace(/[żź]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'strona';
const pageHref = (slug: string) => (slug === 'index' ? 'index.html' : `${slug}.html`);

const SECTION_LABEL: Record<SectionType, string> = {
  navbar: 'Nawigacja', banner: 'Pasek ogłoszeniowy', hero: 'Hero (nagłówek)', stats: 'Statystyki / liczby',
  features: 'Cechy / usługi', steps: 'Jak to działa (kroki)', imagetext: 'Obraz + tekst', gallery: 'Galeria',
  portfolio: 'Portfolio / realizacje', pricing: 'Cennik', menu: 'Menu / lista usług z cenami',
  testimonials: 'Opinie klientów', quote: 'Wyróżniony cytat', team: 'Zespół', timeline: 'Oś czasu / historia',
  tabs: 'Zakładki (tabs)', table: 'Tabela / porównanie', faq: 'FAQ', logos: 'Logo / partnerzy', about: 'O nas',
  richtext: 'Sekcja tekstowa', blog: 'Blog — lista wpisów', article: 'Wpis bloga (treść)',
  video: 'Wideo (YouTube/Vimeo)', map: 'Mapa (Google)', hours: 'Godziny otwarcia', countdown: 'Licznik odliczający',
  download: 'Pliki do pobrania', social: 'Social media', cta: 'Wezwanie do działania', newsletter: 'Newsletter',
  contact: 'Kontakt', embed: 'Własny kod HTML', divider: 'Odstęp / linia', cookies: 'Baner cookies (RODO)', footer: 'Stopka',
};

function defaultSection(type: SectionType): Section {
  const y = new Date().getFullYear();
  const base: Record<SectionType, Record<string, unknown>> = {
    navbar: { brand: 'Twoja Firma', links: ['Start', 'Oferta', 'Cennik', 'Kontakt'], ctaText: 'Napisz do nas', sticky: true },
    hero: { eyebrow: 'Witaj', title: 'Twoja nowa strona internetowa', subtitle: 'Profesjonalna obecność w sieci w kilka minut — bez kodowania.', ctaText: 'Zaczynamy', ctaHref: '#kontakt', ctaSecondary: 'Dowiedz się więcej', bgImage: '', align: 'left' },
    stats: { items: [{ value: '500+', label: 'Zadowolonych klientów' }, { value: '99,9%', label: 'Dostępności' }, { value: '24/7', label: 'Wsparcia' }, { value: '10 lat', label: 'Doświadczenia' }] },
    features: { title: 'Co oferujemy', subtitle: 'Wszystko, czego potrzebujesz w jednym miejscu.', items: [{ icon: '⚡', title: 'Szybkość', desc: 'Błyskawiczne ładowanie na hostingu LiteSpeed.' }, { icon: '🔒', title: 'Bezpieczeństwo', desc: 'SSL, backupy i WAF w standardzie.' }, { icon: '💬', title: 'Wsparcie', desc: 'Jesteśmy z Tobą na każdym kroku.' }] },
    gallery: { title: 'Galeria', images: [{ url: 'https://picsum.photos/seed/a/600/400', caption: 'Realizacja 1' }, { url: 'https://picsum.photos/seed/b/600/400', caption: 'Realizacja 2' }, { url: 'https://picsum.photos/seed/c/600/400', caption: 'Realizacja 3' }] },
    pricing: { title: 'Cennik', subtitle: 'Wybierz plan dopasowany do Ciebie.', plans: [{ name: 'Start', price: '29', period: '/mies.', features: 'Strona WWW\n1 skrzynka e-mail\nCertyfikat SSL', ctaText: 'Wybieram', featured: false }, { name: 'Pro', price: '59', period: '/mies.', features: 'Wszystko ze Start\nSklep online\nPriorytetowe wsparcie', ctaText: 'Wybieram', featured: true }, { name: 'Biznes', price: '99', period: '/mies.', features: 'Wszystko z Pro\nDedykowane zasoby\nOpiekun konta', ctaText: 'Wybieram', featured: false }] },
    testimonials: { title: 'Co mówią klienci', items: [{ quote: 'Najlepsza decyzja dla mojego biznesu. Wszystko działa szybko i bez problemów.', author: 'Anna Kowalska', role: 'Właścicielka sklepu' }, { quote: 'Profesjonalne wsparcie i świetny panel. Polecam każdemu.', author: 'Marek Nowak', role: 'Freelancer' }] },
    team: { title: 'Nasz zespół', items: [{ name: 'Jan Kowalski', role: 'Założyciel', photo: 'https://i.pravatar.cc/200?img=12' }, { name: 'Ewa Wiśniewska', role: 'Projektantka', photo: 'https://i.pravatar.cc/200?img=5' }] },
    faq: { title: 'Najczęstsze pytania', items: [{ q: 'Jak długo trwa uruchomienie?', a: 'Twoja strona działa od razu po opublikowaniu.' }, { q: 'Czy mogę zmienić plan?', a: 'Tak, w dowolnym momencie z poziomu panelu.' }] },
    logos: { title: 'Zaufali nam', items: ['ACME', 'Globex', 'Initech', 'Umbrella', 'Soylent'] },
    about: { title: 'O nas', body: 'Krótko o Twojej firmie — czym się zajmujesz i dlaczego warto Ci zaufać. Edytuj ten tekst, aby opowiedzieć swoją historię.', image: 'https://picsum.photos/seed/about/700/500' },
    video: { title: 'Zobacz nas w akcji', subtitle: 'Krótki film o tym, co robimy.', url: 'https://www.youtube.com/watch?v=ScMzIvxBSi4' },
    map: { title: 'Znajdź nas', query: 'Pałac Kultury i Nauki, Warszawa', height: '420', zoom: '15' },
    banner: { text: '🎉 Promocja startowa — 30% taniej przez pierwszy miesiąc!', linkText: 'Sprawdź', linkHref: '#cennik' },
    steps: { title: 'Jak to działa', subtitle: 'Trzy proste kroki do startu.', items: [{ title: 'Zamów', desc: 'Wybierz plan i złóż zamówienie online.' }, { title: 'Skonfiguruj', desc: 'Przeprowadzimy Cię przez ustawienia krok po kroku.' }, { title: 'Działaj', desc: 'Twoja strona jest gotowa i na żywo.' }] },
    portfolio: { title: 'Nasze realizacje', subtitle: 'Wybrane projekty, z których jesteśmy dumni.', items: [{ image: 'https://picsum.photos/seed/p1/600/400', title: 'Projekt 1', desc: 'Strona dla lokalnej firmy.', href: '#' }, { image: 'https://picsum.photos/seed/p2/600/400', title: 'Projekt 2', desc: 'Sklep internetowy.', href: '#' }, { image: 'https://picsum.photos/seed/p3/600/400', title: 'Projekt 3', desc: 'Portfolio fotografa.', href: '#' }] },
    menu: { title: 'Menu', subtitle: 'Nasze propozycje.', items: [{ category: 'Przystawki', name: 'Bruschetta', desc: 'Pieczywo, pomidory, bazylia', price: '18 zł' }, { category: 'Przystawki', name: 'Carpaccio', desc: 'Wołowina, parmezan, rukola', price: '32 zł' }, { category: 'Dania główne', name: 'Risotto', desc: 'Grzyby leśne, parmezan', price: '46 zł' }, { category: 'Dania główne', name: 'Stek', desc: 'Polędwica wołowa, masło ziołowe', price: '78 zł' }] },
    richtext: { title: 'Tytuł sekcji', body: 'To jest sekcja tekstowa — idealna na dłuższy opis, regulamin, politykę prywatności albo historię firmy.\n\nKażdy pusty wiersz tworzy nowy akapit. Edytuj swobodnie tę treść.' },
    hours: { title: 'Godziny otwarcia', rows: [{ day: 'Poniedziałek – Piątek', hours: '9:00 – 18:00' }, { day: 'Sobota', hours: '10:00 – 14:00' }, { day: 'Niedziela', hours: 'Zamknięte' }], note: 'W święta godziny mogą się różnić.' },
    countdown: { title: 'Oferta kończy się za:', subtitle: 'Nie przegap promocji startowej.', date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 16), expiredText: 'Oferta zakończona' },
    social: { title: 'Znajdź nas w sieci', items: [{ network: 'facebook', url: 'https://facebook.com/' }, { network: 'instagram', url: 'https://instagram.com/' }, { network: 'linkedin', url: 'https://linkedin.com/' }] },
    embed: { title: '', html: '<!-- Wklej tutaj własny kod HTML: widget rezerwacji, mapę, formularz zewnętrzny, iframe itp. -->\n<div style="padding:40px;text-align:center;border:1px dashed #ccc;border-radius:12px">Twój kod HTML pojawi się tutaj.</div>' },
    imagetext: { title: 'Sekcja z obrazem', body: 'Opisz tutaj swoją ofertę, produkt lub usługę. Ten układ świetnie sprawdza się do prezentacji kluczowych korzyści obok zdjęcia.', image: 'https://picsum.photos/seed/it/700/520', imageSide: 'right', ctaText: 'Dowiedz się więcej', ctaHref: '#' },
    quote: { text: 'Sukces to suma małych wysiłków, powtarzanych dzień po dniu.', author: 'Zadowolony klient', role: '' },
    timeline: { title: 'Nasza historia', items: [{ when: '2020', title: 'Początek', desc: 'Założyliśmy firmę z pasji.' }, { when: '2023', title: 'Rozwój', desc: 'Otworzyliśmy nowy oddział.' }, { when: '2026', title: 'Dziś', desc: 'Obsługujemy klientów w całej Polsce.' }] },
    tabs: { title: 'Szczegóły', items: [{ label: 'Opis', content: 'Pełny opis Twojej usługi lub produktu. Edytuj tę treść.' }, { label: 'Specyfikacja', content: 'Parametry techniczne, wymiary, dane szczegółowe.' }, { label: 'Dostawa', content: 'Informacje o czasie i kosztach dostawy.' }] },
    table: { title: 'Porównanie', headers: ['Funkcja', 'Start', 'Pro'], rows: [{ cells: 'Strona WWW\n✓\n✓' }, { cells: 'Sklep online\n—\n✓' }, { cells: 'Wsparcie priorytetowe\n—\n✓' }] },
    blog: { title: 'Blog', subtitle: 'Najnowsze artykuły i aktualności.', items: [{ image: 'https://picsum.photos/seed/b1/600/360', title: 'Pierwszy wpis', excerpt: 'Krótki zajawka artykułu, która zachęca do kliknięcia.', date: '12.06.2026', href: 'wpis.html' }, { image: 'https://picsum.photos/seed/b2/600/360', title: 'Drugi wpis', excerpt: 'Kolejny ciekawy temat dla Twoich czytelników.', date: '01.06.2026', href: '#' }] },
    article: { title: 'Tytuł artykułu', author: 'Autor', date: '12.06.2026', cover: 'https://picsum.photos/seed/art/1000/420', body: 'Wstęp do artykułu — przyciągnij uwagę czytelnika pierwszym akapitem.\n\nKolejny akapit rozwija temat. Każdy pusty wiersz tworzy nowy akapit, dzięki czemu łatwo zapanujesz nad strukturą tekstu.\n\nZakończ wpis podsumowaniem i wezwaniem do działania.' },
    download: { title: 'Do pobrania', subtitle: 'Materiały, cenniki i dokumenty.', items: [{ name: 'Cennik 2026 (PDF)', desc: 'Pełna oferta i ceny.', href: '#', meta: 'PDF · 1,2 MB' }, { name: 'Katalog produktów', desc: 'Nasze produkty w jednym pliku.', href: '#', meta: 'PDF · 4,5 MB' }] },
    divider: { style: 'line', height: '60' },
    cookies: { text: 'Ta strona używa plików cookie, aby zapewnić najlepsze doświadczenia. Korzystając z niej, akceptujesz naszą politykę prywatności.', acceptText: 'Akceptuję', moreText: 'Polityka prywatności', moreHref: '#' },
    cta: { title: 'Gotowy, by zacząć?', subtitle: 'Skontaktuj się z nami już dziś.', buttonText: 'Skontaktuj się', buttonHref: '#kontakt' },
    newsletter: { title: 'Bądź na bieżąco', subtitle: 'Zapisz się i odbieraj nowości oraz porady.', buttonText: 'Zapisz się', placeholder: 'Twój e-mail' },
    contact: { title: 'Kontakt', email: 'kontakt@twojadomena.pl', phone: '+48 000 000 000', address: 'ul. Przykładowa 1, Warszawa', showForm: true },
    footer: { brand: 'Twoja Firma', note: `© ${y} Wszelkie prawa zastrzeżone.`, links: ['Polityka prywatności', 'Regulamin'] },
  };
  return { id: uid(), type, data: base[type] };
}

const SEC = (types: SectionType[]) => types.map((t) => defaultSection(t));
type RawTpl = { title: string; description: string; theme: Theme; sections: Section[] };
const RAW_TEMPLATES: Record<string, () => RawTpl> = {
  landing: () => ({ title: 'Twoja Firma — strona', description: 'Profesjonalna strona Twojej firmy.', theme: { primary: '#34e5a0', accent: '#5b8cff', bg: 'dark', font: 'sans', radius: 'xl', width: 'normal' }, sections: SEC(['navbar', 'hero', 'logos', 'features', 'stats', 'pricing', 'testimonials', 'cta', 'contact', 'footer']) }),
  agencja: () => ({ title: 'Agencja — portfolio', description: 'Tworzymy marki, które zapadają w pamięć.', theme: { primary: '#a855f7', accent: '#ec4899', bg: 'dark', font: 'serif', radius: 'md', width: 'wide' }, sections: SEC(['navbar', 'hero', 'stats', 'gallery', 'features', 'team', 'testimonials', 'cta', 'footer']) }),
  sklep: () => ({ title: 'Sklep online', description: 'Zakupy online bez wychodzenia z domu.', theme: { primary: '#f59e0b', accent: '#10b981', bg: 'light', font: 'sans', radius: 'md', width: 'normal' }, sections: SEC(['navbar', 'hero', 'features', 'gallery', 'pricing', 'testimonials', 'faq', 'newsletter', 'footer']) }),
  wizytowka: () => ({ title: 'Wizytówka firmy', description: 'Poznaj naszą ofertę i dane kontaktowe.', theme: { primary: '#2563eb', accent: '#0ea5e9', bg: 'light', font: 'sans', radius: 'md', width: 'normal' }, sections: SEC(['navbar', 'hero', 'about', 'features', 'contact', 'footer']) }),
  freelancer: () => ({ title: 'Portfolio', description: 'Cześć! Oto moje projekty.', theme: { primary: '#14b8a6', accent: '#f43f5e', bg: 'dark', font: 'sans', radius: 'xl', width: 'normal' }, sections: SEC(['navbar', 'hero', 'about', 'gallery', 'stats', 'faq', 'cta', 'footer']) }),
  restauracja: () => ({ title: 'Restauracja — menu i rezerwacje', description: 'Świeże składniki, wyjątkowe smaki.', theme: { primary: '#d97706', accent: '#b91c1c', bg: 'dark', font: 'serif', radius: 'md', width: 'normal' }, sections: SEC(['navbar', 'hero', 'about', 'gallery', 'pricing', 'testimonials', 'contact', 'footer']) }),
  fitness: () => ({ title: 'Klub fitness', description: 'Trenuj z najlepszymi. Dołącz już dziś.', theme: { primary: '#22c55e', accent: '#eab308', bg: 'dark', font: 'sans', radius: 'md', width: 'normal' }, sections: SEC(['navbar', 'hero', 'stats', 'features', 'pricing', 'testimonials', 'cta', 'footer']) }),
  kancelaria: () => ({ title: 'Kancelaria', description: 'Profesjonalne doradztwo prawne.', theme: { primary: '#1e3a8a', accent: '#0ea5e9', bg: 'light', font: 'serif', radius: 'sm', width: 'normal' }, sections: SEC(['navbar', 'hero', 'about', 'features', 'team', 'faq', 'contact', 'footer']) }),
  fotograf: () => ({ title: 'Fotografia', description: 'Uchwycę Twoje najważniejsze chwile.', theme: { primary: '#e5e7eb', accent: '#f59e0b', bg: 'dark', font: 'sans', radius: 'sm', width: 'wide' }, sections: SEC(['navbar', 'hero', 'gallery', 'about', 'testimonials', 'contact', 'footer']) }),
  produkt: () => ({ title: 'Produkt — landing page', description: 'Jeden produkt, jedna decyzja: kup teraz.', theme: { primary: '#6366f1', accent: '#22d3ee', bg: 'dark', font: 'sans', radius: 'xl', width: 'normal' }, sections: SEC(['navbar', 'banner', 'hero', 'logos', 'features', 'imagetext', 'stats', 'testimonials', 'pricing', 'faq', 'cta', 'footer']) }),
  saas: () => ({ title: 'Aplikacja / SaaS', description: 'Nowoczesne narzędzie dla Twojego zespołu.', theme: { primary: '#2563eb', accent: '#8b5cf6', bg: 'dark', font: 'sans', radius: 'md', width: 'wide' }, sections: SEC(['navbar', 'hero', 'logos', 'features', 'tabs', 'imagetext', 'pricing', 'faq', 'cta', 'footer']) }),
  blog: () => ({ title: 'Blog / magazyn', description: 'Artykuły, porady i aktualności.', theme: { primary: '#0ea5e9', accent: '#f59e0b', bg: 'light', font: 'serif', radius: 'md', width: 'normal' }, sections: SEC(['navbar', 'hero', 'blog', 'newsletter', 'about', 'footer']) }),
  wpis: () => ({ title: 'Wpis bloga', description: 'Pojedynczy artykuł.', theme: { primary: '#0ea5e9', accent: '#f59e0b', bg: 'light', font: 'serif', radius: 'md', width: 'normal' }, sections: SEC(['navbar', 'article', 'cta', 'footer']) }),
  wydarzenie: () => ({ title: 'Wydarzenie / konferencja', description: 'Dołącz do nas — zarejestruj się już dziś.', theme: { primary: '#f43f5e', accent: '#6366f1', bg: 'dark', font: 'condensed', radius: 'md', width: 'normal' }, sections: SEC(['navbar', 'hero', 'countdown', 'steps', 'team', 'pricing', 'faq', 'map', 'cta', 'footer']) }),
  przychodnia: () => ({ title: 'Przychodnia / gabinet', description: 'Profesjonalna opieka, której możesz zaufać.', theme: { primary: '#0d9488', accent: '#0ea5e9', bg: 'light', font: 'sans', radius: 'md', width: 'normal' }, sections: SEC(['navbar', 'hero', 'features', 'team', 'hours', 'faq', 'contact', 'map', 'footer']) }),
  nieruchomosci: () => ({ title: 'Nieruchomości', description: 'Znajdź swój wymarzony dom.', theme: { primary: '#b45309', accent: '#1e3a8a', bg: 'light', font: 'serif', radius: 'sm', width: 'wide' }, sections: SEC(['navbar', 'hero', 'portfolio', 'features', 'stats', 'testimonials', 'contact', 'footer']) }),
  kursy: () => ({ title: 'Kursy / edukacja', description: 'Ucz się od najlepszych, we własnym tempie.', theme: { primary: '#7c3aed', accent: '#22c55e', bg: 'dark', font: 'rounded', radius: 'xl', width: 'normal' }, sections: SEC(['navbar', 'hero', 'stats', 'features', 'steps', 'pricing', 'testimonials', 'faq', 'cta', 'footer']) }),
  kawiarnia: () => ({ title: 'Kawiarnia / bar', description: 'Wpadnij na najlepszą kawę w mieście.', theme: { primary: '#d97706', accent: '#7c2d12', bg: 'dark', font: 'serif', radius: 'md', width: 'normal' }, sections: SEC(['navbar', 'hero', 'menu', 'gallery', 'hours', 'map', 'social', 'footer']) }),
  uslugi: () => ({ title: 'Usługi lokalne', description: 'Solidnie, terminowo, w dobrej cenie.', theme: { primary: '#16a34a', accent: '#f59e0b', bg: 'light', font: 'sans', radius: 'md', width: 'normal' }, sections: SEC(['navbar', 'hero', 'features', 'steps', 'portfolio', 'pricing', 'testimonials', 'contact', 'footer']) }),
  cv: () => ({ title: 'CV / wizytówka osobista', description: 'Cześć! Oto kim jestem i co robię.', theme: { primary: '#0ea5e9', accent: '#a855f7', bg: 'dark', font: 'sans', radius: 'xl', width: 'normal' }, sections: SEC(['navbar', 'hero', 'about', 'timeline', 'portfolio', 'social', 'contact', 'footer']) }),
  organizacja: () => ({ title: 'Fundacja / NGO', description: 'Razem możemy więcej. Dołącz do nas.', theme: { primary: '#16a34a', accent: '#0ea5e9', bg: 'light', font: 'sans', radius: 'md', width: 'normal' }, sections: SEC(['navbar', 'hero', 'stats', 'about', 'steps', 'team', 'cta', 'contact', 'footer']) }),
};
/** PHP handler publikowany obok stron — zapisuje zgłoszenia do CSV i wysyła e-mail (PHP mail()). */
function genFormHandler(recipient: string): string {
  const to = (recipient || 'kontakt@twojadomena.pl').replace(/[\r\n"'\\]/g, '');
  return [
    '<?php',
    '// Wygenerowane przez Kreator stron Verris. Obsługa formularzy kontakt/newsletter.',
    "if (\\$_SERVER['REQUEST_METHOD'] !== 'POST') { header('Location: index.html'); exit; }",
    "\\$to = '" + to + "';",
    "if (!empty(\\$_POST['_company'])) { header('Location: ' . (\\$_SERVER['HTTP_REFERER'] ?? 'index.html')); exit; } // honeypot (bot)",
    "\\$type = isset(\\$_POST['_type']) ? substr(preg_replace('/[^\\p{L}\\p{N} _-]/u','', \\$_POST['_type']), 0, 40) : 'Formularz';",
    "\\$lines = array(); \\$row = array(date('c'), \\$type);",
    "foreach (\\$_POST as \\$k => \\$v) {",
    "  if (\\$k === '_company' || \\$k === '_type' || !is_string(\\$v)) continue;",
    "  \\$v = trim(\\$v); if (\\$v === '') continue;",
    "  \\$lines[] = \\$k . ': ' . \\$v;",
    "  \\$row[] = \\$k . '=' . str_replace(array(\"\\n\",\"\\r\"), ' ', \\$v);",
    "}",
    "// zapis do CSV (kopia zgłoszenia na koncie)",
    "\\$fh = @fopen(__DIR__ . '/form-submissions.csv', 'a');",
    "if (\\$fh) { @fputcsv(\\$fh, \\$row); @fclose(\\$fh); }",
    "// wysyłka e-mail do właściciela strony",
    "\\$body = \"Nowe zgłoszenie z formularza ({\\$type}) na Twojej stronie:\\n\\n\" . implode(\"\\n\", \\$lines) . \"\\n\\n— wysłane automatycznie przez stronę.\";",
    "\\$replyTo = isset(\\$_POST['email']) && filter_var(\\$_POST['email'], FILTER_VALIDATE_EMAIL) ? \\$_POST['email'] : \\$to;",
    "\\$headers = 'From: strona@' . (\\$_SERVER['SERVER_NAME'] ?? 'localhost') . \"\\r\\n\" . 'Reply-To: ' . \\$replyTo . \"\\r\\n\" . 'Content-Type: text/plain; charset=UTF-8';",
    "@mail(\\$to, '[Strona] ' . \\$type, \\$body, \\$headers);",
    "\\$back = \\$_SERVER['HTTP_REFERER'] ?? 'index.html';",
    "\\$back .= (strpos(\\$back, '?') === false ? '?' : '&') . 'sent=1';",
    "header('Location: ' . \\$back); echo 'OK';",
  ].join('\n');
}

function asModel(t: RawTpl): PageModel {
  return { meta: { description: t.description }, theme: t.theme, pages: [{ id: uid(), name: 'Strona główna', slug: 'index', title: t.title, sections: t.sections }] };
}

const COLOR_PRESETS: { label: string; primary: string; accent: string }[] = [
  { label: 'Mint', primary: '#34e5a0', accent: '#5b8cff' },
  { label: 'Ocean', primary: '#2563eb', accent: '#0ea5e9' },
  { label: 'Sunset', primary: '#f59e0b', accent: '#ef4444' },
  { label: 'Violet', primary: '#a855f7', accent: '#ec4899' },
  { label: 'Forest', primary: '#16a34a', accent: '#84cc16' },
  { label: 'Slate', primary: '#64748b', accent: '#22d3ee' },
  { label: 'Rose', primary: '#f43f5e', accent: '#fb7185' },
  { label: 'Amber', primary: '#f59e0b', accent: '#fbbf24' },
  { label: 'Teal', primary: '#14b8a6', accent: '#2dd4bf' },
  { label: 'Indigo', primary: '#6366f1', accent: '#818cf8' },
  { label: 'Crimson', primary: '#dc2626', accent: '#f97316' },
  { label: 'Sky', primary: '#0ea5e9', accent: '#38bdf8' },
  { label: 'Lime', primary: '#65a30d', accent: '#a3e635' },
  { label: 'Royal', primary: '#7c3aed', accent: '#2563eb' },
  { label: 'Coral', primary: '#fb7185', accent: '#f59e0b' },
  { label: 'Graphite', primary: '#3f3f46', accent: '#71717a' },
];

/* ============================ HTML GENERATOR ============================ */
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FORM_ACTION = 'form-handler.php';
const SOCIAL_ICON: Record<string, { e: string; l: string }> = {
  facebook: { e: '📘', l: 'Facebook' }, instagram: { e: '📷', l: 'Instagram' }, linkedin: { e: '💼', l: 'LinkedIn' },
  youtube: { e: '▶️', l: 'YouTube' }, twitter: { e: '✖️', l: 'X / Twitter' }, x: { e: '✖️', l: 'X' },
  tiktok: { e: '🎵', l: 'TikTok' }, whatsapp: { e: '💬', l: 'WhatsApp' }, email: { e: '✉️', l: 'E-mail' },
  phone: { e: '📞', l: 'Telefon' }, pinterest: { e: '📌', l: 'Pinterest' }, github: { e: '🐙', l: 'GitHub' },
};
const socialIcon = (n: string) => SOCIAL_ICON[(n || '').toLowerCase().trim()] ?? { e: '🔗', l: n || 'Link' };
function videoEmbed(raw: string): { kind: 'frame' | 'file'; src: string } | null {
  const url = raw.trim();
  if (!url) return null;
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) return { kind: 'file', src: url };
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return { kind: 'frame', src: `https://www.youtube-nocookie.com/embed/${m[1]}` };
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { kind: 'frame', src: `https://player.vimeo.com/video/${m[1]}` };
  if (/^https?:\/\//i.test(url)) return { kind: 'frame', src: url };
  return null;
}

type NavLink = { name: string; href: string };
type Ctx = { p: string; a: string; fg: string; mut: string; card: string; line: string; bg2: string; dark: boolean; rad: string; nav: NavLink[] };

function genHtml(page: Page, theme: Theme, description: string, nav: NavLink[]): string {
  const t = theme;
  const dark = t.bg === 'dark';
  const font = FONT_STACK[t.font] ?? FONT_STACK.sans;
  const bg = dark ? '#0b0b0e' : '#ffffff';
  const bg2 = dark ? '#121217' : '#f6f7f9';
  const fg = dark ? '#f5f5f7' : '#16161a';
  const mut = dark ? '#a6a6b0' : '#5b5b66';
  const card = dark ? '#16161c' : '#ffffff';
  const line = dark ? '#26262e' : '#e6e6ec';
  const rad = t.radius === 'sm' ? '8px' : t.radius === 'md' ? '14px' : '22px';
  const maxw = t.width === 'wide' ? '1240px' : '1080px';
  const ctx: Ctx = { p: t.primary, a: t.accent, fg, mut, card, line, bg2, dark, rad, nav };
  const body = page.sections.map((s) => renderSection(s, ctx)).join('\n');
  return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(description)}"/>
<meta property="og:title" content="${esc(page.title)}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:type" content="website"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:${font};background:${bg};color:${fg};line-height:1.6}
img{max-width:100%;display:block}
.wrap{max-width:${maxw};margin:0 auto;padding:0 24px}
a{color:inherit;text-decoration:none}
.btn{display:inline-flex;align-items:center;gap:8px;background:${t.primary};color:${dark ? '#04100b' : '#0a0a0a'};font-weight:700;padding:13px 26px;border-radius:${rad};transition:transform .15s,opacity .2s;border:none;cursor:pointer}
.btn:hover{transform:translateY(-1px);opacity:.92}
.btn.ghost{background:transparent;color:${fg};border:1px solid ${line}}
section{padding:80px 0}
.sec-tint{background:${bg2}}
h1{font-size:clamp(34px,6vw,60px);line-height:1.04;font-weight:800;letter-spacing:-.02em}
h2{font-size:clamp(26px,3.6vw,38px);font-weight:800}
h3{font-size:20px;font-weight:700}
.center{text-align:center}
.lead{color:${mut};font-size:clamp(16px,2vw,20px);margin-top:16px;max-width:62ch}
.sub{color:${mut};margin-top:8px;max-width:60ch}
.muted{color:${mut}}
.head{max-width:680px;margin:0 auto 44px;text-align:center}
.grid{display:grid;gap:22px}
.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
.card{background:${card};border:1px solid ${line};border-radius:${rad};padding:26px}
.shadow{box-shadow:0 10px 40px rgba(0,0,0,${dark ? '.35' : '.06'})}
.nav{display:flex;align-items:center;justify-content:space-between;padding:18px 0}
.nav.sticky{position:sticky;top:0;z-index:50;background:${bg}cc;backdrop-filter:blur(10px);border-bottom:1px solid ${line}}
.nav .links{display:flex;gap:26px}
.eyebrow{display:inline-block;color:${t.primary};font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:13px;margin-bottom:14px}
.hero-actions{display:flex;gap:14px;margin-top:34px;flex-wrap:wrap}
.hero-bg{background-size:cover;background-position:center;border-radius:${rad};padding:96px 40px;position:relative}
.hero-bg::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.5);border-radius:${rad}}
.hero-bg>*{position:relative;color:#fff}
.stat .v{font-size:clamp(28px,4vw,44px);font-weight:800;color:${t.primary}}
.stat .l{color:${mut};margin-top:6px;font-size:14px}
.icon{font-size:28px;margin-bottom:14px}
.gal img{border-radius:${rad};aspect-ratio:3/2;object-fit:cover;width:100%}
.price{position:relative;text-align:center}
.price.feat{border-color:${t.primary};box-shadow:0 0 0 2px ${t.primary} inset}
.price .amt{font-size:40px;font-weight:800;margin:12px 0}
.price ul{list-style:none;margin:18px 0;text-align:left}
.price li{padding:7px 0;border-bottom:1px solid ${line};color:${mut}}
.badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:${t.primary};color:#04100b;font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px}
.quote{font-size:18px;font-style:italic}
.avatar{width:56px;height:56px;border-radius:50%;object-fit:cover}
.author{display:flex;align-items:center;gap:12px;margin-top:18px}
.logos{display:flex;flex-wrap:wrap;gap:36px;justify-content:center;align-items:center;opacity:.7}
.logos span{font-weight:800;font-size:20px;letter-spacing:.04em}
.faq details{border:1px solid ${line};border-radius:${rad};padding:16px 20px;margin-bottom:12px;background:${card}}
.faq summary{cursor:pointer;font-weight:700;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq p{color:${mut};margin-top:10px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
.field{width:100%;padding:13px 16px;border:1px solid ${line};border-radius:${rad};background:${card};color:${fg};margin-bottom:12px;font:inherit}
.vidwrap{position:relative;width:100%;max-width:920px;margin:0 auto;aspect-ratio:16/9;border-radius:${rad};overflow:hidden;background:#000;box-shadow:0 10px 40px rgba(0,0,0,${dark ? '.4' : '.1'})}
.vid{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover}
.map{width:100%;border:1px solid ${line};border-radius:${rad}}
.banner{background:${t.primary};color:#04100b;text-align:center;padding:12px 24px;font-weight:600;font-size:15px}
.banner a{text-decoration:underline;font-weight:800;margin-left:8px}
.steps{counter-reset:step}
.step-card{position:relative;padding-top:30px}
.step-card::before{counter-increment:step;content:counter(step);position:absolute;top:-22px;left:24px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:${t.primary};color:#04100b;font-weight:800;font-size:20px;border-radius:50%;box-shadow:0 6px 20px rgba(0,0,0,.25)}
.port figure{position:relative;border-radius:${rad};overflow:hidden;border:1px solid ${line}}
.port img{aspect-ratio:3/2;object-fit:cover;width:100%;transition:transform .3s}
.port a:hover img{transform:scale(1.04)}
.port figcaption{padding:16px}
.menu-cat{margin-top:30px;margin-bottom:8px;color:${t.primary};font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:14px}
.menu-row{display:flex;justify-content:space-between;gap:16px;align-items:baseline;padding:12px 0;border-bottom:1px dashed ${line}}
.menu-row .mn{font-weight:700}.menu-row .md{color:${mut};font-size:14px}.menu-row .mp{font-weight:800;color:${t.primary};white-space:nowrap}
.hours-row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid ${line}}
.hours-row.today{color:${t.primary};font-weight:700}
.cd{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:24px}
.cd .u{background:${card};border:1px solid ${line};border-radius:${rad};padding:16px 10px;min-width:84px;text-align:center}
.cd .n{font-size:clamp(28px,5vw,44px);font-weight:800;color:${t.primary};line-height:1}
.cd .lbl{color:${mut};font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-top:6px}
.rich p{margin-top:14px;color:${mut};max-width:70ch}
.rich p:first-child{margin-top:0}
.social{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.social a{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;background:${card};border:1px solid ${line};transition:transform .15s,border-color .2s}
.social a:hover{transform:translateY(-2px);border-color:${t.primary}}
.bigquote{max-width:840px;margin:0 auto;text-align:center}
.bigquote .q{font-size:clamp(22px,3.4vw,34px);font-weight:700;line-height:1.3;font-style:italic}
.bigquote .q::before{content:"\\201C";color:${t.primary}}.bigquote .q::after{content:"\\201D";color:${t.primary}}
.bigquote .by{color:${mut};margin-top:18px}
.tl{max-width:760px;margin:0 auto;position:relative;padding-left:34px}
.tl::before{content:"";position:absolute;left:9px;top:6px;bottom:6px;width:2px;background:${line}}
.tl-item{position:relative;padding-bottom:28px}
.tl-item::before{content:"";position:absolute;left:-30px;top:4px;width:14px;height:14px;border-radius:50%;background:${t.primary};box-shadow:0 0 0 4px ${bg}}
.tl-when{color:${t.primary};font-weight:800;font-size:14px}
.tabs-nav{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:22px}
.tab-btn{padding:10px 18px;border-radius:${rad};border:1px solid ${line};background:${card};color:${fg};font-weight:600;cursor:pointer;font:inherit}
.tab-btn.active{background:${t.primary};color:#04100b;border-color:${t.primary}}
.tab-pane{display:none;max-width:760px;margin:0 auto;color:${mut};text-align:center}
.tab-pane.active{display:block}
.vtable{width:100%;border-collapse:collapse;border:1px solid ${line};border-radius:${rad};overflow:hidden}
.vtable th,.vtable td{padding:14px 16px;text-align:left;border-bottom:1px solid ${line}}
.vtable th{background:${bg2};font-weight:800}
.vtable tr:last-child td{border-bottom:none}
.posts .card{padding:0;overflow:hidden}
.posts img{aspect-ratio:5/3;object-fit:cover;width:100%}
.posts .pc{padding:20px}
.posts .pd{color:${t.primary};font-size:13px;font-weight:700}
.article-wrap{max-width:760px;margin:0 auto}
.article-wrap .meta{color:${mut};font-size:14px;margin:8px 0 22px}
.article-wrap img.cover{border-radius:${rad};margin-bottom:24px;width:100%}
.article-wrap p{margin-top:16px;color:${mut}}
.dl-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 20px;border:1px solid ${line};border-radius:${rad};background:${card};margin-bottom:12px}
.dl-row .di strong{display:block}.dl-row .di span{color:${mut};font-size:14px}
.dl-row .dm{color:${mut};font-size:13px;white-space:nowrap;margin-right:10px}
.divider-line{height:1px;background:${line};max-width:${maxw};margin:0 auto;width:calc(100% - 48px)}
.cookies{position:fixed;left:16px;right:16px;bottom:16px;z-index:9998;max-width:680px;margin:0 auto;background:${card};border:1px solid ${line};border-radius:${rad};box-shadow:0 16px 50px rgba(0,0,0,.35);padding:18px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.cookies p{color:${mut};font-size:14px;flex:1;min-width:200px;margin:0}
.cookies .cbtns{display:flex;gap:10px;align-items:center}
.hp{position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0}
.fnote{display:none;margin-top:10px;color:${t.primary};font-weight:600}
.footer{border-top:1px solid ${line};padding:36px 0;color:${mut};display:flex;justify-content:space-between;flex-wrap:wrap;gap:14px}
.footer .fl{display:flex;gap:20px;flex-wrap:wrap}
@media(max-width:820px){.g2,.g3,.g4,.split{grid-template-columns:1fr}.nav .links{display:none}}
</style></head>
<body>
${body}
<script>(function(){if(location.search.indexOf('sent=1')>-1){document.querySelectorAll('.fnote').forEach(function(e){e.style.display='block';});var b=document.createElement('div');b.textContent='Dziękujemy! Wiadomość została wysłana.';b.style.cssText='position:fixed;left:50%;top:20px;transform:translateX(-50%);background:${t.primary};color:#04100b;font-weight:700;padding:12px 22px;border-radius:12px;z-index:9999;box-shadow:0 10px 40px rgba(0,0,0,.35)';document.body.appendChild(b);setTimeout(function(){b.remove();},5000);}
var cds=document.querySelectorAll('.cd[data-deadline]');if(cds.length){function pad(n){return(n<10?'0':'')+n;}function tick(){cds.forEach(function(cd){var end=new Date(cd.getAttribute('data-deadline')).getTime();if(isNaN(end))return;var diff=end-Date.now();if(diff<=0){cd.innerHTML='<div class="u" style="min-width:auto;padding:16px 24px"><div class="n">'+(cd.getAttribute('data-expired')||'Zakończono')+'</div></div>';return;}var d=Math.floor(diff/864e5),h=Math.floor(diff/36e5)%24,m=Math.floor(diff/6e4)%60,s=Math.floor(diff/1e3)%60;var set=function(k,v){var el=cd.querySelector('[data-cd="'+k+'"]');if(el)el.textContent=v;};set('d',d);set('h',pad(h));set('m',pad(m));set('s',pad(s));});}tick();setInterval(tick,1000);}
document.querySelectorAll('.tab-btn').forEach(function(b){b.addEventListener('click',function(){var g=b.getAttribute('data-tab'),i=b.getAttribute('data-i');document.querySelectorAll('.tab-btn[data-tab="'+g+'"]').forEach(function(x){x.classList.toggle('active',x===b);});document.querySelectorAll('.tab-pane[data-pane="'+g+'"]').forEach(function(p){p.classList.toggle('active',p.getAttribute('data-i')===i);});});});
var cb=document.querySelector('[data-cookiebar]');if(cb){try{if(!localStorage.getItem('cookieok'))cb.hidden=false;}catch(e){cb.hidden=false;}var ac=cb.querySelector('[data-cookie-accept]');if(ac)ac.addEventListener('click',function(){try{localStorage.setItem('cookieok','1');}catch(e){}cb.hidden=true;});}})();</script>
</body></html>`;
}

function sec(inner: string, tint = false, id = '') {
  return `<section class="${tint ? 'sec-tint' : ''}"${id ? ` id="${id}"` : ''}><div class="wrap">${inner}</div></section>`;
}
function headBlock(title: unknown, sub?: unknown) {
  return `<div class="head"><h2>${esc(title)}</h2>${sub ? `<p class="sub" style="margin:8px auto 0">${esc(sub)}</p>` : ''}</div>`;
}

function renderSection(s: Section, c: Ctx): string {
  const d = s.data;
  switch (s.type) {
    case 'navbar': {
      const links = c.nav.length > 1 ? c.nav : ((d.links as string[]) ?? []).map((l) => ({ name: l, href: '#' }));
      return `<div class="wrap"><nav class="nav ${d.sticky ? 'sticky' : ''}"><strong style="font-size:18px">${esc(d.brand)}</strong><div class="links">${links
        .map((l) => `<a href="${esc(l.href)}">${esc(l.name)}</a>`)
        .join('')}</div><a class="btn" href="#kontakt">${esc(d.ctaText)}</a></nav></div>`;
    }
    case 'hero': {
      const align = (d.align as string) === 'center' ? 'center' : '';
      const inner = `${d.eyebrow ? `<span class="eyebrow">${esc(d.eyebrow)}</span>` : ''}<h1>${esc(d.title)}</h1><p class="lead" ${align ? 'style="margin-left:auto;margin-right:auto"' : ''}>${esc(d.subtitle)}</p><div class="hero-actions" ${align ? 'style="justify-content:center"' : ''}><a class="btn" href="${esc(d.ctaHref || '#')}">${esc(d.ctaText)}</a>${d.ctaSecondary ? `<a class="btn ghost" href="#">${esc(d.ctaSecondary)}</a>` : ''}</div>`;
      if (d.bgImage) return `<section><div class="wrap"><div class="hero-bg ${align}" style="background-image:url('${esc(d.bgImage)}')">${inner}</div></div></section>`;
      return `<section><div class="wrap ${align}">${inner}</div></section>`;
    }
    case 'stats': {
      const items = (d.items as { value: string; label: string }[]) ?? [];
      return sec(`<div class="grid g4">${items.map((i) => `<div class="stat center"><div class="v">${esc(i.value)}</div><div class="l">${esc(i.label)}</div></div>`).join('')}</div>`, true);
    }
    case 'features': {
      const items = (d.items as { icon?: string; title: string; desc: string }[]) ?? [];
      return sec(`${headBlock(d.title, d.subtitle)}<div class="grid g3">${items.map((it) => `<div class="card"><div class="icon">${esc(it.icon || '◆')}</div><h3>${esc(it.title)}</h3><p class="muted" style="margin-top:8px">${esc(it.desc)}</p></div>`).join('')}</div>`);
    }
    case 'gallery': {
      const imgs = (d.images as { url: string; caption?: string }[]) ?? [];
      return sec(`${headBlock(d.title)}<div class="grid g3 gal">${imgs.map((g) => `<figure><img src="${esc(g.url)}" alt="${esc(g.caption)}"/>${g.caption ? `<figcaption class="muted" style="margin-top:8px;font-size:14px">${esc(g.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`);
    }
    case 'pricing': {
      const plans = (d.plans as { name: string; price: string; period: string; features: string; ctaText: string; featured?: boolean }[]) ?? [];
      return sec(`${headBlock(d.title, d.subtitle)}<div class="grid g3">${plans.map((p) => {
        const feats = String(p.features || '').split('\n').filter(Boolean);
        return `<div class="card price ${p.featured ? 'feat shadow' : ''}">${p.featured ? '<span class="badge">Polecany</span>' : ''}<h3>${esc(p.name)}</h3><div class="amt">${esc(p.price)} zł<span style="font-size:14px;color:${c.mut};font-weight:400">${esc(p.period)}</span></div><ul>${feats.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><a class="btn" href="#kontakt" style="width:100%;justify-content:center">${esc(p.ctaText)}</a></div>`;
      }).join('')}</div>`, true);
    }
    case 'testimonials': {
      const items = (d.items as { quote: string; author: string; role: string }[]) ?? [];
      return sec(`${headBlock(d.title)}<div class="grid g2">${items.map((t) => `<div class="card"><p class="quote">“${esc(t.quote)}”</p><div class="author"><div><strong>${esc(t.author)}</strong><div class="muted" style="font-size:14px">${esc(t.role)}</div></div></div></div>`).join('')}</div>`);
    }
    case 'team': {
      const items = (d.items as { name: string; role: string; photo?: string }[]) ?? [];
      return sec(`${headBlock(d.title)}<div class="grid g4">${items.map((m) => `<div class="card center">${m.photo ? `<img class="avatar" src="${esc(m.photo)}" alt="${esc(m.name)}" style="margin:0 auto 12px;width:80px;height:80px"/>` : ''}<strong>${esc(m.name)}</strong><div class="muted" style="font-size:14px">${esc(m.role)}</div></div>`).join('')}</div>`, true);
    }
    case 'faq': {
      const items = (d.items as { q: string; a: string }[]) ?? [];
      return sec(`${headBlock(d.title)}<div class="faq" style="max-width:760px;margin:0 auto">${items.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>`);
    }
    case 'logos': {
      const items = (d.items as string[]) ?? [];
      return sec(`${d.title ? `<p class="center muted" style="margin-bottom:24px">${esc(d.title)}</p>` : ''}<div class="logos">${items.map((l) => `<span>${esc(l)}</span>`).join('')}</div>`);
    }
    case 'about':
      return sec(`<div class="split"><div><h2>${esc(d.title)}</h2><p class="lead" style="max-width:none">${esc(d.body)}</p></div>${d.image ? `<img class="shadow" style="border-radius:${c.rad}" src="${esc(d.image)}" alt="${esc(d.title)}"/>` : ''}</div>`);
    case 'video': {
      const embed = videoEmbed(String(d.url ?? ''));
      const player = embed
        ? (embed.kind === 'file'
          ? `<video class="vid" controls preload="metadata" src="${esc(embed.src)}"></video>`
          : `<iframe class="vid" src="${esc(embed.src)}" title="${esc(d.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`)
        : `<div class="card center muted" style="padding:48px">Wklej link do filmu (YouTube, Vimeo lub plik .mp4).</div>`;
      return sec(`${(d.title || d.subtitle) ? headBlock(d.title, d.subtitle) : ''}<div class="vidwrap">${player}</div>`);
    }
    case 'map': {
      const q = encodeURIComponent(String(d.query ?? '').trim() || 'Polska');
      const z = String(d.zoom ?? '15').replace(/[^0-9]/g, '') || '15';
      const h = String(d.height ?? '420').replace(/[^0-9]/g, '') || '420';
      const src = `https://www.google.com/maps?q=${q}&z=${z}&hl=pl&output=embed`;
      return sec(`${d.title ? headBlock(d.title) : ''}<iframe class="map" style="height:${h}px" src="${src}" title="${esc(d.title || 'Mapa')}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`);
    }
    case 'banner': {
      const link = d.linkText ? ` <a href="${esc(d.linkHref || '#')}">${esc(d.linkText)}</a>` : '';
      return `<div class="banner">${esc(d.text)}${link}</div>`;
    }
    case 'steps': {
      const items = (d.items as { title: string; desc: string }[]) ?? [];
      return sec(`${headBlock(d.title, d.subtitle)}<div class="grid g3 steps">${items.map((it) => `<div class="card step-card"><h3>${esc(it.title)}</h3><p class="muted" style="margin-top:8px">${esc(it.desc)}</p></div>`).join('')}</div>`);
    }
    case 'portfolio': {
      const items = (d.items as { image: string; title: string; desc?: string; href?: string }[]) ?? [];
      return sec(`${headBlock(d.title, d.subtitle)}<div class="grid g3 port">${items.map((it) => {
        const inner = `<figure><img src="${esc(it.image)}" alt="${esc(it.title)}"/><figcaption><strong>${esc(it.title)}</strong>${it.desc ? `<p class="muted" style="margin-top:6px;font-size:14px">${esc(it.desc)}</p>` : ''}</figcaption></figure>`;
        return it.href ? `<a href="${esc(it.href)}">${inner}</a>` : inner;
      }).join('')}</div>`, true);
    }
    case 'menu': {
      const items = (d.items as { category?: string; name: string; desc?: string; price?: string }[]) ?? [];
      const cats: string[] = [];
      items.forEach((i) => { const c = i.category || 'Menu'; if (!cats.includes(c)) cats.push(c); });
      const body = cats.map((c) => `<div class="menu-cat">${esc(c)}</div>${items.filter((i) => (i.category || 'Menu') === c).map((i) => `<div class="menu-row"><div><span class="mn">${esc(i.name)}</span>${i.desc ? `<div class="md">${esc(i.desc)}</div>` : ''}</div><span class="mp">${esc(i.price)}</span></div>`).join('')}`).join('');
      return sec(`${headBlock(d.title, d.subtitle)}<div style="max-width:760px;margin:0 auto">${body}</div>`, true);
    }
    case 'richtext': {
      const paras = String(d.body ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      return sec(`<div class="rich" style="max-width:760px;margin:0 auto">${d.title ? `<h2>${esc(d.title)}</h2>` : ''}${paras.map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`).join('')}</div>`);
    }
    case 'hours': {
      const rows = (d.rows as { day: string; hours: string }[]) ?? [];
      return sec(`${headBlock(d.title)}<div style="max-width:560px;margin:0 auto">${rows.map((r) => `<div class="hours-row"><span>${esc(r.day)}</span><span>${esc(r.hours)}</span></div>`).join('')}${d.note ? `<p class="muted center" style="margin-top:16px;font-size:14px">${esc(d.note)}</p>` : ''}</div>`, true);
    }
    case 'countdown': {
      const iso = String(d.date ?? '');
      return sec(`${headBlock(d.title, d.subtitle)}<div class="cd" data-deadline="${esc(iso)}" data-expired="${esc(d.expiredText || 'Zakończono')}"><div class="u"><div class="n" data-cd="d">–</div><div class="lbl">dni</div></div><div class="u"><div class="n" data-cd="h">–</div><div class="lbl">godz.</div></div><div class="u"><div class="n" data-cd="m">–</div><div class="lbl">min.</div></div><div class="u"><div class="n" data-cd="s">–</div><div class="lbl">sek.</div></div></div>`);
    }
    case 'social': {
      const items = (d.items as { network: string; url: string }[]) ?? [];
      return sec(`${d.title ? `<p class="center muted" style="margin-bottom:18px">${esc(d.title)}</p>` : ''}<div class="social">${items.map((s) => { const ic = socialIcon(s.network); return `<a href="${esc(s.url)}" title="${esc(ic.l)}" aria-label="${esc(ic.l)}" target="_blank" rel="noopener">${ic.e}</a>`; }).join('')}</div>`);
    }
    case 'embed':
      return sec(`${d.title ? headBlock(d.title) : ''}${String(d.html ?? '')}`);
    case 'imagetext': {
      const left = (d.imageSide as string) === 'left';
      const img = d.image ? `<img class="shadow" style="border-radius:${c.rad}" src="${esc(d.image)}" alt="${esc(d.title)}"/>` : '';
      const txt = `<div><h2>${esc(d.title)}</h2><p class="lead" style="max-width:none">${esc(d.body)}</p>${d.ctaText ? `<div class="hero-actions"><a class="btn" href="${esc(d.ctaHref || '#')}">${esc(d.ctaText)}</a></div>` : ''}</div>`;
      return sec(`<div class="split">${left ? img + txt : txt + img}</div>`);
    }
    case 'quote':
      return sec(`<div class="bigquote"><div class="q">${esc(d.text)}</div><div class="by"><strong>${esc(d.author)}</strong>${d.role ? ` — ${esc(d.role)}` : ''}</div></div>`, true);
    case 'timeline': {
      const items = (d.items as { when: string; title: string; desc: string }[]) ?? [];
      return sec(`${headBlock(d.title)}<div class="tl">${items.map((it) => `<div class="tl-item"><div class="tl-when">${esc(it.when)}</div><h3>${esc(it.title)}</h3><p class="muted" style="margin-top:4px">${esc(it.desc)}</p></div>`).join('')}</div>`);
    }
    case 'tabs': {
      const items = (d.items as { label: string; content: string }[]) ?? [];
      const gid = s.id;
      const nav = items.map((it, i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${gid}" data-i="${i}">${esc(it.label)}</button>`).join('');
      const panes = items.map((it, i) => `<div class="tab-pane ${i === 0 ? 'active' : ''}" data-pane="${gid}" data-i="${i}">${esc(it.content).replace(/\n/g, '<br/>')}</div>`).join('');
      return sec(`${headBlock(d.title)}<div class="tabs-nav">${nav}</div>${panes}`);
    }
    case 'table': {
      const headers = (d.headers as string[]) ?? [];
      const rows = (d.rows as { cells: string }[]) ?? [];
      const thead = headers.length ? `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : '';
      const tbody = rows.map((r) => `<tr>${String(r.cells || '').split('\n').map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('');
      return sec(`${headBlock(d.title)}<div style="overflow-x:auto"><table class="vtable">${thead}<tbody>${tbody}</tbody></table></div>`);
    }
    case 'blog': {
      const items = (d.items as { image?: string; title: string; excerpt?: string; date?: string; href?: string }[]) ?? [];
      return sec(`${headBlock(d.title, d.subtitle)}<div class="grid g3 posts">${items.map((p) => {
        const inner = `<div class="card">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}"/>` : ''}<div class="pc">${p.date ? `<div class="pd">${esc(p.date)}</div>` : ''}<h3 style="margin-top:6px">${esc(p.title)}</h3>${p.excerpt ? `<p class="muted" style="margin-top:8px;font-size:15px">${esc(p.excerpt)}</p>` : ''}</div></div>`;
        return p.href ? `<a href="${esc(p.href)}">${inner}</a>` : inner;
      }).join('')}</div>`);
    }
    case 'article': {
      const paras = String(d.body ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      return sec(`<article class="article-wrap"><h1>${esc(d.title)}</h1><div class="meta">${esc(d.author)}${d.author && d.date ? ' · ' : ''}${esc(d.date)}</div>${d.cover ? `<img class="cover" src="${esc(d.cover)}" alt="${esc(d.title)}"/>` : ''}${paras.map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`).join('')}</article>`);
    }
    case 'download': {
      const items = (d.items as { name: string; desc?: string; href?: string; meta?: string }[]) ?? [];
      return sec(`${headBlock(d.title, d.subtitle)}<div style="max-width:720px;margin:0 auto">${items.map((it) => `<div class="dl-row"><div class="di"><strong>${esc(it.name)}</strong>${it.desc ? `<span>${esc(it.desc)}</span>` : ''}</div><div style="display:flex;align-items:center">${it.meta ? `<span class="dm">${esc(it.meta)}</span>` : ''}<a class="btn" href="${esc(it.href || '#')}" download>Pobierz</a></div></div>`).join('')}</div>`, true);
    }
    case 'divider': {
      if ((d.style as string) === 'line') return `<div style="padding:30px 0"><div class="divider-line"></div></div>`;
      const h = String(d.height ?? '60').replace(/[^0-9]/g, '') || '60';
      return `<div style="height:${h}px"></div>`;
    }
    case 'cookies':
      return `<div class="cookies" data-cookiebar hidden><p>${esc(d.text)}${d.moreText ? ` <a href="${esc(d.moreHref || '#')}" style="color:${c.p};text-decoration:underline">${esc(d.moreText)}</a>` : ''}</p><div class="cbtns"><button class="btn" data-cookie-accept type="button">${esc(d.acceptText || 'Akceptuję')}</button></div></div>`;
    case 'cta':
      return sec(`<div class="card center shadow" style="padding:56px"><h2>${esc(d.title)}</h2><p class="muted" style="margin:12px auto 26px">${esc(d.subtitle)}</p><a class="btn" href="${esc(d.buttonHref || '#')}">${esc(d.buttonText)}</a></div>`);
    case 'newsletter':
      return sec(`<div class="card center" style="padding:48px"><h2>${esc(d.title)}</h2><p class="muted" style="margin:10px auto 22px">${esc(d.subtitle)}</p><form method="post" action="${FORM_ACTION}" style="display:flex;gap:10px;max-width:440px;margin:0 auto;flex-wrap:wrap;justify-content:center"><input type="hidden" name="_type" value="Newsletter"/><input class="hp" type="text" name="_company" tabindex="-1" autocomplete="off" aria-hidden="true"/><input class="field" style="margin:0;flex:1;min-width:200px" type="email" name="email" required placeholder="${esc(d.placeholder)}"/><button class="btn" type="submit">${esc(d.buttonText)}</button></form><p class="fnote">Dziękujemy! Zapis przyjęty.</p></div>`, true);
    case 'contact':
      return sec(`${headBlock(d.title)}<div class="split"><div class="grid" style="gap:14px"><div class="card"><h3>E-mail</h3><p class="muted">${esc(d.email)}</p></div><div class="card"><h3>Telefon</h3><p class="muted">${esc(d.phone)}</p></div><div class="card"><h3>Adres</h3><p class="muted">${esc(d.address)}</p></div></div>${d.showForm ? `<form method="post" action="${FORM_ACTION}"><input type="hidden" name="_type" value="Kontakt"/><input class="hp" type="text" name="_company" tabindex="-1" autocomplete="off" aria-hidden="true"/><input class="field" name="name" required placeholder="Imię i nazwisko"/><input class="field" type="email" name="email" required placeholder="E-mail"/><textarea class="field" name="message" required style="min-height:120px" placeholder="Wiadomość"></textarea><button class="btn" type="submit">Wyślij</button><p class="fnote">Dziękujemy! Wiadomość wysłana.</p></form>` : ''}</div>`, false, 'kontakt');
    case 'footer': {
      const links = (d.links as string[]) ?? [];
      return `<div class="wrap"><div class="footer"><strong>${esc(d.brand)}</strong><div class="fl">${links.map((l) => `<a href="#">${esc(l)}</a>`).join('')}</div><span>${esc(d.note)}</span></div></div>`;
    }
    default:
      return '';
  }
}

/* ============================ EDITOR ============================ */
const DRAFT_DIR = '';
const DRAFT_FILE = '.verris-site.json';
const PUBLISH_DEFAULT = 'public_html';

export default function SiteBuilderTab({ serviceId }: { serviceId: string }) {
  const [model, setModel] = useState<PageModel>(() => asModel(RAW_TEMPLATES.landing()));
  const [activePageId, setActivePageId] = useState<string>(() => model.pages[0].id);
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [publishDir, setPublishDir] = useState(PUBLISH_DEFAULT);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const loadedRef = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const activePage = model.pages.find((p) => p.id === activePageId) ?? model.pages[0];
  const nav: NavLink[] = model.pages.map((p) => ({ name: p.name, href: pageHref(p.slug) }));
  const html = useMemo(() => genHtml(activePage, model.theme, model.meta.description, nav), [activePage, model.theme, model.meta.description, nav]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        const res = (await fmRead(serviceId, DRAFT_FILE)) as { content?: string } | string;
        const content = typeof res === 'string' ? res : res?.content;
        if (content) {
          const parsed = JSON.parse(content) as PageModel & { sections?: Section[]; meta?: { title?: string; description?: string } };
          let next: PageModel | null = null;
          if (Array.isArray(parsed.pages) && parsed.pages.length) next = { meta: parsed.meta && 'description' in parsed.meta ? { description: parsed.meta.description ?? '' } : { description: '' }, theme: parsed.theme, pages: parsed.pages };
          else if (Array.isArray(parsed.sections)) next = { meta: { description: parsed.meta?.description ?? '' }, theme: parsed.theme, pages: [{ id: uid(), name: 'Strona główna', slug: 'index', title: parsed.meta?.title ?? 'Strona', sections: parsed.sections }] };
          if (next) { setModel(next); setActivePageId(next.pages[0].id); }
        }
      } catch { /* brak szkicu */ }
    })();
  }, [serviceId]);

  /* --- mutacje aktywnej strony --- */
  const mutate = useCallback((fn: (sections: Section[]) => Section[]) => {
    setModel((m) => ({ ...m, pages: m.pages.map((p) => (p.id === activePageId ? { ...p, sections: fn(p.sections) } : p)) }));
  }, [activePageId]);
  const update = useCallback((id: string, patch: Record<string, unknown>) => mutate((secs) => secs.map((s) => (s.id === id ? { ...s, data: { ...s.data, ...patch } } : s))), [mutate]);
  const setTheme = (patch: Partial<Theme>) => setModel((m) => ({ ...m, theme: { ...m.theme, ...patch } }));
  function move(id: string, dir: -1 | 1) { mutate((secs) => { const i = secs.findIndex((s) => s.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= secs.length) return secs; const n = [...secs]; [n[i], n[j]] = [n[j], n[i]]; return n; }); }
  function reorder(fromId: string, toId: string) { if (fromId === toId) return; mutate((secs) => { const from = secs.findIndex((s) => s.id === fromId); const to = secs.findIndex((s) => s.id === toId); if (from < 0 || to < 0) return secs; const n = [...secs]; const [mv] = n.splice(from, 1); n.splice(to, 0, mv); return n; }); }
  const remove = (id: string) => { mutate((secs) => secs.filter((s) => s.id !== id)); setSelected(null); };
  const add = (type: SectionType) => { const sx = defaultSection(type); mutate((secs) => [...secs, sx]); setSelected(sx.id); };
  function duplicate(id: string) {
    const newId = uid();
    mutate((secs) => { const i = secs.findIndex((s) => s.id === id); if (i < 0) return secs; const o = secs[i]; const copy: Section = { id: newId, type: o.type, data: JSON.parse(JSON.stringify(o.data)) }; const n = [...secs]; n.splice(i + 1, 0, copy); return n; });
    setSelected(newId);
  }

  /* --- zarządzanie stronami --- */
  function addPage() {
    const n = model.pages.length + 1;
    const pg: Page = { id: uid(), name: `Podstrona ${n}`, slug: `podstrona-${n}`, title: `Podstrona ${n}`, sections: SEC(['navbar', 'hero', 'footer']) };
    setModel((m) => ({ ...m, pages: [...m.pages, pg] }));
    setActivePageId(pg.id);
    setSelected(null);
  }
  function patchPage(id: string, patch: Partial<Page>) { setModel((m) => ({ ...m, pages: m.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)) })); }
  function duplicatePage(id: string) {
    const newId = uid();
    setModel((m) => {
      const i = m.pages.findIndex((p) => p.id === id); if (i < 0) return m;
      const o = m.pages[i];
      const np: Page = { id: newId, name: `${o.name} (kopia)`, slug: slugify(`${o.slug}-kopia`), title: o.title, sections: o.sections.map((s) => ({ id: uid(), type: s.type, data: JSON.parse(JSON.stringify(s.data)) })) };
      const pages = [...m.pages]; pages.splice(i + 1, 0, np); return { ...m, pages };
    });
    setActivePageId(newId); setSelected(null);
  }
  function deletePage(id: string) {
    if (model.pages.length <= 1) return;
    setModel((m) => { const pages = m.pages.filter((p) => p.id !== id); return { ...m, pages }; });
    if (activePageId === id) setActivePageId(model.pages.find((p) => p.id !== id)!.id);
    setSelected(null);
  }

  async function saveDraft() {
    setBusy('save'); setMsg(null);
    try { await fmWrite(serviceId, DRAFT_DIR, DRAFT_FILE, JSON.stringify(model)); setMsg({ t: 'ok', m: 'Szkic zapisany na koncie.' }); }
    catch (e) { setMsg({ t: 'err', m: e instanceof Error ? e.message : 'Nie udało się zapisać szkicu.' }); }
    finally { setBusy(null); }
  }
  async function publish() {
    setBusy('publish'); setMsg(null);
    const dir = publishDir.trim() || PUBLISH_DEFAULT;
    try {
      for (const p of model.pages) {
        await fmWrite(serviceId, dir, pageHref(p.slug), genHtml(p, model.theme, model.meta.description, nav));
      }
      // Formularze: opublikuj handler PHP, jeśli na którejkolwiek stronie jest formularz kontakt/newsletter.
      const allSecs = model.pages.flatMap((p) => p.sections);
      const hasForm = allSecs.some((s) => s.type === 'newsletter' || (s.type === 'contact' && s.data.showForm));
      let formNote = '';
      if (hasForm) {
        const recipient = (allSecs.find((s) => s.type === 'contact')?.data.email as string) || '';
        await fmWrite(serviceId, dir, FORM_ACTION, genFormHandler(recipient));
        formNote = ' Formularze działają na żywo (zgłoszenia trafiają na e-mail i do pliku form-submissions.csv).';
      }
      setMsg({ t: 'ok', m: `Opublikowano ${model.pages.length} ${model.pages.length === 1 ? 'stronę' : 'stron(y)'} w „${dir}". Witryna jest na żywo.${formNote}` });
    } catch (e) { setMsg({ t: 'err', m: e instanceof Error ? e.message : 'Nie udało się opublikować.' }); }
    finally { setBusy(null); }
  }
  function downloadHtml() {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = pageHref(activePage.slug); a.click(); URL.revokeObjectURL(url);
  }

  const sel = activePage.sections.find((s) => s.id === selected) ?? null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <LayoutTemplate className="h-4 w-4 text-neutral-400" />
          <select onChange={(e) => { if (e.target.value && RAW_TEMPLATES[e.target.value]) { const nm = asModel(RAW_TEMPLATES[e.target.value]()); setModel(nm); setActivePageId(nm.pages[0].id); setSelected(null); } }} defaultValue="" className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white">
            <option value="">Szablon startowy…</option>
            <optgroup label="Biznes / firma">
              <option value="landing">Landing page</option><option value="wizytowka">Wizytówka firmy</option>
              <option value="uslugi">Usługi lokalne</option><option value="agencja">Agencja / portfolio</option>
              <option value="kancelaria">Kancelaria</option><option value="organizacja">Fundacja / NGO</option>
            </optgroup>
            <optgroup label="Produkt / online">
              <option value="produkt">Produkt — landing</option><option value="saas">Aplikacja / SaaS</option>
              <option value="sklep">Sklep online</option><option value="kursy">Kursy / edukacja</option>
            </optgroup>
            <optgroup label="Treść / blog">
              <option value="blog">Blog / magazyn</option><option value="wpis">Wpis bloga</option>
              <option value="cv">CV / wizytówka osobista</option><option value="freelancer">Freelancer</option>
            </optgroup>
            <optgroup label="Lokal / wydarzenia">
              <option value="restauracja">Restauracja</option><option value="kawiarnia">Kawiarnia / bar</option>
              <option value="fitness">Klub fitness</option><option value="przychodnia">Przychodnia / gabinet</option>
              <option value="nieruchomosci">Nieruchomości</option><option value="wydarzenie">Wydarzenie / konferencja</option>
              <option value="fotograf">Fotograf</option>
            </optgroup>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-black/40 p-0.5">
            <button onClick={() => setDevice('desktop')} className={`rounded-md px-2 py-1 ${device === 'desktop' ? 'bg-white/10' : ''}`} aria-label="Desktop"><Monitor className="h-4 w-4" /></button>
            <button onClick={() => setDevice('mobile')} className={`rounded-md px-2 py-1 ${device === 'mobile' ? 'bg-white/10' : ''}`} aria-label="Mobile"><Smartphone className="h-4 w-4" /></button>
          </div>
          <button onClick={downloadHtml} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-neutral-200 hover:text-white"><Download className="h-4 w-4" /> HTML</button>
          <button onClick={saveDraft} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-neutral-200 hover:text-white disabled:opacity-40">{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Szkic</button>
          <button onClick={publish} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publikuj</button>
        </div>
      </div>

      {/* Pasek stron */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-2">
        <FileText className="h-4 w-4 text-neutral-500" />
        {model.pages.map((p) => (
          <button key={p.id} onClick={() => { setActivePageId(p.id); setSelected(null); }} className={`rounded-lg px-2.5 py-1 text-sm ${p.id === activePageId ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' : 'text-neutral-300 hover:bg-white/5'}`}>
            {p.name} <span className="text-[10px] text-neutral-500">/{pageHref(p.slug)}</span>
          </button>
        ))}
        <button onClick={addPage} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-white/15 px-2.5 py-1 text-sm text-neutral-300 hover:text-white"><Plus className="h-3.5 w-3.5" /> Strona</button>
      </div>

      {msg && (
        <p className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${msg.t === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
          {msg.t === 'ok' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.m}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr_310px]">
        {/* Sekcje */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Sekcje — {activePage.name}</p>
          <p className="text-[10px] text-neutral-600">Przeciągnij uchwyt, aby zmienić kolejność.</p>
          {activePage.sections.map((s) => (
            <div
              key={s.id}
              draggable
              onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { e.preventDefault(); if (overId !== s.id) setOverId(s.id); }}
              onDrop={(e) => { e.preventDefault(); if (dragId) reorder(dragId, s.id); setDragId(null); setOverId(null); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-sm transition ${selected === s.id ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-white/[0.02]'} ${dragId === s.id ? 'opacity-40' : ''} ${overId === s.id && dragId && dragId !== s.id ? 'border-emerald-400 ring-1 ring-emerald-400/40' : ''}`}
            >
              <span className="cursor-grab text-neutral-600 hover:text-neutral-300 active:cursor-grabbing" aria-label="Przeciągnij"><GripVertical className="h-3.5 w-3.5" /></span>
              <button onClick={() => setSelected(s.id)} className="flex-1 truncate text-left text-white">{SECTION_LABEL[s.type]}</button>
              <button onClick={() => move(s.id, -1)} className="text-neutral-500 hover:text-white" aria-label="W górę"><ChevronUp className="h-3.5 w-3.5" /></button>
              <button onClick={() => move(s.id, 1)} className="text-neutral-500 hover:text-white" aria-label="W dół"><ChevronDown className="h-3.5 w-3.5" /></button>
              <button onClick={() => duplicate(s.id)} className="text-neutral-500 hover:text-emerald-300" aria-label="Duplikuj"><Copy className="h-3.5 w-3.5" /></button>
              <button onClick={() => remove(s.id)} className="text-neutral-500 hover:text-rose-300" aria-label="Usuń"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <select onChange={(e) => { if (e.target.value) { add(e.target.value as SectionType); e.target.value = ''; } }} defaultValue="" className="w-full rounded-lg border border-dashed border-white/15 bg-black/40 px-2 py-1.5 text-sm text-neutral-300">
            <option value="">+ Dodaj sekcję…</option>
            {(Object.keys(SECTION_LABEL) as SectionType[]).map((t) => <option key={t} value={t}>{SECTION_LABEL[t]}</option>)}
          </select>
        </div>

        {/* Podgląd */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
          <div className="mx-auto overflow-hidden rounded-lg bg-white transition-all" style={{ width: device === 'mobile' ? 390 : '100%', maxWidth: '100%' }}>
            <iframe title="Podgląd strony" srcDoc={html} className="h-[640px] w-full border-0" />
          </div>
        </div>

        {/* Ustawienia */}
        <div className="space-y-4">
          <details open className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-neutral-400">Strona: {activePage.name}</summary>
            <div className="mt-2 space-y-2">
              <Field label="Nazwa (w menu)" value={activePage.name} onChange={(v) => patchPage(activePage.id, { name: v })} />
              <Field label="Adres pliku (slug)" value={activePage.slug} onChange={(v) => patchPage(activePage.id, { slug: slugify(v) })} />
              <Field label="Tytuł strony (SEO)" value={activePage.title} onChange={(v) => patchPage(activePage.id, { title: v })} />
              <div className="flex items-center gap-3">
                <button onClick={() => duplicatePage(activePage.id)} className="inline-flex items-center gap-1 text-xs text-emerald-300"><Copy className="h-3 w-3" /> Duplikuj stronę</button>
                {model.pages.length > 1 && activePage.slug !== 'index' && (
                  <button onClick={() => deletePage(activePage.id)} className="inline-flex items-center gap-1 text-xs text-rose-300"><Trash2 className="h-3 w-3" /> Usuń tę stronę</button>
                )}
              </div>
              <p className="text-[10px] text-neutral-500">Strona „index" to strona główna. Nawigacja w menu linkuje automatycznie do wszystkich stron. Świetne do bloga: zduplikuj stronę „Wpis" dla każdego artykułu.</p>
            </div>
          </details>

          <details open className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-neutral-400">SEO (opis witryny)</summary>
            <div className="mt-2"><Field label="Meta description (wspólny)" value={model.meta.description} onChange={(v) => setModel((m) => ({ ...m, meta: { description: v } }))} area /></div>
          </details>

          <details open className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-neutral-400">Motyw</summary>
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1.5 pb-1">
                {COLOR_PRESETS.map((cp) => (
                  <button key={cp.label} type="button" title={cp.label} onClick={() => setTheme({ primary: cp.primary, accent: cp.accent })} className="h-6 w-6 rounded-full border border-white/20" style={{ background: `linear-gradient(135deg, ${cp.primary} 50%, ${cp.accent} 50%)` }} />
                ))}
              </div>
              <Row label="Kolor główny"><input type="color" value={model.theme.primary} onChange={(e) => setTheme({ primary: e.target.value })} className="h-7 w-12 rounded border border-white/10 bg-transparent" /></Row>
              <Row label="Akcent"><input type="color" value={model.theme.accent} onChange={(e) => setTheme({ accent: e.target.value })} className="h-7 w-12 rounded border border-white/10 bg-transparent" /></Row>
              <Row label="Tło"><Sel value={model.theme.bg} onChange={(v) => setTheme({ bg: v as Theme['bg'] })} opts={[['light', 'Jasne'], ['dark', 'Ciemne']]} /></Row>
              <Row label="Font"><Sel value={model.theme.font} onChange={(v) => setTheme({ font: v as Theme['font'] })} opts={[['sans', 'Bezszeryfowy'], ['serif', 'Szeryfowy'], ['rounded', 'Zaokrąglony'], ['condensed', 'Wąski'], ['mono', 'Monospace']]} /></Row>
              <Row label="Zaokrąglenia"><Sel value={model.theme.radius} onChange={(v) => setTheme({ radius: v as Theme['radius'] })} opts={[['sm', 'Małe'], ['md', 'Średnie'], ['xl', 'Duże']]} /></Row>
              <Row label="Szerokość"><Sel value={model.theme.width} onChange={(v) => setTheme({ width: v as Theme['width'] })} opts={[['normal', 'Normalna'], ['wide', 'Szeroka']]} /></Row>
            </div>
          </details>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">{sel ? `Edycja: ${SECTION_LABEL[sel.type]}` : 'Wybierz sekcję, aby edytować'}</p>
            {sel ? <SectionEditor section={sel} serviceId={serviceId} onChange={(patch) => update(sel.id, patch)} /> : null}
          </div>

          <div className="space-y-1.5 border-t border-white/10 pt-3">
            <label className="block text-xs text-neutral-500">Katalog publikacji</label>
            <input value={publishDir} onChange={(e) => setPublishDir(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
            <p className="text-[11px] text-neutral-500">„Publikuj" zapisze wszystkie strony (index.html + podstrony) w <code>{PUBLISH_DEFAULT}</code>.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- UI helpers ---- */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex items-center justify-between text-sm text-neutral-300">{label}{children}</label>;
}
function Sel({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: [string, string][] }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm text-white">{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}
function Field({ label, value, onChange, area }: { label: string; value: string; onChange: (v: string) => void; area?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-neutral-400">{label}</span>
      {area ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} className="w-full min-h-[60px] rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
      )}
    </label>
  );
}

type Rec = Record<string, unknown>;
function SectionEditor({ section, serviceId, onChange }: { section: Section; serviceId: string; onChange: (patch: Record<string, unknown>) => void }) {
  const d = section.data;
  const F = (k: string, label: string, area?: boolean) => <Field key={k} label={label} value={String(d[k] ?? '')} onChange={(v) => onChange({ [k]: v })} area={area} />;
  const Img = (k: string, label: string) => <ImageField key={k} serviceId={serviceId} label={label} value={String(d[k] ?? '')} onChange={(v) => onChange({ [k]: v })} />;
  const Bool = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" checked={Boolean(d[k])} onChange={(e) => onChange({ [k]: e.target.checked })} className="h-4 w-4 accent-emerald-500" />{label}</label>
  );
  switch (section.type) {
    case 'navbar':
      return <div className="space-y-2">{F('brand', 'Nazwa / logo')}{F('ctaText', 'Tekst przycisku')}{Bool('sticky', 'Przyklejona nawigacja')}<p className="text-[11px] text-neutral-500">Przy wielu stronach menu linkuje automatycznie do podstron.</p></div>;
    case 'hero':
      return <div className="space-y-2">{F('eyebrow', 'Etykieta')}{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł', true)}{F('ctaText', 'Przycisk główny')}{F('ctaHref', 'Link przycisku')}{F('ctaSecondary', 'Przycisk drugi (opcjonalnie)')}{Img('bgImage', 'Tło (URL lub z plików)')}<Row label="Wyrównanie"><Sel value={String(d.align ?? 'left')} onChange={(v) => onChange({ align: v })} opts={[['left', 'Do lewej'], ['center', 'Wyśrodkowane']]} /></Row></div>;
    case 'stats':
      return <ObjList label="Liczby" items={(d.items as Rec[]) ?? []} fields={[['value', 'Wartość'], ['label', 'Opis']]} factory={() => ({ value: '100+', label: 'Opis' })} onChange={(items) => onChange({ items })} />;
    case 'features':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Karty" items={(d.items as Rec[]) ?? []} fields={[['icon', 'Ikona (emoji)'], ['title', 'Tytuł'], ['desc', 'Opis', true]]} factory={() => ({ icon: '◆', title: 'Nowa cecha', desc: 'Opis…' })} onChange={(items) => onChange({ items })} /></div>;
    case 'gallery':
      return <div className="space-y-2">{F('title', 'Tytuł')}<ObjList label="Zdjęcia" serviceId={serviceId} items={(d.images as Rec[]) ?? []} fields={[['url', 'URL obrazu', false, true], ['caption', 'Podpis']]} factory={() => ({ url: 'https://picsum.photos/seed/x/600/400', caption: '' })} onChange={(images) => onChange({ images })} /></div>;
    case 'pricing':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Plany" items={(d.plans as Rec[]) ?? []} fields={[['name', 'Nazwa'], ['price', 'Cena'], ['period', 'Okres'], ['features', 'Cechy (po jednej w wierszu)', true], ['ctaText', 'Przycisk']]} bools={[['featured', 'Polecany']]} factory={() => ({ name: 'Plan', price: '0', period: '/mies.', features: 'Cecha 1\nCecha 2', ctaText: 'Wybieram', featured: false })} onChange={(plans) => onChange({ plans })} /></div>;
    case 'testimonials':
      return <div className="space-y-2">{F('title', 'Tytuł')}<ObjList label="Opinie" items={(d.items as Rec[]) ?? []} fields={[['quote', 'Cytat', true], ['author', 'Autor'], ['role', 'Rola']]} factory={() => ({ quote: 'Świetna usługa!', author: 'Klient', role: '' })} onChange={(items) => onChange({ items })} /></div>;
    case 'team':
      return <div className="space-y-2">{F('title', 'Tytuł')}<ObjList label="Osoby" serviceId={serviceId} items={(d.items as Rec[]) ?? []} fields={[['name', 'Imię i nazwisko'], ['role', 'Rola'], ['photo', 'URL zdjęcia', false, true]]} factory={() => ({ name: 'Imię', role: 'Stanowisko', photo: '' })} onChange={(items) => onChange({ items })} /></div>;
    case 'faq':
      return <div className="space-y-2">{F('title', 'Tytuł')}<ObjList label="Pytania" items={(d.items as Rec[]) ?? []} fields={[['q', 'Pytanie'], ['a', 'Odpowiedź', true]]} factory={() => ({ q: 'Pytanie?', a: 'Odpowiedź.' })} onChange={(items) => onChange({ items })} /></div>;
    case 'logos':
      return <div className="space-y-2">{F('title', 'Tytuł')}<StrList label="Nazwy / partnerzy" items={(d.items as string[]) ?? []} onChange={(items) => onChange({ items })} /></div>;
    case 'about':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('body', 'Treść', true)}{Img('image', 'Obraz (URL lub z plików)')}</div>;
    case 'video':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}{F('url', 'Link do filmu (YouTube / Vimeo / .mp4)')}<p className="text-[11px] text-neutral-500">Wklej zwykły link, np. youtube.com/watch?v=… — sami zamienimy go na osadzony odtwarzacz.</p></div>;
    case 'map':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('query', 'Adres lub nazwa miejsca')}<Row label="Powiększenie"><Sel value={String(d.zoom ?? '15')} onChange={(v) => onChange({ zoom: v })} opts={[['11', 'Miasto'], ['13', 'Dzielnica'], ['15', 'Ulica'], ['17', 'Budynek']]} /></Row><Field label="Wysokość mapy (px)" value={String(d.height ?? '420')} onChange={(v) => onChange({ height: v.replace(/[^0-9]/g, '') })} /><p className="text-[11px] text-neutral-500">Mapa Google bez klucza API — wpisz adres tak, jak w wyszukiwarce Map.</p></div>;
    case 'banner':
      return <div className="space-y-2">{F('text', 'Tekst paska')}{F('linkText', 'Tekst linku (opcjonalnie)')}{F('linkHref', 'Adres linku')}<p className="text-[11px] text-neutral-500">Najlepiej umieść ten blok na samej górze strony (przeciągnij na początek).</p></div>;
    case 'steps':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Kroki" items={(d.items as Rec[]) ?? []} fields={[['title', 'Tytuł kroku'], ['desc', 'Opis', true]]} factory={() => ({ title: 'Nowy krok', desc: 'Opis…' })} onChange={(items) => onChange({ items })} /></div>;
    case 'portfolio':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Realizacje" serviceId={serviceId} items={(d.items as Rec[]) ?? []} fields={[['image', 'Obraz', false, true], ['title', 'Tytuł'], ['desc', 'Opis', true], ['href', 'Link (opcjonalnie)']]} factory={() => ({ image: 'https://picsum.photos/seed/x/600/400', title: 'Projekt', desc: '', href: '' })} onChange={(items) => onChange({ items })} /></div>;
    case 'menu':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Pozycje" items={(d.items as Rec[]) ?? []} fields={[['category', 'Kategoria (grupuje pozycje)'], ['name', 'Nazwa'], ['desc', 'Opis', true], ['price', 'Cena']]} factory={() => ({ category: 'Menu', name: 'Nowa pozycja', desc: '', price: '0 zł' })} onChange={(items) => onChange({ items })} /><p className="text-[11px] text-neutral-500">Pozycje z tą samą kategorią są grupowane pod wspólnym nagłówkiem.</p></div>;
    case 'richtext':
      return <div className="space-y-2">{F('title', 'Tytuł (opcjonalnie)')}{F('body', 'Treść', true)}<p className="text-[11px] text-neutral-500">Pusty wiersz = nowy akapit. Świetne do regulaminu, polityki prywatności, dłuższych opisów.</p></div>;
    case 'hours':
      return <div className="space-y-2">{F('title', 'Tytuł')}<ObjList label="Dni i godziny" items={(d.rows as Rec[]) ?? []} fields={[['day', 'Dzień / zakres'], ['hours', 'Godziny']]} factory={() => ({ day: 'Poniedziałek', hours: '9:00 – 17:00' })} onChange={(rows) => onChange({ rows })} />{F('note', 'Notka (opcjonalnie)')}</div>;
    case 'countdown':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<label className="block space-y-1"><span className="text-xs text-neutral-400">Data i godzina zakończenia</span><input type="datetime-local" value={String(d.date ?? '')} onChange={(e) => onChange({ date: e.target.value })} className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" /></label>{F('expiredText', 'Tekst po zakończeniu')}<p className="text-[11px] text-neutral-500">Licznik odlicza na żywo na opublikowanej stronie.</p></div>;
    case 'social':
      return <div className="space-y-2">{F('title', 'Tytuł (opcjonalnie)')}<ObjList label="Profile" items={(d.items as Rec[]) ?? []} fields={[['network', 'Sieć (facebook, instagram, linkedin, youtube, tiktok, x…)'], ['url', 'Adres profilu']]} factory={() => ({ network: 'facebook', url: 'https://' })} onChange={(items) => onChange({ items })} /></div>;
    case 'embed':
      return <div className="space-y-2">{F('title', 'Tytuł (opcjonalnie)')}{F('html', 'Kod HTML', true)}<p className="text-[11px] text-amber-300/80">Zaawansowane: wklejony kod trafia 1:1 na stronę. Używaj tylko zaufanych źródeł (np. widget rezerwacji, iframe mapy, formularz zewnętrzny).</p></div>;
    case 'imagetext':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('body', 'Treść', true)}{Img('image', 'Obraz (URL lub z plików)')}<Row label="Strona obrazu"><Sel value={String(d.imageSide ?? 'right')} onChange={(v) => onChange({ imageSide: v })} opts={[['right', 'Po prawej'], ['left', 'Po lewej']]} /></Row>{F('ctaText', 'Przycisk (opcjonalnie)')}{F('ctaHref', 'Link przycisku')}</div>;
    case 'quote':
      return <div className="space-y-2">{F('text', 'Cytat', true)}{F('author', 'Autor')}{F('role', 'Rola / firma')}</div>;
    case 'timeline':
      return <div className="space-y-2">{F('title', 'Tytuł')}<ObjList label="Wydarzenia" items={(d.items as Rec[]) ?? []} fields={[['when', 'Data / etap'], ['title', 'Tytuł'], ['desc', 'Opis', true]]} factory={() => ({ when: '2026', title: 'Wydarzenie', desc: 'Opis…' })} onChange={(items) => onChange({ items })} /></div>;
    case 'tabs':
      return <div className="space-y-2">{F('title', 'Tytuł')}<ObjList label="Zakładki" items={(d.items as Rec[]) ?? []} fields={[['label', 'Etykieta'], ['content', 'Treść', true]]} factory={() => ({ label: 'Nowa zakładka', content: 'Treść…' })} onChange={(items) => onChange({ items })} /></div>;
    case 'table':
      return <div className="space-y-2">{F('title', 'Tytuł')}<StrList label="Nagłówki kolumn" items={(d.headers as string[]) ?? []} onChange={(headers) => onChange({ headers })} /><ObjList label="Wiersze (komórki w osobnych liniach)" items={(d.rows as Rec[]) ?? []} fields={[['cells', 'Komórki — jedna w wierszu', true]]} factory={() => ({ cells: 'Kol 1\nKol 2\nKol 3' })} onChange={(rows) => onChange({ rows })} /><p className="text-[11px] text-neutral-500">W każdym wierszu wpisz komórki jedna pod drugą — kolejność = kolumny.</p></div>;
    case 'blog':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Wpisy" serviceId={serviceId} items={(d.items as Rec[]) ?? []} fields={[['image', 'Miniatura', false, true], ['title', 'Tytuł'], ['excerpt', 'Zajawka', true], ['date', 'Data'], ['href', 'Link do wpisu (np. wpis.html)']]} factory={() => ({ image: 'https://picsum.photos/seed/n/600/360', title: 'Nowy wpis', excerpt: '', date: '', href: '#' })} onChange={(items) => onChange({ items })} /><p className="text-[11px] text-neutral-500">Wskazówka: dodaj osobną stronę z sekcją „Wpis bloga" i podlinkuj ją tutaj.</p></div>;
    case 'article':
      return <div className="space-y-2">{F('title', 'Tytuł artykułu')}{F('author', 'Autor')}{F('date', 'Data')}{Img('cover', 'Obraz główny (URL lub z plików)')}{F('body', 'Treść (pusty wiersz = akapit)', true)}</div>;
    case 'download':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Pliki" items={(d.items as Rec[]) ?? []} fields={[['name', 'Nazwa'], ['desc', 'Opis', true], ['href', 'Adres pliku'], ['meta', 'Info (np. PDF · 1,2 MB)']]} factory={() => ({ name: 'Nowy plik', desc: '', href: '#', meta: '' })} onChange={(items) => onChange({ items })} /><p className="text-[11px] text-neutral-500">Wgraj pliki w Menedżerze plików, a tu wpisz ich adres (np. /pliki/cennik.pdf).</p></div>;
    case 'divider':
      return <div className="space-y-2"><Row label="Typ"><Sel value={String(d.style ?? 'line')} onChange={(v) => onChange({ style: v })} opts={[['line', 'Linia'], ['space', 'Pusty odstęp']]} /></Row>{String(d.style) !== 'line' && <Field label="Wysokość odstępu (px)" value={String(d.height ?? '60')} onChange={(v) => onChange({ height: v.replace(/[^0-9]/g, '') })} />}</div>;
    case 'cookies':
      return <div className="space-y-2">{F('text', 'Treść komunikatu', true)}{F('acceptText', 'Przycisk akceptacji')}{F('moreText', 'Tekst linku (np. Polityka prywatności)')}{F('moreHref', 'Adres linku')}<p className="text-[11px] text-neutral-500">Baner pojawia się raz — po akceptacji zapamiętujemy wybór w przeglądarce gościa.</p></div>;
    case 'cta':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}{F('buttonText', 'Przycisk')}{F('buttonHref', 'Link')}</div>;
    case 'newsletter':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}{F('placeholder', 'Placeholder pola')}{F('buttonText', 'Przycisk')}</div>;
    case 'contact':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('email', 'E-mail')}{F('phone', 'Telefon')}{F('address', 'Adres')}{Bool('showForm', 'Pokaż formularz kontaktowy')}</div>;
    case 'footer':
      return <div className="space-y-2">{F('brand', 'Nazwa')}{F('note', 'Notka')}<StrList label="Linki w stopce" items={(d.links as string[]) ?? []} onChange={(links) => onChange({ links })} /></div>;
    default:
      return null;
  }
}

function StrList({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-neutral-400">{label}</span>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1">
          <input value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm text-white" />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <button onClick={() => onChange([...items, 'Nowy'])} className="inline-flex items-center gap-1 text-xs text-emerald-300"><Plus className="h-3 w-3" /> Dodaj</button>
    </div>
  );
}
function ObjList({ label, items, fields, factory, onChange, bools, serviceId }: { label: string; items: Rec[]; fields: [string, string, boolean?, boolean?][]; factory: () => Rec; onChange: (v: Rec[]) => void; bools?: [string, string][]; serviceId?: string }) {
  const set = (i: number, k: string, v: unknown) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="space-y-2">
      <span className="text-xs text-neutral-400">{label}</span>
      {items.map((it, i) => (
        <div key={i} className="space-y-1 rounded-lg border border-white/10 p-2">
          {fields.map(([k, l, area, image]) =>
            image && serviceId ? (
              <ImageField key={k} serviceId={serviceId} label={l} value={String(it[k] ?? '')} onChange={(v) => set(i, k, v)} />
            ) : area ? (
              <textarea key={k} value={String(it[k] ?? '')} onChange={(e) => set(i, k, e.target.value)} placeholder={l} className="w-full min-h-[44px] rounded border border-white/10 bg-black/40 px-2 py-1 text-sm text-white" />
            ) : (
              <input key={k} value={String(it[k] ?? '')} onChange={(e) => set(i, k, e.target.value)} placeholder={l} className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-sm text-white" />
            ),
          )}
          {(bools ?? []).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" checked={Boolean(it[k])} onChange={(e) => set(i, k, e.target.checked)} className="h-3.5 w-3.5 accent-emerald-500" />{l}</label>
          ))}
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 text-xs text-rose-300"><Trash2 className="h-3 w-3" /> Usuń</button>
        </div>
      ))}
      <button onClick={() => onChange([...items, factory()])} className="inline-flex items-center gap-1 text-xs text-emerald-300"><Plus className="h-3 w-3" /> Dodaj</button>
    </div>
  );
}

/* ---- media picker ---- */
const IMG_RE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
function ImageField({ serviceId, label, value, onChange }: { serviceId: string; label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <label className="block space-y-1">
      <span className="text-xs text-neutral-400">{label}</span>
      <div className="flex gap-1">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="URL lub wybierz z plików" className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg border border-white/10 px-2 text-neutral-300 hover:text-white" aria-label="Wybierz z plików"><Folder className="h-4 w-4" /></button>
      </div>
      {open && <MediaPicker serviceId={serviceId} onPick={onChange} onClose={() => setOpen(false)} />}
    </label>
  );
}
function MediaPicker({ serviceId, onPick, onClose }: { serviceId: string; onPick: (url: string) => void; onClose: () => void }) {
  const [dir, setDir] = useState('public_html');
  const [entries, setEntries] = useState<FmEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setLoading(true); setErr(null);
    fmList(serviceId, dir).then((r) => setEntries(r.entries)).catch((e) => setErr(e instanceof Error ? e.message : 'Nie udało się wczytać plików.')).finally(() => setLoading(false));
  }, [serviceId, dir, reloadKey]);
  async function handleUpload(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true); setErr(null);
    let lastName = '';
    try {
      for (const file of Array.from(files)) {
        if (!IMG_RE.test(file.name)) { setErr(`„${file.name}" to nie obraz — pomijam.`); continue; }
        const fd = new FormData();
        fd.append('id', serviceId); fd.append('dir', dir); fd.append('file', file);
        const r = await fmUpload(fd);
        if ('error' in r) { setErr(r.error); } else { lastName = file.name; }
      }
      setReloadKey((k) => k + 1);
      if (lastName) { onPick(webPath(lastName)); onClose(); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Nie udało się wgrać pliku.');
    } finally { setUploading(false); }
  }
  const webPath = (name: string) => { const rel = dir.replace(/^public_html\/?/, ''); return '/' + (rel ? rel + '/' : '') + name; };
  const up = () => setDir((d) => { const p = d.split('/').filter(Boolean); if (p.length <= 1) return 'public_html'; p.pop(); return p.join('/') || 'public_html'; });
  const dirs = entries.filter((e) => e.type === 'dir');
  const imgs = entries.filter((e) => e.type === 'file' && IMG_RE.test(e.name));
  return (
    <div onClick={onClose} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0e0e12] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><ImageIcon className="h-4 w-4 text-emerald-300" /> Wybierz obraz z plików</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="mb-2 flex items-center gap-2 text-xs text-neutral-400">
          <button onClick={up} className="rounded border border-white/10 px-2 py-1 hover:text-white">↑ wyżej</button>
          <span className="flex-1 truncate font-mono">/{dir}</span>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { handleUpload(e.target.files); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Wgraj obraz
          </button>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-neutral-400"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
        ) : err ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</p>
        ) : (
          <div className="max-h-[50vh] space-y-1 overflow-auto">
            {dirs.map((e) => (<button key={e.name} onClick={() => setDir(`${dir}/${e.name}`)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white hover:bg-white/5"><Folder className="h-4 w-4 text-amber-300" /> {e.name}</button>))}
            {imgs.map((e) => (<button key={e.name} onClick={() => { onPick(webPath(e.name)); onClose(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-neutral-200 hover:bg-emerald-500/10"><ImageIcon className="h-4 w-4 text-emerald-300" /> {e.name}</button>))}
            {dirs.length === 0 && imgs.length === 0 && (<p className="py-6 text-center text-sm text-neutral-500">Brak obrazów w tym folderze. Użyj „Wgraj obraz", aby dodać własne.</p>)}
          </div>
        )}
        <p className="mt-3 text-[11px] text-neutral-500">Obrazy wgrywasz wprost tutaj („Wgraj obraz") do bieżącego folderu w <code>public_html</code> — od razu pojawią się na opublikowanej stronie.</p>
      </div>
    </div>
  );
}
