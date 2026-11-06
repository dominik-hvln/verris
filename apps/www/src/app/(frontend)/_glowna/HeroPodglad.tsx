'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * Podgląd panelu w hero strony głównej (makieta 1.11, plansza Main): 3 widoki — autoskalowanie, przeniesienie,
 * cena za rok. Widoki leżą w jednej komórce siatki, więc ramka ma zawsze wysokość najwyższego (hero nie „skacze”).
 * Zmieniają się same co 7 s; kliknięcie zakładki zatrzymuje przełączanie. Przy prefers-reduced-motion nie ma
 * auto-przełączania ani animacji. Kwoty liczy strona z cen API (lib/ceny) i przekazuje gotowe teksty.
 */
export type DaneHeroPodgladu = {
  /** „+ 1,85 zł” itd. — rachunek miesiąca z przykładowym pikiem. */
  pakiet: string;
  doplata: string;
  razem: string;
  razemNetto: string;
  /** Szerokość paska wykorzystania limitu, 0–100. */
  limitProcent: number;
  limitOpis: string;
  /** Cena za rok przez 3 lata. */
  rok: string;
  rokNetto: string;
  miesiecznie: string;
  miesiecznieNetto: string;
  trzyLata: string;
  trzyLataNetto: string;
};

const WIDOKI = ['Autoskalowanie', 'Przeniesienie', 'Cena za rok'] as const;

const ETAPY: { s: 'ok' | 'teraz' | 'czeka'; t: string; m: string }[] = [
  { s: 'ok', t: 'Znaleźliśmy stronę', m: 'stary hosting: cPanel' },
  { s: 'ok', t: 'Pliki strony', m: '2 418 plików · 1,2 GB' },
  { s: 'ok', t: 'Baza danych WordPressa', m: 'wp_pracownia · 84 MB' },
  { s: 'teraz', t: 'Skrzynki pocztowe', m: '3 z 5 skrzynek · trwa' },
  { s: 'czeka', t: 'Sprawdzenie na adresie testowym', m: 'czeka na Ciebie' },
  { s: 'czeka', t: 'Przełączenie domeny', m: 'kiedy powiesz „przełączamy”' },
];

