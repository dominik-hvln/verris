'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, FileText, Home, Pencil, Plus, Trash2 } from 'lucide-react';
import { KATALOG_WARIANTOW, SEKCJE_PRO, TYPY_SEKCJI, type PlanKreatora, type Strona, type TypSekcji } from '@verris/kreator/klient';
import { PanelModal } from '@/components/panel/panel-modal';
import { potwierdz, zapytaj } from '@/components/panel/potwierdz';
import { cx } from '@/components/panel/cx';
import { moznaDodacPodstrone, podstron } from '@/lib/kreator';
import { bladPod, NAZWY_SEKCJI, nowaSekcja, OPISY_SEKCJI, przesun } from './schemat';
import { klasaPrzyciskuDrugiego, klasaPrzyciskuIkony, ZnakPro } from '../wspolne';
import { nazwaWariantu } from './panel-sekcji';

/** Na telefonie (< 768 px) cele dotykowe ≥ 44 px, na komputerze zwarte. */
const klasaIkonyListy = `${klasaPrzyciskuIkony} max-md:h-11 max-md:w-11`;
const klasaMalejIkony = `${klasaPrzyciskuIkony.replace('h-7 w-7', 'h-6 w-6')} max-md:h-11 max-md:w-11`;

/** Adres podstrony z tytułu: małe litery bez polskich znaków, myślniki, do 60 znaków. */
export function slugZTytulu(tytul: string, zajete: Set<string>): string {
  const mapa: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
  const baza =
    tytul
      .toLocaleLowerCase('pl-PL')
      .replace(/[ąćęłńóśźż]/g, (c) => mapa[c] ?? c)
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'podstrona';
  let slug = baza;
  for (let n = 2; zajete.has(slug); n++) slug = `${baza}-${n}`;
  return slug;
}

const SLUG = /^[a-z0-9-]{1,60}$/;

export interface PropsStruktury {
  model: Strona;
  podstrona: number;
  zaznaczona: string | null;
  plan: PlanKreatora;
  funkcjePro: boolean;
  bledy: Map<string, string>;
  onPodstrona: (i: number) => void;
  onZaznacz: (id: string | null) => void;
  onZmiana: (fn: (m: Strona) => Strona) => void;
  onKomunikat: (tekst: string) => void;
}

