'use client';

import Link from 'next/link';
import { createContext, useContext, type ReactNode } from 'react';
import { ArrowLeft, Menu } from 'lucide-react';
import { VerrisMark } from '@/components/logo';
import { cx } from './cx';

/**
 * Tryb skupienia (prośba właściciela 8.11) – edytor kreatora i kreator nowej strony zajmują cały ekran: layout
 * panelu nie renderuje menu bocznego, górnego paska (wyszukiwarka, portfel) ani stopki. Decyzja zapada w layoucie
 * na podstawie adresu (`usePathname` działa też przy renderze na serwerze), więc HTML z serwera jest od razu
 * w trybie skupienia – bez mignięcia menu przy ładowaniu. Banery globalne (sesja wsparcia, awaria, komunikaty)
 * zostają nad treścią.
 */
const TRASY_SKUPIENIA = /^\/dashboard\/kreator\/(?:nowa|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
/** Paczka 131 – Kreator marki: brief nowej marki, wgranie logo i ekrany marki (start z listą marek – z menu panelu). */
const TRASY_SKUPIENIA_MARKI = /^\/dashboard\/kreator-marki\/[A-Za-z0-9_-]{1,64}\/?$/;

export function trybSkupienia(pathname: string | null | undefined): boolean {
  return !!pathname && (TRASY_SKUPIENIA.test(pathname) || TRASY_SKUPIENIA_MARKI.test(pathname));
}

export interface KontekstSkupienia {
  /** Otwiera menu panelu jako szufladę; fokus po zamknięciu wraca na `wyzwalacz`. */
  otworzMenu: (wyzwalacz: HTMLElement | null) => void;
  menuOtwarte: boolean;
  idMenu: string;
}

const Kontekst = createContext<KontekstSkupienia | null>(null);
export const DostawcaSkupienia = Kontekst.Provider;
/** null poza layoutem panelu (testy komponentów) – pasek pokazuje wtedy sam przycisk powrotu. */
export const useSkupienie = () => useContext(Kontekst);

/** Cel dotykowy ≥ 44 px na telefonie, zwarty na komputerze. */
export const klasaPrzyciskuPaska =
  'inline-flex min-h-11 min-w-11 flex-none items-center justify-center gap-1.5 rounded-[7px] px-2 text-[13px] font-medium text-foreground hover:bg-raised md:min-h-9 md:min-w-9 disabled:cursor-not-allowed disabled:opacity-50';

/** Znak Verris Kreator: emblemat V w ciemnym kwadracie (jak w Verris Poczta / Status) + „Kreator” w mięcie. */
export function ZnakKreatora({ kompaktowy = false, nazwa = 'Kreator' }: { kompaktowy?: boolean; nazwa?: string }) {
  return (
    <span className="flex flex-none items-center gap-1.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-verris-pine ring-1 ring-inset ring-line-strong">
        <VerrisMark className="h-6 w-6 text-verris-paper" />
      </span>
      <span className={cx('font-display text-[13px] font-bold text-data-hi', kompaktowy && 'max-lg:hidden')}>{nazwa}</span>
    </span>
  );
}

/** Przycisk „Menu” – szuflada z menu panelu (tylko w layoucie panelu). */
export function PrzyciskMenuPanelu({ className, kompaktowy = false }: { className?: string; kompaktowy?: boolean }) {
  const s = useSkupienie();
  if (!s) return null;
  return (
    <button
      type="button"
      className={cx(klasaPrzyciskuPaska, className)}
      aria-label="Menu panelu"
      aria-expanded={s.menuOtwarte}
      aria-controls={s.idMenu}
      onClick={(e) => s.otworzMenu(e.currentTarget)}
    >
      <Menu className="h-4 w-4" aria-hidden />
      <span className={kompaktowy ? 'max-xl:hidden' : undefined}>Menu</span>
    </button>
  );
}

/**
 * Pasek trybu skupienia na całą szerokość: „← Panel”, znak Verris, „Menu”, a dalej narzędzia strony.
 * `kompaktowy` (edytor): napisy „Panel”, „Kreator”, „Menu” chowają się na węższych ekranach, a „Menu” na telefonie
 * przechodzi do „Więcej” – w pasku zostaje miejsce na nazwę strony i „Publikuj”.
 */
/** Paczka 131 – dokąd prowadzi „← Panel” i jak nazywa się moduł (Kreator marki ma własną listę i nazwę). */
export interface PowrotSkupienia {
  href: string;
  opis: string;
  nazwa: string;
}
const POWROT_KREATORA: PowrotSkupienia = { href: '/dashboard/kreator', opis: 'Wróć do listy stron w panelu', nazwa: 'Kreator' };

export function PasekSkupienia({ children, kompaktowy = false, powrot = POWROT_KREATORA }: { children?: ReactNode; kompaktowy?: boolean; powrot?: PowrotSkupienia }) {
  return (
    <div className="flex min-h-14 w-full min-w-0 flex-none items-center gap-1 border-b border-line bg-card px-1.5 py-1.5 sm:gap-2 sm:px-3">
      <Link href={powrot.href} aria-label={powrot.opis} className={cx(klasaPrzyciskuPaska, 'sm:pr-3')}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        <span className={kompaktowy ? 'max-sm:hidden' : undefined}>Panel</span>
      </Link>
      <ZnakKreatora kompaktowy={kompaktowy} nazwa={powrot.nazwa} />
      <PrzyciskMenuPanelu kompaktowy={kompaktowy} className={kompaktowy ? 'max-md:hidden' : undefined} />
      {children ? <span className="mx-0.5 h-6 w-px flex-none bg-line max-sm:hidden" aria-hidden /> : null}
      {children}
    </div>
  );
}

/** Strona w trybie skupienia bez własnego układu (kreator nowej strony, generowanie, komunikaty). */
export function StronaSkupienia({ children, pasek, powrot, szeroka = false }: { children: ReactNode; pasek?: ReactNode; powrot?: PowrotSkupienia; szeroka?: boolean }) {
  return (
    <div className="flex min-h-full flex-col">
      <PasekSkupienia powrot={powrot}>{pasek}</PasekSkupienia>
      <div className={cx('mx-auto w-full min-w-0 flex-1 px-3 py-5 sm:px-6 lg:py-8', szeroka ? 'max-w-[1400px]' : 'max-w-5xl')}>{children}</div>
    </div>
  );
}
