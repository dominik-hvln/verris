import Link from "next/link";
import { KARTA } from "@/components/v2";

/**
 * 10.10 (Dominik nie mógł znaleźć ponownego Onboard LIVE — był tylko w kreatorze) — wszystkie działania
 * na węźle w jednym miejscu, na Przeglądzie karty węzła. Każda pozycja: co robi (jedno zdanie) i link
 * do miejsca, gdzie się ją uruchamia. Lista jest zwykłymi linkami — nic tu się nie wykonuje.
 */
export interface DzialanieWezla {
  nazwa: string;
  opis: string;
  href: string;
}

export function dzialaniaWezla(baza: string, opts: { dziala: boolean; instalacja: boolean }): DzialanieWezla[] {
  const lista: DzialanieWezla[] = [];
  if (opts.instalacja) {
    lista.push({ nazwa: "Instalacja węzła", opis: "Skrypt instalacyjny i akceptacja nowego węzła.", href: `${baza}#bootstrap` });
  }
  if (opts.dziala) {
    lista.push(
      {
        nazwa: "Odśwież skrypty i zabezpieczenia (Onboard LIVE)",
        opis: "Wgrywa aktualne skrypty Verris (worker migracji, guard, agent), hardening i blokadę ruchu wychodzącego. Po deployu zmian w skryptach węzła.",
        href: `${baza}?sekcja=aktualizacje#onboard-live`,
      },
      {
        nazwa: "Aktualizuj stos serwera",
        opis: "DirectAdmin, CloudLinux, LiteSpeed do najnowszych stabilnych wersji.",
        href: `${baza}?sekcja=aktualizacje#stos`,
      },
      { nazwa: "Profil hostingu", opis: "Poczta, FTP, bazy, CageFS, PHP i strony błędów — ponowne zastosowanie ustawień.", href: `${baza}?sekcja=aktualizacje#profil` },
      { nazwa: "Audyt i naprawa", opis: "Sprawdzenie zgodności węzła i naprawa wykrytych różnic.", href: `${baza}?sekcja=audyt` },
      { nazwa: "Nowe konta, nadsubskrypcja, limity", opis: "Czy węzeł przyjmuje konta i ile zasobów może sprzedać.", href: `${baza}?sekcja=konfiguracja#pojemnosc` },
      { nazwa: "Tryb serwisowy", opis: "Wstrzymanie węzła na czas prac.", href: `${baza}?sekcja=konfiguracja#serwis` },
      { nazwa: "Wycofanie węzła", opis: "Przeniesienie kont na inne węzły.", href: `${baza}?sekcja=wycofanie` },
    );
  }
  lista.push({ nazwa: "Historia zadań", opis: "Co agent wykonał na węźle i z jakim wynikiem.", href: `${baza}?sekcja=zadania` });
  return lista;
}

export function DzialaniaWezla({ baza, dziala, instalacja }: { baza: string; dziala: boolean; instalacja: boolean }) {
  const lista = dzialaniaWezla(baza, { dziala, instalacja });
  return (
    <section className={`${KARTA} flex flex-col gap-1 p-5`} aria-labelledby="dzialania-wezla">
      <h2 id="dzialania-wezla" className="font-display text-[17px] font-bold">
        Działania
      </h2>
      <ul className="m-0 grid list-none gap-x-6 gap-y-2 p-0 sm:grid-cols-2">
        {lista.map((d) => (
          <li key={d.nazwa} className="flex flex-col">
            <Link href={d.href} className="text-sm font-semibold text-foreground underline-offset-2 hover:underline">
              {d.nazwa} →
            </Link>
            <span className="text-xs text-muted-foreground">{d.opis}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
