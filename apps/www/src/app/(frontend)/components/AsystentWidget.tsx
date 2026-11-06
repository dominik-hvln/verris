'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, RotateCcw, X } from 'lucide-react';
import { captchaTokenFromForm } from '@/lib/captcha-token';
import { poprosOTelefonZRozmowy, zapytajAsystenta } from '@/lib/asystent';
import {
  CAPTCHA_OD_WIADOMOSCI,
  MAKS_ZNAKOW,
  PODPOWIEDZI,
  POWITANIE,
  STOPKA_AI,
  UWAGA_AI,
  akapity,
  reakcjaNaBlad,
  wczytajSesje,
  zapiszSesje,
  type WiadomoscCzatu,
} from '@/lib/asystent-stan';
import { Captcha } from './Captcha';
import { GODZINY_ODDZWANIANIA, KLAUZULA_ODDZWONIENIA } from './PasRozmowy';

export type StanAvatara = 'czeka' | 'szuka' | 'odpowiada';

/**
 * Avatar asystenta z sygnetu marki (makieta 1.11, 3 stany): czeka — spokojny; szuka — mięta w trójkącie „oddycha”;
 * odpowiada — pulsujący pierścień. Bez twarzy i ludzkiego imienia: od razu widać, że to AI.
 */
export function AsystentAvatar({ stan = 'czeka', rozmiar = 40 }: { stan?: StanAvatara; rozmiar?: number }) {
  return (
    <span className={`asy-av asy-av-${stan}`} aria-hidden="true">
      <svg viewBox="0 0 80 80" width={rozmiar} height={rozmiar} focusable="false">
        <circle cx="40" cy="40" r="39.5" fill="#0c1a14" stroke="rgba(52,229,160,.45)" />
        <g transform="translate(-2.5 -5.9) scale(0.85)">
          <path d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z" fill="#f4f4ee" fillRule="evenodd" />
          <path className="asy-tri" d="M44 55 L56 55 L50 69 Z" fill="#34e5a0" />
        </g>
      </svg>
      <i className="asy-ring" />
    </span>
  );
}

