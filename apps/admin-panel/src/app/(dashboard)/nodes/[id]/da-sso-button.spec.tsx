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
  const kliknij = async (sshHost: string | null = null) => {
    await act(async () => root.render(<DaSsoButton serverId="n1" sshHost={sshHost} />));
    const przycisk = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Otwórz DirectAdmin"))!;
    await act(async () => przycisk.click());
  };

  it("sukces: jedna karta, opener zerwany, adres podmieniony", async () => {
    mockSso.mockResolvedValue({ data: { url: "https://t1.example:2222/api/login/url?key=k", sshHost: null, sshCommand: null } });
    await kliknij("203.0.113.10"); // z adresem węzła — wtedy jest podpowiedź tunelu
    expect(mockSso).toHaveBeenCalledWith("n1");
    expect(open).toHaveBeenCalledTimes(1);
    expect(okno.opener).toBeNull();
    expect(okno.location.href).toBe("https://t1.example:2222/api/login/url?key=k");
    // Obserwacja 13.10: po otwarciu jest komunikat, co zrobić, gdy karta się nie ładuje (2222 tylko z CP).
    const status = el.querySelector("[data-sso-otwarte]");
    expect(status?.textContent).toContain("tylko z control-plane");
    // Decyzja 17.10: certyfikat panelu na nazwę hosta — link przez tunel zostaje bez zmian (SOCKS), nie 127.0.0.1.
    expect(status?.querySelector("a")?.getAttribute("href")).toBe("https://t1.example:2222/api/login/url?key=k");
    expect(el.innerHTML).not.toContain("127.0.0.1:2222");
  });

  it("błąd API: karta zamknięta, komunikat pod przyciskiem", async () => {
    mockSso.mockResolvedValue({ error: "Węzeł nie ma skonfigurowanego DirectAdmina." });
    await kliknij();
    expect(okno.close).toHaveBeenCalled();
    expect(el.textContent).toContain("Węzeł nie ma skonfigurowanego DirectAdmina.");
  });

  it("weryfikacja 11.10: podpowiedź SSH prowadzi do działającej drogi — klucz deploy na control-plane i tunel przez CP", async () => {
    await act(async () => root.render(<DaSsoButton serverId="n1" sshHost="203.0.113.10" />));
    const tekst = el.querySelector("[data-podpowiedz-ssh]")?.textContent ?? "";
    expect(tekst).toContain("/opt/verris/ops/scripts/verris-node.sh ssh 203.0.113.10");
    expect(tekst).toContain("ssh -N -D 1080 root@<control-plane>");
    expect(tekst).toContain('--proxy-server="socks5://127.0.0.1:1080"');
    // Stara podpowiedź: tunel wprost na węzeł kluczem osobistym — „Permission denied (publickey)”.
    expect(el.innerHTML).not.toContain("root@203.0.113.10");
    expect(el.innerHTML).not.toContain("2222:127.0.0.1:2222");
    const kopiuj = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("SSH"))!;
    expect(kopiuj.title).toContain("na control-plane");
  });
});
