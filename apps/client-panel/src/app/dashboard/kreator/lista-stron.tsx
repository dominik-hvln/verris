'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ExternalLink, LayoutTemplate, Loader2, Pencil, Trash2 } from 'lucide-react';
import { potwierdz } from '@/components/panel/potwierdz';
import { StatusPill } from '@/components/panel/v2';
import { dataGodzinaPl } from '@/lib/data-pl';
import type { PozycjaListyKreatora } from '@/lib/kreator';
import { usunStrone } from './akcje';
import { klasaPrzyciskuDrugiego, klasaPrzyciskuIkony, Miniatura } from './wspolne';

export type KartaStrony = PozycjaListyKreatora & { kolory: { tlo: string; akcent: string; tekst: string } };

function Status({ s }: { s: PozycjaListyKreatora }) {
  if (s.status === 'GENEROWANIE') return <StatusPill tone="data">Generowanie…</StatusPill>;
  if (s.status === 'BLAD') return <StatusPill tone="warn">Błąd generowania</StatusPill>;
  if (s.opublikowanaAt) return <StatusPill tone="data">Opublikowana</StatusPill>;
  return <StatusPill tone="muted">Szkic</StatusPill>;
}

export function ListaStron({ strony, nowaZablokowana }: { strony: KartaStrony[]; nowaZablokowana: boolean }) {
  const router = useRouter();
  const [usuwana, setUsuwana] = useState<string | null>(null);
  const [, start] = useTransition();

  const usun = async (s: KartaStrony) => {
    const ok = await potwierdz(
      `Usunąć stronę „${s.nazwa}” razem z historią wersji? ${s.opublikowanaAt ? 'Opublikowane pliki zostaną na hostingu, dopóki ich nie usuniesz. ' : ''}Tego nie da się cofnąć.`,
      { akcja: 'Usuń stronę', niebezpieczne: true, tytul: 'Usunąć stronę?' },
    );
    if (!ok) return;
    setUsuwana(s.id);
    const r = await usunStrone(s.id);
    setUsuwana(null);
    if (!r.ok) {
      toast.error(r.blad);
      return;
    }
    toast.success('Strona usunięta.');
    start(() => router.refresh());
  };

  if (!strony.length) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-line-strong bg-card px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-data-soft text-data-hi" aria-hidden>
          <LayoutTemplate className="h-6 w-6" />
        </span>
        <h2 className="m-0 font-display text-[18px] font-bold text-foreground">Nie masz jeszcze strony</h2>
        <p className="max-w-md text-[13.5px] text-muted-foreground">
          Opisz firmę w kilku zdaniach – AI ułoży sekcje, napisze teksty i dobierze styl. Ceny, adres i opinie podajesz Ty, AI ich nie wymyśla.
        </p>
        {nowaZablokowana ? null : (
          <Link href="/dashboard/kreator/nowa" className={`${klasaPrzyciskuDrugiego} mt-2`}>
            Zacznij od opisu firmy
          </Link>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="kreator-lista" className="flex flex-col gap-3">
      <h2 id="kreator-lista" className="m-0 font-display text-[17px] font-bold text-foreground">
        Twoje strony
      </h2>
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
        {strony.map((s) => (
          <li key={s.id} className="flex flex-col overflow-hidden rounded-[10px] border border-line bg-card">
            <Link href={`/dashboard/kreator/${s.id}`} className="group block p-3 pb-0" aria-label={`Otwórz stronę ${s.nazwa} w edytorze`}>
              <Miniatura nazwa={s.nazwa} {...s.kolory} className="transition-transform group-hover:-translate-y-0.5" />
            </Link>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="m-0 min-w-0 break-words font-display text-[15px] font-bold text-foreground">{s.nazwa}</h3>
                <Status s={s} />
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                {s.branza ? `${s.branza} · ` : ''}zmieniona {dataGodzinaPl(s.updatedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
              {s.status === 'BLAD' && s.bladOpis ? <p className="text-[12.5px] text-warn">{s.bladOpis}</p> : null}
              {s.domena ? (
                <a href={`https://${s.domena}/`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-data-hi hover:underline">
                  {s.domena} <ExternalLink className="h-3 w-3" aria-hidden />
                  <span className="sr-only">(otwiera się w nowej karcie)</span>
                </a>
              ) : null}
              <div className="mt-auto flex items-center gap-2 pt-2">
                <Link href={`/dashboard/kreator/${s.id}`} className={`${klasaPrzyciskuDrugiego} flex-1`}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> {s.status === 'GOTOWA' ? 'Edytuj' : 'Otwórz'}
                </Link>
                <button type="button" onClick={() => void usun(s)} className={klasaPrzyciskuIkony} aria-label={`Usuń stronę ${s.nazwa}`} disabled={usuwana === s.id}>
                  {usuwana === s.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
