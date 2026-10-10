import type { MailMessage } from '../mailer.interface.js';
import { escapeMarkdown, renderEmailShell } from './_layouts/email-shell.js';

export interface RaportPomigracyjnyContext {
  to: string;
  firstName: string | null;
  domena: string;
  /** Teksty z checklisty obsługi (white label sprawdzony przy zapisie i przed wysyłką). */
  podsumowanie: string;
  optymalizacja: string;
  testPrzed: string;
  testPo: string;
  /** Koniec okna poprawek (po przełączeniu DNS). */
  poprawkiDo: Date | null;
  /** Skrót zgłoszenia (#ab12cd34), gdy migracja jest powiązana ze zgłoszeniem. */
  zgloszenie: string | null;
  panelUrl: string;
}

/** Wielowierszowy tekst obsługi jako akapity Markdown (bez interpretacji znaczników). */
const akapity = (t: string) =>
  t
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    // Pojedynczy znak nowej linii w akapicie szablon zamienia na <br/>; escapeMarkdown chroni „-” i „#” na początku linii.
    .map((p) => escapeMarkdown(p.trim()))
    .filter(Boolean)
    .join('\n\n');

const data = (d: Date) => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });

/**
 * D11 — raport pomigracyjny wysyłany klientowi jednym kliknięciem z tablicy migracji: podsumowanie, optymalizacja,
 * test wydajności przed (stary hosting) i po (u nas), okno poprawek. White label: bez nazw oprogramowania serwera.
 */
export function raportPomigracyjnyTemplate(ctx: RaportPomigracyjnyContext): MailMessage {
  const greeting = ctx.firstName ? `Dzień dobry **${escapeMarkdown(ctx.firstName)}**,` : 'Dzień dobry,';
  const odpowiedz = ctx.zgloszenie
    ? `Jeśli coś działa inaczej niż wcześniej, odpowiedz w zgłoszeniu ${escapeMarkdown(ctx.zgloszenie)} — poprawimy to.`
    : 'Jeśli coś działa inaczej niż wcześniej, napisz do nas z panelu — poprawimy to.';
  const { html, text } = renderEmailShell({
    title: 'Raport z przeniesienia strony',
    preheader: `Przeniesienie ${ctx.domena} zakończone — podsumowanie i wyniki testu przed i po.`,
    bodyMarkdown: [
      greeting,
      `przeniesienie **${escapeMarkdown(ctx.domena)}** zostało zakończone. Poniżej podsumowanie naszej pracy.`,
      '**Podsumowanie**',
      akapity(ctx.podsumowanie),
      '**Co zoptymalizowaliśmy**',
      akapity(ctx.optymalizacja),
      '**Test wydajności przed i po przeniesieniu**',
      `- Przed (poprzedni hosting): ${escapeMarkdown(ctx.testPrzed.replace(/\s+/g, ' ').trim())}\n- Po (nowy hosting): ${escapeMarkdown(ctx.testPo.replace(/\s+/g, ' ').trim())}`,
      ctx.poprawkiDo ? `Do **${data(ctx.poprawkiDo)}** sprawdzamy stronę po przeniesieniu. ${odpowiedz}` : odpowiedz,
    ].join('\n\n'),
    cta: { label: 'Przejdź do panelu', url: `${ctx.panelUrl}/dashboard/migrations` },
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'migration.raport', subject: `Raport z przeniesienia ${ctx.domena}`, text, html };
}
