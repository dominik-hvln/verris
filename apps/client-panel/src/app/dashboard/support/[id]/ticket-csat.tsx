"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Star } from "lucide-react";
import { submitCsatAction } from "../actions";

/** SUP-4 — gwiazdkowa ocena wsparcia po zamknięciu zgłoszenia. */
export function TicketCsat({
  ticketId,
  existingRating,
}: {
  ticketId: string;
  existingRating?: number | null;
}) {
  const router = useRouter();
  const [hover, setHover] = useState(0);
  const [rating, setRating] = useState(existingRating ?? 0);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  if (existingRating) {
    return (
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4">
        <p className="text-sm text-emerald-200">
          Dziękujemy za ocenę:{" "}
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`inline h-4 w-4 ${i < existingRating ? "fill-amber-400 text-amber-400" : "text-neutral-600"}`}
            />
          ))}
        </p>
      </div>
    );
  }

  const submit = () => {
    if (rating < 1) {
      toast.error("Wybierz ocenę (1-5 gwiazdek).");
      return;
    }
    startTransition(async () => {
      const res = await submitCsatAction(ticketId, rating, comment.trim() || undefined);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Dziękujemy za ocenę wsparcia!");
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <p className="text-sm font-semibold text-white">Jak oceniasz nasze wsparcie?</p>
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => {
          const v = i + 1;
          const filled = (hover || rating) >= v;
          return (
            <button
              key={v}
              type="button"
              onMouseEnter={() => setHover(v)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(v)}
              className="p-1"
              aria-label={`${v} gwiazdek`}
            >
              <Star className={`h-6 w-6 transition-colors ${filled ? "fill-amber-400 text-amber-400" : "text-neutral-600"}`} />
            </button>
          );
        })}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Komentarz (opcjonalnie)"
        rows={2}
        className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-600 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Wyślij ocenę
      </button>
    </div>
  );
}
