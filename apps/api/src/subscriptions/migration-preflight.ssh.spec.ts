import { EventEmitter } from 'node:events';
import { sshLogin } from './migration-preflight.service.js';

/** I-18 — preflight SFTP/SSH loguje się naprawdę: literówka w haśle to „auth_failed”, nie „reachable”. */
function fake(zachowanie: (c: EventEmitter & { cfg?: Record<string, unknown> }) => void) {
  return class extends EventEmitter {
    cfg?: Record<string, unknown>;
    ended = false;
    connect(cfg: Record<string, unknown>) {
      this.cfg = cfg;
      setImmediate(() => zachowanie(this));
      return this;
    }
    end() {
      this.ended = true;
      return this;
    }
  } as never;
}

describe('I-18 — sshLogin', () => {
  it('poprawne hasło → ok', async () => {
    await expect(sshLogin('1.2.3.4', 22, 'u', 'p', fake((c) => c.emit('ready')))).resolves.toBe('ok');
  });

  it('odrzucone poświadczenia → auth_failed', async () => {
    const err = Object.assign(new Error('All configured authentication methods failed'), { level: 'client-authentication' });
    await expect(sshLogin('1.2.3.4', 22, 'u', 'zle', fake((c) => c.emit('error', err)))).resolves.toBe('auth_failed');
  });

  it('błąd sieci → wyjątek (preflight zgłosi „unreachable”)', async () => {
    await expect(sshLogin('1.2.3.4', 22, 'u', 'p', fake((c) => c.emit('error', new Error('ECONNREFUSED'))))).rejects.toThrow('ECONNREFUSED');
  });

  it('keyboard-interactive dostaje hasło na każde pytanie', async () => {
    let odpowiedzi: string[] = [];
    await sshLogin('1.2.3.4', 22, 'u', 'sekret', fake((c) => {
      c.emit('keyboard-interactive', '', '', 'pl', [{ prompt: 'Password:' }], (r: string[]) => { odpowiedzi = r; c.emit('ready'); });
    }));
    expect(odpowiedzi).toEqual(['sekret']);
  });
});
