import Link from 'next/link';
import { Check, Lock, Plus, Sparkles } from 'lucide-react';
import { PageHeaderRow, PanelCard } from '@/components/panel';
import { Label, Meter } from '@/components/panel/v2';
import {
  blokadaNowejStrony,
  ETYKIETY_WERSJI,
  generacji,
  kolorMiniatury,
  opisCenyPro,
  podstron,
  pozostalo,
  stron,
  zmianAi,
  type StanKreatora,
} from '@/lib/kreator';
import { listaStron, pobierzStrone, stanKreatora } from './akcje';
import { ListaStron, type KartaStrony } from './lista-stron';
import { BrakDostepu } from './brak-dostepu';
import { klasaPrzyciskuGlownego } from './klasy';
import { AbonamentPro, ZakupPro } from './kreator-pro';

export const dynamic = 'force-dynamic';

const OPIS = 'Opisz firmę, a AI zaproponuje gotową stronę – teksty, układ, kolory i fonty. Wszystko zmienisz potem w edytorze albo poleceniem.';

export default async function KreatorPage({ searchParams }: { searchParams: Promise<{ platnosc?: string }> }) {
  const stan = await stanKreatora();
  const parametry = await searchParams;
  if (!stan.ok) {
    return (
      <div className="space-y-6">
        <PageHeaderRow title="Kreator stron" description={OPIS} />
        <BrakDostepu powod={stan.status === 403 ? 'Twoje konto nie ma uprawnień do kreatora stron.' : 'Nie udało się wczytać kreatora – odśwież stronę za chwilę.'} />
      </div>
    );
  }
  if (!stan.dane.dostep) {
    return (
      <div className="space-y-6">
        <PageHeaderRow title="Kreator stron" description={OPIS} />
        <BrakDostepu powod={stan.dane.powod} zamowHosting={stan.dane.powod?.includes('Zamów hosting') ?? false} />
      </div>
    );
  }

  const lista = await listaStron();
  const strony = lista.ok ? lista.dane : [];
  // Miniatury w kolorach projektu – lista nie zwraca modelu, więc dla gotowych stron (≤ 10 na konto) pytamy o widok.
  const karty: KartaStrony[] = await Promise.all(
    strony.map(async (s) => {
      const widok = s.status === 'GOTOWA' ? await pobierzStrone(s.id) : null;
      return { ...s, kolory: kolorMiniatury(widok?.ok ? widok.dane.model : null) };
    }),
  );
  const blokada = blokadaNowejStrony(stan.dane);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeaderRow
        title="Kreator stron"
        description={OPIS}
        actions={
          blokada ? (
            <button type="button" disabled className={klasaPrzyciskuGlownego} aria-describedby="kreator-blokada">
              <Plus className="h-4 w-4" aria-hidden /> Nowa strona
            </button>
          ) : (
            <Link href="/dashboard/kreator/nowa" className={klasaPrzyciskuGlownego}>
              <Plus className="h-4 w-4" aria-hidden /> Nowa strona
            </Link>
          )
        }
      />
      {blokada ? (
        <p id="kreator-blokada" className="-mt-4 rounded-[8px] border border-warn/40 bg-warn-soft px-3.5 py-2.5 text-[13px] text-foreground">
          {blokada}
        </p>
      ) : null}
      {!lista.ok ? (
        <p role="alert" className="rounded-[8px] border border-crit/40 bg-crit/10 px-3.5 py-2.5 text-[13px] text-foreground">
          {lista.blad}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ListaStron strony={karty} nowaZablokowana={!!blokada} />
        <div className="flex flex-col gap-6">
          <KartaWersji stan={stan.dane} />
          <KartaPro stan={stan.dane} poPlatnosciKarta={parametry.platnosc === 'karta'} />
        </div>
      </div>
    </div>
  );
}

function Licznik({ etykieta, zuzyte, limit, opis }: { etykieta: string; zuzyte: number; limit: number; opis: string }) {
  const pct = limit > 0 ? (zuzyte / limit) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="text-foreground">{etykieta}</span>
        <span className="font-mono text-[12.5px] tabular-nums text-muted-foreground">
          {zuzyte} / {limit}
        </span>
      </div>
      <Meter pct={pct} tone={pct >= 100 ? 'warn' : 'data'} />
      <span className="text-[12px] text-muted-foreground">{opis}</span>
    </div>
  );
}