/** Style widgetu jako tekst (bez pliku .css — jest go nie mapuje, a globals.css jest poza zakresem asystenta). */
export const CSS_ASYSTENTA = `
.asy-fab{position:fixed;right:max(20px,env(safe-area-inset-right,0px));bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:70;display:inline-flex;align-items:center;gap:10px;padding:8px 18px 8px 8px;border-radius:999px;background:#0E1F17;border:1px solid rgba(52,229,160,.4);box-shadow:0 14px 34px rgba(0,0,0,.45);color:#F4F4EE;font:inherit;cursor:pointer;text-align:left}
.asy-fab:hover{border-color:#34E5A0}
.asy-fab:focus-visible,.asy-panel :focus-visible{outline:2px solid #34E5A0;outline-offset:2px}
.asy-fab-t{display:grid;line-height:1.25}
.asy-fab-t b{font-weight:600;font-size:15px}
.asy-fab-t small{font-size:12px;color:#93A29A}
.asy-av{position:relative;flex:none;display:inline-block;line-height:0;border-radius:50%}
.asy-av svg{display:block}
.asy-ring{position:absolute;inset:-5px;border-radius:50%;border:2px solid rgba(52,229,160,0);pointer-events:none}
.asy-av-szuka .asy-tri{animation:asyTri 1.1s ease-in-out infinite}
.asy-av-odpowiada .asy-ring{animation:asyRing 1.8s ease-out infinite}
@keyframes asyTri{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes asyRing{0%{border-color:rgba(52,229,160,.55);transform:scale(.96)}100%{border-color:rgba(52,229,160,0);transform:scale(1.12)}}
.asy-panel{position:fixed;right:max(20px,env(safe-area-inset-right,0px));bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:71;width:420px;max-width:calc(100vw - 40px);height:min(760px,calc(100vh - 40px));height:min(760px,calc(100dvh - 40px));background:#0C1A14;border:1px solid rgba(255,255,255,.12);border-radius:20px;box-shadow:0 30px 70px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden;color:#B4C2BB;font-size:14.5px;line-height:1.55}
.asy-gl{display:flex;align-items:center;gap:12px;padding:14px 12px 14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
.asy-gl-t{display:grid;line-height:1.3;flex:1;min-width:0}
.asy-gl-t h2{margin:0;font-size:16px;color:#F4F4EE;letter-spacing:-.01em}
.asy-gl-t span{font-size:12px;color:#93A29A}
.asy-ikona{width:40px;height:40px;display:grid;place-items:center;border-radius:10px;background:none;border:0;color:#93A29A;cursor:pointer}
.asy-ikona:hover{color:#F4F4EE;background:rgba(255,255,255,.06)}
.asy-ikona svg{width:20px;height:20px}
.asy-msgs{flex:1;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:12px;padding:16px}
.asy-uwaga{font-size:12px;color:#93A29A;text-align:center;padding:2px 8px;margin:0}
.asy-u{align-self:flex-end;max-width:82%;background:#1FA871;color:#06120D;border-radius:16px 16px 4px 16px;padding:10px 14px;white-space:pre-wrap;overflow-wrap:anywhere}
.asy-b{align-self:flex-start;max-width:90%;background:#0E1F17;border:1px solid rgba(255,255,255,.08);color:#DCE4DF;border-radius:16px 16px 16px 4px;padding:12px 14px;display:grid;gap:8px;overflow-wrap:anywhere}
.asy-b p{margin:0}
.asy-sys{align-self:stretch;font-size:13px;color:#F4D58D;background:rgba(244,213,141,.07);border:1px solid rgba(244,213,141,.25);border-radius:12px;padding:10px 12px;margin:0}
.asy-src{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.asy-src a,.asy-src span{display:inline-block;font:500 11.5px/1.4 'JetBrains Mono',ui-monospace,monospace;padding:4px 8px;border-radius:6px;background:#091410;border:1px solid rgba(52,229,160,.25);text-decoration:none;color:#34E5A0}
.asy-src a:hover{border-color:#34E5A0}
.asy-pisze{align-self:flex-start;display:flex;align-items:center;gap:8px;font-size:13px;color:#93A29A}
.asy-dots i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#34E5A0;margin-right:4px;animation:asyDot 1.2s infinite}
.asy-dots i:nth-child(2){animation-delay:.15s}.asy-dots i:nth-child(3){animation-delay:.3s}
@keyframes asyDot{0%,60%,100%{opacity:.25}30%{opacity:1}}
.asy-tel{align-self:stretch;background:#0E1F17;border:1px solid rgba(52,229,160,.35);border-radius:14px;padding:14px;display:grid;gap:10px}
.asy-tel h3{margin:0;font-size:15px;color:#F4F4EE}
.asy-tel p{margin:0;font-size:13px;color:#93A29A}
.asy-tel form{display:grid;gap:8px}
.asy-tel label{display:grid;gap:4px;font-size:13px;color:#DCE4DF}
.asy-tel input[type=text],.asy-tel input[type=tel]{min-height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:#091410;color:#F4F4EE;padding:0 10px;font:inherit}
.asy-tel fieldset{border:0;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px}
.asy-tel legend{padding:0;margin-bottom:4px;font-size:13px;color:#DCE4DF}
.asy-tel fieldset label{display:inline-flex;align-items:center;gap:6px}
.asy-tel-ok{color:#34E5A0;font-size:14px;margin:0}
.asy-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 10px}
.asy-chips button{font:inherit;font-size:13px;padding:7px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:none;color:#DCE4DF;cursor:pointer}
.asy-chips button:hover{border-color:#34E5A0;color:#F4F4EE}
.asy-wej{display:grid;gap:6px;padding:12px 16px 6px;border-top:1px solid rgba(255,255,255,.08)}
.asy-wej-r{display:flex;gap:8px;align-items:flex-end}
.asy-wej textarea{flex:1;min-height:42px;max-height:140px;resize:none;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#091410;color:#F4F4EE;padding:10px 12px;font:inherit;font-size:14.5px;line-height:1.45}
.asy-wej textarea::placeholder{color:#6f7f78}
.asy-wyslij{width:42px;height:42px;flex:none;border-radius:12px;background:#34E5A0;border:0;display:grid;place-items:center;color:#06120D;cursor:pointer}
.asy-wyslij:disabled{opacity:.45;cursor:not-allowed}
.asy-wyslij svg{width:20px;height:20px}
.asy-licznik{font-size:11.5px;color:#93A29A;text-align:right;margin:0}
.asy-note{font-size:11.5px;color:#93A29A;padding:0 16px 12px;margin:0}
.asy-note button{font:inherit;background:none;border:0;padding:0;color:#34E5A0;text-decoration:underline;cursor:pointer}
.asy-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:899px){html:not([data-formularz-widoczny]) body:has(.mpasek.on):not(:has(.cc-bar)) .asy-fab{bottom:calc(92px + env(safe-area-inset-bottom,0px))}}
@media(prefers-reduced-motion:no-preference){.asy-fab{transition:bottom .25s ease,border-color .15s}}
@media(max-width:640px){
.asy-fab{padding:6px;right:max(14px,env(safe-area-inset-right,0px));bottom:calc(14px + env(safe-area-inset-bottom,0px))}
.asy-fab-t{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
.asy-panel{inset:0;width:100%;max-width:none;height:100%;border-radius:0;border:0;padding-bottom:env(safe-area-inset-bottom,0px)}
html:has(.asy-panel){overflow:hidden}
}
@media(prefers-reduced-motion:reduce){.asy-av .asy-tri,.asy-av .asy-ring,.asy-dots i{animation:none}}
`;

