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
  Eye,
  ArrowLeft,
  LayoutGrid,
  Search,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { fmWrite, fmRead, fmList, fmUpload, type FmEntry } from '@/app/dashboard/file-manager/data';

/* ============================ MODEL ============================ */
type SectionType =
  | 'navbar' | 'banner' | 'hero' | 'stats' | 'features' | 'steps' | 'imagetext' | 'gallery' | 'portfolio' | 'pricing' | 'menu'
  | 'testimonials' | 'quote' | 'team' | 'timeline' | 'tabs' | 'table' | 'faq' | 'logos' | 'about' | 'richtext'
  | 'blog' | 'article' | 'video' | 'map' | 'hours' | 'countdown' | 'download' | 'social' | 'cta' | 'newsletter'
  | 'contact' | 'embed' | 'divider' | 'cookies' | 'footer'
  | 'bento' | 'marqueeText' | 'pricingToggle' | 'testimonialWall' | 'heroSplit' | 'showcase'
  | 'heroEditorial' | 'workRows' | 'serviceList';

type Section = { id: string; type: SectionType; data: Record<string, unknown> };
type ThemeFont = 'sans' | 'serif' | 'mono' | 'rounded' | 'condensed';
type ThemeStyle = 'modern' | 'minimal' | 'bold' | 'editorial' | 'soft';
type Theme = { primary: string; accent: string; bg: 'light' | 'dark'; font: ThemeFont; radius: 'sm' | 'md' | 'xl'; width: 'normal' | 'wide'; style?: ThemeStyle };
const FONT_STACK: Record<ThemeFont, string> = {
  sans: 'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  rounded: '"Trebuchet MS", "Segoe UI", Verdana, system-ui, sans-serif',
  condensed: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", system-ui, sans-serif',
};
/** Dobrane pary fontów Google per krój — display (nagłówki) + body (treść). Podnosi jakość każdego szablonu. */
type FontPair = { displayName: string; bodyName: string; display: string; body: string; query: string };
const FONT_PAIRS: Record<ThemeFont, FontPair> = {
  sans: { displayName: 'Space Grotesk', bodyName: 'Inter', display: `'Space Grotesk', ${FONT_STACK.sans}`, body: `'Inter', ${FONT_STACK.sans}`, query: 'family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700' },
  serif: { displayName: 'Fraunces', bodyName: 'Inter', display: `'Fraunces', ${FONT_STACK.serif}`, body: `'Inter', ${FONT_STACK.sans}`, query: 'family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600' },
  rounded: { displayName: 'Poppins', bodyName: 'Poppins', display: `'Poppins', ${FONT_STACK.rounded}`, body: `'Poppins', ${FONT_STACK.rounded}`, query: 'family=Poppins:wght@400;500;600;700;800' },
  condensed: { displayName: 'Archivo', bodyName: 'Inter', display: `'Archivo', ${FONT_STACK.condensed}`, body: `'Inter', ${FONT_STACK.sans}`, query: 'family=Archivo:wght@600;700;800;900&family=Inter:wght@400;500;600' },
  mono: { displayName: 'Space Grotesk', bodyName: 'JetBrains Mono', display: `'Space Grotesk', ${FONT_STACK.sans}`, body: `'JetBrains Mono', ${FONT_STACK.mono}`, query: 'family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500;700' },
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
  bento: 'Bento — siatka korzyści', marqueeText: 'Przewijany tekst (banner)', pricingToggle: 'Cennik z przełącznikiem', testimonialWall: 'Ściana opinii',
  heroSplit: 'Hero z mockupem (split)', showcase: 'Prezentacja (okno aplikacji)',
  heroEditorial: 'Hero edytorialny (duży)', workRows: 'Realizacje — wiersze', serviceList: 'Usługi — lista numerowana',
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
    bento: { title: 'Dlaczego my', subtitle: 'Wszystko, co naprawdę się liczy — w jednym miejscu.', items: [
      { icon: '🚀', title: 'Szybkość bez kompromisów', desc: 'Strony ładują się w ułamku sekundy dzięki nowoczesnej infrastrukturze i pamięci NVMe.' },
      { icon: '🔒', title: 'Bezpieczeństwo', desc: 'SSL, kopie zapasowe i WAF w standardzie.' },
      { icon: '📊', title: 'Analityka', desc: 'Pełny wgląd w ruch i konwersje.' },
      { icon: '⚙️', title: 'Automatyzacja', desc: 'Mniej pracy ręcznej, więcej efektów.' },
      { icon: '💬', title: 'Wsparcie 24/7', desc: 'Realni ludzie, zawsze gotowi pomóc.' },
    ] },
    marqueeText: { text: 'Projektujemy, Budujemy, Wdrażamy, Skalujemy, Wspieramy' },
    pricingToggle: { title: 'Prosty, uczciwy cennik', subtitle: 'Przełącz na rozliczenie roczne i oszczędzaj 20%.', plans: [
      { name: 'Start', monthly: '29', annual: '23', period: '/mies.', features: '1 strona WWW\n10 GB SSD\nCertyfikat SSL\nWsparcie e-mail', ctaText: 'Wybieram', featured: false },
      { name: 'Pro', monthly: '59', annual: '47', period: '/mies.', features: 'Nielimitowane strony\n50 GB NVMe\nCodzienne backupy\nWsparcie 24/7', ctaText: 'Wybieram', featured: true },
      { name: 'Biznes', monthly: '119', annual: '95', period: '/mies.', features: 'Wszystko z Pro\n200 GB NVMe\nDedykowane IP\nOpiekun konta', ctaText: 'Wybieram', featured: false },
    ] },
    heroSplit: { eyebrow: 'Nowość', title: 'Wszystko, czego potrzebuje Twój biznes online', subtitle: 'Hosting, domena, poczta i kreator stron w jednym panelu. Uruchom się dziś — bez kodowania.', ctaText: 'Zacznij za darmo', ctaHref: '#kontakt', ctaSecondary: 'Zobacz demo', kpis: [{ value: '99,99%', label: 'Uptime' }, { value: '12 tys.', label: 'Stron' }, { value: '30 s', label: 'Wdrożenie' }] },
    showcase: { title: 'Wszystko pod kontrolą', subtitle: 'Intuicyjny panel, w którym zarządzisz całą obecnością online.', caption: 'Podgląd panelu Verris', kpis: [{ value: '1 240', label: 'Wizyt dziś' }, { value: '64 ms', label: 'Czas odpowiedzi' }, { value: '4,9/5', label: 'Ocena' }] },
    heroEditorial: { title: 'Projektujemy marki, które mają znaczenie', subtitle: 'Niezależne studio. Tworzymy marki, strony i produkty cyfrowe, które ludzie zapamiętują.', tag: 'Dostępni do współpracy', badge: 'STUDIO · EST. 2014', image: 'https://picsum.photos/seed/edhero/1600/900', meta: [{ k: 'Założone', v: '2014, Warszawa' }, { k: 'Specjalizacja', v: 'Branding · Web' }, { k: 'Nagrody', v: 'Awwwards · FWA' }] },
    workRows: { title: 'Wybrane realizacje', subtitle: 'Projekty, z których jesteśmy dumni.', items: [{ image: 'https://picsum.photos/seed/wr1/900/600', title: 'Aurora Cosmetics', cat: 'Branding · Sklep online', href: '#' }, { image: 'https://picsum.photos/seed/wr2/900/600', title: 'Nordic Coffee', cat: 'Identyfikacja · Opakowania', href: '#' }, { image: 'https://picsum.photos/seed/wr3/900/600', title: 'Lumen Banking', cat: 'Produkt · Aplikacja', href: '#' }] },
    serviceList: { title: 'Co robimy', subtitle: 'Cztery rzeczy, w których jesteśmy najlepsi.', items: [{ title: 'Strategia i branding', desc: 'Pozycjonowanie, naming i pełny system identyfikacji wizualnej.' }, { title: 'Projektowanie stron', desc: 'Strony i landing page, które ładnie wyglądają i realnie sprzedają.' }, { title: 'Produkt i UX', desc: 'Aplikacje webowe i mobilne projektowane wokół użytkownika.' }, { title: 'Motion i 3D', desc: 'Animacje i treści, które ożywiają markę w każdym kanale.' }] },
    testimonialWall: { title: 'Kochają nas klienci', subtitle: 'Dołącz do tysięcy zadowolonych firm.', items: [
      { quote: 'Postawiłem sklep w godzinę. Najlepszy hosting, z jakiego korzystałem.', author: 'Marek Kowalski', role: 'Właściciel sklepu' },
      { quote: 'Wsparcie odpowiada błyskawicznie, a strona po prostu śmiga.', author: 'Anna Wiśniewska', role: 'Agencja Pixel' },
      { quote: 'Migracja przebiegła bezboleśnie. Polecam każdemu.', author: 'Tomasz Lewandowski', role: 'Bloger' },
      { quote: 'Panel jest intuicyjny, a ceny uczciwe. Nareszcie.', author: 'Katarzyna Zając', role: 'Fotografka' },
      { quote: 'Uptime bez zarzutu od pół roku. Konkretna robota.', author: 'Piotr Mazur', role: 'E-commerce' },
      { quote: 'Backupy uratowały mi skórę. Czuję się zaopiekowany.', author: 'Magda Król', role: 'Restauratorka' },
    ] },
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
  startup: () => ({ title: 'Startup / SaaS — premium', description: 'Twój produkt zasługuje na stronę, która robi wrażenie.', theme: { primary: '#6d28d9', accent: '#06b6d4', bg: 'dark', font: 'sans', radius: 'xl', width: 'wide' }, sections: SEC(['navbar', 'hero', 'marqueeText', 'logos', 'bento', 'stats', 'pricingToggle', 'testimonialWall', 'faq', 'cta', 'footer']) }),
  studio: () => ({ title: 'Studio kreatywne — premium', description: 'Pokaż portfolio z klasą i przyciągnij klientów.', theme: { primary: '#e11d48', accent: '#f59e0b', bg: 'dark', font: 'serif', radius: 'md', width: 'wide' }, sections: SEC(['navbar', 'hero', 'marqueeText', 'bento', 'portfolio', 'testimonialWall', 'about', 'contact', 'footer']) }),
  saaspro: () => ({ title: 'SaaS Pro — z mockupem', description: 'Strona produktu jak z najlepszych startupów: split-hero z podglądem aplikacji.', theme: { primary: '#4f46e5', accent: '#06b6d4', bg: 'dark', font: 'sans', radius: 'md', width: 'wide' }, sections: SEC(['navbar', 'heroSplit', 'logos', 'bento', 'showcase', 'pricingToggle', 'testimonialWall', 'faq', 'cta', 'footer']) }),
  agencjapro: () => ({ title: 'Studio / agencja — edytorial', description: 'Edytorialny, prestiżowy szablon dla studia kreatywnego.', theme: { primary: '#ff4a1c', accent: '#14110d', bg: 'light', font: 'serif', radius: 'sm', width: 'wide' }, sections: SEC(['navbar', 'heroEditorial', 'marqueeText', 'workRows', 'serviceList', 'stats', 'quote', 'cta', 'footer']) }),
  architekt: () => ({ title: 'Architekt / wnętrza — edytorial', description: 'Elegancki, minimalistyczny szablon dla architekta lub projektanta wnętrz.', theme: { primary: '#9a7b4f', accent: '#1c1a17', bg: 'light', font: 'serif', radius: 'sm', width: 'wide' }, sections: SEC(['navbar', 'heroEditorial', 'workRows', 'serviceList', 'about', 'quote', 'contact', 'footer']) }),
  restauracjapro: () => ({ title: 'Restauracja — edytorial', description: 'Apetyczny, prestiżowy szablon dla restauracji z dużą fotografią.', theme: { primary: '#b91c1c', accent: '#d97706', bg: 'dark', font: 'serif', radius: 'sm', width: 'normal' }, sections: SEC(['navbar', 'heroEditorial', 'marqueeText', 'menu', 'gallery', 'serviceList', 'hours', 'quote', 'contact', 'footer']) }),
};
/* Kategorie szablonów (galeria startowa z filtrami) + krótkie opisy do kart. */
const TPL_GROUPS: { cat: string; items: { key: string; name: string }[] }[] = [
  { cat: 'Biznes / firma', items: [
    { key: 'agencjapro', name: 'Studio / agencja — edytorial ✦' }, { key: 'architekt', name: 'Architekt / wnętrza ✦' },
    { key: 'landing', name: 'Landing page' }, { key: 'studio', name: 'Studio kreatywne (premium) ✦' }, { key: 'wizytowka', name: 'Wizytówka firmy' },
    { key: 'uslugi', name: 'Usługi lokalne' }, { key: 'agencja', name: 'Agencja / portfolio' },
    { key: 'kancelaria', name: 'Kancelaria' }, { key: 'organizacja', name: 'Fundacja / NGO' },
  ] },
  { cat: 'Produkt / online', items: [
    { key: 'saaspro', name: 'SaaS Pro — mockup ✦' }, { key: 'startup', name: 'Startup / SaaS (premium) ✦' }, { key: 'produkt', name: 'Produkt — landing' }, { key: 'saas', name: 'Aplikacja / SaaS' },
    { key: 'sklep', name: 'Sklep online' }, { key: 'kursy', name: 'Kursy / edukacja' },
  ] },
  { cat: 'Treść / blog', items: [
    { key: 'blog', name: 'Blog / magazyn' }, { key: 'wpis', name: 'Wpis bloga' },
    { key: 'cv', name: 'CV / wizytówka osobista' }, { key: 'freelancer', name: 'Freelancer' },
  ] },
  { cat: 'Lokal / wydarzenia', items: [
    { key: 'restauracjapro', name: 'Restauracja — edytorial ✦' }, { key: 'restauracja', name: 'Restauracja' }, { key: 'kawiarnia', name: 'Kawiarnia / bar' },
    { key: 'fitness', name: 'Klub fitness' }, { key: 'przychodnia', name: 'Przychodnia / gabinet' },
    { key: 'nieruchomosci', name: 'Nieruchomości' }, { key: 'wydarzenie', name: 'Wydarzenie / konferencja' },
    { key: 'fotograf', name: 'Fotograf' },
  ] },
];
const TPL_CATS = ['Wszystkie', ...TPL_GROUPS.map((g) => g.cat)];
const ALL_TPLS = TPL_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, cat: g.cat })));

