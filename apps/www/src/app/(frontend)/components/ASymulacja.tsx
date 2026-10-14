'use client';

import { useEffect, useState } from 'react';

/*
 * Grupa A — symulacja tygodnia sklepu na /hosting#pokaz (makieta 14.10, plansza Hosting).
 * Render na serwerze pokazuje cały tydzień (gotowy wykres bez JavaScriptu). Animacja startuje dopiero
 * po załadowaniu i tylko przy prefers-reduced-motion: no-preference; przycisk ją zatrzymuje.
 * Moc „z autoskalowaniem” reaguje na ruch bieżący i poprzedni (bez zaglądania w przyszłość) — silnik
 * autoskalowania sprawdza obciążenie co minutę, nie prognozuje.
 */

// Ruch w % mocy w cenie pakietu, co 6 h (pn. 00:00 … ndz. 18:00). Reklama rusza w czw. o 12:00 (indeks 14).
const L = [30, 45, 55, 40, 28, 42, 52, 38, 30, 44, 58, 42, 32, 48, 95, 210, 260, 300, 360, 330, 280, 240, 300, 220, 150, 110, 90, 70];
const KONIEC = L.length - 1; // 27
const X = (i: number) => 70 + i * (634 / KONIEC);
const Y = (v: number) => 250 - (v / 500) * 230;
const S = 12; // próbek na odcinek 6 h

type P = [number, number];

function probki(arr: number[]): P[] {
  const p: P[] = arr.map((v, i) => [X(i), Y(v)]);
  const out: P[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i];
    const b = p[i];
    const c = p[i + 1];
    const e = p[i + 2] || c;
    const c1: P = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2: P = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    for (let k = 0; k < S; k++) {
      const u = k / S;
      const w = 1 - u;
      const pt = (d: 0 | 1) => w * w * w * b[d] + 3 * w * w * u * c1[d] + 3 * w * u * u * c2[d] + u * u * u * c[d];
      out.push([pt(0), pt(1)]);
    }
  }
  out.push(p[p.length - 1]);
  return out;
}

