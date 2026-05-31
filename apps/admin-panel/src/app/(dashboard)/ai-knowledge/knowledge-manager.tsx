"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  Archive,
  Check,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import type {
  AiKnowledgeAudience,
  AiKnowledgeDocSummaryDto,
} from "@verris/contracts";
import {
  createKnowledgeDoc,
  deleteKnowledgeDoc,
  listKnowledgeDocs,
  updateKnowledgeDoc,
} from "./data";

const AUDIENCE_LABEL: Record<AiKnowledgeAudience, string> = {
  CLIENT: "Klient",
  STAFF: "Zespół",
  ALL: "Wszyscy",
};

const AUDIENCE_STYLE: Record<AiKnowledgeAudience, string> = {
  CLIENT: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  STAFF: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  ALL: "bg-violet-500/10 text-violet-300 border-violet-500/30",
};

export function KnowledgeManager({
  initialDocs,
  embeddings,
}: {
  initialDocs: AiKnowledgeDocSummaryDto[];
  embeddings: boolean;
}) {
  const [docs, setDocs] = useState(initialDocs);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [audience, setAudience] = useState<AiKnowledgeAudience>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    try {
      setDocs(await listKnowledgeDocs());
    } catch {
      /* keep current list */
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setContent(text);
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const create = () => {
    setError(null);
    setOk(false);
    startTransition(async () => {
      const res = await createKnowledgeDoc({
        title,
        content,
        audience,
        sourceType: "TEXT",
      });
      if (res.data) {
        setOk(true);
        setTitle("");
        setContent("");
        await refresh();
      } else {
        setError(res.error ?? "Nie udało się zapisać dokumentu.");
      }
    });
  };

  const toggleArchive = (doc: AiKnowledgeDocSummaryDto) => {
    startTransition(async () => {
      await updateKnowledgeDoc(doc.id, {
        status: doc.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE",
      });
      await refresh();
    });
  };

  const remove = (doc: AiKnowledgeDocSummaryDto) => {
    if (!confirm(`Usunąć dokument „${doc.title}"? Tej operacji nie można cofnąć.`)) return;
    startTransition(async () => {
      await deleteKnowledgeDoc(doc.id);
      await refresh();
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* Create */}
      <div className="space-y-4 rounded-2xl border border-white/10 bg-black/40 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4 text-violet-300" /> Dodaj do pamięci AI
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            Tytuł
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="np. Jak skonfigurować rekordy DNS"
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-muted-foreground/50 focus:border-violet-400/50 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            Widoczność
          </span>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as AiKnowledgeAudience)}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-violet-400/50 focus:outline-none"
          >
            <option value="ALL">Wszyscy (klient + zespół)</option>
            <option value="CLIENT">Tylko chatbot klienta</option>
            <option value="STAFF">Tylko asystent zespołu</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>Treść</span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200"
            >
              <Upload className="h-3 w-3" /> Wczytaj plik (.txt/.md)
            </button>
          </span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            placeholder="Wklej treść dokumentu, FAQ, polityki lub instrukcji…"
            className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-muted-foreground/50 focus:border-violet-400/50 focus:outline-none"
          />
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {content.length.toLocaleString("pl-PL")} znaków ·{" "}
            {embeddings ? "indeksowanie wektorowe (embeddings)" : "wyszukiwanie po słowach kluczowych"}
          </span>
        </label>

        {error ? (
          <p className="flex items-center gap-1.5 text-sm text-rose-300">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        ) : null}
        {ok ? (
          <p className="flex items-center gap-1.5 text-sm text-emerald-300">
            <Check className="h-4 w-4" /> Dodano do bazy wiedzy.
          </p>
        ) : null}

        <button
          type="button"
          onClick={create}
          disabled={pending || !title.trim() || content.trim().length < 10}
          className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-400/20 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Dodaj dokument
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {docs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-base font-bold text-white">Pusta baza wiedzy</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Dodaj pierwszy dokument po lewej — asystent zacznie z niego korzystać od razu.
            </p>
          </div>
        ) : (
          docs.map((doc) => (
            <div
              key={doc.id}
              className={`rounded-2xl border bg-black/30 p-4 ${
                doc.status === "ARCHIVED" ? "border-white/5 opacity-60" : "border-white/10"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-white">{doc.title}</span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${AUDIENCE_STYLE[doc.audience]}`}
                    >
                      {AUDIENCE_LABEL[doc.audience]}
                    </span>
                    {doc.status === "ARCHIVED" ? (
                      <span className="shrink-0 rounded-full border border-neutral-500/30 bg-neutral-500/10 px-2 py-0.5 text-[10px] font-bold text-neutral-400">
                        Zarchiwizowany
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {doc.chunkCount} fragm. · {doc.charCount.toLocaleString("pl-PL")} znaków ·{" "}
                    {doc.createdByEmail ?? "—"} ·{" "}
                    {new Date(doc.createdAt).toLocaleDateString("pl-PL")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleArchive(doc)}
                    disabled={pending}
                    title={doc.status === "ACTIVE" ? "Archiwizuj" : "Przywróć"}
                    className="rounded-lg border border-white/10 p-1.5 text-neutral-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    {doc.status === "ACTIVE" ? (
                      <Archive className="h-3.5 w-3.5" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(doc)}
                    disabled={pending}
                    title="Usuń"
                    className="rounded-lg border border-rose-500/20 p-1.5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
