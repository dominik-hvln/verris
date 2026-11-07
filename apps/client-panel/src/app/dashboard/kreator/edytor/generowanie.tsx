'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, RotateCcw } from 'lucide-react';
import { cx } from '@/components/panel/cx';
import type { NowaStronaKreatora, WidokStronyKreatora } from '@/lib/kreator';
import { pobierzStrone, usunStrone, utworzStrone } from '../akcje';
import { kluczBriefu } from '../nowa/kreator-briefu';
import { klasaPrzyciskuDrugiego, klasaPrzyciskuGlownego } from '../wspolne';

export const ODSTEP_ODPYTYWANIA_MS = 3000;

/** Etapy pokazywane klientowi – kolejne progi czasu (s). Generacja w API trwa zwykle 40–120 s (Pro dłużej). */
export const ETAPY = [
  { od: 0, nazwa: 'Dobieram styl', opis: 'Kolory, fonty i układ dopasowane do branży.' },
  { od: 12, nazwa: 'Piszę treści', opis: 'Nagłówki, opisy usług i sekcje strony – z Twojego opisu, bez zmyślonych danych.' },
  { od: 75, nazwa: 'Sprawdzam SEO i dostępność', opis: 'Tytuły, opisy dla Google, kontrast i kolejność nagłówków.' },
] as const;

export function etapPoCzasie(sekundy: number): number {
  let i = 0;
  ETAPY.forEach((e, j) => {
    if (sekundy >= e.od) i = j;
  });
  return i;
}

/** Postęp „asymptotyczny”: szybko do ~60%, potem coraz wolniej, nigdy 100% przed końcem. */
export function postepPoCzasie(sekundy: number): number {
  return Math.min(95, Math.round(95 * (1 - Math.exp(-sekundy / 45))));
}

export function EkranGenerowania({ widok, onGotowa }: { widok: WidokStronyKreatora; onGotowa: (w: WidokStronyKreatora) => void }) {
  const router = useRouter();
  const [stan, setStan] = useState(widok);
  // 0 przy pierwszym renderze (ten sam tekst na serwerze i w przeglądarce), potem czas od utworzenia strony.
  const [sekundy, setSekundy] = useState(0);
  const [ponawianie, setPonawianie] = useState(false);
  const [bladPonowienia, setBladPonowienia] = useState<string | null>(null);
  const onGotowaRef = useRef(onGotowa);
  useEffect(() => {
    onGotowaRef.current = onGotowa;
  });

  useEffect(() => {
    if (stan.status !== 'GENEROWANIE') return;
    const start = new Date(widok.createdAt).getTime();
    const zegar = setInterval(() => setSekundy(Math.max(0, Math.round((Date.now() - start) / 1000))), 1000);
    const odpytywanie = setInterval(() => {
      void pobierzStrone(widok.id).then((r) => {
        if (!r.ok) return;
        setStan(r.dane);
        if (r.dane.status === 'GOTOWA' && r.dane.model) onGotowaRef.current(r.dane);
      });
    }, ODSTEP_ODPYTYWANIA_MS);
    return () => {
      clearInterval(zegar);
      clearInterval(odpytywanie);
    };
  }, [stan.status, widok.id, widok.createdAt]);

  /** „Spróbuj ponownie”: nieudana strona idzie do kosza (liczy się do limitu stron), nowa – z tym samym briefem. */
  const ponow = async () => {
    let brief: NowaStronaKreatora | null = null;
    try {
      const zapis = sessionStorage.getItem(kluczBriefu(widok.id));
      brief = zapis ? (JSON.parse(zapis) as NowaStronaKreatora) : null;
    } catch {
      brief = null;
    }
    if (!brief) {
      router.push('/dashboard/kreator/nowa');
      return;
    }
    setPonawianie(true);
    setBladPonowienia(null);
    const usun = await usunStrone(widok.id);
    if (!usun.ok && usun.status !== 404) {
      setPonawianie(false);
      setBladPonowienia(usun.blad);
      return;
    }
    const r = await utworzStrone(brief);
    if (!r.ok) {
      setPonawianie(false);
      setBladPonowienia(r.blad);
      return;
    }
    try {
      sessionStorage.removeItem(kluczBriefu(widok.id));
      sessionStorage.setItem(kluczBriefu(r.dane.id), JSON.stringify(brief));
    } catch {
      /* bez sessionStorage – kolejna próba odeśle do formularza */
    }
    router.replace(`/dashboard/kreator/${r.dane.id}`);
  };

  if (stan.status === 'BLAD') {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-[10px] border border-line bg-card px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-warn-soft text-warn" aria-hidden>
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h2 className="m-0 font-display text-[18px] font-bold text-foreground">Nie udało się wygenerować strony</h2>
        <p className="text-[13.5px] text-muted-foreground" role="alert">
          {stan.bladOpis ?? 'Spróbuj ponownie albo opisz firmę trochę inaczej.'} Nieudana próba nie zużywa limitu generacji.
        </p>
        {bladPonowienia ? <p className="text-[13px] font-medium text-crit">{bladPonowienia}</p> : null}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button type="button" className={klasaPrzyciskuGlownego} onClick={() => void ponow()} disabled={ponawianie}>
            {ponawianie ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />} Spróbuj ponownie
          </button>
          <Link href="/dashboard/kreator/nowa" className={klasaPrzyciskuDrugiego}>
            Zmień opis
          </Link>
        </div>
      </section>
    );
  }

  const etap = etapPoCzasie(sekundy);
  const postep = postepPoCzasie(sekundy);
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-[10px] border border-line bg-card px-6 py-10" aria-labelledby="kr-gen">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-data-soft text-data-hi" aria-hidden>
          <Loader2 className="h-7 w-7 animate-spin motion-reduce:animate-none" />
        </span>
        <h2 id="kr-gen" className="m-0 font-display text-[19px] font-bold text-foreground">
          Budujemy stronę „{stan.nazwa}”
        </h2>
        <p className="text-[13px] text-muted-foreground">Zwykle trwa to od jednej do dwóch minut. Możesz zostawić tę kartę – wrócisz do gotowej strony z listy.</p>
      </div>
      <div
        role="progressbar"
        aria-label="Postęp generowania strony"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={postep}
        aria-valuetext={`${ETAPY[etap]!.nazwa}, około ${postep}%`}
        className="h-2 overflow-hidden rounded-full bg-raised"
      >
        <span className="block h-full rounded-full bg-data transition-[width] duration-1000 ease-out motion-reduce:transition-none" style={{ width: `${postep}%` }} />
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {ETAPY.map((e, i) => (
          <li key={e.nazwa} className="flex items-start gap-3" aria-current={i === etap ? 'step' : undefined}>
            <span
              className={cx(
                'mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border text-[11px] font-semibold',
                i < etap ? 'border-data bg-data text-primary-foreground' : i === etap ? 'border-data bg-data-soft text-data-hi' : 'border-line-strong text-muted-foreground',
              )}
              aria-hidden
            >
              {i < etap ? <Check className="h-3.5 w-3.5" /> : i === etap ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : i + 1}
            </span>
            <div>
              <p className={cx('text-[13.5px] font-semibold', i <= etap ? 'text-foreground' : 'text-muted-foreground')}>
                {e.nazwa}
                {i < etap ? <span className="sr-only"> – zrobione</span> : null}
              </p>
              <p className="text-[12.5px] text-muted-foreground">{e.opis}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        {ETAPY[etap]!.nazwa}
      </p>
    </section>
  );
}
