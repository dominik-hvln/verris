import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

/**
 * Mail wysyłany po pomyślnym zrealizowaniu kodu promocyjnego — informuje
 * usera, ile środków bonusowych trafiło do portfela oraz jaki jest aktualny
 * stan portfela. Kategoria TRANSACTIONAL — usery nie mogą się wypisać.
 *
 * Wysyłane z dwóch miejsc:
 *  1. `PromoService.redeemPromo`               — kody flat („dostajesz 50 zł").
 *  2. `PromoService.applyPercentBonusForTopup` — kody procentowe rozliczane
 *     po opłaceniu Stripe-checkoutu doładowania portfela.
 */
export interface PromoCodeRedeemedContext {
  to: string;
  firstName: string | null;
  /** Sam kod, bez normalizacji wielkości liter — pokazujemy zachowanym formatem. */
  code: string;
  kind: 'FLAT' | 'PERCENT_BONUS';
  /** Skreditowana kwota (PLN, 2 miejsca) — ZAWSZE finalna wartość zaksięgowana. */
  amountPln: string;
  /** Opis kodu z panelu admina (np. „Promocja Black Friday"). */
  description: string | null;
  /** Stan portfela po księgowaniu — opcjonalny (gdy wallet brak, omijamy). */
  walletBalancePln: string | null;
  panelUrl: string;
}

export function promoCodeRedeemedTemplate(ctx: PromoCodeRedeemedContext): MailMessage {
  const greeting = ctx.firstName
    ? `Cześć **${escapeHtml(ctx.firstName)}**!`
    : 'Cześć!';

  const headlineKindLabel =
    ctx.kind === 'PERCENT_BONUS' ? 'bonus procentowy' : 'środki promocyjne';

  const intro =
    ctx.kind === 'PERCENT_BONUS'
      ? `Twoje doładowanie portfela zostało **powiększone o bonus z kodu** \`${escapeHtml(
          ctx.code,
        )}\`. Środki są już dostępne w portfelu Verris i możesz ich od razu używać do opłacania subskrypcji.`
      : `Kod promocyjny \`${escapeHtml(
          ctx.code,
        )}\` został pomyślnie zrealizowany — środki trafiły do **Twojego portfela Verris** i są od ręki gotowe do wykorzystania.`;

  const lines: string[] = [
    greeting,
    ``,
    intro,
    ``,
    `## Szczegóły transakcji`,
    ``,
    `- **Kod:** \`${escapeHtml(ctx.code)}\``,
    `- **Rodzaj:** ${headlineKindLabel}`,
    `- **Kwota zaksięgowana:** ${escapeHtml(ctx.amountPln)} zł`,
  ];
  if (ctx.description) {
    lines.push(`- **Opis akcji:** ${escapeHtml(ctx.description)}`);
  }
  if (ctx.walletBalancePln) {
    lines.push(`- **Aktualny stan portfela:** ${escapeHtml(ctx.walletBalancePln)} zł`);
  }
  lines.push(
    ``,
    `Środki promocyjne działają dokładnie jak zwykłe doładowanie — pokrywają **odnowienia subskrypcji, opłaty za hosting i wszystkie inne usługi Verris**. Nie wymagają minimalnej kwoty zamówienia ani aktywacji.`,
  );

  const { html, text } = renderEmailShell({
    title: 'Bonus zaksięgowany w portfelu',
    preheader: `+${ctx.amountPln} zł trafiło do Twojego portfela Verris.`,
    bodyMarkdown: lines.join('\n'),
    cta: {
      label: 'Zobacz portfel',
      url: `${ctx.panelUrl}/dashboard/wallet`,
    },
    footnote:
      'Transakcję promocyjną widzisz w historii portfela jako wpis typu „PROMO_CREDIT". Nie podlega ona zwrotowi.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'promo.code-redeemed',
    subject: `[Verris] Bonus +${ctx.amountPln} zł zaksięgowany — kod ${ctx.code}`,
    text,
    html,
  };
}