export function Struktura(p: PropsStruktury) {
  const { model, podstrona: ip, plan, funkcjePro } = p;
  const [dodawanie, setDodawanie] = useState(false);
  const biezaca = model.strony[ip] ?? model.strony[0]!;
  const limitOsiagniety = !moznaDodacPodstrone(plan, model.strony.length);

  const dodajPodstrone = async () => {
    if (limitOsiagniety) return;
    const tytul = (await zapytaj('Jak ma się nazywać podstrona w menu?', { tytul: 'Nowa podstrona', akcja: 'Dodaj', placeholder: 'Np. Cennik, O nas, Realizacje' }))?.trim();
    if (!tytul) return;
    p.onZmiana((m) => {
      const slug = slugZTytulu(tytul, new Set(m.strony.map((s) => s.slug)));
      const sekcja = nowaSekcja('onas', KATALOG_WARIANTOW.onas[0]!.id, new Set());
      (sekcja.dane as { naglowek: string }).naglowek = tytul.slice(0, 120);
      return { ...m, strony: [...m.strony, { slug, tytul: tytul.slice(0, 80), seo: {}, sekcje: [sekcja] }] };
    });
    p.onPodstrona(model.strony.length);
    p.onKomunikat(`Dodano podstronę „${tytul}”.`);
  };

  const zmienPodstrone = async (i: number) => {
    const s = model.strony[i]!;
    const tytul = (await zapytaj('Nazwa podstrony w menu:', { tytul: 'Zmień nazwę podstrony', akcja: 'Zapisz', domyslna: s.tytul }))?.trim();
    if (!tytul) return;
    let slug = s.slug;
    if (s.slug !== '') {
      const nowy = (await zapytaj('Adres podstrony (małe litery, cyfry i myślniki):', { tytul: 'Adres podstrony', akcja: 'Zapisz', domyslna: s.slug }))?.trim();
      if (nowy && nowy !== s.slug) {
        if (!SLUG.test(nowy)) p.onKomunikat('Adres może mieć tylko małe litery, cyfry i myślniki – zostawiamy poprzedni.');
        else if (model.strony.some((x, j) => j !== i && x.slug === nowy)) p.onKomunikat('Taki adres ma już inna podstrona – zostawiamy poprzedni.');
        else slug = nowy;
      }
    }
    p.onZmiana((m) => ({ ...m, strony: m.strony.map((x, j) => (j === i ? { ...x, tytul: tytul.slice(0, 80), slug } : x)) }));
  };

  const usunPodstrone = async (i: number) => {
    const s = model.strony[i]!;
    if (!(await potwierdz(`Usunąć podstronę „${s.tytul}” razem z jej sekcjami? Wrócisz do niej w historii wersji.`, { akcja: 'Usuń', niebezpieczne: true, tytul: 'Usunąć podstronę?' }))) return;
    p.onZmiana((m) => ({ ...m, strony: m.strony.filter((_, j) => j !== i) }));
    p.onPodstrona(0);
  };

  const zmienSekcje = (fn: (sekcje: Strona['strony'][number]['sekcje']) => Strona['strony'][number]['sekcje']) =>
    p.onZmiana((m) => ({ ...m, strony: m.strony.map((x, j) => (j === ip ? { ...x, sekcje: fn(x.sekcje) } : x)) }));

  const usunSekcje = async (i: number) => {
    const s = biezaca.sekcje[i]!;
    if (biezaca.sekcje.length <= 1) {
      p.onKomunikat('Podstrona musi mieć co najmniej jedną sekcję – dodaj nową, zanim usuniesz tę.');
      return;
    }
    if (!(await potwierdz(`Usunąć sekcję „${NAZWY_SEKCJI[s.typ]}”? Wrócisz do niej w historii wersji.`, { akcja: 'Usuń', niebezpieczne: true, tytul: 'Usunąć sekcję?' }))) return;
    zmienSekcje((lista) => lista.filter((_, j) => j !== i));
    if (p.zaznaczona === s.id) p.onZaznacz(null);
  };

  const dodajSekcje = (typ: TypSekcji) => {
    const warianty = KATALOG_WARIANTOW[typ];
    const wariant = (funkcjePro ? warianty[0] : warianty.find((w) => !w.pro) ?? warianty[0])!.id;
    const sekcja = nowaSekcja(typ, wariant, new Set(biezaca.sekcje.map((s) => s.id)));
    const po = biezaca.sekcje.findIndex((s) => s.id === p.zaznaczona);
    zmienSekcje((lista) => {
      const kopia = [...lista];
      kopia.splice(po === -1 ? kopia.length : po + 1, 0, sekcja);
      return kopia;
    });
    setDodawanie(false);
    p.onZaznacz(sekcja.id);
    p.onKomunikat(`Dodano sekcję „${NAZWY_SEKCJI[typ]}”. Uzupełnij pola oznaczone nawiasami.`);
  };

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="kr-podstrony" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="kr-podstrony" className="m-0 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Podstrony
          </h2>
          <span className="font-mono text-[11.5px] text-muted-foreground">
            {model.strony.length}
            {plan.podstron !== null ? `/${plan.podstron}` : ''}
          </span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {model.strony.map((s, i) => (
            <li key={`${s.slug}-${i}`} className={cx('group flex items-center gap-1 rounded-[6px] pr-1', i === ip ? 'bg-data-soft' : 'hover:bg-raised')}>
              <button
                type="button"
                onClick={() => p.onPodstrona(i)}
                aria-current={i === ip ? 'page' : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13.5px] text-foreground max-md:min-h-11"
              >
                {s.slug === '' ? <Home className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden /> : <FileText className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden />}
                <span className="min-w-0 break-words">{s.tytul}</span>
                {bladPod(p.bledy, `strony.${i}`) ? <span className="ml-auto h-2 w-2 flex-none rounded-full bg-crit" aria-label="Są pola do poprawienia" role="img" /> : null}
              </button>
              <button type="button" className={klasaIkonyListy} aria-label={`Zmień nazwę podstrony ${s.tytul}`} onClick={() => void zmienPodstrone(i)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
              {s.slug !== '' ? (
                <button type="button" className={klasaIkonyListy} aria-label={`Usuń podstronę ${s.tytul}`} onClick={() => void usunPodstrone(i)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <button type="button" className={`${klasaPrzyciskuDrugiego} w-full max-md:min-h-11`} onClick={() => void dodajPodstrone()} disabled={limitOsiagniety} aria-describedby={limitOsiagniety ? 'kr-limit-podstron' : undefined}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Dodaj podstronę
        </button>
        {limitOsiagniety ? (
          <p id="kr-limit-podstron" className="text-[12px] text-muted-foreground">
            W tej wersji strona może mieć najwyżej {podstron(plan.podstron ?? 0)}. W Kreatorze Pro – bez limitu.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="kr-sekcje" className="flex flex-col gap-2">
        <h2 id="kr-sekcje" className="m-0 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Sekcje: {biezaca.tytul}
        </h2>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {biezaca.sekcje.map((s, i) => {
            const zazn = s.id === p.zaznaczona;
            const proSekcja = SEKCJE_PRO.includes(s.typ) || KATALOG_WARIANTOW[s.typ]?.some((w) => w.id === s.wariant && w.pro);
            const nazwa = NAZWY_SEKCJI[s.typ];
            const bladSekcji = bladPod(p.bledy, `strony.${ip}.sekcje.${i}`);
            return (
              <li key={s.id} className={cx('relative rounded-[6px] border', zazn ? 'border-data bg-data-soft' : 'border-line bg-card hover:border-line-strong')}>
                <button type="button" onClick={() => p.onZaznacz(s.id)} aria-pressed={zazn} className={cx('flex w-full flex-col items-start gap-0.5 px-2.5 pb-2 pt-2 text-left max-md:min-h-[52px] max-md:justify-center max-md:pr-[184px]', s.ukryta && 'opacity-60')}>
                  <span className="flex w-full items-center gap-1.5 text-[13px] font-semibold leading-tight text-foreground">
                    <span className="min-w-0">{nazwa}</span>
                    {proSekcja ? <ZnakPro zablokowane={!funkcjePro} /> : null}
                    {bladSekcji ? <span className="ml-auto h-2 w-2 flex-none rounded-full bg-crit" role="img" aria-label="Są pola do poprawienia" /> : null}
                  </span>
                  <span className="text-[11.5px] md:pr-[104px] leading-tight text-muted-foreground">{s.ukryta ? 'Ukryta na stronie' : nazwaWariantu(s.wariant)}</span>
                </button>
                <div className="absolute inset-y-0 right-1 flex items-center md:inset-y-auto md:bottom-1">
                  <button type="button" className={klasaMalejIkony} aria-label={`${nazwa}: wyżej`} disabled={i === 0} onClick={() => zmienSekcje((l) => przesun(l, i, i - 1))}>
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button type="button" className={klasaMalejIkony} aria-label={`${nazwa}: niżej`} disabled={i === biezaca.sekcje.length - 1} onClick={() => zmienSekcje((l) => przesun(l, i, i + 1))}>
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={klasaMalejIkony}
                    aria-label={s.ukryta ? `${nazwa}: pokaż na stronie` : `${nazwa}: ukryj na stronie`}
                    aria-pressed={s.ukryta}
                    onClick={() => zmienSekcje((l) => l.map((x, j) => (j === i ? { ...x, ukryta: !x.ukryta } : x)))}
                  >
                    {s.ukryta ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                  </button>
                  <button type="button" className={klasaMalejIkony} aria-label={`${nazwa}: usuń`} onClick={() => void usunSekcje(i)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <button type="button" className={`${klasaPrzyciskuDrugiego} w-full max-md:min-h-11`} onClick={() => setDodawanie(true)} disabled={biezaca.sekcje.length >= 30}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Dodaj sekcję
        </button>
      </section>

      <PanelModal open={dodawanie} onClose={() => setDodawanie(false)} title="Dodaj sekcję" description="Sekcja pojawi się pod zaznaczoną. Teksty uzupełnisz w panelu po prawej albo poleceniem AI." className="max-w-2xl">
        <ul className="m-0 grid max-h-[60vh] list-none gap-2 overflow-y-auto p-0 sm:grid-cols-2">
          {TYPY_SEKCJI.map((t) => {
            const pro = SEKCJE_PRO.includes(t);
            return (
              <li key={t}>
                <button type="button" onClick={() => dodajSekcje(t)} className="flex h-full w-full flex-col items-start gap-1 rounded-[8px] border border-line bg-card px-3 py-2.5 text-left hover:border-line-strong hover:bg-raised">
                  <span className="flex w-full items-center gap-2 text-[13.5px] font-semibold text-foreground">
                    <span className="flex-1">{NAZWY_SEKCJI[t]}</span>
                    {pro ? <ZnakPro zablokowane={!funkcjePro} /> : null}
                  </span>
                  <span className="text-[12px] leading-snug text-muted-foreground">
                    {OPISY_SEKCJI[t]}
                    {pro && !funkcjePro ? ' Widoczna w podglądzie – na stronę trafi po włączeniu Kreatora Pro.' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PanelModal>
    </div>
  );
}
