"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { approveServer } from "../actions";

export function ApproveServerButton({ serverId }: { serverId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await approveServer(serverId);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 px-4 py-2 text-sm font-medium transition-colors shadow-[0_0_20px_rgba(16,185,129,0.4)]"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {isPending ? "Akceptacja..." : "Zaakceptuj węzeł"}
      </button>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