const ZAMKNIECIE_ODPOWIADA_MS = 2400;

const PORY = [
  { id: 'rano', label: 'rano' },
  { id: 'poludnie', label: 'w południe' },
  { id: 'popoludnie', label: 'po 14:00' },
] as const;

function wSesji(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

/** Karta „Poproś o telefon” w oknie asystenta — prośba z dołączoną rozmową (rozmowaId). */
function KartaTelefonu({ rozmowaId }: { rozmowaId: string | null }) {
  const [otwarta, setOtwarta] = useState(false);
  const [pora, setPora] = useState<(typeof PORY)[number]['id']>('rano');
  const [busy, setBusy] = useState(false);
  const [wyslane, setWyslane] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  const wyslij = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const name = fd.get('asy-imie')?.toString().trim() ?? '';
    const phone = fd.get('asy-tel')?.toString().trim() ?? '';
    if (!name || !phone) return;
    setBusy(true);
    setBlad(null);
    const r = await poprosOTelefonZRozmowy({
      name,
      phone,
      preferredTime: pora,
      consentText: KLAUZULA_ODDZWONIENIA,
      rozmowaId,
      page: typeof window !== 'undefined' ? window.location.href : undefined,
      captchaToken: captchaTokenFromForm(fd),
    });
    setBusy(false);
    if (r.ok) setWyslane(true);
    else
      setBlad(
        r.status === 400
          ? 'Sprawdź numer telefonu: 9–15 cyfr, może zaczynać się od +.'
          : r.status === 429
            ? 'Za dużo prób w krótkim czasie. Napisz na kontakt@verris.pl.'
            : 'Nie udało się wysłać. Spróbuj ponownie albo napisz na kontakt@verris.pl.',
      );
  };

  return (
    <div className="asy-tel">
      <h3>Poproś o telefon</h3>
      {wyslane ? (
        <p className="asy-tel-ok" role="status">
          Dziękujemy! {GODZINY_ODDZWANIANIA}
        </p>
      ) : (
        <>
          <p>Dołączymy tę rozmowę, żebyś nie musiał powtarzać pytania. {GODZINY_ODDZWANIANIA}</p>
          {otwarta ? (
            <form onSubmit={wyslij}>
              <label>
                Imię
                <input name="asy-imie" type="text" required maxLength={100} autoComplete="given-name" />
              </label>
              <label>
                Telefon
                <input name="asy-tel" type="tel" required maxLength={32} inputMode="tel" autoComplete="tel" pattern="\+?[0-9 \-]{9,20}" />
              </label>
              <fieldset>
                <legend>Kiedy zadzwonić?</legend>
                {PORY.map((p) => (
                  <label key={p.id}>
                    <input type="radio" name="asy-pora" value={p.id} checked={pora === p.id} onChange={() => setPora(p.id)} />
                    {p.label}
                  </label>
                ))}
              </fieldset>
              <Captcha action="lead" />
              <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                {busy ? 'Wysyłam…' : 'Poproś o telefon'}
              </button>
              {blad && (
                <p className="form-error" role="alert">
                  {blad}
                </p>
              )}
              <p>
                Numer wykorzystamy tylko do tej rozmowy. Szczegóły w{' '}
                <a href="https://panel.verris.pl/legal/privacy">polityce prywatności</a>.
              </p>
            </form>
          ) : (
            <button className="btn btn-primary btn-sm" type="button" onClick={() => setOtwarta(true)}>
              Zostaw numer
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Asystent AI na verris.pl (makieta 1.11): przycisk w prawym dolnym rogu (na telefonie mała ikona nad paskiem zakupu),
 * okno 420 px na komputerze, pełny ekran na telefonie. Odpowiedzi tylko ze źródeł (chipy z linkami); gdy asystent nie
 * wie albo jest niedostępny — karta „Poproś o telefon” z dołączoną rozmową. Bez cookies: id i przebieg rozmowy
 * w sessionStorage. Włącza się wyłącznie przełącznikiem w Admin → Konfiguracja asystenta (/settings/ai), sekcja „Asystent na verris.pl”: layout pyta API o status
 * (lib/asystent-status.ts) i przekazuje `wlaczony`; bez tego propa nic nie renderuje.
 * Montaż: `<AsystentWidget wlaczony={…} />` raz, w app/(frontend)/layout.tsx.
 */
export function AsystentWidget({
  wlaczony = false,
  otwarteNaStart = false,
}: {
  /** Status z API (GET /public/asystent/status) — ustawia layout po stronie serwera. */
  wlaczony?: boolean;
  /** Dla testów i podglądu: okno otwarte od razu. */
  otwarteNaStart?: boolean;
}) {
  const [otwarte, setOtwarte] = useState(otwarteNaStart);
  // Sesja z sessionStorage od pierwszego renderu klienta (na serwerze pusta). Hydratacja się zgadza, bo zamknięty
  // widget renderuje tylko przycisk — historia rozmowy pojawia się dopiero w otwartym oknie.
  const [start] = useState(() => wczytajSesje(wSesji()));
  const [wiadomosci, setWiadomosci] = useState<WiadomoscCzatu[]>(start.wiadomosci);
  const [rozmowaId, setRozmowaId] = useState<string | null>(start.rozmowaId);
  const [wymiany, setWymiany] = useState(start.wymiany);
  const [tekst, setTekst] = useState('');
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState<StanAvatara>('czeka');
  const [captcha, setCaptcha] = useState(false);
  const [captchaKlucz, setCaptchaKlucz] = useState(0);
  const [telefon, setTelefon] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const fab = useRef<HTMLButtonElement | null>(null);
  const pole = useRef<HTMLTextAreaElement | null>(null);
  const lista = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!wlaczony) return;
    zapiszSesje(wSesji(), { rozmowaId, wiadomosci, wymiany });
  }, [wlaczony, rozmowaId, wiadomosci, wymiany]);

  useEffect(() => {
    if (otwarte) pole.current?.focus();
  }, [otwarte]);

  useEffect(() => {
    const l = lista.current;
    if (l) l.scrollTop = l.scrollHeight;
  }, [wiadomosci, busy, telefon, otwarte]);

  const zamknij = useCallback(() => {
    setOtwarte(false);
    // Fokus wraca na przycisk, który otworzył okno.
    setTimeout(() => fab.current?.focus(), 0);
  }, []);

  /** Esc zamyka; Tab krąży w oknie (aria-modal). Nasłuch na dokumencie, póki okno jest otwarte. */
  useEffect(() => {
    if (!otwarte) return;
    const klawisze = (e: KeyboardEvent) => {
      const p = panel.current;
      if (!p) return;
      if (e.key === 'Escape') {
        zamknij();
        return;
      }
      if (e.key !== 'Tab') return;
      const el = [
        ...p.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea,input:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])'),
      ].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!el.length) return;
      const pierwszy = el[0];
      const ostatni = el[el.length - 1];
      if (!p.contains(document.activeElement)) {
        e.preventDefault();
        pierwszy.focus();
      } else if (e.shiftKey && document.activeElement === pierwszy) {
        e.preventDefault();
        ostatni.focus();
      } else if (!e.shiftKey && document.activeElement === ostatni) {
        e.preventDefault();
        pierwszy.focus();
      }
    };
    document.addEventListener('keydown', klawisze);
    return () => document.removeEventListener('keydown', klawisze);
  }, [otwarte, zamknij]);

  const nowaRozmowa = () => {
    setWiadomosci([]);
    setRozmowaId(null);
    setWymiany(0);
    setCaptcha(false);
    setTelefon(false);
    setAvatar('czeka');
    pole.current?.focus();
  };

  const wyslij = async (pytanie: string, captchaToken?: string) => {
    const p = pytanie.trim().slice(0, MAKS_ZNAKOW);
    if (!p || busy) return;
    setBusy(true);
    setAvatar('szuka');
    setTekst('');
    setWiadomosci((w) => [...w, { rola: 'ja', tresc: p }]);
    const r = await zapytajAsystenta({ rozmowaId, pytanie: p, captchaToken });
    setBusy(false);
    if (captchaToken) setCaptchaKlucz((k) => k + 1); // token jednorazowy — świeży widget na następne pytanie
    if (r.ok) {
      const d = r.dane;
      setRozmowaId(d.rozmowaId);
      setWymiany((n) => (d.rozmowaId === rozmowaId ? n + 1 : 1));
      setWiadomosci((w) => [...w, { rola: 'asystent', tresc: d.odpowiedz, zrodla: d.zrodla, przekaz: d.nieWiem }]);
      if (d.nieWiem) setTelefon(true);
      setAvatar('odpowiada');
      setTimeout(() => setAvatar('czeka'), ZAMKNIECIE_ODPOWIADA_MS);
      return;
    }
    const re = reakcjaNaBlad(r);
    setAvatar('czeka');
    if (re.captcha) {
      // Pytanie wraca do pola — po zaznaczeniu testu wystarczy wysłać jeszcze raz.
      setWiadomosci((w) => [...w.slice(0, -1), { rola: 'asystent', tresc: re.tresc, systemowa: true }]);
      setTekst(p);
      setCaptcha(true);
      return;
    }
    setWiadomosci((w) => [...w, { rola: 'asystent', tresc: re.tresc, systemowa: true, przekaz: re.przekaz }]);
    if (re.przekaz) setTelefon(true);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void wyslij(tekst, captchaTokenFromForm(new FormData(e.currentTarget)));
  };

  if (!wlaczony) return null;

  const pokazCaptche = captcha || wymiany + 1 >= CAPTCHA_OD_WIADOMOSCI;
  const bezPytan = !wiadomosci.some((w) => w.rola === 'ja');

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS_ASYSTENTA }} />
      {!otwarte && (
        <button
          ref={fab}
          type="button"
          className="asy-fab"
          aria-haspopup="dialog"
          aria-label="Masz pytanie? Otwórz asystenta AI"
          onClick={() => setOtwarte(true)}
          data-event="cta_click"
          data-cta="asystent-otworz"
        >
          <AsystentAvatar stan="czeka" rozmiar={40} />
          <span className="asy-fab-t">
            <b>Masz pytanie?</b>
            <small>Odpowiem w kilka sekund</small>
          </span>
        </button>
      )}
      {otwarte && (
        <div ref={panel} className="asy-panel" role="dialog" aria-modal="true" aria-labelledby="asy-tytul">
          <div className="asy-gl">
            <AsystentAvatar stan={avatar} rozmiar={40} />
            <div className="asy-gl-t">
              <h2 id="asy-tytul">Asystent Verris</h2>
              <span>asystent AI · odpowiada na podstawie cennika i pomocy</span>
            </div>
            {!bezPytan && (
              <button type="button" className="asy-ikona" onClick={nowaRozmowa} aria-label="Zacznij nową rozmowę" title="Nowa rozmowa">
                <RotateCcw aria-hidden="true" />
              </button>
            )}
            <button type="button" className="asy-ikona" onClick={zamknij} aria-label="Zamknij asystenta">
              <X aria-hidden="true" />
            </button>
          </div>

          <div ref={lista} className="asy-msgs" role="log" aria-live="polite" aria-relevant="additions" aria-busy={busy}>
            <p className="asy-uwaga">{UWAGA_AI}</p>
            <div className="asy-b">
              <p>{POWITANIE}</p>
            </div>
            {wiadomosci.map((w, i) =>
              w.rola === 'ja' ? (
                <div key={i} className="asy-u">
                  <span className="asy-sr">Ty: </span>
                  {w.tresc}
                </div>
              ) : w.systemowa ? (
                <p key={i} className="asy-sys" role="status">
                  {w.tresc}
                </p>
              ) : (
                <div key={i} className="asy-b">
                  <span className="asy-sr">Asystent: </span>
                  {akapity(w.tresc).map((a, j) => (
                    <p key={j}>{a}</p>
                  ))}
                  {!!w.zrodla?.length && (
                    <ul className="asy-src" aria-label="Źródła odpowiedzi">
                      {w.zrodla.map((z) => (
                        <li key={z.id}>
                          {z.url ? (
                            <a href={z.url} target="_blank" rel="noopener">
                              {z.tytul}
                            </a>
                          ) : (
                            <span>{z.tytul}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ),
            )}
            {busy && (
              <div className="asy-pisze" role="status">
                <span className="asy-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                Asystent pisze…
              </div>
            )}
            {telefon && <KartaTelefonu rozmowaId={rozmowaId} />}
          </div>

          {bezPytan && (
            <div className="asy-chips">
              {PODPOWIEDZI.map((p) => (
                <button key={p} type="button" onClick={() => void wyslij(p)} disabled={busy}>
                  {p}
                </button>
              ))}
            </div>
          )}

          <form className="asy-wej" onSubmit={onSubmit}>
            <div className="asy-wej-r">
              <label htmlFor="asy-pytanie" className="asy-sr">
                Twoje pytanie
              </label>
              <textarea
                id="asy-pytanie"
                ref={pole}
                rows={1}
                maxLength={MAKS_ZNAKOW}
                placeholder="Napisz pytanie…"
                value={tekst}
                onChange={(e) => setTekst(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button type="submit" className="asy-wyslij" disabled={busy || !tekst.trim()} aria-label="Wyślij pytanie">
                <ArrowUp aria-hidden="true" />
              </button>
            </div>
            {tekst.length > MAKS_ZNAKOW - 200 && (
              <p className="asy-licznik">
                {tekst.length}/{MAKS_ZNAKOW}
              </p>
            )}
            {pokazCaptche && <Captcha key={captchaKlucz} action="asystent" />}
          </form>
          <p className="asy-note">
            {STOPKA_AI}{' '}
            <button type="button" onClick={() => setTelefon(true)}>
              Porozmawiaj z człowiekiem
            </button>
          </p>
        </div>
      )}
    </>
  );
}