const linia = (pp: P[]) => pp.map((q, j) => `${j ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
const CAP_AUTO = L.map((v, i) => Math.max(100, Math.min(1200, Math.ceil((Math.max(v, L[i - 1] ?? v) * 1.3) / 25) * 25)));
const CAP_STALA = L.map(() => 100);
const PROBKI_RUCH = probki(L);
const PROBKI_AUTO = probki(CAP_AUTO);
const PROBKI_STALA = probki(CAP_STALA);

const fmt = (n: number) => (n >= 1000 ? `${String(Math.round(n / 100) / 10).replace('.', ',')} tys.` : String(Math.round(n)));

export function ASymulacja() {
  const [t, setT] = useState(KONIEC);
  const [auto, setAuto] = useState(true);
  const [gra, setGra] = useState(false);
  const [ruchOk, setRuchOk] = useState(false);

  useEffect(() => {
    // Start z krótkim opóźnieniem (callback, nie synchroniczny setState w efekcie): najpierw widać gotowy wykres.
    const id = window.setTimeout(() => {
      let ok = false;
      try {
        ok = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
      } catch {
        ok = false;
      }
      setRuchOk(ok);
      if (ok) {
        setT(0);
        setGra(true);
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!gra) return;
    const iv = setInterval(() => setT((x) => (x >= KONIEC + 4 ? 0 : Math.round((x + 0.12) * 100) / 100)), 40);
    return () => clearInterval(iv);
  }, [gra]);

  const T = Math.min(t, KONIEC);
  const i = Math.min(Math.floor(T), KONIEC - 1);
  const fr = T - i;
  const cap = auto ? CAP_AUTO : CAP_STALA;
  const n = Math.round(T * S);
  const lp = PROBKI_RUCH.slice(0, n + 1);
  const glowa = lp[lp.length - 1];
  const loadPath = linia(lp);
  const loadArea = `${loadPath} L${glowa[0].toFixed(1)} 250 L${X(0).toFixed(1)} 250 Z`;
  const capPath = linia((auto ? PROBKI_AUTO : PROBKI_STALA).slice(0, n + 1));
  const lostArea = auto
    ? ''
    : `${linia(lp.map((q): P => [q[0], Math.min(q[1], Y(100))]))} L${glowa[0].toFixed(1)} ${Y(100).toFixed(1)} L${X(0).toFixed(1)} ${Y(100).toFixed(1)} Z`;

  const suma = (f: (v: number, j: number) => number) => L.slice(0, i).reduce((s, v, j) => s + f(v, j), 0) + f(L[i], i) * fr;
  const wizyty = suma((v) => v * 36) + L[0] * 36;
  const utracone = suma((v) => Math.max(0, v - 100) * 36 * 0.7);
  const godzinyPiku = Math.round(suma((_v, j) => (cap[j] > 100 ? 6 : 0)));
  const c = Math.round(cap[i] + (cap[i + 1] - cap[i]) * fr);
  const przeciazona = !auto && L[i] > 100;
  const noteX = X(14);

  const capNote =
    c <= 100
      ? 'moc w cenie pakietu'
      : (L[i + 1] ?? 0) > L[i] * 1.2
        ? 'ruch rośnie — dokładamy mocy'
        : L[i] < c / 1.6
          ? 'ruch maleje — moc wraca do pakietu'
          : 'dodatkowa moc na czas szczytu';

  return (
    <div className="a-sym">
      <div className="card a-sym-chart">
        <div className="a-sym-head">
          <p>Obciążenie strony w tygodniu</p>
          <ul className="a-legend">
            <li>
              <i className="l-ruch" aria-hidden="true" />
              ruch na stronie
            </li>
            <li>
              <i className="l-moc" aria-hidden="true" />
              moc serwera
            </li>
            {!auto && (
              <li>
                <i className="l-lost" aria-hidden="true" />
                ruch, którego serwer nie obsłużył
              </li>
            )}
          </ul>
        </div>
        <svg
          viewBox="0 0 720 290"
          role="img"
          aria-label={`Symulacja tygodnia: w czwartek rusza reklama i ruch rośnie do 3,6 raza ponad moc w cenie pakietu. ${
            auto
              ? 'Z autoskalowaniem moc serwera rośnie razem z ruchem.'
              : 'Bez autoskalowania moc zostaje na poziomie pakietu, a część ruchu nie zostaje obsłużona.'
          }`}
        >
          <line x1="56" y1="250" x2="704" y2="250" stroke="rgba(255,255,255,0.18)" />
          {[158, 112, 66, 20].map((y) => (
            <line key={y} x1="56" y1={y} x2="704" y2={y} stroke="rgba(255,255,255,0.07)" />
          ))}
          <line x1="56" y1="204" x2="704" y2="204" stroke="rgba(52,229,160,0.28)" strokeDasharray="2 6" />
          {['0', '1×', '2×', '3×', '4×', '5×'].map((l, k) => (
            <text key={l} x="48" y={254 - k * 46} fill="#93A29A" fontSize="11" textAnchor="end" fontFamily="JetBrains Mono, monospace">
              {l}
            </text>
          ))}
          <text x="60" y="198" fill="#93A29A" fontSize="11">
            moc w cenie pakietu
          </text>
          {lostArea && <path d={lostArea} fill="rgba(255,159,67,0.45)" />}
          <path d={capPath} fill="none" stroke="#F4F4EE" strokeWidth="2" strokeDasharray="6 5" />
          <path d={loadArea} fill="rgba(52,229,160,0.10)" />
          <path d={loadPath} fill="none" stroke="#34E5A0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={glowa[0].toFixed(1)} cy={glowa[1].toFixed(1)} r="5" fill="#34E5A0" stroke="#091410" strokeWidth="2" />
          <g opacity={T >= 14 ? 1 : 0}>
            <line x1={noteX} y1="44" x2={noteX} y2="250" stroke="rgba(244,244,238,0.45)" strokeDasharray="3 4" />
            <rect x={noteX - 75} y="18" width="150" height="26" rx="8" fill="#F4F4EE" />
            <text x={noteX} y="35" fill="#0C1A14" fontSize="12" fontWeight="700" textAnchor="middle">
              Rusza reklama
            </text>
          </g>
          {['pn.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'ndz.'].map((d, k) => (
            <text key={d} x={102 + k * 92.7} y="274" fill="#93A29A" fontSize="12" textAnchor="middle">
              {d}
            </text>
          ))}
        </svg>
        <div className="a-sym-foot">
          <p>Symulacja poglądowa: kształt ruchu i liczby są przykładowe.</p>
          {ruchOk && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGra((g) => !g)}>
              {gra ? 'Zatrzymaj animację' : 'Odtwórz animację'}
            </button>
          )}
        </div>
      </div>

      <div className="a-sym-side">
        <button
          type="button"
          className="a-switch"
          aria-pressed={auto}
          onClick={() => {
            setAuto((a) => !a);
            if (gra) setT(0);
          }}
        >
          <span>
            <strong>Autoskalowanie</strong>
            <small>{auto ? 'włączone — moc rośnie z ruchem' : 'wyłączone — stała moc pakietu'}</small>
          </span>
          <span className="a-knob" aria-hidden="true">
            <span />
          </span>
        </button>
        <div className="a-stat">
          <small>Odwiedziny w tym tygodniu</small>
          <b>{fmt(wizyty)}</b>
        </div>
        <div className="a-stat">
          <small>Moc serwera w tej chwili</small>
          <b>
            {Math.ceil((2 * c) / 100)} vCPU · {Math.round((8 * c) / 100)} GB RAM
          </b>
          <small>{capNote}</small>
        </div>
        <div className={`a-stat ${auto ? 'a-stat-ok' : 'a-stat-warn'}`}>
          <small>{auto ? 'Godziny z dodatkową mocą' : 'Wizyty, które nie doczekały się strony'}</small>
          <b>{auto ? `${godzinyPiku} h` : fmt(utracone)}</b>
          <small>
            {auto
              ? 'Płacisz tylko za nie, do limitu z panelu. Potem znów 45 zł.'
              : przeciazona
                ? 'Strona zwalnia, koszyki zostają porzucone.'
                : 'Na razie wszystko w normie — poczekaj na czwartek.'}
          </small>
        </div>
      </div>
    </div>
  );
}
