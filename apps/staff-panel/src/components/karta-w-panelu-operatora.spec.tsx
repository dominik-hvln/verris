import { renderToStaticMarkup } from "react-dom/server";
import { KartaWPaneluOperatora } from "./karta-w-panelu-operatora";
import { adresPaneluOperatora, kartaKlientaOperatora, kartaUslugiOperatora } from "@/lib/panel-operatora";

/** D1 (10.10) — karty klienta i usługi w panelu obsługi prowadzą do kart w panelu operatora i są oznaczone jako przestarzałe. */
describe("D1 — link do panelu operatora", () => {
  it("adres z ADMIN_PANEL_URL (bez końcowego ukośnika), domyślnie https://admin.verris.pl", () => {
    expect(adresPaneluOperatora({})).toBe("https://admin.verris.pl");
    expect(adresPaneluOperatora({ ADMIN_PANEL_URL: " https://admin.test/ " })).toBe("https://admin.test");
    expect(kartaKlientaOperatora("u 1", { ADMIN_PANEL_URL: "https://admin.test" })).toBe("https://admin.test/customers/u%201");
    expect(kartaUslugiOperatora("s1", {})).toBe("https://admin.verris.pl/subscriptions/s1");
  });

  it("baner: przestarzała karta + „Otwórz w panelu operatora” w nowej karcie", () => {
    const html = renderToStaticMarkup(<KartaWPaneluOperatora href="https://admin.verris.pl/customers/u1" co="klienta" />);
    expect(html).toContain("data-karta-przestarzala");
    expect(html).toContain("Ta karta jest przestarzała.");
    expect(html).toContain('href="https://admin.verris.pl/customers/u1"');
    expect(html).toContain("Otwórz w panelu operatora");
    expect(html).toContain('target="_blank"');
  });
});
