/**
 * @jest-environment jsdom
 */
import { podswietlKotwice } from "./podswietl";

const czekaj = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("podświetlenie kotwicy po wyborze w Cmd+K", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("czeka na element na stronie docelowej, podświetla i zdejmuje podświetlenie", async () => {
    window.history.pushState({}, "", "/nodes/n1?sekcja=aktualizacje");
    podswietlKotwice("/nodes/n1?sekcja=aktualizacje#onboard-live", { czasMs: 200 });
    await czekaj(120);
    const el = document.createElement("section");
    el.id = "onboard-live";
    document.body.appendChild(el);
    await czekaj(150);
    expect(el.hasAttribute("data-podswietl")).toBe(true);
    await czekaj(250);
    expect(el.hasAttribute("data-podswietl")).toBe(false);
  });

  it("nie podświetla elementu z innej strony (ten sam id na karcie innego węzła)", async () => {
    window.history.pushState({}, "", "/nodes/n2");
    const el = document.createElement("div");
    el.id = "dostep";
    document.body.appendChild(el);
    podswietlKotwice("/nodes/n1#dostep", { limitMs: 250 });
    await czekaj(350);
    expect(el.hasAttribute("data-podswietl")).toBe(false);
  });
});
