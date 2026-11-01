'use client';

import Link from 'next/link';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * „Zajrzyj do panelu, zanim kupisz” (makieta 1.11): zakładki z opisem po lewej i odwzorowaniem panelu klienta po
 * prawej — menu boczne jak w panel.verris.pl, jasna część główna, osobny ekran dla każdej zakładki. Ekrany leżą w
 * jednej komórce siatki (stała wysokość okna). Dane w oknie są przykładowe, kwoty z cen API liczy strona.
 * Wszystkie opisy są w HTML z serwera (nieaktywne mają `hidden`), strzałki ←/→, Home, End przełączają zakładki.
 */
export type ZakladkaPanelu = { id: string; label: string; title: string; text: string; points: string[]; href: string; link: string };

const MENU = ['Pulpit', 'Usługi', 'Domeny', 'Płatności', 'Migracje', 'Analityka stron', 'Baza wiedzy', 'Ustawienia'];
/** Która pozycja menu jest podświetlona przy danej zakładce (indeks w MENU). */
const MENU_DLA: Record<string, number> = { pulpit: 0, autoskalowanie: 1, kopie: 1, przeniesienie: 4, poczta: 1, statystyki: 5 };
const OKRUSZKI: Record<string, string> = {
  pulpit: 'Pulpit',
  autoskalowanie: 'Usługi › sklep-ogrodowy.pl › Autoskalowanie',
  kopie: 'Usługi › sklep-ogrodowy.pl › Kopie',
  przeniesienie: 'Migracje › sklep-ogrodowy.pl',
  poczta: 'Usługi › sklep-ogrodowy.pl › Poczta',
  statystyki: 'Analityka stron › sklep-ogrodowy.pl',
};

