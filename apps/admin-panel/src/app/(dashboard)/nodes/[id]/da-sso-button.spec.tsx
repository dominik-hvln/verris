/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Przegląd 1B-2 — „Otwórz DirectAdmin” otwierał kartę z cechą „noopener”, a wtedy window.open zwraca null
 * (specyfikacja HTML): zostawała pusta karta about:blank, a link szedł drugim oknem po awaicie
 * (blokowanym przez przeglądarkę). Teraz jedna karta z podmienionym adresem; przy błędzie zamknięta.
 */
const mockSso = jest.fn();
jest.mock("./da-sso-actions", () => ({ createNodeSsoUrl: (id: string) => mockSso(id) }));

import { DaSsoButton } from "./da-sso-button";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("DaSsoButton — jednorazowy link w jednej karcie", () => {
  let root: Root;
  let el: HTMLElement;
  const okno = { location: { href: "" }, close: jest.fn(), opener: {} as unknown };
  let open: jest.SpyInstance;
  beforeEach(() => {
    mockSso.mockReset();
    okno.location.href = "";
    okno.opener = {};
    okno.close.mockReset();
    open = jest
      .spyOn(window, "open")
      .mockImplementation((_u?: string | URL, _t?: string, cechy?: string) => (cechy?.includes("noopener") ? null : (okno as unknown as Window)));
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    open.mockRestore();
    act(() => root.unmount());
    el.remove();
  });
  const kliknij = async () => {
    await act(async () => root.render(<DaSsoButton serverId="n1" sshHost={null} />));
    const przycisk = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Otwórz DirectAdmin"))!;
    await act(async () => przycisk.click());
  };

  it("sukces: jedna karta, opener zerwany, adres podmieniony", async () => {
    mockSso.mockResolvedValue({ data: { url: "https://t1.example:2222/api/login/url?key=k", sshHost: null, sshCommand: null } });
    await kliknij();
    expect(mockSso).toHaveBeenCalledWith("n1");
    expect(open).toHaveBeenCalledTimes(1);
    expect(okno.opener).toBeNull();
    expect(okno.location.href).toBe("https://t1.example:2222/api/login/url?key=k");
  });

  it("błąd API: karta zamknięta, komunikat pod przyciskiem", async () => {
    mockSso.mockResolvedValue({ error: "Węzeł nie ma skonfigurowanego DirectAdmina." });
    await kliknij();
    expect(okno.close).toHaveBeenCalled();
    expect(el.textContent).toContain("Węzeł nie ma skonfigurowanego DirectAdmina.");
  });
});
