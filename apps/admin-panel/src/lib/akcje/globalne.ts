/**
 * Działania globalne dla Cmd+K (propozycja 10.10, sekcja C2). Wybór prowadzi do strony z podświetlonym
 * miejscem — operacja uruchamia się tam, z potwierdzeniem. `perm` jak w API: „ADMIN” — tylko administrator.
 */
export interface AkcjaGlobalna {
  id: string;
  nazwa: string;
  opis: string;
  perm: "ADMIN" | "NODES_MANAGE" | "BILLING_MANAGE" | "MIGRATIONS_MANAGE";
  href: string;
  slowa: string;
}

export const AKCJE_GLOBALNE: AkcjaGlobalna[] = [
  // POST /admin/servers — @Roles(ADMIN) klasy servers.admin.controller.ts.
  { id: "dodaj-wezel", nazwa: "Dodaj węzeł", opis: "Kreator nowego węzła.", perm: "ADMIN", href: "/nodes/wizard", slowa: "nowy węzeł serwer kreator instalacja" },
  // POST /admin/servers/fleet-update — NODES_MANAGE.
  { id: "aktualizuj-flote", nazwa: "Aktualizuj flotę", opis: "Fala aktualizacji stosu na wszystkich węzłach.", perm: "NODES_MANAGE", href: "/nodes#aktualizuj-flote", slowa: "fleet update stos wszystkie węzły" },
  // POST /admin/invoices/reczna — BILLING_MANAGE.
  { id: "faktura-reczna", nazwa: "Faktura ręczna", opis: "Wystawienie faktury poza automatem.", perm: "BILLING_MANAGE", href: "/invoices/reczna", slowa: "wystaw fakturę nowa" },
  // POST /staff/migrations/za-klienta — MIGRATIONS_MANAGE.
  { id: "migracja-za-klienta", nazwa: "Migracja za klienta", opis: "Przygotowanie migracji do zgody klienta.", perm: "MIGRATIONS_MANAGE", href: "/migrations/za-klienta", slowa: "przeniesienie strony zgoda" },
];
