import { renderToStaticMarkup } from "react-dom/server";
import { BanerIncydentow } from "./baner-incydentow";

/** F3.8 (ON-05) — baner „czy to awaria u was?”: nic nie trwa — brak baneru; incydent i prace z węzłem i liczbą kont. */
it("pusto albo bez danych — nic", () => {
  expect(renderToStaticMarkup(<BanerIncydentow stan={null} />)).toBe("");
  expect(renderToStaticMarkup(<BanerIncydentow stan={{ incydenty: [], prace: [] }} />)).toBe("");
});

it("awaria z węzłem i liczbą kont (link do karty), prace na całej platformie", () => {
  const html = renderToStaticMarkup(
    <BanerIncydentow
      stan={{
        incydenty: [{ id: "i1", tytul: "Strony nie odpowiadają", powazny: true, od: "2026-10-11T08:00:00Z", usluga: "Strony klientów", wezel: { id: "w1", nazwa: "fra-01", kont: 2 } }],
        prace: [{ id: "p1", tytul: "Aktualizacja", trwa: false, od: "2026-10-11T20:00:00Z", do: "2026-10-11T21:00:00Z", wezel: null, calaPlatforma: true }],
      }}
    />,
  );
  expect(html).toContain("Awaria:");
  expect(html).toContain('href="/nodes/w1"');
  expect(html).toContain("fra-01 (2 konta)");
  expect(html).toContain("cała platforma");
  expect(html).toContain("Prace serwisowe:");
});
