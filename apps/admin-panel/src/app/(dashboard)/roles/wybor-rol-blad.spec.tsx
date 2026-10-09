/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
jest.mock("./actions", () => ({ setOperatorRoles: jest.fn() }));

import { setOperatorRoles } from "./actions";
import { WyborRolOperatora } from "./wybor-rol-operatora";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** Przegląd 10.10 — na karcie operatora nikt nie podaje onBlad, więc błąd zapisu ról znikał bez śladu. */
it("błąd zapisu ról widać przy wyborze ról", async () => {
  (setOperatorRoles as jest.Mock).mockResolvedValue({ ok: false, error: "Wybrana rola nie istnieje." });
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  const op = { id: "op1", email: "jan@verris.pl", firstName: null, lastName: null, role: "STAFF", staffRoleId: null, roleIds: ["l2"] };
  const role = [{ id: "l2", name: "L2", description: null, permissions: [], isSystem: true, memberCount: 1 }];
  await act(async () => root.render(<WyborRolOperatora operator={op} role={role} />));
  const przycisk = (t: string) => [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(t))!;
  await act(async () => przycisk("Zmień role").click());
  await act(async () => przycisk("Zapisz role").click());
  expect(el.querySelector('[role="alert"]')?.textContent).toBe("Wybrana rola nie istnieje.");
  act(() => root.unmount());
});
