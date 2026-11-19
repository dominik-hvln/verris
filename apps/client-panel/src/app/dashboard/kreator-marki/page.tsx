import Link from 'next/link';
import { ArrowRight, Droplet, Layers, Sparkles } from 'lucide-react';
import type { StanKreatoraMarki } from '@verris/kreator/klient';
import { PageHeaderRow, PanelCard } from '@/components/panel';
import { Label, Meter } from '@/components/panel/v2';
import { cx } from '@/components/panel/cx';
import { getWalletSummary } from '@/app/dashboard/billing/data';
import { blokadaNowejMarki, ETYKIETY_WERSJI_MARKI, marek, opisPozostalo, serii, zmianAiMarki } from '@/lib/kreator-marki';
import { BrakDostepu } from '../kreator/brak-dostepu';
import { stanKreatoraMarki } from './akcje';
import { ListaMarek } from './lista-marek';
import { OstrzezeniePrawne } from './wspolne-marki';
import { ZakupMarki } from './zakup-marki';

export const dynamic = 'force-dynamic';

const TYTUL = 'Kreator marki';
const OPIS = 'Logo, kolory i materiały firmy – w tym samym miejscu co domena, strona i poczta. Wszystko wektorowe i edytowalne: zmienisz kolor, krój i układ bez generowania od nowa.';
const NIEDOSTEPNY = 'Kreator marki jest niedostępny na tym koncie';

/**
 * Paczka 131 – start Kreatora marki: trzy ścieżki (nowa marka, Key Visual pod obecne logo, odświeżenie logo),
 * lista marek konta z miniaturami, wersja konta (okres próbny / w cenie hostingu / Pakiet marki) z limitami,
 * zakup Pakietu marki i kolejnej marki. Moduł niedostępny (wyłączony w adminie, brak hostingu) → ekran jak w Kreatorze stron.
 */
