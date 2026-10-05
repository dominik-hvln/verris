'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bot, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import type { AiChatMessageDto, AiChatSourceDto } from '@verris/contracts';
import {
  askHostingAssistantAction as askHostingAssistantActionAkcja,
  fetchAiStatusAction,
} from '@/app/dashboard/assistant-actions';
import { zOdpakowaniem } from '@/lib/wynik-akcji';

// Akcja zwraca Wynik (komunikat błędu przeżywa produkcję) — tu z powrotem dane albo Error z treścią.
const askHostingAssistantAction = zOdpakowaniem(askHostingAssistantActionAkcja);

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: AiChatSourceDto[];
}

const SUGGESTIONS = [
  'Jak podłączyć domenę do hostingu?',
  'Jak włączyć certyfikat SSL?',
  'Jak działa autoskalowanie i ile kosztuje?',
  'Jak przywrócić kopię zapasową?',
];

const GREETING: ChatMessage = {
  role: 'assistant',
  content:
    'Cześć! Jestem asystentem Verris. Zapytaj o domeny, SSL, pocztę, bazy danych, kopie zapasowe czy rozliczenia — odpowiem na podstawie bazy wiedzy i danych Twoich usług.',
};

export default function HostingAssistant() {
  // PB-17 — na stronie usługi czat dostaje jej kontekst (dysk, SSL, domena, kopie).
  const subscriptionId = /\/dashboard\/services\/([0-9a-f-]{36})/i.exec(usePathname() ?? '')?.[1] ?? null;
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const status = await fetchAiStatusAction();
      setAvailable(Boolean(status?.configured));
    })();
  }, []);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, loading]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;
    const history: AiChatMessageDto[] = messages
      .filter((m) => m !== GREETING)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    setLoading(true);
    try {
      const res = await askHostingAssistantAction({ question, history, subscriptionId });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.answer, sources: res.sources },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            e instanceof Error
              ? `Przepraszam, wystąpił błąd: ${e.message}`
              : 'Przepraszam, nie udało się uzyskać odpowiedzi.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (available === false) return null;

  // Wygląd z tokenów panelu (card/line/primary) — działa w motywie jasnym i ciemnym, jak paleta poleceń.
  return (
    <>
      {!open ? (
        <button
          type="button"
          aria-label="Otwórz asystenta Verris"
          onClick={() => setOpen(true)}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,1rem))] right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-line-strong bg-card text-foreground shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)] transition-colors hover:bg-raised sm:bottom-6 sm:right-6"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      ) : (
        <div
          role="dialog"
          aria-label="Asystent Verris"
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,1rem))] right-4 z-50 flex h-[min(560px,80dvh)] max-h-[80dvh] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line-strong bg-card shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] sm:bottom-6 sm:right-6"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-raised text-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Asystent Verris</p>
                <p className="text-[11px] text-muted-foreground">Baza wiedzy i dane Twoich usług</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Zamknij"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-raised hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {/* AI Act art. 50 ust. 2 — treść AI oznaczona maszynowo (data-ai-generated); informacja dla człowieka jest pod polem pytania. */}
                <div
                  data-ai-generated={m.role === 'assistant' && m !== GREETING ? 'true' : undefined}
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                    m.role === 'user' ? 'bg-primary text-primary-foreground' : 'border border-line bg-raised text-foreground'
                  }`}
                >
                  {m.content}
                  {m.sources && m.sources.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
                      {m.sources.map((s) => (
                        <span key={s.docId} className="rounded-full border border-line bg-card px-2 py-0.5 text-[10.5px] text-muted-foreground">
                          {s.title}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-[13px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Asystent pisze…
                </div>
              </div>
            ) : null}

            {messages.length === 1 && !loading ? (
              <div className="space-y-2 pt-2">
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3" /> Przykładowe pytania:
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="block w-full rounded-md border border-line bg-card px-3 py-2 text-left text-[12.5px] text-foreground hover:border-line-strong hover:bg-raised"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="border-t border-line p-3"
          >
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Zadaj pytanie…"
                aria-describedby="asystent-ai-info"
                disabled={loading}
                className="min-w-0 flex-1 rounded-md border border-line bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-line-strong focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Wyślij"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            {/* AI Act art. 50 ust. 1 i 5 — informacja najpóźniej przy pierwszej interakcji: widoczna przy polu pytania od otwarcia okna. */}
            <p id="asystent-ai-info" className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
              Odpowiedzi tworzy AI i mogą zawierać błędy. Wiążące są Regulamin i odpowiedzi naszego zespołu.
            </p>
          </form>
        </div>
      )}
    </>
  );
}