/* Styl wizualny per szablon — żeby szablony realnie się od siebie różniły. */
const TPL_STYLE: Record<string, ThemeStyle> = {
  landing: 'modern', produkt: 'modern', saas: 'modern', sklep: 'modern', uslugi: 'modern',
  agencja: 'bold', freelancer: 'bold', fitness: 'bold', wydarzenie: 'bold',
  wizytowka: 'minimal', fotograf: 'minimal', cv: 'minimal',
  restauracja: 'editorial', kancelaria: 'editorial', blog: 'editorial', wpis: 'editorial', nieruchomosci: 'editorial',
  przychodnia: 'soft', kursy: 'soft', kawiarnia: 'soft', organizacja: 'soft',
  startup: 'bold', studio: 'editorial', saaspro: 'modern',
  agencjapro: 'editorial', architekt: 'editorial', restauracjapro: 'editorial',
};
function buildTplModel(key: string): PageModel {
  const m = asModel(RAW_TEMPLATES[key]());
  m.theme.style = TPL_STYLE[key] ?? 'modern';
  return m;
}

/* Grupy bloków dla wizualnego insertera (jak panel bloków w Gutenbergu). */
const SECTION_GROUPS: { cat: string; items: SectionType[] }[] = [
  { cat: 'Układ i nagłówki', items: ['navbar', 'banner', 'hero', 'heroEditorial', 'heroSplit', 'marqueeText', 'cta', 'footer', 'divider'] },
  { cat: 'Treść', items: ['bento', 'features', 'serviceList', 'steps', 'about', 'richtext', 'imagetext', 'quote', 'table', 'tabs', 'timeline', 'faq'] },
  { cat: 'Media i galeria', items: ['workRows', 'showcase', 'gallery', 'portfolio', 'video', 'logos', 'embed'] },
  { cat: 'Sprzedaż i oferta', items: ['pricingToggle', 'pricing', 'menu', 'stats', 'testimonialWall', 'testimonials'] },
  { cat: 'Blog', items: ['blog', 'article'] },
  { cat: 'Kontakt i lokal', items: ['contact', 'map', 'hours', 'social', 'newsletter', 'countdown', 'download', 'team'] },
  { cat: 'Inne', items: ['cookies'] },
];

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

/* Neutralny motyw do miniatur pojedynczych bloków w inserterze. */
const PREVIEW_THEME: Theme = { primary: '#6366f1', accent: '#22d3ee', bg: 'dark', font: 'sans', radius: 'xl', width: 'normal' };

