import { escapeMarkdown, renderEmailShell } from './email-shell.js';
import { uzasadnienieDlaKlienta } from '../../../abuse/abuse.templates.js';

const baza = { recipientEmail: 'jan@example.pl', panelUrl: 'https://panel.verris.pl' };

describe('renderEmailShell — dane od użytkownika', () => {
  it('escapeMarkdown: znaki HTML escapowane raz, cudzysłów czytelny w obu wersjach', () => {
    const { html, text } = renderEmailShell({ ...baza, title: `Temat "${escapeMarkdown('A & <b>')}"`, bodyMarkdown: `Zgłoszenie **"${escapeMarkdown('O\'Brien & <script>')}"**` });
    expect(html).toContain('O&#39;Brien &amp; &lt;script&gt;');
    expect(html).not.toContain('&amp;amp;');
    expect(html).not.toContain('&amp;quot;');
    expect(html).toContain('<title>Temat &quot;A &amp; &lt;b&gt;&quot;</title>');
    expect(text).toContain(`Zgłoszenie "O'Brien & <script>"`);
    expect(text).not.toContain('\\');
  });

  it('escapeMarkdown: link, bold, kod, nagłówek i lista z danych nie stają się składnią', () => {
    const zly = '[kliknij](https://zly.example)\n# Nagłówek\n- punkt **mocno** `kod`';
    const { html, text } = renderEmailShell({ ...baza, title: 't', bodyMarkdown: escapeMarkdown(zly) });
    expect(html).not.toContain('href="https://zly.example"');
    expect(html).not.toMatch(/<h2|<ul|<strong|<code/);
    expect(html).toContain('[kliknij](https://zly.example)');
    expect(text).toContain(zly);
  });

  it('składnia szablonu dalej działa obok danych', () => {
    const { html } = renderEmailShell({ ...baza, title: 't', bodyMarkdown: `**${escapeMarkdown('a*b')}** [panel](https://panel.verris.pl/x)` });
    expect(html).toContain('<strong style="color:#0c1a14;">a*b</strong>');
    expect(html).toContain('href="https://panel.verris.pl/x"');
  });

  it('pojedynczy znak nowej linii w akapicie to <br/>, a nie widoczny tekst „<br/>”', () => {
    const { html } = renderEmailShell({ ...baza, title: 't', bodyMarkdown: 'linia 1\nlinia 2' });
    expect(html).toContain('linia 1<br/>linia 2');
    expect(html).not.toContain('&lt;br/&gt;');
  });

  it('recipientHasAccount: false ukrywa „Preferencje powiadomień”', () => {
    const z = renderEmailShell({ ...baza, title: 't', bodyMarkdown: 'x' });
    const bez = renderEmailShell({ ...baza, title: 't', bodyMarkdown: 'x', recipientHasAccount: false });
    expect(z.html).toContain('Preferencje powiadomień');
    expect(z.text).toContain('Preferencje powiadomień');
    expect(bez.html).not.toContain('Preferencje powiadomień');
    expect(bez.text).not.toContain('Preferencje powiadomień');
    expect(bez.html).toContain('Polityka prywatności');
  });
});

describe('renderEmailShell — wypis z listy klienta', () => {
  it('unsubscribeUrl zastępuje link do preferencji w panelu', () => {
    const { html, text } = renderEmailShell({ ...baza, title: 't', bodyMarkdown: 'x', category: 'MARKETING', recipientHasAccount: false, unsubscribeUrl: 'https://api.verris.pl/u/abc' });
    expect(html).toContain('href="https://api.verris.pl/u/abc"');
    expect(html).not.toContain('/dashboard/settings');
    expect(text).toContain('Wypisz się: https://api.verris.pl/u/abc');
  });
});

describe('abuse — mail do klienta', () => {
  it('adres ze zgłoszenia nie wstrzyknie linku do brandowanego maila', () => {
    const m = uzasadnienieDlaKlienta({
      to: 'klient@example.pl', url: 'https://sklep.pl/[Zaloguj się](https://zly.example)', kategoria: 'PHISHING',
      uzasadnienie: 'Strona podszywała się pod bank.\n- dowód 1', panelUrl: 'https://panel.verris.pl',
    });
    expect(m.html).toBeDefined();
    expect(m.html).not.toContain('href="https://zly.example"');
    expect(m.html).toContain('href="https://panel.verris.pl/dashboard/support"');
    expect(m.text).toContain('https://sklep.pl/[Zaloguj się](https://zly.example)');
    expect(m.text).toContain('- dowód 1');
  });
});