export default async function KreatorMarkiPage({ searchParams }: { searchParams: Promise<{ platnosc?: string }> }) {
  const [stan, parametry] = await Promise.all([stanKreatoraMarki(), searchParams]);
  if (!stan.ok) {
    return (
      <div className="space-y-6">
        <PageHeaderRow title={TYTUL} description={OPIS} />
        <BrakDostepu
          tytul={NIEDOSTEPNY}
          powod={stan.status === 403 ? (stan.kod === 'MODUL_NIEDOSTEPNY' ? stan.blad : 'Twoje konto nie ma dostępu do Kreatora marki.') : 'Nie udało się wczytać Kreatora marki – odśwież stronę za chwilę.'}
        />
      </div>
    );
  }
  if (!stan.dane.dostepny) {
    return (
      <div className="space-y-6">
        <PageHeaderRow title={TYTUL} description={OPIS} />
        <BrakDostepu tytul={NIEDOSTEPNY} powod="Kreator marki działa z hostingiem Verris. Zamów hosting, a pierwsza marka będzie w jego cenie." zamowHosting />
      </div>
    );
  }
  const s = stan.dane;
  const paynowDostepny = await getWalletSummary()
    .then((w) => w.paynowDostepny === true)
    .catch(() => false);
  const blokada = blokadaNowejMarki(s);
  const limitMarek = s.limity.marki.uzyte >= s.limity.marki.limit;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeaderRow title={TYTUL} description={OPIS} />
      <OstrzezeniePrawne />
      {parametry.platnosc === 'karta' ? (
        <p role="status" className="rounded-[8px] border border-data/40 bg-data-soft px-3.5 py-2.5 text-[13px] text-foreground">
          Płatność przyjęta – zakup włączy się, gdy operator płatności ją potwierdzi (zwykle w ciągu minuty). Odśwież stronę.
        </p>
      ) : null}

      <section aria-labelledby="marka-sciezki" className="flex flex-col gap-3">
        <h2 id="marka-sciezki" className="m-0 font-display text-[17px] font-bold text-foreground">
          Od czego zaczynasz?
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Sciezka
            href="/dashboard/kreator-marki/nowa"
            tytul="Nowa marka"
            opis="Pierwsze logo dla firmy, która startuje. Krótki opis, a asystent pokaże 6 różnych kierunków."
            dopisek="Logo w wariantach, paleta, kroje, materiały"
            ikona={<Sparkles className="h-5 w-5" aria-hidden />}
            zablokowana={blokada?.powod ?? null}
            wyrozniona
          />
          <Sciezka
            href="/dashboard/kreator-marki/wgraj?zrodlo=wgrane"
            tytul="Mam logo – Key Visual"
            opis="Logo zostaje bez zmian. Dobudujemy do niego paletę, wzór i gotowe materiały."
            dopisek="Social media, wizytówki, stopka e-mail"
            ikona={<Layers className="h-5 w-5" aria-hidden />}
            zablokowana={limitMarek ? (blokada?.powod ?? null) : null}
          />
          <Sciezka
            href="/dashboard/kreator-marki/wgraj?zrodlo=odswiezenie"
            tytul="Odśwież logo"
            opis="Wgraj obecne logo. Pokażemy, co działa, co nie, i 3 kierunki: od ewolucji po nowy znak."
            dopisek="Wersja wektorowa i 3 kierunki do wyboru"
            ikona={<Droplet className="h-5 w-5" aria-hidden />}
            zablokowana={blokada?.powod ?? null}
          />
        </div>
        {blokada ? (
          <p id="marka-blokada" className="rounded-[8px] border border-warn/40 bg-warn-soft px-3.5 py-2.5 text-[13px] text-foreground">
            {blokada.powod}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="marka-lista" className="flex min-w-0 flex-col gap-3">
          <h2 id="marka-lista" className="m-0 font-display text-[17px] font-bold text-foreground">
            Twoje marki
          </h2>
          <ListaMarek marki={s.marki} />
        </section>
        <div className="flex flex-col gap-6">
          <KartaWersji stan={s} />
          {s.pakiet.kupiony ? (
            <PanelCard className="flex flex-col gap-2">
              <Label>Pakiet marki</Label>
              <p className="font-display text-[16px] font-bold text-foreground">Pakiet marki aktywny</p>
              {s.pakiet.aktualizacjeDo ? (
                <p className="text-[13px] text-muted-foreground">
                  Nowe szablony materiałów do{' '}
                  {new Date(s.pakiet.aktualizacjeDo).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'long', year: 'numeric' })}.
                </p>
              ) : null}
            </PanelCard>
          ) : (
            <div id="pakiet-marki">
              <PanelCard>
                <ZakupMarki rodzaj="pakiet" cena={s.pakiet.cena} zawiera={s.pakiet.zawiera} paynowDostepny={paynowDostepny} />
              </PanelCard>
            </div>
          )}
          {blokada?.kupDruga ? (
            <div id="kolejna-marka">
              <PanelCard>
                <ZakupMarki rodzaj="druga-marka" cena={s.drugaMarka.cena} paynowDostepny={paynowDostepny} />
              </PanelCard>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Sciezka({
  href,
  tytul,
  opis,
  dopisek,
  ikona,
  zablokowana,
  wyrozniona = false,
}: {
  href: string;
  tytul: string;
  opis: string;
  dopisek: string;
  ikona: React.ReactNode;
  zablokowana: string | null;
  wyrozniona?: boolean;
}) {
  const tresc = (
    <>
      <span className={cx('flex h-10 w-10 items-center justify-center rounded-[9px]', wyrozniona ? 'bg-data-soft text-data-hi' : 'bg-raised text-foreground')}>{ikona}</span>
      <span className="flex items-center gap-1.5 font-display text-[16px] font-bold text-foreground">
        {tytul}
        {zablokowana ? null : <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
      </span>
      <span className="text-[13px] leading-snug text-muted-foreground">{opis}</span>
      <span className="text-[12px] text-muted-foreground">{dopisek}</span>
    </>
  );
  const klasa = cx(
    'flex h-full flex-col gap-2 rounded-[10px] border bg-card p-4 text-left transition-colors',
    wyrozniona ? 'border-data/60' : 'border-line',
    zablokowana ? 'cursor-not-allowed opacity-60' : 'hover:border-data hover:bg-raised',
  );
  if (zablokowana) {
    return (
      <div className={klasa} aria-disabled="true" aria-describedby="marka-blokada">
        {tresc}
      </div>
    );
  }
  return (
    <Link href={href} className={klasa}>
      {tresc}
    </Link>
  );
}

function Licznik({ etykieta, uzyte, limit, opis }: { etykieta: string; uzyte: number; limit: number; opis: string }) {
  const pct = limit > 0 ? (uzyte / limit) * 100 : 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="text-foreground">{etykieta}</span>
        <span className="font-mono text-[12.5px] tabular-nums text-muted-foreground">
          {uzyte} / {limit}
        </span>
      </div>
      <Meter pct={Math.min(100, pct)} tone={pct >= 100 ? 'warn' : 'data'} />
      <span className="text-[12px] text-muted-foreground">{opis}</span>
    </div>
  );
}

function KartaWersji({ stan }: { stan: StanKreatoraMarki }) {
  const { marki, serie, zmianyAi } = stan.limity;
  return (
    <PanelCard className="flex flex-col gap-4">
      <div>
        <Label>Twoja wersja Kreatora marki</Label>
        <p className="mt-2 font-display text-[20px] font-bold leading-tight text-foreground">{ETYKIETY_WERSJI_MARKI[stan.wersja]}</p>
      </div>
      {stan.wersja === 'proba' ? (
        <p className="text-[13px] text-muted-foreground">
          W okresie próbnym projektujesz markę i oglądasz wszystkie warianty. Pliki do pobrania i użycie na stronie włączą się po opłaceniu hostingu.
        </p>
      ) : null}
      <div className="flex flex-col gap-3.5">
        <Licznik etykieta="Marki na koncie" uzyte={marki.uzyte} limit={marki.limit} opis={`Możesz mieć ${marek(marki.limit)}.`} />
        <Licznik etykieta="Serie propozycji" uzyte={serie.uzyte} limit={serie.limit} opis={`${opisPozostalo(serie, 'serie')}. Seria to 6 kierunków od asystenta.`} />
        <Licznik
          etykieta="Zmiany AI"
          uzyte={zmianyAi.uzyte}
          limit={zmianyAi.limit}
          opis={`${opisPozostalo(zmianyAi, 'zmiany')}. Zmiana koloru, kroju i układu nie zużywa limitu.`}
        />
      </div>
      <p className="text-[12px] text-muted-foreground">
        {stan.wersja === 'pakiet'
          ? `Pakiet marki: ${serii(serie.limit)} i ${zmianAiMarki(zmianyAi.limit)} łącznie.`
          : 'Limity w cenie hostingu odnawiają się 1. dnia każdego miesiąca.'}
      </p>
    </PanelCard>
  );
}
