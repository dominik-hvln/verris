'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import type { AiChatMessageDto, AiChatSourceDto } from '@verris/contracts';
import {
  askHostingAssistantAction,
  fetchAiStatusAction,
} from '@/app/dashboard/assistant-actions';

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
    'Cześć! Jestem asystentem Verris. Zapytaj mnie o domeny, SSL, pocztę, bazy danych, kopie zapasowe czy rozliczenia — odpowiem na podstawie naszej bazy wiedzy.',
};

export default function HostingAssistant() {
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
      const res = await askHostingAssistantAction({ question, history });
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

  return (
    <>
      {!open ? (
        <button
          type="button"
          aria-label="Otwórz asystenta Verris"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-cyan-500/90 to-violet-600/90 text-white shadow-lg shadow-cyan-500/20 transition-transform hover:scale-105"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      ) : (
        <div className="fixed bottom-6 right-6 z-50 flex h-[560px] max-h-[80vh] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-cyan-500/10 to-violet-600/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Asystent Verris</p>
                <p className="text-[10px] text-neutral-400">Pomoc hostingowa 24/7</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Zamknij"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-cyan-500/15 text-cyan-50'
                      : 'bg-white/5 text-neutral-200'
                  }`}
                >
                  {m.content}
                  {m.sources && m.sources.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-white/10 pt-2">
                      {m.sources.map((s) => (
                        <span
                          key={s.docId}
                          className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-neutral-400"
                        >
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
                <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-[13px] text-neutral-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Asystent pisze…
                </div>
              </div>
            ) : null}

            {messages.length === 1 && !loading ? (
              <div className="space-y-2 pt-2">
                <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <Sparkles className="h-3 w-3" /> Przykładowe pytania:
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="block w-full rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-left text-[12px] text-neutral-300 hover:bg-white/5 hover:text-white"
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
            className="flex items-center gap-2 border-t border-white/10 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Zadaj pytanie…"
              disabled={loading}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-white placeholder:text-neutral-500 focus:border-cyan-400/40 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Wyślij"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/80 text-white hover:bg-cyan-500 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
