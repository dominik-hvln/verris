"use client";

import { useState, useTransition } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { publishLegalDocAction } from "./actions";

const KINDS = [
  { value: "TERMS", label: "Regulamin" },
  { value: "PRIVACY", label: "Polityka prywatności" },
  { value: "COOKIES", label: "Polityka cookies" },
  { value: "DPA", label: "DPA" },
] as const;

export function PublishDocForm() {
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("TERMS");
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [changelogMarkdown, setChangelogMarkdown] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!version || !title || !contentMarkdown) {
      setFeedback({ ok: false, msg: "Uzupełnij wersję, tytuł i treść." });
      return;
    }
    startTransition(async () => {
      const result = await publishLegalDocAction({
        kind,
        version,
        title,
        contentMarkdown,
        changelogMarkdown: changelogMarkdown || undefined,
      });
      if (result.ok) {
        setFeedback({
          ok: true,
          msg: `Opublikowano ${result.published.kind} v${result.published.version}. Wszyscy aktywni użytkownicy zostaną poproszeni o ponowną akceptację przy najbliższej akcji w panelu.`,
        });
        setVersion("");
        setTitle("");
        setContentMarkdown("");
        setChangelogMarkdown("");
      } else {
        setFeedback({ ok: false, msg: result.error });
      }
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4"
    >
      <header>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-indigo-400" />
          Opublikuj nową wersję dokumentu
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Po publikacji nowa wersja stanie się <code>isCurrent=true</code> i wymusi re-consent na
          wszystkich klientach. Wersję podawaj w formacie semver (np. <code>1.0.0</code>,{" "}
          <code>1.1.0</code>).
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-muted-foreground text-xs uppercase tracking-wider">Rodzaj</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof KINDS)[number]["value"])}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value} className="bg-black">
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-1">
          <span className="text-muted-foreground text-xs uppercase tracking-wider">Wersja (semver)</span>
          <input
            type="text"
            placeholder="1.0.0"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-white"
          />
        </label>
        <label className="block text-sm sm:col-span-1">
          <span className="text-muted-foreground text-xs uppercase tracking-wider">Tytuł</span>
          <input
            type="text"
            placeholder="Regulamin świadczenia usług hostingowych Verris"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-muted-foreground text-xs uppercase tracking-wider">
          Treść (Markdown — bez HTML, min. 200 znaków)
        </span>
        <textarea
          value={contentMarkdown}
          onChange={(e) => setContentMarkdown(e.target.value)}
          rows={14}
          placeholder="# Regulamin&#10;## §1 Definicje&#10;..."
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-white"
        />
      </label>

      <label className="block text-sm">
        <span className="text-muted-foreground text-xs uppercase tracking-wider">
          Co się zmieniło (Markdown, opcjonalnie)
        </span>
        <textarea
          value={changelogMarkdown}
          onChange={(e) => setChangelogMarkdown(e.target.value)}
          rows={4}
          placeholder="- Dodano sekcję o subprocessor'ach&#10;- Zaktualizowano kontakt RODO"
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-white"
        />
      </label>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-sm ${
            feedback.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Opublikuj wersję
        </button>
      </div>
    </form>
  );
}
