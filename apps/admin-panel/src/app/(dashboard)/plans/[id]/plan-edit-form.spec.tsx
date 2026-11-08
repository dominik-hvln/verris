/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Paczka 121 — plan produktu aplikacyjnego (Kreator Pro, Newsletter) w edycji planu: rodzaj pokazany po polsku
 * i NIE wysyłany przy zapisie. API przyjmuje w `productKind` tylko HOSTING/EMAIL, więc formularz, który odsyłał
 * „KREATOR_PRO”, wywracał każdy zapis takiego planu (także uzupełnienie cen Stripe potrzebnych do płatności kartą).
 */
const updatePlanAction = jest.fn(async (..._a: unknown[]) => ({ ok: false as const, error: "stop" }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
jest.mock("@/components/potwierdz", () => ({ potwierdz: async () => true }));
jest.mock("../actions", () => ({
  updatePlanAction: (...a: unknown[]) => updatePlanAction(...a),
  validateStripePriceAction: jest.fn(),
  deactivatePlanAction: jest.fn(),
  usunPlanTrwaleAction: jest.fn(),
  syncPlanStripeAction: jest.fn(),
}));

import { PlanEditForm } from "./plan-edit-form";
import type { AdminPlanRow } from "../data";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const plan = (productKind: AdminPlanRow["productKind"]): AdminPlanRow => ({
  id: "p1", slug: "kreator-pro", name: "Verris Kreator Pro", description: null, cpuLimit: 1, ramLimitMb: 1, diskLimitMb: 1,
  ioLimitKbps: 1, iopsLimit: 1, entryProcesses: 1, nprocLimit: 17, includedTransferGb: null, priceMonthly: "9.90", priceYearly: "99.00",
  currency: "PLN", stripeProductId: null, stripePriceMonthlyId: null, stripePriceYearlyId: null, isPublic: true, isActive: true,
  sortOrder: 30, trialDays: 0, productKind, supportSlaHours: 0, offsiteRetentionMaxDays: 30, autoscalingMaxOverscaleCpu: 1,
  autoscalingMaxOverscaleRam: 1, autoscalingMaxOverscaleDisk: 1, createdAt: "", updatedAt: "",
});

let root: Root;
let k: HTMLElement;
beforeEach(() => {
  updatePlanAction.mockClear();
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
});
afterEach(() => act(() => root.unmount()));

async function zapisz() {
  await act(async () => {
    k.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

it("Kreator Pro: rodzaj „Kreator Pro – usługa aplikacyjna”, zapis bez productKind", async () => {
  act(() => root.render(<PlanEditForm plan={plan("KREATOR_PRO")} />));
  expect(k.textContent).toContain("Kreator Pro – usługa aplikacyjna");
  await zapisz();
  expect(updatePlanAction).toHaveBeenCalledTimes(1);
  const payload = updatePlanAction.mock.calls[0][1] as Record<string, unknown>;
  expect(payload).not.toHaveProperty("productKind");
  expect(payload).toMatchObject({ priceMonthly: 9.9, priceYearly: 99 });
});

it("hosting: rodzaj wybierany jak dotąd i wysyłany przy zapisie", async () => {
  act(() => root.render(<PlanEditForm plan={plan("HOSTING")} />));
  await zapisz();
  expect((updatePlanAction.mock.calls[0][1] as Record<string, unknown>).productKind).toBe("HOSTING");
});
