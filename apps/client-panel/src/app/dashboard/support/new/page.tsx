"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Loader2, Send } from "lucide-react";
import { createTicketWithFiles, fetchKbSuggestions, type KbSuggestion } from "../actions";
import { toast } from "sonner";

const TOPICS = [
  { value: "HOSTING", label: "Hosting / strona" },
  { value: "DOMAIN", label: "Domena" },
  { value: "EMAIL", label: "Poczta e-mail" },
  { value: "DNS", label: "DNS" },
  { value: "SSL", label: "Certyfikat SSL" },
  { value: "BILLING", label: "Płatności / faktury" },
  { value: "OTHER", label: "Inne" },
];

export default function NewTicketPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState("");
  const [kb, setKb] = useState<KbSuggestion[]>([]);

  // SUP-1 — pobierz podpowiedzi KB gdy temat+tytuł dają sensowne zapytanie.
  useEffect(() => {
    const q = subject.trim();
    if (q.length < 3 && !topic) {
      setKb([]);
      return;
    }
    const handle = setTimeout(() => {
      void fetchKbSuggestions(q || topic, topic || undefined).then(setKb);
    }, 450);
    return () => clearTimeout(handle);
  }, [subject, topic]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const subject = (formData.get("subject") as string)?.trim() ?? "";
    const message = (formData.get("message") as string)?.trim() ?? "";

    if (subject.length < 3) {
      toast.error("Temat musi mieć co najmniej 3 znaki.");
      setIsSubmitting(false);
      return;
    }

    if (message.length < 10) {
      toast.error("Wiadomość musi mieć co najmniej 10 znaków.");
      setIsSubmitting(false);
      return;
    }

    const res = await createTicketWithFiles(formData);

    if (res.error) {
      toast.error(res.error);
      setIsSubmitting(false);
    } else {
      toast.success("Zgłoszenie zostało wysłane!");
      router.push("/dashboard/support");
      router.refresh();
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/support"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nowe zgłoszenie</h1>
          <p className="text-sm text-muted-foreground">
            Opisz swój problem, a my odpowiemy tak szybko, jak to możliwe.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
        <form onSubmit={onSubmit} className="space-y-5" encType="multipart/form-data">
          <div className="space-y-2">
            <label htmlFor="topic" className="text-sm font-medium">
              Czego dotyczy zgłoszenie?
            </label>
            <select
              id="topic"
              name="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">— wybierz temat —</option>
              {TOPICS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="subject" className="text-sm font-medium">
              Temat zgłoszenia <span className="text-red-500">*</span>
            </label>
            <input
              id="subject"
              name="subject"
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Np. Problem z logowaniem do poczty"
            />
          </div>

          {kb.length > 0 ? (
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.05] p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-200">
                <BookOpen className="h-4 w-4" /> Zanim wyślesz — może to pomoże:
              </p>
              <ul className="mt-2 space-y-2">
                {kb.map((s) => (
                  <li key={s.docId} className="text-sm">
                    <a
                      href={`/dashboard/knowledge?article=${encodeURIComponent(s.docId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-white underline-offset-2 hover:text-emerald-200 hover:underline"
                    >
                      {s.title} →
                    </a>
                    <span className="block text-xs text-neutral-400">{s.snippet}…</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-neutral-400">
                Jeśli to nie rozwiązuje sprawy — wyślij zgłoszenie poniżej.
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="message" className="text-sm font-medium">
              Treść wiadomości <span className="text-red-500">*</span>
            </label>
            <textarea
              id="message"
              name="message"
              required
              rows={8}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Podaj jak najwięcej szczegółów..."
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="files" className="text-sm font-medium">
              Załączniki <span className="text-muted-foreground font-normal">(opcjonalnie, do 5 plików × 8 MB)</span>
            </label>
            <input
              id="files"
              name="files"
              type="file"
              multiple
              className="flex w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <Link
              href="/dashboard/support"
              className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              Anuluj
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Wysyłanie...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Wyślij zgłoszenie
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
