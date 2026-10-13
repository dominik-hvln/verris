/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/** H-16 — pusta lista kopii z węzła docelowego mówi wprost, że kopii nie ma i pod jakim prefiksem szukano (13.10, t2). */
const stanMock = jest.fn();
jest.mock("./odtworzenie-na-wezle-actions", () => ({
  stanNaWezleAction: (...a: unknown[]) => stanMock(...a),
  listaNaWezleAction: jest.fn(),
  odtworzNaWezleAction: jest.fn(),
}));
jest.mock("@/components/potwierdz", () => ({ potwierdz: jest.fn(async () => true) }));

import { OdtworzenieNaWezlePanel } from "./odtworzenie-na-wezle-panel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const zadanie = (status: string) => ({ id: "z1", status, wezel: "t2", archiwum: null, blad: null, utworzone: "2026-10-13T14:26:45.000Z", zakonczone: null });
const stan = (status: string, archiwa: { name: string; sizeBytes: number | null; modifiedAt: string | null }[]) => ({
  ok: true,
  stan: { wezelZrodlowy: { id: "t1", prefiks: "nodes/t1" }, wToku: false, lista: zadanie(status), archiwa, odtworzenie: null },
});

let root: Root;
let k: HTMLElement;
const render = async () => {
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () =>
    root.render(
      <OdtworzenieNaWezlePanel
        subscriptionId="s1"
        domain="pb55.d3.hvln.pl"
        servers={[{ id: "t1", name: "TEST-NRB-01", region: "DE-NBG" }, { id: "t2", name: "t2", region: "DE-NBG" }]}
        currentServerId="t1"
      />,
    ),
  );
};

afterEach(() => {
  act(() => root.unmount());
  k.remove();
  stanMock.mockReset();
});

describe("Odtworzenie na innym węźle — wynik listy kopii", () => {
  it("lista gotowa i pusta → komunikat o braku kopii z prefiksem węzła źródłowego", async () => {
    stanMock.mockResolvedValue(stan("COMPLETED", []));
    await render();
    expect(k.textContent).toContain("Brak kopii tego konta na zdalnym dysku pod prefiksem nodes/t1");
  });

  it("lista z archiwami → bez komunikatu o braku", async () => {
    stanMock.mockResolvedValue(stan("COMPLETED", [{ name: "user.admin.rdeetgju.tar.zst", sizeBytes: 47513, modifiedAt: "2026-10-13T01:35:02.000Z" }]));
    await render();
    expect(k.textContent).not.toContain("Brak kopii");
    expect(k.textContent).toContain("Odtwórz na węźle");
  });

  it("lista w toku → jeszcze bez komunikatu", async () => {
    stanMock.mockResolvedValue(stan("RUNNING", []));
    await render();
    expect(k.textContent).not.toContain("Brak kopii");
  });
});
