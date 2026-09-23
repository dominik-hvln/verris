"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children on `document.body` so `position: fixed` modals are not
 * clipped by ancestor `overflow-hidden` containers (e.g. customer tables).
 */
// `document` nie zmienia się w trakcie życia strony — nie ma czego subskrybować.
const subscribeNoop = () => () => {};

export function ModalPortal({ children }: { children: React.ReactNode }) {
  // Serwer i hydratacja: `false` (brak `document`), potem klient: `true`.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  if (!mounted) return null;
  return createPortal(children, document.body);
}
