"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import type { AiChatMessageDto, KontekstAsystentaDto } from "@verris/contracts";
import { zapytajAsystenta } from "./asystent-actions";

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: { docId: string; title: string }[];
}

/**
 * Czat z asystentem pracowników (RAG po dokumentach STAFF/ALL) — w pływającym oknie AdminShell i na stronie
 * „Baza wiedzy AI”. `start` wysyła gotowe pytanie (z „Zapytaj asystenta” pod „?”); `nr` odróżnia kolejne.
 */
export function StaffAssistant({
  kontekst,
  start,
}: {
  kontekst?: KontekstAsystentaDto;
  start?: { pytanie: string; nr: number } | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wyslane = useRef<number | null>(null);

  const send = async (tekst: string) => {
    const question = tekst.trim();
    if (!question) return;
    const history: AiChatMessageDto[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((p) => [...p, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    try {
      const res = await zapytajAsystenta({ question, history, kontekst });
      setMessages((p) => [...p, { role: "assistant", content: res.answer, sources: res.sources }]);
    } catch {
      // Sama akcja serwera nie doszła (sieć, nowe wdrożenie) — bez tego czat zostaje zablokowany na „pisze…”.
      setMessages((p) => [...p, { role: "assistant", content: "Asystent nie odpowiedział — spróbuj ponownie." }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!start || wyslane.current === start.nr) return;
    wyslane.current = start.nr;
    void send(start.pytanie);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tylko nowe pytanie z „?”, nie zmiana kontekstu
  }, [start]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div ref={scrollRef} className="min-h-[8rem] flex-1 space-y-2 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Zapytaj, jak coś zrobić w panelu.</p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                data-ai-generated={m.role === "assistant" ? "true" : undefined}
                className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "border border-line bg-raised text-foreground"
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
          ))
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Asystent pisze…
          </div>
        ) : null}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading) void send(input);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Zadaj pytanie…"
          aria-label="Pytanie do asystenta"
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
      </form>
      <p className="m-0 text-[10.5px] leading-snug text-muted-foreground">Odpowiedzi tworzy AI na podstawie bazy wiedzy — mogą zawierać błędy.</p>
    </div>
  );
}
