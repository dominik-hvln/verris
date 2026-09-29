import { DirectAdminClient, decodeHtmlEntities, parseDaMessage, parseDaMessageList } from '@verris/directadmin-sdk';

/**
 * Wiadomości systemowe konta (CMD_API_TICKET) — kształty odpowiedzi zdjęte z żywego węzła (1.710, język pl).
 * Pilnujemy dekodowania encji w tematach, pomijania kluczy nienumerycznych (info) i odporności na brak pól.
 */
const LISTA = {
  messages: {
    '0': { message: '000000006', subject: 'Błąd przy żądaniu LetsEncrypt', last_message: '1759132800', new: 'yes' },
    '1': { message: '000000005', subject: 'Tw&#243;j Hash URL Login &#39;k&#53;&#39; zosta&#322; utworzony', new: 'no' },
    '2': { message: '000000004', subject: 'Twoje kopie zapasowe s&#261; gotowe' },
    '3': { subject: 'bez numeru' },
    info: { columns: { subject: {} }, current_page: '1', ipp: '50', rows: '16', total_pages: '1' },
  },
  tickets: { info: { rows: '0' } },
  settings: {},
  clear_messages: {},
};

const TRESC = {
  '0':
    'from=diradmin&message=Musi%20by%C4%87%20wybrana%20co%20najmniej%20jedna%20pozycja%20Let%26%2339%3Bs%20Encrypt.%0Afirma.pl' +
    '&name=Message%20System&priority=30&status=open&subject=B%C5%82%C4%85d%20przy%20%C5%BC%C4%85daniu%20LetsEncrypt' +
    '&time=1759132800&type=message&user=multiple',
};

describe('parseDaMessageList', () => {
  it('prawdziwa odpowiedź: numery, encje w tematach, flaga new; info i wpis bez numeru pominięte', () => {
    expect(parseDaMessageList(LISTA)).toEqual([
      { id: '000000006', number: 6, subject: 'Błąd przy żądaniu LetsEncrypt', isNew: true },
      { id: '000000005', number: 5, subject: "Twój Hash URL Login 'k5' został utworzony", isNew: false },
      { id: '000000004', number: 4, subject: 'Twoje kopie zapasowe są gotowe', isNew: false },
    ]);
  });

  it('brak `messages`, pusta lista, śmieci → []', () => {
    expect(parseDaMessageList({})).toEqual([]);
    expect(parseDaMessageList({ messages: { info: { rows: '0' } } })).toEqual([]);
    expect(parseDaMessageList(null)).toEqual([]);
    expect(parseDaMessageList('<html>')).toEqual([]);
  });
});

describe('parseDaMessage', () => {
  it('odkodowuje zakodowany ciąg klucz=wartość: treść, temat, nadawca, czas', () => {
    const m = parseDaMessage('000000006', TRESC);
    expect(m).toEqual({
      id: '000000006',
      subject: 'Błąd przy żądaniu LetsEncrypt',
      body: "Musi być wybrana co najmniej jedna pozycja Let's Encrypt.\nfirma.pl",
      from: 'diradmin',
      time: new Date(1759132800 * 1000),
    });
  });

  it('brak pól → puste teksty i null', () => {
    expect(parseDaMessage('1', {})).toEqual({ id: '1', subject: '', body: '', from: null, time: null });
  });

  it('encje: nazwane, dziesiętne, szesnastkowe; nieznane zostają', () => {
    expect(decodeHtmlEntities('a &amp; b &#39;x&#39; &#x142; &foo;')).toBe("a & b 'x' ł &foo;");
  });
});

describe('DirectAdminClient — wywołania', () => {
  function klient(data: unknown) {
    const k = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
    const get = vi.fn(async (_p: string, _c?: unknown) => ({ data }));
    Object.assign(k, { client: { get } });
    return { k, get };
  }

  it('listMessages: GET /CMD_API_TICKET?json=yes', async () => {
    const { k, get } = klient(LISTA);
    expect(await k.listMessages()).toHaveLength(3);
    expect(get).toHaveBeenCalledWith('/CMD_API_TICKET', { params: { json: 'yes' } });
  });

  it('getMessage: action=view&type=message&number=<id>; numer spoza cyfr odrzucony bez zapytania', async () => {
    const { k, get } = klient(TRESC);
    expect((await k.getMessage('000000006')).subject).toBe('Błąd przy żądaniu LetsEncrypt');
    expect(get).toHaveBeenCalledWith('/CMD_API_TICKET', { params: { action: 'view', type: 'message', number: '000000006', json: 'yes' } });
    await expect(k.getMessage('6&action=delete')).rejects.toThrow(/Niepoprawny numer/);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('błąd węzła (error w JSON) → wyjątek, nie pusta lista', async () => {
    await expect(klient({ error: '1', text: 'Brak dostępu' }).k.listMessages()).rejects.toThrow(/Brak dostępu/);
  });
});
