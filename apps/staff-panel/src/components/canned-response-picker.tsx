"use client";

import { useEffect, useMemo, useState } from "react";
import { BookText, Copy, Check, CornerDownLeft, Search, X } from "lucide-react";
import type { CannedResponseRow } from "@/lib/ticket-actions";

export interface TemplateVars {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  company?: string | null;
  shortId: string;
  subject?: string | null;
}

/** Podstawia zmienne {{imie}}, {{nazwisko}}, {{email}}, {{firma}}, {{nr}}, {{temat}}. */
export function applyTemplateVars(text: string, v: TemplateVars): string {
  const map: Record<string, string> = {
    imie: v.firstName ?? "",
    nazwisko: v.lastName ?? "",
    email: v.email ?? "",
    firma: v.company ?? "",
    nr: v.shortId,
    temat: v.subject ?? "",
  };
  return text.replace(/\{\{\s*([a-ząćęłńóśźż]+)\s*\}\}/gi, (m, key: string) => {
    const k = key.toLowerCase();
    return k in map ? map[k] : m;
  });
}

export function CannedResponsePicker({
  canned,
  vars,
  onInsert,
}: {
  canned: CannedResponseRow[];
  vars: TemplateVars;
  onInsert: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return canned;
    return canned.filter((c) =>
      [c.title, c.content, c.topic ?? "", c.shortcut ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [canned, query]);

  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;
  const preview = selected ? applyTemplateVars(selected.content, vars) : "";

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCopied(false);
      setSelectedId(null);
    }
  }, [open]);

  // Zamknięcie na Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function copyPreview() {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* schowek może być niedostępny (http) — ignorujemy */
    }
  }

  function insert() {
    if (!selected) return;
    onInsert(preview);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium text-white hover:border-cyan-500/40 hover:bg-white/5"
        title="Baza odpowiedzi (szablony)"
      >
        <BookText className="h-3.5 w-3.5" />
        Baza odpowiedzi
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <h3 className="text-sm font-semibold text-white">Baza odpowiedzi</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
                aria-label="Zamknij"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-white/10 px-5 py-3">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <Search className="h-4 w-4 text-neutral-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Szukaj po tytule, treści lub skrócie…"
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-neutral-500"
                />
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
              <ul className="min-h-0 overflow-y-auto border-r border-white/10">
                {filtered.length === 0 ? (
                  <li className="px-5 py-6 text-sm text-neutral-500">Brak pasujących szablonów.</li>
                ) : (
                  filtered.map((c) => {
                    const active = selected?.id === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(c.id)}
                          onDoubleClick={insert}
                          className={`block w-full border-b border-white/5 px-5 py-3 text-left ${
                            active ? "bg-cyan-500/10" : "hover:bg-white/5"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {c.topic ? (
                              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-neutral-300">
                                {c.topic}
                              </span>
                            ) : null}
                            <span className="text-sm font-medium text-white">{c.title}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{c.content}</p>
                          {c.shortcut ? (
                            <span className="mt-1 inline-block font-mono text-[10px] text-cyan-300/80">
                              /{c.shortcut}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>

              <div className="flex min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {selected ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-100">{preview}</pre>
                  ) : (
                    <p className="text-sm text-neutral-500">Wybierz szablon z listy, aby zobaczyć podgląd.</p>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
                  <button
                    type="button"
                    disabled={!selected}
                    onClick={copyPreview}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white hover:bg-white/5 disabled:opacity-40"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Skopiowano" : "Kopiuj"}
                  </button>
                  <button
                    type="button"
                    disabled={!selected}
                    onClick={insert}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-40"
                  >
                    <CornerDownLeft className="h-3.5 w-3.5" />
                    Wstaw do odpowiedzi
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
