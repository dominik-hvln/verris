"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children on `document.body` so `position: fixed` modals are not
 * clipped by ancestor `overflow-hidden` containers (e.g. customer tables).
 * `onClose` — zamknięcie klawiszem Escape (WCAG 2.1.1).
 */
// `document` nie zmienia się w trakcie życia strony — nie ma czego subskrybować.
const subscribeNoop = () => () => {};

export function ModalPortal({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Serwer i hydratacja: `false` (brak `document`), potem klient: `true`.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  if (!mounted) return null;
  return createPortal(children, document.body);
}