export function PanelPodglad({
  zakladki,
  platnosc,
  doplataPiku,
  doplataPikuNetto,
}: {
  zakladki: ZakladkaPanelu[];
  /** Kwota najbliższej płatności na pulpicie (cena miesięczna z API). */
  platnosc: string;
  /** Dopłata za przykładowy pik (2 vCPU + 4 GB RAM przez 1,5 h) ze stawek z API. */
  doplataPiku: string;
  doplataPikuNetto: string;
}) {
  const [akt, setAkt] = useState(0);
  const przyciski = useRef<(HTMLButtonElement | null)[]>([]);
  const idz = (i: number) => {
    const n = (i + zakladki.length) % zakladki.length;
    setAkt(n);
    przyciski.current[n]?.focus();
  };
  const klawisz = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight') idz(i + 1);
    else if (e.key === 'ArrowLeft') idz(i - 1);
    else if (e.key === 'Home') idz(0);
    else if (e.key === 'End') idz(zakladki.length - 1);
    else return;
    e.preventDefault();
  };
  const aktId = zakladki[akt]?.id ?? 'pulpit';
  const ekran = (id: string, tresc: ReactNode) => (
    <div key={id} className="gl-pv" data-off={id === aktId ? undefined : ''}>
      {tresc}
    </div>
  );

  return (
    <div>
      <div className="gl-panel-zakl" role="tablist" aria-label="Funkcje panelu">
        {zakladki.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              przyciski.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`gl-ptab-${t.id}`}
            aria-selected={i === akt}
            aria-controls={`gl-ppanel-${t.id}`}
            tabIndex={i === akt ? 0 : -1}
            className="gl-tab"
            onClick={() => setAkt(i)}
            onKeyDown={(e) => klawisz(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="gl-panel">
        <div>
          {zakladki.map((t, i) => (
            <div key={t.id} className="gl-panel-txt" role="tabpanel" id={`gl-ppanel-${t.id}`} aria-labelledby={`gl-ptab-${t.id}`} hidden={i !== akt}>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
              <ul className="gl-punkty" style={{ marginTop: 0 }}>
                {t.points.map((p) => (
                  <li key={p}>
                    <span className="gl-ok" aria-hidden="true">
                      ✓
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <Link href={t.href}>{t.link} →</Link>
            </div>
          ))}
        </div>

        <div className="gl-okno" role="img" aria-label={`Podgląd panelu klienta Verris: ${zakladki[akt]?.title.toLowerCase() ?? ''}. Przykładowe dane.`}>
          <div className="gl-okno-g" aria-hidden="true">
            <span className="gl-kropki">
              <i />
              <i />
              <i />
            </span>
            <span className="gl-adres">panel.verris.pl</span>
          </div>
          <div className="gl-okno-c" aria-hidden="true">
            <div className="gl-menu">
              <span className="gl-menu-logo">verris</span>
              {MENU.map((m, i) => (
                <span key={m} data-on={MENU_DLA[aktId] === i ? '' : undefined}>
                  <i />
                  {m}
                </span>
              ))}
            </div>
            <div className="gl-glowna">
              <div className="gl-glowna-g">
                <span className="gl-pl">{OKRUSZKI[aktId]}</span>
                <span className="gl-szukaj">Szukaj… Ctrl K</span>
              </div>
              <div style={{ display: 'grid' }}>
                {ekran(
                  'pulpit',
                  <>
                    <div className="gl-pv-t">Dzień dobry, Anna</div>
                    <div className="gl-pc" style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <b>sklep-ogrodowy.pl</b>
                        <span className="gl-pchip">● działa</span>
                      </div>
                      <div className="gl-g3">
                        {[
                          ['Dysk · 12,4 z 50 GB', 25],
                          ['RAM · 1,9 z 8 GB', 24],
                          ['Procesor · 18%', 18],
                        ].map(([l, w]) => (
                          <div key={String(l)} style={{ display: 'grid', gap: 5 }}>
                            <span className="gl-pl">{l}</span>
                            <span className="gl-pbar">
                              <i style={{ width: `${w}%` }} />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="gl-g3">
                      <div className="gl-pc">
                        <span className="gl-pl">Ostatnia kopia</span>
                        <br />
                        <b>dziś 03:10</b>
                      </div>
                      <div className="gl-pc">
                        <span className="gl-pl">Certyfikat SSL</span>
                        <br />
                        <b>aktywny</b>
                      </div>
                      <div className="gl-pc">
                        <span className="gl-pl">Następna płatność</span>
                        <br />
                        <b>{platnosc}</b>
                      </div>
                    </div>
                  </>,
                )}
                {ekran(
                  'autoskalowanie',
                  <>
                    <div className="gl-pv-t">Autoskalowanie</div>
                    <div className="gl-pc" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div style={{ display: 'grid' }}>
                        <b>Dodatkowa moc w szczycie</b>
                        <span className="gl-pl">do 24 vCPU i 64 GB RAM</span>
                      </div>
                      <span style={{ width: 44, height: 24, borderRadius: 12, background: '#0F7A52', position: 'relative', flex: 'none' }}>
                        <i style={{ position: 'absolute', right: 3, top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
                      </span>
                    </div>
                    <div className="gl-pc" style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="gl-pl">Limit kosztu w miesiącu</span>
                        <b>30 zł</b>
                      </div>
                      <span className="gl-pbar" style={{ height: 8 }}>
                        <i style={{ width: '4%' }} />
                      </span>
                      <span className="gl-pl">wykorzystano {doplataPiku}</span>
                    </div>
                    <div className="gl-pc" style={{ display: 'grid', gap: 6 }}>
                      <span className="gl-pl">Wczoraj</span>
                      <svg viewBox="0 0 300 70" style={{ width: '100%', height: 'auto' }}>
                        <path d="M0 58 L120 58 C140 58 142 18 165 16 L200 16 C220 16 224 58 245 58 L300 58 L300 70 L0 70 Z" fill="rgba(15,122,82,.12)" />
                        <path d="M0 58 L120 58 C140 58 142 18 165 16 L200 16 C220 16 224 58 245 58 L300 58" fill="none" stroke="#0F7A52" strokeWidth="2.5" />
                      </svg>
                      <span style={{ fontSize: 13 }}>
                        Pik 19:40–21:10 · dopłata {doplataPiku} brutto ({doplataPikuNetto} netto)
                      </span>
                    </div>
                  </>,
                )}
                {ekran(
                  'kopie',
                  <>
                    <div className="gl-pv-t">Kopie zapasowe</div>
                    <div className="gl-pc" style={{ padding: '6px 16px' }}>
                      <div className="gl-wiersz">
                        <span>◉ 14.10, 03:10</span>
                        <span className="gl-pl">pełna · poza serwerem</span>
                      </div>
                      <div className="gl-wiersz" style={{ color: '#5d6b64' }}>
                        <span>○ 13.10, 03:10</span>
                        <span className="gl-pl">pełna</span>
                      </div>
                      <div className="gl-wiersz" style={{ color: '#5d6b64' }}>
                        <span>○ 12.10, 03:10</span>
                        <span className="gl-pl">pełna</span>
                      </div>
                    </div>
                    <div className="gl-pc" style={{ display: 'grid', gap: 10 }}>
                      <span className="gl-pl">Co przywrócić</span>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 14 }}>
                        <span>☑ Pliki</span>
                        <span>☑ Baza wp_sklep</span>
                        <span>☐ Poczta</span>
                      </div>
                      <span className="gl-pl">Przed przywróceniem zapiszemy kopię obecnego stanu.</span>
                      <span className="gl-pbtn" style={{ justifySelf: 'start' }}>
                        Przywróć z 14.10
                      </span>
                    </div>
                  </>,
                )}
                {ekran(
                  'przeniesienie',
                  <>
                    <div className="gl-pv-t">Migracja: sklep-ogrodowy.pl</div>
                    <div className="gl-pc" style={{ display: 'grid', gap: 12 }}>
                      {[
                        ['Pliki strony', 'gotowe', 100],
                        ['Baza wp_sklep', 'gotowe', 100],
                        ['Poczta biuro@', '64%', 64],
                      ].map(([n, s, w]) => (
                        <div key={String(n)} style={{ display: 'grid', gap: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                            <span>{n}</span>
                            <span className="gl-pchip" data-w={w === 100 ? undefined : ''}>
                              {s}
                            </span>
                          </div>
                          <span className="gl-pbar">
                            <i style={{ width: `${w}%` }} />
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="gl-pc" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'grid' }}>
                        <b>Przełączenie domeny</b>
                        <span className="gl-pl">czeka na Ciebie, stara strona działa</span>
                      </div>
                      <span className="gl-pbtn" data-off="">
                        Przełącz
                      </span>
                    </div>
                  </>,
                )}
                {ekran(
                  'poczta',
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div className="gl-pv-t">Poczta</div>
                      <span className="gl-pbtn">Otwórz webmail</span>
                    </div>
                    <div className="gl-pc" style={{ padding: '6px 16px' }}>
                      {[
                        ['biuro@sklep-ogrodowy.pl', '0,4 / 1 GB', 40],
                        ['anna@sklep-ogrodowy.pl', '1,1 / 5 GB', 22],
                      ].map(([a, z, w]) => (
                        <div key={String(a)} className="gl-wiersz">
                          <span>{a}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="gl-pbar" style={{ width: 70 }}>
                              <i style={{ width: `${w}%` }} />
                            </span>
                            <span className="gl-pl">{z}</span>
                          </span>
                        </div>
                      ))}
                      <div className="gl-wiersz">
                        <span>zamowienia@</span>
                        <span className="gl-pl">alias → biuro@</span>
                      </div>
                    </div>
                    <div className="gl-pc" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="gl-pl" style={{ marginRight: 6 }}>
                        Dostarczalność
                      </span>
                      <span className="gl-pchip">SPF</span>
                      <span className="gl-pchip">DKIM</span>
                      <span className="gl-pchip">DMARC</span>
                    </div>
                  </>,
                )}
                {ekran(
                  'statystyki',
                  <>
                    <div className="gl-pv-t">Analityka stron</div>
                    <div className="gl-g3">
                      {[
                        ['Odwiedziny dziś', '1 284'],
                        ['Źródło nr 1', 'Google'],
                        ['Cookies', 'brak'],
                      ].map(([l, v]) => (
                        <div key={l} className="gl-pc">
                          <span className="gl-pl">{l}</span>
                          <br />
                          <b style={{ fontSize: 20 }}>{v}</b>
                        </div>
                      ))}
                    </div>
                    <div className="gl-pc" style={{ display: 'grid', gap: 8 }}>
                      <span className="gl-pl">Ostatnie 7 dni</span>
                      <div className="gl-slupki">
                        {[45, 52, 48, 61, 58, 74, 92].map((h, i) => (
                          <i key={i} style={{ height: `${h}%` }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 13 }}>Najczęstsze wejście: /sklep/nasiona</span>
                    </div>
                  </>,
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="gl-uwaga">Odwzorowanie panelu klienta na przykładowych danych.</p>
    </div>
  );
}
