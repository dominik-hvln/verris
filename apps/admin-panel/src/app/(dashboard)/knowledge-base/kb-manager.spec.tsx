import { renderToStaticMarkup } from "react-dom/server";

jest.mock("./actions", () => ({
  createArticle: jest.fn(),
  createCategory: jest.fn(),
  deleteArticle: jest.fn(),
  deleteCategory: jest.fn(),
  fetchArticles: jest.fn(async () => []),
  fetchCategories: jest.fn(async () => []),
  fetchCta: jest.fn(async () => null),
  getArticle: jest.fn(),
  saveCta: jest.fn(),
  updateArticle: jest.fn(),
  updateCategory: jest.fn(),
}));
jest.mock("@/components/potwierdz", () => ({ potwierdz: async () => true, zapytaj: async () => null }));
jest.mock("@/lib/staff-access", () => ({ fetchStaffAccess: jest.fn() }));

import { fetchStaffAccess } from "@/lib/staff-access";
import { BEZ_KB_MANAGE } from "@/lib/baza-wiedzy";
import { CatRow, Editor, KbManager } from "./kb-manager";
import KnowledgeBasePage from "./page";

/**
 * Weryfikacja 11.10 (decyzja właściciela) — Baza wiedzy CMS dla roli bez KB_MANAGE (np. L1): „Nowy artykuł”,
 * „Kategoria”, zmiana nazwy i usunięcie kategorii oraz pola i zapis artykułu są widoczne, ale wyszarzone
 * z podpowiedzią „Wymaga uprawnienia Baza wiedzy (KB_MANAGE)”. API i tak odmawia (kb.admin.controller.ts).
 */
const kategoria = { id: "k1", name: "Domeny", parentId: null } as never;
const nic = () => undefined;
const POWOD = 'title="Wymaga uprawnienia Baza wiedzy (KB_MANAGE)"';

describe("Baza wiedzy CMS — bez KB_MANAGE wyszarzone z podpowiedzią", () => {
  it("strona: powód z nazwą uprawnienia dla roli bez KB_MANAGE; z KB_MANAGE i dla administratora — bez blokady", async () => {
    (fetchStaffAccess as jest.Mock).mockResolvedValueOnce({ role: "STAFF", isAdmin: false, permissions: ["DASHBOARD_VIEW", "TICKETS_VIEW"] });
    const l1 = renderToStaticMarkup(await KnowledgeBasePage());
    expect(l1).toContain(`Tylko podgląd. ${BEZ_KB_MANAGE}.`);
    for (const d of [
      { role: "STAFF", isAdmin: false, permissions: ["KB_MANAGE"] },
      { role: "ADMIN", isAdmin: true, permissions: [] },
    ]) {
      (fetchStaffAccess as jest.Mock).mockResolvedValueOnce(d);
      expect(renderToStaticMarkup(await KnowledgeBasePage())).not.toContain("KB_MANAGE");
    }
  });

  it("„Kategoria” i „Nowy artykuł” — disabled z powodem w dymku", () => {
    const html = renderToStaticMarkup(<KbManager blokada={BEZ_KB_MANAGE} />);
    expect(html).toMatch(new RegExp(`<button disabled="" ${POWOD.replace(/[()]/g, "\\$&")}[^>]*>.*?Kategoria</button>`));
    expect(html).toMatch(new RegExp(`<button disabled="" ${POWOD.replace(/[()]/g, "\\$&")}[^>]*>.*?Nowy artykuł</button>`));
  });

  it("kategoria: podkategoria, zmiana nazwy i usunięcie widoczne, ale disabled z powodem (wcześniej znikały)", () => {
    const html = renderToStaticMarkup(<CatRow c={kategoria} sel={false} blokada={BEZ_KB_MANAGE} onSelect={nic} onAddSub={nic} onRename={nic} onDelete={nic} />);
    for (const a of ["Podkategoria", "Zmień nazwę", "Usuń"]) {
      expect(html).toContain(`<button ${POWOD} aria-label="${a}" disabled=""`);
    }
    const wolno = renderToStaticMarkup(<CatRow c={kategoria} sel={false} onSelect={nic} onAddSub={nic} onRename={nic} onDelete={nic} />);
    expect(wolno).not.toContain("disabled=\"\"");
    expect(wolno).toContain('title="Usuń"');
  });

  it("artykuł bez KB_MANAGE: „Podgląd artykułu”, pola w fieldset disabled, Zapisz i Usuń disabled; „Wróć” działa", () => {
    const props = {
      form: { title: "Jak podpiąć domenę", categoryId: "k1", bodyMarkdown: "Treść", status: "DRAFT" as const, faq: [], relatedSlugs: [] },
      set: () => nic,
      setForm: nic as never,
      cats: [kategoria],
      busy: false,
      isNew: false,
      onSave: nic,
      onDelete: nic,
      onClose: nic,
    };
    const html = renderToStaticMarkup(<Editor {...props} blokada={BEZ_KB_MANAGE} />);
    expect(html).toContain("Podgląd artykułu");
    expect(html).toMatch(/<fieldset disabled="" data-tylko-odczyt=""/);
    expect(html).toMatch(new RegExp(`<button disabled="" ${POWOD.replace(/[()]/g, "\\$&")}[^>]*>.*?Usuń</button>`));
    expect(html).toMatch(new RegExp(`<button disabled="" ${POWOD.replace(/[()]/g, "\\$&")}[^>]*>.*?Zapisz</button>`));
    expect(html).toMatch(/<button class="[^"]*">Wróć<\/button>/);
    const edycja = renderToStaticMarkup(<Editor {...props} blokada={null} />);
    expect(edycja).toContain("Edycja artykułu");
    expect(edycja).not.toContain("<fieldset disabled");
  });
});
