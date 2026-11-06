'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUp, RotateCcw, X } from 'lucide-react';
import type { AiChatMessageDto, AiChatSourceDto } from '@verris/contracts/klient';
import {
  askHostingAssistantAction as askHostingAssistantActionAkcja,
  fetchAiStatusAction,
} from '@/app/dashboard/assistant-actions';
import { zOdpakowaniem } from '@/lib/wynik-akcji';
import { AsystentAvatar, type StanAvatara } from './asystent-avatar';

// Akcja zwraca Wynik (komunikat błędu przeżywa produkcję) — tu z powrotem dane albo Error z treścią.
const askHostingAssistantAction = zOdpakowaniem(askHostingAssistantActionAkcja);

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: AiChatSourceDto[];
  /** Błąd albo asystent niedostępny — inny wygląd, nie trafia do historii, pod nim karta „Napisz do zespołu”. */
  systemowa?: boolean;
}

export const SUGGESTIONS = [
  'Jak podłączyć domenę do hostingu?',
  'Jak włączyć certyfikat SSL?',
  'Jak działa autoskalowanie i ile kosztuje?',
  'Jak przywrócić kopię zapasową?',
];

export const POWITANIE =
  'Cześć! Jestem asystentem Verris. Zapytaj o domeny, SSL, pocztę, bazy danych, kopie zapasowe czy rozliczenia – odpowiem na podstawie bazy wiedzy i danych Twoich usług.';
/** AI Act art. 50 ust. 1 i 5 — informacja najpóźniej przy pierwszej interakcji: pierwsza linia okna (jak UWAGA_AI na www). */
export const UWAGA_AI = 'Rozmawiasz z asystentem AI. Nie podawaj haseł ani danych do płatności.';
export const STOPKA_AI = 'Odpowiedzi mogą zawierać błędy. Wiążące są Regulamin i odpowiedzi naszego zespołu.';
export const NOWE_ZGLOSZENIE = '/dashboard/support/new';
/** Limit pytania z API (AiChatRequestDto.question). */
const MAKS_ZNAKOW = 2000;
const ODPOWIADA_MS = 2400;

/** Akapity odpowiedzi (model pisze zwykły tekst; pusta linia = nowy akapit). */
function akapity(t: string): string[] {
  return t
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Na telefonie okno zakrywa ekran — po kliknięciu linku zamykamy je, żeby było widać stronę, na którą prowadzi. */
function pelnyEkran(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639px)').matches;
}

/**
 * Asystent w panelu klienta — układ asystenta z verris.pl (makieta 1.11; www: AsystentWidget), kolory z tokenów panelu,
 * więc działa w motywie jasnym i ciemnym (`v2-motyw-tresci` w globals.css — komponent stoi poza kolumną treści).
 * Przycisk 48 px w prawym dolnym rogu (pigułka „Zgłoś uwagę” stoi 3.75rem nad nim, z-40 < z-50 okna); okno 420 px na
 * komputerze, pełny ekran na telefonie. Na stronie usługi czat dostaje jej kontekst (PB-17). Przy błędzie albo
 * niedostępności — zamiast „Poproś o telefon” z www — link do nowego zgłoszenia (gdy konto może je zakładać).
 */
