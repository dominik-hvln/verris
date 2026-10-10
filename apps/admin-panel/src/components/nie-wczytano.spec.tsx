/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { NieWczytano } from "./nie-wczytano";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** Fala 1B (audyt OP-11) — wspólny komunikat zamiast pustej listy przy błędzie API. */
describe("NieWczytano", () => {
  let root: Root;
  let el: HTMLElement;
  beforeEach(() => {
    refresh.mockReset();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });
  const przycisk = () => el.querySelector("button")!;

  it("komunikat jako alert z nazwą tego, czego nie wczytano", async () => {
    await act(async () => root.render(<NieWczytano co="historii zadań" />));
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("Nie udało się wczytać historii zadań.");
    expect(przycisk().textContent).toBe("Spróbuj ponownie");
  });

  it("bez onPonow — „Spróbuj ponownie” odświeża dane strony (router.refresh)", async () => {
    await act(async () => root.render(<NieWczytano />));
    expect(el.textContent).toContain("Nie udało się wczytać.");
    await act(async () => przycisk().click());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("z onPonow — woła go zamiast odświeżania strony", async () => {
    const onPonow = jest.fn();
    await act(async () => root.render(<NieWczytano co="kategorii" onPonow={onPonow} />));
    await act(async () => przycisk().click());
    expect(onPonow).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});