function KartaWersji({ stan }: { stan: StanKreatora }) {
  const plan = stan.plan!;
  const wersja = stan.wersja!;
  const z = stan.zuzycie;
  return (
    <PanelCard className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label>Twoja wersja kreatora</Label>
          <p className="mt-2 font-display text-[20px] font-bold leading-tight text-foreground">{ETYKIETY_WERSJI[wersja]}</p>
        </div>
        {wersja === 'pro' ? <Sparkles className="h-5 w-5 text-data-hi" aria-hidden /> : null}
      </div>
      {wersja === 'proba' ? (
        <p className="text-[13px] text-muted-foreground">
          W okresie próbnym zbudujesz stronę i opublikujesz ją pod adresem podglądu (bez indeksowania w wyszukiwarkach). Własna domena, ZIP
          i przejście na WordPressa włączą się po opłaceniu hostingu.
        </p>
      ) : null}
      <div className="flex flex-col gap-3.5">
        <Licznik etykieta="Strony" zuzyte={z.stron} limit={plan.stron} opis={`Możesz mieć ${stron(plan.stron)}, w każdej ${plan.podstron === null ? 'dowolną liczbę podstron' : `do ${podstron(plan.podstron)}`}.`} />
        <Licznik
          etykieta="Generacje w tym miesiącu"
          zuzyte={z.generacje}
          limit={plan.generacjiMies}
          opis={`Zostało ${generacji(pozostalo(plan.generacjiMies, z.generacje))}. Nieudana generacja nie zużywa limitu.`}
        />
        <Licznik etykieta="Zmiany AI w tym miesiącu" zuzyte={z.zmiany} limit={plan.zmianAiMies} opis={`Zostało ${zmianAi(pozostalo(plan.zmianAiMies, z.zmiany))}. Edycja ręczna jest bez limitu.`} />
      </div>
      <p className="text-[12px] text-muted-foreground">Limity odnawiają się 1. dnia każdego miesiąca.</p>
    </PanelCard>
  );
}

/**
 * Paczka 121 – karta Kreatora Pro: bez abonamentu „Co daje Kreator Pro” z wyborem okresu i zakupem; z abonamentem
 * jego stan („aktywny do …”, odnawianie, „Anuluj odnowienie”). Abonament zawieszony albo czekający na płatność
 * pokazuje się obok korzyści, bo Pro wtedy nie działa.
 */
function KartaPro({ stan, poPlatnosciKarta }: { stan: StanKreatora; poPlatnosciKarta: boolean }) {
  const pro = stan.pro;
  const abonament = pro?.abonament ?? null;
  const czekaNaKarte = poPlatnosciKarta && (!abonament || abonament.status === 'PENDING_PAYMENT');
  if (abonament && (abonament.status === 'ACTIVE' || abonament.status === 'PAST_DUE')) {
    return (
      <div id="kreator-pro">
        <PanelCard className="flex flex-col gap-4">
          <Label className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Kreator Pro
          </Label>
          <AbonamentPro abonament={abonament} />
        </PanelCard>
      </div>
    );
  }
  return (
    <div id="kreator-pro">
    <PanelCard className="flex flex-col gap-4">
      <div>
        <Label className="flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" aria-hidden /> Kreator Pro
        </Label>
        <h2 className="mt-2 font-display text-[17px] font-bold leading-tight text-foreground">Co daje Kreator Pro</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{opisCenyPro(stan.cenaPro)}.</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {stan.korzysciPro.map((k) => (
          <li key={k.id} className="flex gap-2.5">
            <Check className="mt-0.5 h-4 w-4 flex-none text-data-hi" aria-hidden />
            <span className="text-[13px] leading-snug">
              <span className="font-semibold text-foreground">{k.nazwa}</span>
              <span className="text-muted-foreground"> – {k.opis}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="rounded-[8px] bg-raised px-3 py-2 text-[12.5px] text-muted-foreground">
        Funkcje Pro możesz obejrzeć w edytorze już teraz – są oznaczone kłódką.
      </p>
      {czekaNaKarte ? (
        <p role="status" className="rounded-[8px] border border-data/40 bg-data-soft px-3 py-2 text-[12.5px] text-foreground">
          Płatność kartą przyjęta – Kreator Pro włączy się, gdy operator płatności ją potwierdzi (zwykle w ciągu minuty). Odśwież stronę.
        </p>
      ) : null}
      {abonament ? (
        <AbonamentPro abonament={abonament} />
      ) : pro ? (
        <ZakupPro pro={pro} />
      ) : null}
    </PanelCard>
    </div>
  );
}
