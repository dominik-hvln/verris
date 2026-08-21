"use client";

import { useRef, useState } from "react";
import { Bot, Loader2, Send } from "lucide-react";
import type { AiChatMessageDto } from "@verris/contracts";
import { askStaffAssistant } from "./data";

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: { docId: string; title: string }[];
}

export function StaffAssistant() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;
    const history: AiChatMessageDto[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((p) => [...p, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    try {
      const res = await askStaffAssistant({ question, history });
      setMessages((p) => [...p, { role: "assistant", content: res.answer, sources: res.sources }]);
    } catch (e) {
      setMessages((p) => [
        ...p,
        { role: "assistant", content: e instanceof Error ? e.message : "Błąd asystenta." },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <Bot className="h-4 w-4 text-cyan-300" /> Asystent zespołu (test bazy wiedzy)
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Zadaj pytanie tak, jak zrobiłby to klient lub pracownik — odpowiedź powstaje na podstawie
        dokumentów STAFF/ALL. Dobry sposób, by sprawdzić jakość świeżo dodanej wiedzy.
      </p>
      <div
        ref={scrollRef}
        className="mb-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-white/5 bg-black/30 p-3"
      >
        {messages.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Brak wiadomości — zadaj pytanie poniżej.</p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[12px] ${
                  m.role === "user" ? "bg-cyan-500/15 text-cyan-50" : "bg-white/5 text-neutral-200"
                }`}
              >
                {m.content}
                {m.sources && m.sources.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1 border-t border-white/10 pt-1.5">
                    {m.sources.map((s) => (
                      <span key={s.docId} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-neutral-400">
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
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Asystent pisze…
          </div>
        ) : null}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Zadaj pytanie do bazy wiedzy…"
          disabled={loading}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-muted-foreground/50 focus:border-cyan-400/40 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/80 text-white hover:bg-cyan-500 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