export function HeroPodglad({ dane }: { dane: DaneHeroPodgladu }) {
  const [widok, setWidok] = useState(0);
  const [auto, setAuto] = useState(true);
  const przyciski = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!auto) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      // Bez ruchu: nie przełączamy samo (stan zmieniamy w kolejnym takcie, nie synchronicznie w efekcie).
      const t0 = setTimeout(() => setAuto(false), 0);
      return () => clearTimeout(t0);
    }
    const t = setInterval(() => setWidok((w) => (w + 1) % WIDOKI.length), 7000);
    return () => clearInterval(t);
  }, [auto]);

  const wybierz = (i: number, fokus = false) => {
    const n = (i + WIDOKI.length) % WIDOKI.length;
    setWidok(n);
    setAuto(false);
    if (fokus) przyciski.current[n]?.focus();
  };
  const klawisz = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight') wybierz(i + 1, true);
    else if (e.key === 'ArrowLeft') wybierz(i - 1, true);
    else return;
    e.preventDefault();
  };
  const off = (i: number) => (i === widok ? undefined : '');

  return (
    <div className="gl-podglad">
      {/* A3-16: w role=tablist mogą być tylko zakładki — opis automatycznej zmiany stoi obok, nie w środku. */}
      <div className="gl-zakl">
        <div className="gl-zakl-karty" role="tablist" aria-label="Podgląd panelu">
        {WIDOKI.map((w, i) => (
          <button
            key={w}
            ref={(el) => {
              przyciski.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`gl-hero-tab-${i}`}
            aria-selected={i === widok}
            aria-controls={`gl-hero-widok-${i}`}
            tabIndex={i === widok ? 0 : -1}
            className="gl-tab"
            onClick={() => wybierz(i)}
            onKeyDown={(e) => klawisz(e, i)}
          >
            {w}
          </button>
        ))}
        </div>
        <span className="gl-auto" aria-live="off">
          {auto ? 'zmienia się co 7 s' : 'zatrzymane'}
        </span>
      </div>

      <div className="gl-stos">
        {/* 1. Autoskalowanie */}
        <div className="gl-widok" role="tabpanel" id="gl-hero-widok-0" aria-labelledby="gl-hero-tab-0" aria-hidden={widok !== 0} data-off={off(0)}>
          <div className="gl-widok-g">
            <b>sklep-kowalski.pl · dziś</b>
            <span className="gl-mono">● autoskalowanie włączone</span>
          </div>
          <svg
            className="gl-wykres"
            viewBox="0 0 560 200"
            role="img"
            aria-label="Wykres: wieczorem odwiedzin przybywa, moc serwera rośnie razem z nimi i po 23:00 wraca do pakietu"
          >
            <defs>
              <linearGradient id="gl-moc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#34E5A0" stopOpacity=".28" />
                <stop offset="1" stopColor="#34E5A0" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect x="292" y="22" width="178" height="146" rx="10" fill="rgba(52,229,160,.05)" />
            <line x1="0" y1="168" x2="560" y2="168" stroke="rgba(255,255,255,.1)" />
            <line x1="0" y1="138" x2="560" y2="138" stroke="rgba(255,255,255,.08)" strokeDasharray="4 5" />
            <text x="4" y="132" fill="#93A29A" fontSize="10.5" fontFamily="JetBrains Mono, monospace">
              limit pakietu: 2 vCPU · 8 GB
            </text>
            <path
              className="ch-area"
              d="M0 138 L268 138 C300 138 304 66 342 64 L400 64 C440 64 446 138 482 138 L560 138 L560 168 L0 168 Z"
              fill="url(#gl-moc)"
            />
            <path
              className="ch-line"
              pathLength={1}
              d="M0 152 C110 150 200 146 250 136 C292 126 300 46 350 40 C395 36 410 70 445 112 C470 140 520 150 560 150"
              fill="none"
              stroke="#8ea6ee"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              className="ch-line ch-moc"
              pathLength={1}
              d="M0 138 L268 138 C300 138 304 66 342 64 L400 64 C440 64 446 138 482 138 L560 138"
              fill="none"
              stroke="#34E5A0"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle className="ch-dot" cx="342" cy="64" r="5" fill="#34E5A0" />
            <text x="300" y="16" fill="#34E5A0" fontSize="11" fontFamily="JetBrains Mono, monospace">
              +2 vCPU, +4 GB RAM
            </text>
            <text x="0" y="190" fill="#93A29A" fontSize="11" fontFamily="JetBrains Mono, monospace">
              12:00
            </text>
            <text x="280" y="190" fill="#93A29A" fontSize="11" fontFamily="JetBrains Mono, monospace">
              20:00
            </text>
            <text x="448" y="190" fill="#93A29A" fontSize="11" fontFamily="JetBrains Mono, monospace">
              23:00
            </text>
            <text x="522" y="190" fill="#93A29A" fontSize="11" fontFamily="JetBrains Mono, monospace">
              24:00
            </text>
          </svg>
          <div className="gl-legenda" aria-hidden="true">
            <span>
              <i style={{ background: '#8ea6ee' }} />
              odwiedziny
            </span>
            <span>
              <i style={{ background: '#34E5A0' }} />
              moc serwera
            </span>
          </div>
          <div className="gl-rach">
            <div className="gl-rach-w">
              <span>Pakiet, ten miesiąc</span>
              <b>{dane.pakiet}</b>
            </div>
            <div className="gl-rach-w">
              <span>Dodatkowa moc, 20:00–23:00</span>
              <span className="gl-plus">+ {dane.doplata}</span>
            </div>
            <div className="gl-rach-suma">
              <b>Razem w tym miesiącu</b>
              <span>
                <strong>{dane.razem}</strong> <span className="gl-mini">brutto · {dane.razemNetto} netto</span>
              </span>
            </div>
            <div className="gl-limit" aria-hidden="true">
              <i style={{ width: `${Math.max(2, Math.min(100, dane.limitProcent))}%` }} />
            </div>
            <span className="gl-mini">{dane.limitOpis}</span>
          </div>
          <span className="gl-mini">Przykład wyliczony ze stawek z cennika.</span>
        </div>

        {/* 2. Przeniesienie */}
        <div className="gl-widok" role="tabpanel" id="gl-hero-widok-1" aria-labelledby="gl-hero-tab-1" aria-hidden={widok !== 1} data-off={off(1)}>
          <div className="gl-widok-g">
            <b>Przeniesienie: pracownia-anna.pl</b>
            <span className="gl-mono">etap 4 z 6</span>
          </div>
          <div className="gl-segi" aria-hidden="true">
            {ETAPY.map((e) => (
              <i key={e.t} data-s={e.s} />
            ))}
          </div>
          <ol className="gl-etapy">
            {ETAPY.map((e) => (
              <li key={e.t} className="gl-etap" data-s={e.s}>
                <span className="gl-etap-l" aria-hidden="true">
                  <span className="gl-kolo">
                    {e.s === 'ok' && (
                      <svg viewBox="0 0 12 12" width="12" height="12">
                        <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="#06120D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="gl-lacznik" />
                </span>
                <span className="gl-etap-t">
                  <b>
                    {e.t}
                    <span className="gl-sr">{e.s === 'ok' ? ' – gotowe' : e.s === 'teraz' ? ' – w toku' : ' – czeka'}</span>
                  </b>
                  <span>{e.m}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="gl-mini" style={{ fontSize: 14, color: 'var(--body)', margin: 0 }}>
            Stara strona działa przez cały czas. Nic nie zmieniamy w domenie bez Twojego kliknięcia.
          </p>
        </div>

        {/* 3. Cena za rok */}
        <div className="gl-widok" role="tabpanel" id="gl-hero-widok-2" aria-labelledby="gl-hero-tab-2" aria-hidden={widok !== 2} data-off={off(2)}>
          <div className="gl-widok-g">
            <b>Twoja cena przez 3 lata</b>
            <span className="gl-mono">odnowienie po cenie z cennika</span>
          </div>
          <svg className="gl-wykres" viewBox="0 0 560 150" role="img" aria-label={`Oś czasu: trzy lata po ${dane.rok} według cennika, odnowienia po cenie z cennika`}>
            <line x1="20" y1="62" x2="540" y2="62" stroke="#34E5A0" strokeWidth="4" strokeLinecap="round" />
            <circle cx="20" cy="62" r="8" fill="#34E5A0" />
            <circle cx="193" cy="62" r="10" fill="#0E1F17" stroke="#34E5A0" strokeWidth="3" />
            <circle cx="366" cy="62" r="10" fill="#0E1F17" stroke="#34E5A0" strokeWidth="3" />
            <circle cx="540" cy="62" r="8" fill="#34E5A0" />
            {[106, 280, 453].map((x, i) => (
              <g key={x}>
                <text x={x} y="40" textAnchor="middle" fill="#F4F4EE" fontSize="22" fontWeight="700" fontFamily="Schibsted Grotesk, sans-serif">
                  {dane.rok}
                </text>
                <text x={x} y="92" textAnchor="middle" fill="#93A29A" fontSize="11" fontFamily="JetBrains Mono, monospace">
                  ROK {i + 1}
                </text>
              </g>
            ))}
            {[193, 366].map((x) => (
              <g key={x}>
                <text x={x} y="122" textAnchor="middle" fill="#34E5A0" fontSize="11" fontFamily="JetBrains Mono, monospace">
                  odnowienie
                </text>
                <text x={x} y="137" textAnchor="middle" fill="#34E5A0" fontSize="11" fontFamily="JetBrains Mono, monospace">
                  cena z cennika
                </text>
              </g>
            ))}
          </svg>
          <div className="gl-rach">
            <div className="gl-rach-w">
              <span>Co roku</span>
              <b>
                {dane.rok} brutto · {dane.rokNetto} netto
              </b>
            </div>
            <div className="gl-rach-w">
              <span>Miesięcznie wychodzi</span>
              <b>
                ok. {dane.miesiecznie} brutto · {dane.miesiecznieNetto} netto
              </b>
            </div>
            <div className="gl-rach-suma">
              <b>Razem za 3 lata</b>
              <span>
                <strong>{dane.trzyLata}</strong> <span className="gl-mini">brutto · {dane.trzyLataNetto} netto</span>
              </span>
            </div>
            <span className="gl-mini">
              Według cennika, każdy rok po tej samej cenie. Przy pierwszym zakupie dostajesz kredyty na
              autoskalowanie. Przed każdym odnowieniem przypomnimy e-mailem.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