export default function HostingAssistant({ mozeZglaszac = false }: { mozeZglaszac?: boolean }) {
  const subscriptionId = /\/dashboard\/services\/([0-9a-f-]{36})/i.exec(usePathname() ?? '')?.[1] ?? null;
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatar, setAvatar] = useState<StanAvatara>('czeka');
  const [przekaz, setPrzekaz] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const pole = useRef<HTMLTextAreaElement>(null);
  const timerAvatara = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      const status = await fetchAiStatusAction();
      setAvailable(Boolean(status?.configured));
    })();
    return () => {
      if (timerAvatara.current) clearTimeout(timerAvatara.current);
    };
  }, []);

  useEffect(() => {
    if (open) pole.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, loading, przekaz]);

  const zamknij = useCallback(() => {
    setOpen(false);
    // Fokus wraca na przycisk, który otworzył okno.
    setTimeout(() => fab.current?.focus(), 0);
  }, []);

  /** Esc zamyka; Tab krąży w oknie (aria-modal). Nasłuch na dokumencie, póki okno jest otwarte. */
  useEffect(() => {
    if (!open) return;
    const klawisze = (e: KeyboardEvent) => {
      const p = panel.current;
      if (!p) return;
      if (e.key === 'Escape') {
        zamknij();
        return;
      }
      if (e.key !== 'Tab') return;
      const el = [
        ...p.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea,input:not([disabled]),[tabindex]:not([tabindex="-1"])'),
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
  }, [open, zamknij]);

  const poLinku = () => {
    if (pelnyEkran()) setOpen(false);
  };

  const nowaRozmowa = () => {
    setMessages([]);
    setPrzekaz(false);
    setAvatar('czeka');
    pole.current?.focus();
  };

  const send = async (text: string) => {
    const question = text.trim().slice(0, MAKS_ZNAKOW);
    if (!question || loading) return;
    const history: AiChatMessageDto[] = messages
      .filter((m) => !m.systemowa)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    setLoading(true);
    setAvatar('szuka');
    try {
      const res = await askHostingAssistantAction({ question, history, subscriptionId });
      if (res.available === false) {
        // Limit miesięczny / brak dostawcy — komunikat API, nie odpowiedź modelu.
        setMessages((prev) => [...prev, { role: 'assistant', content: res.answer, systemowa: true }]);
        setPrzekaz(true);
        setAvatar('czeka');
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.answer, sources: res.sources }]);
        setAvatar('odpowiada');
        if (timerAvatara.current) clearTimeout(timerAvatara.current);
        timerAvatara.current = setTimeout(() => setAvatar('czeka'), ODPOWIADA_MS);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          systemowa: true,
          content:
            e instanceof Error && e.message
              ? `Przepraszam, wystąpił błąd: ${e.message}`
              : 'Przepraszam, nie udało się uzyskać odpowiedzi.',
        },
      ]);
      setPrzekaz(true);
      setAvatar('czeka');
    } finally {
      setLoading(false);
    }
  };

  if (available === false) return null;

  const bezPytan = !messages.some((m) => m.role === 'user');

  return (
    <>
      {!open ? (
        <button
          ref={fab}
          type="button"
          aria-haspopup="dialog"
          aria-label="Masz pytanie? Otwórz asystenta AI"
          onClick={() => setOpen(true)}
          className="v2-motyw-tresci fixed bottom-[max(1rem,env(safe-area-inset-bottom,1rem))] right-4 z-50 inline-flex h-12 w-12 items-center justify-center gap-2.5 rounded-full border border-line-strong bg-card p-1.5 text-left text-foreground shadow-[0_14px_34px_-14px_rgba(0,0,0,0.55)] transition-colors hover:border-data sm:bottom-6 sm:right-6 sm:w-auto sm:justify-start sm:pr-4"
        >
          <AsystentAvatar stan="czeka" rozmiar={34} />
          <span className="sr-only grid leading-tight sm:not-sr-only">
            <b className="text-[14px] font-semibold">Masz pytanie?</b>
            <small className="text-[11.5px] text-muted-foreground">Odpowiem w kilka sekund</small>
          </span>
        </button>
      ) : (
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="asystent-tytul"
          className="v2-motyw-tresci fixed inset-0 z-50 flex flex-col overflow-hidden bg-card pb-[env(safe-area-inset-bottom,0px)] text-[14.5px] leading-[1.55] text-foreground sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(760px,calc(100dvh-3rem))] sm:w-[420px] sm:max-w-[calc(100vw-3rem)] sm:rounded-[20px] sm:border sm:border-line-strong sm:pb-0 sm:shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-center gap-3 border-b border-line py-3.5 pl-4 pr-3">
            <AsystentAvatar stan={avatar} rozmiar={40} />
            <div className="grid min-w-0 flex-1 leading-snug">
              <h2 id="asystent-tytul" className="m-0 text-base font-semibold tracking-[-0.01em] text-foreground">
                Asystent Verris
              </h2>
              <span className="text-xs text-muted-foreground">asystent AI · baza wiedzy i dane Twoich usług</span>
            </div>
            {!bezPytan ? (
              <button
                type="button"
                onClick={nowaRozmowa}
                aria-label="Zacznij nową rozmowę"
                title="Nowa rozmowa"
                className="grid h-10 w-10 place-items-center rounded-[10px] text-muted-foreground hover:bg-raised hover:text-foreground"
              >
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={zamknij}
              aria-label="Zamknij asystenta"
              className="grid h-10 w-10 place-items-center rounded-[10px] text-muted-foreground hover:bg-raised hover:text-foreground"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div
            ref={scrollRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-busy={loading}
            className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4"
          >
            <p id="asystent-ai-info" className="m-0 px-2 py-0.5 text-center text-xs text-muted-foreground">
              {UWAGA_AI}
            </p>
            {/* Powitanie to tekst panelu, nie odpowiedź modelu — bez data-ai-generated. */}
            <div className="grid max-w-[90%] gap-2 self-start rounded-[16px_16px_16px_4px] border border-line bg-raised px-3.5 py-3 text-foreground [overflow-wrap:anywhere]">
              <p className="m-0">{POWITANIE}</p>
            </div>
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div
                  key={i}
                  className="max-w-[82%] self-end whitespace-pre-wrap rounded-[16px_16px_4px_16px] bg-primary px-3.5 py-2.5 text-primary-foreground [overflow-wrap:anywhere]"
                >
                  <span className="sr-only">Ty: </span>
                  {m.content}
                </div>
              ) : m.systemowa ? (
                <p key={i} role="status" className="m-0 self-stretch rounded-[12px] border border-warn/25 bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
                  {m.content}
                </p>
              ) : (
                // AI Act art. 50 ust. 2 — treść AI oznaczona maszynowo (data-ai-generated).
                <div
                  key={i}
                  data-ai-generated="true"
                  className="grid max-w-[90%] gap-2 self-start rounded-[16px_16px_16px_4px] border border-line bg-raised px-3.5 py-3 text-foreground [overflow-wrap:anywhere]"
                >
                  <span className="sr-only">Asystent: </span>
                  {akapity(m.content).map((a, j) => (
                    <p key={j} className="m-0 whitespace-pre-wrap">
                      {a}
                    </p>
                  ))}
                  {m.sources && m.sources.length > 0 ? (
                    <ul aria-label="Źródła odpowiedzi" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                      {m.sources.map((s) => {
                        const chip =
                          'inline-block rounded-md border border-data/30 bg-background px-2 py-1 font-mono text-[11.5px] font-medium leading-snug text-data-hi no-underline';
                        return (
                          <li key={s.docId}>
                            {s.slug ? (
                              <Link
                                href={`/dashboard/knowledge?article=${encodeURIComponent(s.slug)}`}
                                onClick={poLinku}
                                className={`${chip} hover:border-data`}
                              >
                                {s.title}
                              </Link>
                            ) : (
                              <span className={chip}>{s.title}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              ),
            )}
            {loading ? (
              <div role="status" className="flex items-center gap-2 self-start text-[13px] text-muted-foreground">
                <span aria-hidden="true" className="inline-flex">
                  {['', '[animation-delay:.15s]', '[animation-delay:.3s]'].map((d) => (
                    <i
                      key={d || '0'}
                      className={`mr-1 inline-block h-1.5 w-1.5 animate-[asy-dot_1.2s_infinite] rounded-full bg-data motion-reduce:animate-none ${d}`}
                    />
                  ))}
                </span>
                Asystent pisze…
              </div>
            ) : null}
            {przekaz && mozeZglaszac ? (
              <div className="grid gap-2.5 self-stretch rounded-[14px] border border-data/35 bg-card p-3.5">
                <h3 className="m-0 text-[15px] font-semibold text-foreground">Napisz do zespołu</h3>
                <p className="m-0 text-[13px] text-muted-foreground">
                  Załóż zgłoszenie – odpowiemy w nim, a historia zostanie w panelu.
                </p>
                <Link
                  href={NOWE_ZGLOSZENIE}
                  onClick={poLinku}
                  className="inline-flex w-fit items-center rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
                >
                  Nowe zgłoszenie
                </Link>
              </div>
            ) : null}
          </div>

          {bezPytan ? (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  disabled={loading}
                  className="rounded-full border border-line-strong px-3 py-[7px] text-left text-[13px] text-foreground hover:border-data disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="grid gap-1.5 border-t border-line px-4 pb-1.5 pt-3"
          >
            <div className="flex items-end gap-2">
              <label htmlFor="asystent-pytanie" className="sr-only">
                Twoje pytanie
              </label>
              <textarea
                id="asystent-pytanie"
                ref={pole}
                rows={1}
                maxLength={MAKS_ZNAKOW}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Napisz pytanie…"
                aria-describedby="asystent-ai-info"
                className="max-h-[140px] min-h-[42px] min-w-0 flex-1 resize-none rounded-[12px] border border-line-strong bg-background px-3 py-2.5 text-[14.5px] leading-[1.45] text-foreground placeholder:text-muted-foreground focus:border-data focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Wyślij pytanie"
                className="grid h-[42px] w-[42px] flex-none place-items-center rounded-[12px] bg-primary text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ArrowUp className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </form>
          <p className="m-0 px-4 pb-3 text-[11.5px] text-muted-foreground">
            {STOPKA_AI}
            {mozeZglaszac ? (
              <>
                {' '}
                <Link href={NOWE_ZGLOSZENIE} onClick={poLinku} className="text-data-hi underline underline-offset-2">
                  Napisz do zespołu
                </Link>
              </>
            ) : null}
          </p>
        </div>
      )}
    </>
  );
}