/* ============================ HTML GENERATOR ============================ */
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Hex (#rgb / #rrggbb) → rgba() z alfą. Bezpieczny fallback. */
function rgba(hex: string, a: number): string {
  let h = (hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(99,102,241,${a})`;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/** Czytelny kolor tekstu (ciemny/jasny) na danym tle wg luminancji. */
function textOn(hex: string): string {
  let h = (hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#0a0a0a';
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#0a0a0a' : '#ffffff';
}

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

/** Dodaje klasę `reveal` do kluczowych elementów (animacja wejścia przy scrollu). */
function addReveal(html: string): string {
  return html
    .replace(/class="head"/g, 'class="head reveal"')
    .replace(/class="card"/g, 'class="card reveal"')
    .replace(/class="card /g, 'class="card reveal ')
    .replace(/class="stat /g, 'class="stat reveal ')
    .replace(/class="cta-panel"/g, 'class="cta-panel reveal"')
    .replace(/class="bigquote"/g, 'class="bigquote reveal"')
    .replace(/class="eyebrow"/g, 'class="eyebrow reveal"')
    .replace(/class="hero-actions"/g, 'class="hero-actions reveal"');
}

function genHtml(page: Page, theme: Theme, description: string, nav: NavLink[], animate = true): string {
  const t = theme;
  const dark = t.bg === 'dark';
  const pair = FONT_PAIRS[t.font] ?? FONT_PAIRS.sans;
  const font = pair.body;
  // RODO — fonty serwujemy przez proxy Verris (self-hosting), nie bezpośrednio
  // z Google. Dzięki temu IP odwiedzającego stronę nigdy nie trafia do Google.
  const fontsBase = (process.env.NEXT_PUBLIC_API_URL ?? 'https://api.verris.pl').replace(/\/$/, '');
  const fontsLink = `<link rel="preconnect" href="${fontsBase}" crossorigin/><link href="${fontsBase}/fonts/css2?${pair.query}&display=swap" rel="stylesheet"/>`;
  const bg = dark ? '#0b0b0e' : '#ffffff';
  const bg2 = dark ? '#121217' : '#f6f7f9';
  const fg = dark ? '#f5f5f7' : '#16161a';
  const mut = dark ? '#a6a6b0' : '#5b5b66';
  const card = dark ? '#16161c' : '#ffffff';
  const line = dark ? '#26262e' : '#e6e6ec';
  const rad = t.radius === 'sm' ? '8px' : t.radius === 'md' ? '14px' : '22px';
  const maxw = t.width === 'wide' ? '1240px' : '1080px';
  const style: ThemeStyle = t.style ?? 'modern';
  const grad = `linear-gradient(135deg, ${t.primary}, ${t.accent})`;
  const onP = textOn(t.primary);
  const ctx: Ctx = { p: t.primary, a: t.accent, fg, mut, card, line, bg2, dark, rad, nav };
  const rawBody = page.sections.map((s) => renderSection(s, ctx)).join('\n');
  const body = animate ? addReveal(rawBody) : rawBody;
  return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(description)}"/>
<meta property="og:title" content="${esc(page.title)}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:type" content="website"/>
${fontsLink}
<style>
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:${font};background:${bg};color:${fg};line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{max-width:100%;display:block}
.wrap{max-width:${maxw};margin:0 auto;padding:0 24px}
a{color:inherit;text-decoration:none}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:${grad};color:${onP};font-weight:700;font-size:15px;padding:14px 28px;border-radius:${rad};transition:transform .18s ease,box-shadow .25s ease;border:none;cursor:pointer;box-shadow:0 8px 24px ${rgba(t.primary, 0.32)}}
.btn:hover{transform:translateY(-2px);box-shadow:0 14px 36px ${rgba(t.primary, 0.42)}}
.btn.ghost{background:transparent;color:${fg};border:1px solid ${line};box-shadow:none}
.btn.ghost:hover{border-color:${t.primary};background:${rgba(t.primary, 0.06)};box-shadow:none}
section{padding:clamp(64px,9vw,104px) 0;position:relative}
.sec-tint{background:${bg2}}
h1,h2,h3,.nav .brand,.amt,.stat .v,.mock .kpi b,.bento .b.lg h3,.mtext .mt span,.edhero .meta .v,.wrow .no,.srow .n{font-family:${pair.display}}
h1{font-size:clamp(40px,6.4vw,68px);line-height:1.02;font-weight:800;letter-spacing:-.035em}
h2{font-size:clamp(28px,4vw,44px);font-weight:800;line-height:1.1;letter-spacing:-.025em}
h3{font-size:20px;font-weight:700;letter-spacing:-.01em}
.center{text-align:center}
.lead{color:${mut};font-size:clamp(17px,1.7vw,21px);margin-top:20px;max-width:62ch;line-height:1.6}
.sub{color:${mut};margin-top:10px;max-width:60ch}
.muted{color:${mut}}
.grad-text{background:${grad};-webkit-background-clip:text;background-clip:text;color:transparent}
.head{max-width:720px;margin:0 auto 56px;text-align:center}
.grid{display:grid;gap:24px}
.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
.card{background:${card};border:1px solid ${line};border-radius:${rad};padding:30px;transition:transform .2s ease,box-shadow .25s ease,border-color .2s ease}
.card:hover{transform:translateY(-4px);box-shadow:0 18px 50px rgba(0,0,0,${dark ? '.45' : '.10'});border-color:${rgba(t.primary, 0.4)}}
.shadow{box-shadow:0 18px 60px rgba(0,0,0,${dark ? '.4' : '.08'})}
.nav{display:flex;align-items:center;justify-content:space-between;padding:20px 0;gap:16px}
.nav.sticky{position:sticky;top:0;z-index:50;background:${rgba(dark ? '#0b0b0e' : '#ffffff', 0.72)};backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid ${line}}
.nav .brand{font-size:19px;font-weight:800;letter-spacing:-.02em}
.nav .links{display:flex;gap:30px}
.nav .links a{font-size:15px;color:${mut};font-weight:500;transition:color .15s}
.nav .links a:hover{color:${fg}}
.eyebrow{display:inline-flex;align-items:center;gap:8px;color:${t.primary};font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:12.5px;margin-bottom:18px;padding:6px 14px;border-radius:999px;background:${rgba(t.primary, 0.1)};border:1px solid ${rgba(t.primary, 0.22)}}
.hero{padding:clamp(76px,12vh,148px) 0 clamp(64px,9vh,116px);position:relative;overflow:hidden}
.hero::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(58% 50% at 12% -5%, ${rgba(t.primary, dark ? 0.3 : 0.16)} 0%, transparent 62%),radial-gradient(52% 46% at 92% 12%, ${rgba(t.accent, dark ? 0.28 : 0.14)} 0%, transparent 60%)}
.hero .wrap{position:relative;z-index:1}
.hero h1{max-width:19ch}
.hero.center{text-align:center}
.hero.center h1,.hero.center .lead{margin-left:auto;margin-right:auto}
.hero-actions{display:flex;gap:14px;margin-top:36px;flex-wrap:wrap}
.hero.center .hero-actions{justify-content:center}
.hero-bg{background-size:cover;background-position:center;border-radius:${rad};padding:clamp(64px,9vw,104px) 40px;position:relative;overflow:hidden}
.hero-bg::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.62));border-radius:${rad}}
.hero-bg>*{position:relative;color:#fff}
.hero-bg.center{text-align:center}.hero-bg.center h1,.hero-bg.center .lead{margin-left:auto;margin-right:auto}.hero-bg.center .hero-actions{justify-content:center}
.cta-panel{position:relative;overflow:hidden;text-align:center;border-radius:${rad};padding:clamp(44px,6vw,76px);background:${grad};color:${onP};box-shadow:0 22px 70px ${rgba(t.primary, 0.35)}}
.cta-panel h2{color:${onP}}
.cta-panel .btn{background:${onP === '#ffffff' ? '#ffffff' : '#0a0a0a'};color:${onP === '#ffffff' ? t.primary : '#ffffff'};box-shadow:0 10px 28px rgba(0,0,0,.2)}
.cta-panel .btn:hover{transform:translateY(-2px)}
.stat .v{font-size:clamp(32px,4.4vw,52px);font-weight:800;letter-spacing:-.03em;background:${grad};-webkit-background-clip:text;background-clip:text;color:transparent}
.stat .l{color:${mut};margin-top:8px;font-size:14.5px}
.icon{display:inline-flex;align-items:center;justify-content:center;width:54px;height:54px;border-radius:${t.radius === 'xl' ? '16px' : '12px'};font-size:26px;margin-bottom:18px;background:${rgba(t.primary, 0.12)};border:1px solid ${rgba(t.primary, 0.2)}}
.gal img{border-radius:${rad};aspect-ratio:3/2;object-fit:cover;width:100%}
.price{position:relative;text-align:center}
.price.feat{border-color:${rgba(t.primary, 0.55)};box-shadow:0 0 0 2px ${rgba(t.primary, 0.55)} inset,0 22px 60px rgba(0,0,0,${dark ? '.5' : '.12'});transform:scale(1.035)}
.price .amt{font-size:44px;font-weight:800;letter-spacing:-.03em;margin:14px 0}
.price ul{list-style:none;margin:18px 0;text-align:left}
.price li{padding:9px 0 9px 26px;border-bottom:1px solid ${line};color:${mut};position:relative}
.price li::before{content:"✓";position:absolute;left:0;color:${t.primary};font-weight:800}
.badge{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:${grad};color:${onP};font-size:12px;font-weight:700;padding:5px 14px;border-radius:999px;box-shadow:0 6px 18px ${rgba(t.primary, 0.4)}}
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
.banner{background:${grad};color:${onP};text-align:center;padding:13px 24px;font-weight:600;font-size:15px}
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
/* ===== Warianty stylu (różnicują szablony) ===== */
/* MINIMAL — dużo światła, płaskie przyciski, stonowane akcenty */
body[data-style=minimal] section{padding:clamp(72px,10vw,128px) 0}
body[data-style=minimal] .btn{background:${t.primary};box-shadow:none}
body[data-style=minimal] .btn:hover{transform:translateY(-1px);box-shadow:none;opacity:.9}
body[data-style=minimal] .eyebrow{background:transparent;border:none;padding:0;letter-spacing:.2em}
body[data-style=minimal] .card{box-shadow:none}
body[data-style=minimal] .card:hover{transform:none;box-shadow:none;border-color:${t.primary}}
body[data-style=minimal] .hero::before{opacity:.45}
body[data-style=minimal] h1,body[data-style=minimal] h2{font-weight:700;letter-spacing:-.02em}
/* BOLD — wielka, mocna typografia + gradientowy nagłówek hero */
body[data-style=bold] h1{font-size:clamp(46px,9vw,96px);font-weight:900;letter-spacing:-.045em}
body[data-style=bold] .hero h1{background:${grad};-webkit-background-clip:text;background-clip:text;color:transparent}
body[data-style=bold] .hero::before{background:radial-gradient(60% 55% at 10% -10%, ${rgba(t.primary, dark ? 0.42 : 0.22)} 0%, transparent 62%),radial-gradient(55% 50% at 95% 10%, ${rgba(t.accent, dark ? 0.4 : 0.2)} 0%, transparent 60%)}
body[data-style=bold] .btn{padding:16px 34px;font-size:16px}
body[data-style=bold] h2{font-weight:900}
/* EDITORIAL — magazynowy, hero do lewej, subtelne akcenty */
body[data-style=editorial] .hero{text-align:left}
body[data-style=editorial] .hero h1,body[data-style=editorial] .hero .lead{margin-left:0}
body[data-style=editorial] .eyebrow{background:transparent;border:none;padding:0;color:${mut};letter-spacing:.24em}
body[data-style=editorial] .card{box-shadow:none}
body[data-style=editorial] h1{font-weight:700;letter-spacing:-.015em}
body[data-style=editorial] .head{text-align:left;margin-left:0}
/* SOFT — przyjazny, mocno zaokrąglony, pastelowe poświaty */
body[data-style=soft] .btn,body[data-style=soft] .card,body[data-style=soft] .field,body[data-style=soft] .price,body[data-style=soft] .faq details{border-radius:26px}
body[data-style=soft] .icon{border-radius:20px}
body[data-style=soft] .hero::before{background:radial-gradient(55% 50% at 18% 0%, ${rgba(t.primary, dark ? 0.26 : 0.16)} 0%, transparent 60%),radial-gradient(50% 45% at 85% 8%, ${rgba(t.accent, dark ? 0.24 : 0.15)} 0%, transparent 58%),radial-gradient(60% 50% at 50% 110%, ${rgba(t.accent, dark ? 0.18 : 0.1)} 0%, transparent 60%)}
body[data-style=soft] .card:hover{box-shadow:0 22px 60px rgba(0,0,0,${dark ? '.4' : '.1'})}
.footer{border-top:1px solid ${line};padding:44px 0;color:${mut};display:flex;justify-content:space-between;flex-wrap:wrap;gap:14px;align-items:center}
.footer .fl a{transition:color .15s}.footer .fl a:hover{color:${fg}}
/* ===== Nowe bloki premium ===== */
.hsplit{display:grid;grid-template-columns:1.04fr .96fr;gap:clamp(28px,5vw,64px);align-items:center}
.hsplit .lead{margin-top:18px}
@media(max-width:900px){.hsplit{grid-template-columns:1fr}}
.mock{border:1px solid ${line};border-radius:16px;overflow:hidden;background:${card};box-shadow:0 30px 80px rgba(0,0,0,${dark ? '.5' : '.16'})}
.mock .bar{display:flex;gap:7px;align-items:center;padding:13px 16px;border-bottom:1px solid ${line};background:${bg2}}
.mock .bar i{width:11px;height:11px;border-radius:50%;display:block;background:${line}}
.mock .bar i:nth-child(1){background:#ff5f57}.mock .bar i:nth-child(2){background:#febc2e}.mock .bar i:nth-child(3){background:#28c840}
.mock .bar em{margin-left:12px;font-style:normal;font-size:12px;color:${mut};background:${card};border:1px solid ${line};border-radius:8px;padding:4px 12px;flex:1;max-width:280px}
.mock .mbody{padding:20px;display:grid;gap:16px}
.mock .kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.mock .kpi div{background:${bg2};border:1px solid ${line};border-radius:12px;padding:14px 16px}
.mock .kpi b{font-size:24px;display:block;letter-spacing:-.02em;background:${grad};-webkit-background-clip:text;background-clip:text;color:transparent}
.mock .kpi span{font-size:11px;color:${mut}}
.mock .chart{display:flex;align-items:flex-end;gap:9px;height:130px;padding:12px;background:${bg2};border:1px solid ${line};border-radius:12px}
.mock .chart i{flex:1;border-radius:6px 6px 0 0;background:${grad};opacity:.9;display:block}
.mock .mline{height:11px;border-radius:6px;background:${bg2};border:1px solid ${line}}
.edhero{padding:clamp(56px,8vw,96px) 0 36px;position:relative}
.edhero .leadrow{display:flex;justify-content:flex-end;margin-bottom:18px}
.edhero .lead{max-width:440px;margin-top:0}
.edhero h1{font-size:clamp(46px,11vw,150px);line-height:.94;font-weight:700;letter-spacing:-.03em}
.edhero .meta{display:flex;gap:40px;flex-wrap:wrap;margin-top:32px;border-top:1px solid ${line};padding-top:20px}
.edhero .meta .k{display:block;color:${mut};font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.edhero .meta .v{display:block;font-size:22px;margin-top:4px}
.edhero .ed-img{margin-top:42px;height:clamp(260px,42vw,520px);border-radius:${rad};overflow:hidden;position:relative;background:linear-gradient(135deg,${bg2},${rgba(t.primary, 0.25)})}
.edhero .ed-img img{width:100%;height:100%;object-fit:cover;filter:grayscale(.2) contrast(1.05)}
.ed-badge{position:absolute;right:22px;top:22px;width:112px;height:112px;background:${card};border-radius:50%;box-shadow:0 10px 30px rgba(0,0,0,.18)}
.ed-badge svg{width:100%;height:100%;animation:spin 16s linear infinite}
.ed-badge .st{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${t.primary};font-size:24px}
.edhero .tag{position:absolute;left:20px;bottom:20px;background:${card};padding:9px 16px;border-radius:40px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px}
.edhero .tag::before{content:"";width:8px;height:8px;border-radius:50%;background:${t.primary}}
.wrows{display:flex;flex-direction:column;gap:16px}
.wrow{display:grid;grid-template-columns:70px 1fr 1fr;gap:28px;align-items:center;padding:20px;border:1px solid ${line};border-radius:${rad};background:${card};transition:transform .3s,box-shadow .3s}
.wrow:hover{transform:translateY(-4px);box-shadow:0 22px 56px rgba(0,0,0,${dark ? '.5' : '.1'})}
.wrow .no{font-size:32px;color:${t.primary}}
.wrow .ph{height:210px;border-radius:12px;overflow:hidden;background:linear-gradient(135deg,${bg2},${rgba(t.primary, 0.2)})}
.wrow .ph img{width:100%;height:100%;object-fit:cover;filter:grayscale(.3) contrast(1.05);transition:transform .5s,filter .5s}
.wrow:hover .ph img{transform:scale(1.05);filter:grayscale(0)}
.wrow h3{font-size:28px}
.wrow .cat{font-size:14px;margin-top:8px}
.wrow .arrow{margin-top:14px;display:inline-flex;gap:8px;font-weight:600;font-size:14px}.wrow .arrow b{color:${t.primary}}
@media(max-width:860px){.wrow{grid-template-columns:1fr}}
.slist{border-top:1px solid ${line}}
.srow{display:grid;grid-template-columns:60px 1fr 1.1fr;gap:28px;align-items:center;padding:28px 6px;border-bottom:1px solid ${line};transition:background .25s,padding .25s}
.srow:hover{background:${bg2};padding-left:16px;padding-right:16px}
.srow .n{color:${mut};font-size:18px}
.srow h3{font-size:clamp(24px,3.2vw,40px)}
.srow:hover h3{color:${t.primary}}
.srow p{color:${mut}}
@media(max-width:860px){.srow{grid-template-columns:40px 1fr}.srow p{grid-column:1 / -1}}
.bento{display:grid;grid-template-columns:repeat(6,1fr);grid-auto-rows:1fr;gap:18px}
.bento .b{background:${card};border:1px solid ${line};border-radius:${rad};padding:28px;position:relative;overflow:hidden;grid-column:span 2;transition:transform .2s,box-shadow .25s,border-color .2s}
.bento .b:hover{transform:translateY(-4px);box-shadow:0 18px 50px rgba(0,0,0,${dark ? '.45' : '.10'});border-color:${rgba(t.primary, 0.4)}}
.bento .b.lg{grid-column:span 4;grid-row:span 2;display:flex;flex-direction:column;justify-content:flex-end}
.bento .b.lg::before{content:"";position:absolute;inset:0;background:${grad};opacity:.1;pointer-events:none}
.bento .b.lg h3{font-size:clamp(22px,2.6vw,30px)}
.mtext{overflow:hidden;border-top:1px solid ${line};border-bottom:1px solid ${line};padding:24px 0;background:${bg2};-webkit-mask:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.mtext .mt{display:flex;align-items:center;width:max-content}
.mtext .mt span{font-size:clamp(30px,6vw,72px);font-weight:900;letter-spacing:-.03em;white-space:nowrap;padding:0 .3em;background:${grad};-webkit-background-clip:text;background-clip:text;color:transparent}
.mtext .mt span.dot{-webkit-text-fill-color:${t.primary};color:${t.primary}}
.toggle{display:inline-flex;gap:4px;padding:5px;border:1px solid ${line};border-radius:999px;background:${card};margin:0 auto 40px}
.toggle button{border:none;background:transparent;color:${mut};font:inherit;font-weight:700;font-size:14px;padding:9px 20px;border-radius:999px;cursor:pointer;transition:color .2s}
.toggle button.on{background:${grad};color:${onP}}
.save-pill{font-size:11px;opacity:.9}
.wall{column-count:3;column-gap:20px}
.wall .tcard{break-inside:avoid;-webkit-column-break-inside:avoid;margin-bottom:20px;background:${card};border:1px solid ${line};border-radius:${rad};padding:24px}
.wall .tq{font-size:15.5px;line-height:1.6}
.wall .ta{display:flex;align-items:center;gap:10px;margin-top:16px}
.wall .av{width:42px;height:42px;border-radius:50%;flex:none;background:${grad};color:${onP};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px}
@media(max-width:980px){.wall{column-count:2}.bento{grid-template-columns:repeat(2,1fr)}.bento .b,.bento .b.lg{grid-column:span 1;grid-row:auto}}
@media(max-width:620px){.wall{column-count:1}.bento{grid-template-columns:1fr}}
/* ===== Autorskie efekty „wow" (CSS + vanilla JS, bez bibliotek) ===== */
/* Spotlight pod kursorem na kartach */
.card{position:relative;overflow:hidden}
.card::after{content:"";position:absolute;inset:0;border-radius:inherit;opacity:0;transition:opacity .35s;pointer-events:none;background:radial-gradient(220px circle at var(--mx,50%) var(--my,50%), ${rgba(t.primary, 0.16)}, transparent 60%)}
.card:hover::after{opacity:1}
/* Marquee logo (auto-przewijanie) */
.marquee{overflow:hidden;-webkit-mask:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent);mask:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)}
.mq-track{display:flex;align-items:center;gap:56px;width:max-content;opacity:.62}
.mq-track span{font-weight:800;font-size:20px;letter-spacing:.04em;white-space:nowrap}
/* Animowany pierścień gradientowy na wyróżnionym planie */
.price.feat{z-index:0}
.price.feat::before{content:"";position:absolute;inset:-1.5px;border-radius:inherit;z-index:-1;background:conic-gradient(from 0deg, ${t.primary}, ${t.accent}, ${t.primary})}
/* ===== Animacje (tylko gdy body.anim; respektują reduced-motion) ===== */
body.anim .reveal{opacity:0;transform:translateY(28px);transition:opacity .7s cubic-bezier(.16,.7,.3,1),transform .7s cubic-bezier(.16,.7,.3,1)}
body.anim .reveal.in{opacity:1;transform:none}
body.anim .grid>.reveal:nth-child(2){transition-delay:.07s}
body.anim .grid>.reveal:nth-child(3){transition-delay:.14s}
body.anim .grid>.reveal:nth-child(4){transition-delay:.21s}
body.anim .hero::before{inset:auto;width:50vw;height:50vw;left:-12vw;top:-18vw;border-radius:50%;background:radial-gradient(circle, ${t.primary} 0%, transparent 68%);filter:blur(72px);opacity:${dark ? '.55' : '.4'};animation:drift1 20s ease-in-out infinite alternate}
body.anim .hero::after{content:"";position:absolute;z-index:0;pointer-events:none;width:44vw;height:44vw;right:-10vw;top:-10vw;border-radius:50%;background:radial-gradient(circle, ${t.accent} 0%, transparent 68%);filter:blur(72px);opacity:${dark ? '.5' : '.38'};animation:drift2 24s ease-in-out infinite alternate}
body.anim .mq-track{animation:mq 30s linear infinite}
body.anim .price.feat::before{animation:spin 8s linear infinite}
@keyframes drift1{to{transform:translate(8vw,6vw) scale(1.18)}}
@keyframes drift2{to{transform:translate(-7vw,8vw) scale(1.12)}}
@keyframes mq{to{transform:translateX(-50%)}}
@keyframes spin{to{transform:rotate(1turn)}}
@media(prefers-reduced-motion:reduce){body.anim .reveal{opacity:1!important;transform:none!important}body.anim .hero::before,body.anim .hero::after,body.anim .mq-track,body.anim .price.feat::before,.ed-badge svg{animation:none!important}}
@media(max-width:820px){.g2,.g3,.g4,.split{grid-template-columns:1fr}.nav .links{display:none}.price.feat{transform:none}.hero{padding:72px 0 56px}}
</style></head>
<body data-style="${style}" class="${animate ? 'anim' : ''}">
${body}
<script>(function(){if(location.search.indexOf('sent=1')>-1){document.querySelectorAll('.fnote').forEach(function(e){e.style.display='block';});var b=document.createElement('div');b.textContent='Dziękujemy! Wiadomość została wysłana.';b.style.cssText='position:fixed;left:50%;top:20px;transform:translateX(-50%);background:${t.primary};color:#04100b;font-weight:700;padding:12px 22px;border-radius:12px;z-index:9999;box-shadow:0 10px 40px rgba(0,0,0,.35)';document.body.appendChild(b);setTimeout(function(){b.remove();},5000);}
var cds=document.querySelectorAll('.cd[data-deadline]');if(cds.length){function pad(n){return(n<10?'0':'')+n;}function tick(){cds.forEach(function(cd){var end=new Date(cd.getAttribute('data-deadline')).getTime();if(isNaN(end))return;var diff=end-Date.now();if(diff<=0){cd.innerHTML='<div class="u" style="min-width:auto;padding:16px 24px"><div class="n">'+(cd.getAttribute('data-expired')||'Zakończono')+'</div></div>';return;}var d=Math.floor(diff/864e5),h=Math.floor(diff/36e5)%24,m=Math.floor(diff/6e4)%60,s=Math.floor(diff/1e3)%60;var set=function(k,v){var el=cd.querySelector('[data-cd="'+k+'"]');if(el)el.textContent=v;};set('d',d);set('h',pad(h));set('m',pad(m));set('s',pad(s));});}tick();setInterval(tick,1000);}
document.querySelectorAll('.tab-btn').forEach(function(b){b.addEventListener('click',function(){var g=b.getAttribute('data-tab'),i=b.getAttribute('data-i');document.querySelectorAll('.tab-btn[data-tab="'+g+'"]').forEach(function(x){x.classList.toggle('active',x===b);});document.querySelectorAll('.tab-pane[data-pane="'+g+'"]').forEach(function(p){p.classList.toggle('active',p.getAttribute('data-i')===i);});});});
document.querySelectorAll('[data-toggle]').forEach(function(tg){tg.addEventListener('click',function(e){var b=e.target.closest('button[data-mode]');if(!b)return;var mode=b.getAttribute('data-mode');tg.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);});var sc=tg.closest('section');if(!sc)return;sc.querySelectorAll('[data-price]').forEach(function(p){var v=p.getAttribute(mode==='a'?'data-a':'data-m');if(v!=null)p.textContent=v;});sc.querySelectorAll('[data-per]').forEach(function(pe){pe.textContent=mode==='a'?'/mies. (rocznie)':'/mies.';});});});
var cb=document.querySelector('[data-cookiebar]');if(cb){try{if(!localStorage.getItem('cookieok'))cb.hidden=false;}catch(e){cb.hidden=false;}var ac=cb.querySelector('[data-cookie-accept]');if(ac)ac.addEventListener('click',function(){try{localStorage.setItem('cookieok','1');}catch(e){}cb.hidden=true;});}
if(document.body.classList.contains('anim')){var rm=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;var rev=[].slice.call(document.querySelectorAll('.reveal'));if(rm){rev.forEach(function(e){e.classList.add('in');});}else if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target);}});},{threshold:.12,rootMargin:'0px 0px -8% 0px'});rev.forEach(function(e){io.observe(e);});}else{rev.forEach(function(e){e.classList.add('in');});}
document.querySelectorAll('.card').forEach(function(c){c.addEventListener('pointermove',function(e){var r=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-r.left)+'px');c.style.setProperty('--my',(e.clientY-r.top)+'px');});});
if(!rm){var run=function(el){var txt=el.textContent;var m=txt.match(/([0-9]+(?:[.,][0-9]+)?)/);if(!m)return;var target=parseFloat(m[1].replace(',','.'));var dec=(m[1].split(/[.,]/)[1]||'').length;var pre=txt.slice(0,m.index),post=txt.slice(m.index+m[1].length);var t0=null,dur=1400;function step(ts){if(!t0)t0=ts;var p=Math.min((ts-t0)/dur,1);var ease=1-Math.pow(1-p,3);var disp=dec?(target*ease).toFixed(dec).replace('.',','):Math.round(target*ease).toString();el.textContent=pre+disp+post;if(p<1)requestAnimationFrame(step);}requestAnimationFrame(step);};var nums=[].slice.call(document.querySelectorAll('.stat .v'));if('IntersectionObserver' in window){var io2=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){run(en.target);io2.unobserve(en.target);}});},{threshold:.5});nums.forEach(function(e){io2.observe(e);});}else{nums.forEach(run);}}}
})();</script>
</body></html>`;
}

function sec(inner: string, tint = false, id = '') {
  return `<section class="${tint ? 'sec-tint' : ''}"${id ? ` id="${id}"` : ''}><div class="wrap">${inner}</div></section>`;
}
function headBlock(title: unknown, sub?: unknown) {
  return `<div class="head"><h2>${esc(title)}</h2>${sub ? `<p class="sub" style="margin:8px auto 0">${esc(sub)}</p>` : ''}</div>`;
}
/** Czysty-CSS „mockup" okna aplikacji (pasek tytułu + KPI + wykres słupkowy). */
function mockWindow(kpis: { value: string; label: string }[]): string {
  const bars = [44, 66, 52, 78, 60, 92, 70, 84];
  const k = kpis.slice(0, 3).map((x) => `<div><b>${esc(x.value)}</b><span>${esc(x.label)}</span></div>`).join('');
  return `<div class="mock"><div class="bar"><i></i><i></i><i></i><em>panel.twojafirma.pl</em></div><div class="mbody"><div class="kpi">${k}</div><div class="chart">${bars.map((h) => `<i style="height:${h}%"></i>`).join('')}</div><div class="mline" style="width:82%"></div><div class="mline" style="width:64%"></div><div class="mline" style="width:73%"></div></div></div>`;
}

function renderSection(s: Section, c: Ctx): string {
  const d = s.data;
  switch (s.type) {
    case 'navbar': {
      const links = c.nav.length > 1 ? c.nav : ((d.links as string[]) ?? []).map((l) => ({ name: l, href: '#' }));
      return `<div class="wrap"><nav class="nav ${d.sticky ? 'sticky' : ''}"><strong class="brand">${esc(d.brand)}</strong><div class="links">${links
        .map((l) => `<a href="${esc(l.href)}">${esc(l.name)}</a>`)
        .join('')}</div><a class="btn" href="#kontakt">${esc(d.ctaText)}</a></nav></div>`;
    }
    case 'hero': {
      const center = (d.align as string) === 'center';
      const inner = `${d.eyebrow ? `<span class="eyebrow">${esc(d.eyebrow)}</span>` : ''}<h1>${esc(d.title)}</h1><p class="lead">${esc(d.subtitle)}</p><div class="hero-actions"><a class="btn" href="${esc(d.ctaHref || '#')}">${esc(d.ctaText)}</a>${d.ctaSecondary ? `<a class="btn ghost" href="#">${esc(d.ctaSecondary)}</a>` : ''}</div>`;
      if (d.bgImage) return `<section class="hero"><div class="wrap"><div class="hero-bg ${center ? 'center' : ''}" style="background-image:url('${esc(d.bgImage)}')">${inner}</div></div></section>`;
      return `<section class="hero ${center ? 'center' : ''}"><div class="wrap">${inner}</div></section>`;
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
      const set = items.map((l) => `<span>${esc(l)}</span>`).join('');
      return sec(`${d.title ? `<p class="center muted" style="margin-bottom:28px">${esc(d.title)}</p>` : ''}<div class="marquee"><div class="mq-track">${set}${set}</div></div>`);
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
      return sec(`<div class="cta-panel"><h2>${esc(d.title)}</h2><p style="margin:14px auto 28px;max-width:54ch;opacity:.92">${esc(d.subtitle)}</p><a class="btn" href="${esc(d.buttonHref || '#')}">${esc(d.buttonText)}</a></div>`);
    case 'newsletter':
      return sec(`<div class="card center" style="padding:48px"><h2>${esc(d.title)}</h2><p class="muted" style="margin:10px auto 22px">${esc(d.subtitle)}</p><form method="post" action="${FORM_ACTION}" style="display:flex;gap:10px;max-width:440px;margin:0 auto;flex-wrap:wrap;justify-content:center"><input type="hidden" name="_type" value="Newsletter"/><input class="hp" type="text" name="_company" tabindex="-1" autocomplete="off" aria-hidden="true"/><input class="field" style="margin:0;flex:1;min-width:200px" type="email" name="email" required placeholder="${esc(d.placeholder)}"/><button class="btn" type="submit">${esc(d.buttonText)}</button></form><p class="fnote">Dziękujemy! Zapis przyjęty.</p></div>`, true);
    case 'contact':
      return sec(`${headBlock(d.title)}<div class="split"><div class="grid" style="gap:14px"><div class="card"><h3>E-mail</h3><p class="muted">${esc(d.email)}</p></div><div class="card"><h3>Telefon</h3><p class="muted">${esc(d.phone)}</p></div><div class="card"><h3>Adres</h3><p class="muted">${esc(d.address)}</p></div></div>${d.showForm ? `<form method="post" action="${FORM_ACTION}"><input type="hidden" name="_type" value="Kontakt"/><input class="hp" type="text" name="_company" tabindex="-1" autocomplete="off" aria-hidden="true"/><input class="field" name="name" required placeholder="Imię i nazwisko"/><input class="field" type="email" name="email" required placeholder="E-mail"/><textarea class="field" name="message" required style="min-height:120px" placeholder="Wiadomość"></textarea><button class="btn" type="submit">Wyślij</button><p class="fnote">Dziękujemy! Wiadomość wysłana.</p></form>` : ''}</div>`, false, 'kontakt');
    case 'footer': {
      const links = (d.links as string[]) ?? [];
      return `<div class="wrap"><div class="footer"><strong>${esc(d.brand)}</strong><div class="fl">${links.map((l) => `<a href="#">${esc(l)}</a>`).join('')}</div><span>${esc(d.note)}</span></div></div>`;
    }
    case 'bento': {
      const items = (d.items as { icon?: string; title: string; desc: string }[]) ?? [];
      return sec(`${headBlock(d.title, d.subtitle)}<div class="bento">${items.map((it, i) => `<div class="b ${i === 0 ? 'lg' : ''}"><div class="icon">${esc(it.icon || '◆')}</div><h3>${esc(it.title)}</h3><p class="muted" style="margin-top:8px">${esc(it.desc)}</p></div>`).join('')}</div>`);
    }
    case 'marqueeText': {
      const words = String(d.text ?? '').split(/[,\n•]/).map((w) => w.trim()).filter(Boolean);
      if (!words.length) return '';
      const one = words.map((w) => `<span>${esc(w)}</span><span class="dot">•</span>`).join('');
      return `<section style="padding:0"><div class="mtext"><div class="mt">${one}${one}</div></div></section>`;
    }
    case 'pricingToggle': {
      const plans = (d.plans as { name: string; monthly: string; annual: string; period?: string; features: string; ctaText: string; featured?: boolean }[]) ?? [];
      const cards = plans.map((p) => {
        const feats = String(p.features || '').split('\n').filter(Boolean);
        return `<div class="card price ${p.featured ? 'feat' : ''}">${p.featured ? '<span class="badge">Polecany</span>' : ''}<h3>${esc(p.name)}</h3><div class="amt"><span data-price data-m="${esc(p.monthly)}" data-a="${esc(p.annual)}">${esc(p.monthly)}</span> zł<span style="font-size:14px;color:${c.mut};font-weight:400" data-per>${esc(p.period || '/mies.')}</span></div><ul>${feats.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><a class="btn" href="#kontakt" style="width:100%;justify-content:center">${esc(p.ctaText)}</a></div>`;
      }).join('');
      return sec(`${headBlock(d.title, d.subtitle)}<div class="center"><div class="toggle" data-toggle><button type="button" class="on" data-mode="m">Miesięcznie</button><button type="button" data-mode="a">Rocznie <span class="save-pill">−20%</span></button></div></div><div class="grid g3">${cards}</div>`, true);
    }
    case 'testimonialWall': {
      const items = (d.items as { quote: string; author: string; role: string }[]) ?? [];
      return sec(`${headBlock(d.title, d.subtitle)}<div class="wall">${items.map((t2) => {
        const init = String(t2.author || '?').trim().split(/\s+/).map((w) => w[0] || '').slice(0, 2).join('').toUpperCase();
        return `<div class="tcard"><p class="tq">“${esc(t2.quote)}”</p><div class="ta"><div class="av">${esc(init)}</div><div><strong>${esc(t2.author)}</strong><div class="muted" style="font-size:13px">${esc(t2.role)}</div></div></div></div>`;
      }).join('')}</div>`);
    }
    case 'heroSplit': {
      const kpis = (d.kpis as { value: string; label: string }[]) ?? [];
      const txt = `<div>${d.eyebrow ? `<span class="eyebrow">${esc(d.eyebrow)}</span>` : ''}<h1>${esc(d.title)}</h1><p class="lead" style="max-width:54ch">${esc(d.subtitle)}</p><div class="hero-actions"><a class="btn" href="${esc(d.ctaHref || '#')}">${esc(d.ctaText)}</a>${d.ctaSecondary ? `<a class="btn ghost" href="#">${esc(d.ctaSecondary)}</a>` : ''}</div></div>`;
      return `<section class="hero"><div class="wrap"><div class="hsplit">${txt}${mockWindow(kpis)}</div></div></section>`;
    }
    case 'showcase': {
      const kpis = (d.kpis as { value: string; label: string }[]) ?? [];
      return sec(`${headBlock(d.title, d.subtitle)}<div style="max-width:980px;margin:0 auto">${mockWindow(kpis)}</div>${d.caption ? `<p class="center muted" style="margin-top:18px;font-size:14px">${esc(d.caption)}</p>` : ''}`);
    }
    case 'heroEditorial': {
      const meta = (d.meta as { k: string; v: string }[]) ?? [];
      const pid = `edbc-${s.id}`;
      const badge = d.badge
        ? `<div class="ed-badge"><svg viewBox="0 0 120 120"><path id="${pid}" d="M60,60 m-43,0 a43,43 0 1,1 86,0 a43,43 0 1,1 -86,0" fill="none"/><text font-size="11" letter-spacing="2" fill="${c.fg}" font-weight="600"><textPath href="#${pid}" startOffset="0">${esc(d.badge)} · ${esc(d.badge)} · </textPath></text></svg><span class="st">✦</span></div>`
        : '';
      const img = d.image
        ? `<img src="${esc(d.image)}" alt="${esc(d.title)}" onerror="this.style.display='none'"/>`
        : '';
      return `<section class="edhero"><div class="wrap">${d.subtitle ? `<div class="leadrow"><p class="lead">${esc(d.subtitle)}</p></div>` : ''}<h1>${esc(d.title)}</h1>${meta.length ? `<div class="meta">${meta.map((m) => `<div><span class="k">${esc(m.k)}</span><span class="v">${esc(m.v)}</span></div>`).join('')}</div>` : ''}<div class="ed-img">${img}${badge}${d.tag ? `<span class="tag">${esc(d.tag)}</span>` : ''}</div></div></section>`;
    }
    case 'workRows': {
      const items = (d.items as { image: string; title: string; cat?: string; href?: string }[]) ?? [];
      return sec(`${headBlock(d.title, d.subtitle)}<div class="wrows">${items.map((it, i) => {
        const inner = `<div class="no">${String(i + 1).padStart(2, '0')}</div><div class="ph"><img src="${esc(it.image)}" alt="${esc(it.title)}" onerror="this.style.display='none'"/></div><div><h3>${esc(it.title)}</h3>${it.cat ? `<div class="cat muted">${esc(it.cat)}</div>` : ''}<span class="arrow">Zobacz <b>→</b></span></div>`;
        return it.href ? `<a class="wrow" href="${esc(it.href)}">${inner}</a>` : `<div class="wrow">${inner}</div>`;
      }).join('')}</div>`);
    }
    case 'serviceList': {
      const items = (d.items as { title: string; desc: string }[]) ?? [];
      return sec(`${headBlock(d.title, d.subtitle)}<div class="slist">${items.map((it, i) => `<div class="srow"><span class="n">${String(i + 1).padStart(2, '0')}</span><h3>${esc(it.title)}</h3><p>${esc(it.desc)}</p></div>`).join('')}</div>`);
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
  const [model, setModel] = useState<PageModel>(() => buildTplModel('landing'));
  const [activePageId, setActivePageId] = useState<string>(() => model.pages[0].id);
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [publishDir, setPublishDir] = useState(PUBLISH_DEFAULT);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const loadedRef = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // Gutenberg-style: najpierw galeria szablonów, potem edytor.
  const [view, setView] = useState<'gallery' | 'editor'>('gallery');
  const [inserterOpen, setInserterOpen] = useState(false);
  // Builder domyślnie otwiera się na pełną szerokość (nakładka na panel).
  const [fullscreen, setFullscreen] = useState(true);

  // Blokada przewijania tła, gdy builder jest na pełnym ekranie.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    if (fullscreen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [fullscreen]);

  // Miniatury szablonów (pełne strony) i bloków — liczone raz, statyczne wejścia.
  const tplThumbs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const t of ALL_TPLS) {
      const m = buildTplModel(t.key);
      const pg = m.pages[0];
      out[t.key] = genHtml(pg, m.theme, m.meta.description, [{ name: pg.name, href: pageHref(pg.slug) }], false);
    }
    return out;
  }, []);
  const blockThumbs = useMemo(() => {
    const out = {} as Record<SectionType, string>;
    for (const t of Object.keys(SECTION_LABEL) as SectionType[]) {
      const pg: Page = { id: 'thumb', name: '', slug: 'index', title: '', sections: [defaultSection(t)] };
      out[t] = genHtml(pg, PREVIEW_THEME, '', [], false);
    }
    return out;
  }, []);

  function applyTemplate(key: string) {
    if (!RAW_TEMPLATES[key]) return;
    const nm = buildTplModel(key);
    setModel(nm);
    setActivePageId(nm.pages[0].id);
    setSelected(null);
    setView('editor');
  }

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
          if (next) { setModel(next); setActivePageId(next.pages[0].id); setView('editor'); }
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

  const fsToggleEl = (
    <button onClick={() => setFullscreen((f) => !f)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-neutral-200 hover:text-white" title={fullscreen ? 'Zwiń do panelu' : 'Pełny ekran'}>
      {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      <span className="hidden sm:inline">{fullscreen ? 'Zwiń' : 'Pełny ekran'}</span>
    </button>
  );
  // Funkcja (nie komponent) — unikamy remountu edytora/iframe przy każdym renderze.
  const wrap = (children: React.ReactNode) =>
    fullscreen ? (
      <div className="fixed inset-0 z-40 overflow-auto bg-neutral-950">
        <div className="mx-auto w-full max-w-[1800px] p-4 lg:p-6">{children}</div>
      </div>
    ) : (
      <div>{children}</div>
    );

  if (view === 'gallery') {
    return wrap(
      <TemplateGallery thumbs={tplThumbs} onPick={applyTemplate} onContinue={() => setView('editor')} fsToggle={fsToggleEl} />,
    );
  }

  return wrap(
    <div className="space-y-4">
      {inserterOpen && (
        <BlockInserter
          thumbs={blockThumbs}
          onPick={(t) => { add(t); setInserterOpen(false); }}
          onClose={() => setInserterOpen(false)}
        />
      )}
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setView('gallery')} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-neutral-200 hover:text-white" title="Wróć do galerii szablonów">
            <LayoutGrid className="h-4 w-4" /> Szablony
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {fsToggleEl}
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

      <div className="grid gap-4 xl:grid-cols-[270px_minmax(0,1fr)_340px]">
        {/* Sekcje */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Sekcje — {activePage.name}</p>
          <p className="text-[10px] text-neutral-600">Przeciągnij uchwyt, aby zmienić kolejność. Kliknij sekcję, aby edytować.</p>
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
          <button onClick={() => setInserterOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/5 px-2 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/10">
            <Plus className="h-4 w-4" /> Dodaj sekcję
          </button>
        </div>

        {/* Podgląd */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
          <div className="mx-auto overflow-hidden rounded-lg bg-white shadow-lg transition-all" style={{ width: device === 'mobile' ? 390 : '100%', maxWidth: '100%' }}>
            <iframe title="Podgląd strony" srcDoc={html} className="h-[760px] w-full border-0" />
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
              <Row label="Styl"><Sel value={model.theme.style ?? 'modern'} onChange={(v) => setTheme({ style: v as ThemeStyle })} opts={[['modern', 'Nowoczesny'], ['minimal', 'Minimalistyczny'], ['bold', 'Odważny'], ['editorial', 'Magazynowy'], ['soft', 'Przyjazny']]} /></Row>
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
    </div>,
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
    case 'bento':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Kafle (pierwszy jest duży)" items={(d.items as Rec[]) ?? []} fields={[['icon', 'Ikona (emoji)'], ['title', 'Tytuł'], ['desc', 'Opis', true]]} factory={() => ({ icon: '◆', title: 'Nowy kafel', desc: 'Opis…' })} onChange={(items) => onChange({ items })} /><p className="text-[11px] text-neutral-500">Pierwszy kafel wyświetla się jako duży (bento). Najlepiej 5 kafli.</p></div>;
    case 'marqueeText':
      return <div className="space-y-2">{F('text', 'Słowa (oddziel przecinkami)')}<p className="text-[11px] text-neutral-500">Wielki, przewijający się napis. Np. „Projektujemy, Budujemy, Wdrażamy".</p></div>;
    case 'pricingToggle':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Plany" items={(d.plans as Rec[]) ?? []} fields={[['name', 'Nazwa'], ['monthly', 'Cena miesięczna'], ['annual', 'Cena roczna (za mies.)'], ['period', 'Okres (np. /mies.)'], ['features', 'Cechy (po jednej w wierszu)', true], ['ctaText', 'Przycisk']]} bools={[['featured', 'Polecany']]} factory={() => ({ name: 'Plan', monthly: '49', annual: '39', period: '/mies.', features: 'Cecha 1\nCecha 2', ctaText: 'Wybieram', featured: false })} onChange={(plans) => onChange({ plans })} /><p className="text-[11px] text-neutral-500">Przełącznik mies./rok działa automatycznie na opublikowanej stronie.</p></div>;
    case 'testimonialWall':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Opinie" items={(d.items as Rec[]) ?? []} fields={[['quote', 'Cytat', true], ['author', 'Autor'], ['role', 'Rola / firma']]} factory={() => ({ quote: 'Świetna usługa!', author: 'Klient', role: '' })} onChange={(items) => onChange({ items })} /><p className="text-[11px] text-neutral-500">Awatary tworzymy automatycznie z inicjałów autora.</p></div>;
    case 'heroSplit':
      return <div className="space-y-2">{F('eyebrow', 'Etykieta')}{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł', true)}{F('ctaText', 'Przycisk główny')}{F('ctaHref', 'Link przycisku')}{F('ctaSecondary', 'Przycisk drugi (opcjonalnie)')}<ObjList label="Wskaźniki w mockupie (3)" items={(d.kpis as Rec[]) ?? []} fields={[['value', 'Wartość'], ['label', 'Opis']]} factory={() => ({ value: '100%', label: 'Opis' })} onChange={(kpis) => onChange({ kpis })} /><p className="text-[11px] text-neutral-500">Po prawej generujemy podgląd „okna aplikacji" (czysty CSS — bez obrazów).</p></div>;
    case 'showcase':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}{F('caption', 'Podpis pod oknem')}<ObjList label="Wskaźniki w mockupie (3)" items={(d.kpis as Rec[]) ?? []} fields={[['value', 'Wartość'], ['label', 'Opis']]} factory={() => ({ value: '100%', label: 'Opis' })} onChange={(kpis) => onChange({ kpis })} /></div>;
    case 'heroEditorial':
      return <div className="space-y-2">{F('title', 'Wielki nagłówek', true)}{F('subtitle', 'Akapit (do prawej)', true)}{F('tag', 'Etykieta na zdjęciu')}{F('badge', 'Tekst wirującego znaczka')}{Img('image', 'Zdjęcie hero (URL lub z plików)')}<ObjList label="Pasek meta (3 pozycje)" items={(d.meta as Rec[]) ?? []} fields={[['k', 'Etykieta'], ['v', 'Wartość']]} factory={() => ({ k: 'Etykieta', v: 'Wartość' })} onChange={(meta) => onChange({ meta })} /></div>;
    case 'workRows':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Realizacje" serviceId={serviceId} items={(d.items as Rec[]) ?? []} fields={[['image', 'Zdjęcie', false, true], ['title', 'Tytuł'], ['cat', 'Kategoria'], ['href', 'Link (opcjonalnie)']]} factory={() => ({ image: 'https://picsum.photos/seed/x/900/600', title: 'Projekt', cat: 'Kategoria', href: '' })} onChange={(items) => onChange({ items })} /></div>;
    case 'serviceList':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Usługi" items={(d.items as Rec[]) ?? []} fields={[['title', 'Nazwa usługi'], ['desc', 'Opis', true]]} factory={() => ({ title: 'Nowa usługa', desc: 'Opis…' })} onChange={(items) => onChange({ items })} /></div>;
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

/* ============================ GUTENBERG-STYLE UI ============================ */

/** Skalowana miniatura strony/bloku — renderuje wygenerowany HTML w „desktopowym" układzie. */
function FrameThumb({ html, aspect = '16 / 10', tall = '2200px' }: { html: string; aspect?: string; tall?: string }) {
  return (
    <div style={{ width: '100%', aspectRatio: aspect, overflow: 'hidden', position: 'relative', background: '#fff' }}>
      <iframe
        title="Miniatura"
        srcDoc={html}
        scrolling="no"
        tabIndex={-1}
        aria-hidden
        style={{ position: 'absolute', top: 0, left: 0, width: '333.33%', height: tall, transform: 'scale(0.3)', transformOrigin: 'top left', border: 0, pointerEvents: 'none' }}
      />
    </div>
  );
}

/** Ekran startowy — galeria szablonów z filtrami, wyszukiwarką i pełnym podglądem. */
function TemplateGallery({ thumbs, onPick, onContinue, fsToggle }: { thumbs: Record<string, string>; onPick: (key: string) => void; onContinue: () => void; fsToggle?: React.ReactNode }) {
  const [cat, setCat] = useState<string>('Wszystkie');
  const [q, setQ] = useState('');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const descs = useMemo(() => Object.fromEntries(ALL_TPLS.map((t) => [t.key, RAW_TEMPLATES[t.key]().description])), []);
  const items = ALL_TPLS.filter((t) => (cat === 'Wszystkie' || t.cat === cat) && (q.trim() === '' || t.name.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Wybierz szablon startowy</h2>
          <p className="mt-1 text-sm text-neutral-400">Gotowe, profesjonalne układy — po wybraniu edytujesz sekcje i treść. Najedź, aby zobaczyć podgląd.</p>
        </div>
        <div className="flex items-center gap-2">
          {fsToggle}
          <button onClick={onContinue} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-neutral-200 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Wróć do edytora
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TPL_CATS.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${cat === c ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' : 'border border-white/10 text-neutral-300 hover:bg-white/5'}`}>{c}</button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj szablonu…" className="w-48 rounded-lg border border-white/10 bg-black/40 py-1.5 pl-8 pr-2 text-sm text-white" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((t) => (
          <div key={t.key} className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition hover:border-emerald-500/40">
            <button onClick={() => setPreviewKey(t.key)} className="block w-full" title="Podgląd">
              <FrameThumb html={thumbs[t.key]} />
            </button>
            <div className="space-y-2 p-3">
              <div>
                <p className="text-sm font-semibold text-white">{t.name}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-neutral-500">{descs[t.key]}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onPick(t.key)} className="flex-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">Użyj szablonu</button>
                <button onClick={() => setPreviewKey(t.key)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-neutral-200 hover:text-white"><Eye className="h-3.5 w-3.5" /> Podgląd</button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="col-span-full py-10 text-center text-sm text-neutral-500">Brak szablonów dla tego filtra.</p>}
      </div>

      {previewKey && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4 backdrop-blur-sm" onClick={() => setPreviewKey(null)}>
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-950" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
              <p className="text-sm font-semibold text-white">{ALL_TPLS.find((t) => t.key === previewKey)?.name}</p>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-white/10 bg-black/40 p-0.5">
                  <button onClick={() => setDevice('desktop')} className={`rounded-md px-2 py-1 ${device === 'desktop' ? 'bg-white/10' : ''}`}><Monitor className="h-4 w-4" /></button>
                  <button onClick={() => setDevice('mobile')} className={`rounded-md px-2 py-1 ${device === 'mobile' ? 'bg-white/10' : ''}`}><Smartphone className="h-4 w-4" /></button>
                </div>
                <button onClick={() => { onPick(previewKey); }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500">Użyj ten szablon</button>
                <button onClick={() => setPreviewKey(null)} className="rounded-lg border border-white/10 p-1.5 text-neutral-300 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-neutral-900 p-3">
              <div className="mx-auto overflow-hidden rounded-lg bg-white shadow-xl transition-all" style={{ width: device === 'mobile' ? 390 : '100%', maxWidth: '100%' }}>
                <iframe title="Podgląd szablonu" srcDoc={thumbs[previewKey]} className="h-[70vh] w-full border-0" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Wizualny inserter bloków (podgląd każdej sekcji jak w Gutenbergu). */
function BlockInserter({ thumbs, onPick, onClose }: { thumbs: Record<SectionType, string>; onPick: (t: SectionType) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="mt-6 flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-950" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <p className="text-sm font-semibold text-white">Dodaj sekcję</p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj bloku…" className="w-56 rounded-lg border border-white/10 bg-black/40 py-1.5 pl-8 pr-2 text-sm text-white" />
            </div>
            <button onClick={onClose} className="rounded-lg border border-white/10 p-1.5 text-neutral-300 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 space-y-5 overflow-auto p-4">
          {SECTION_GROUPS.map((g) => {
            const items = g.items.filter((t) => ql === '' || SECTION_LABEL[t].toLowerCase().includes(ql));
            if (items.length === 0) return null;
            return (
              <div key={g.cat}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">{g.cat}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((t) => (
                    <button key={t} onClick={() => onPick(t)} className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] text-left transition hover:border-emerald-500/40">
                      <FrameThumb html={thumbs[t]} aspect="16 / 7" tall="1400px" />
                      <div className="flex items-center justify-between gap-1 px-3 py-2">
                        <span className="text-xs font-medium text-white">{SECTION_LABEL[t]}</span>
                        <Plus className="h-3.5 w-3.5 text-emerald-300 opacity-0 transition group-hover:opacity-100" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
