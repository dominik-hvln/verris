"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";
import { adminLogout } from "@/lib/auth-actions";

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => adminLogout())}
      disabled={isPending}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
      title="Wyloguj ze strefy ROOT"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}
