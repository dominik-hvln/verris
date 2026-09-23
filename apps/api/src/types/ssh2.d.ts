/**
 * I-18 — minimalne typy `ssh2` (tylko to, czego używa preflight migracji).
 * Bez @types/ssh2: ciągnęło @types/node@18 i przestawiało wersje typów w całym lockfile.
 */
declare module 'ssh2' {
  import { EventEmitter } from 'node:events';

  export interface ConnectConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    readyTimeout?: number;
    tryKeyboard?: boolean;
    hostVerifier?: (key: Buffer) => boolean;
  }

  export class Client extends EventEmitter {
    connect(config: ConnectConfig): this;
    end(): this;
    on(event: 'ready', listener: () => void): this;
    on(event: 'error', listener: (err: Error & { level?: string }) => void): this;
    on(
      event: 'keyboard-interactive',
      listener: (
        name: string,
        instructions: string,
        lang: string,
        prompts: Array<{ prompt: string; echo?: boolean }>,
        finish: (responses: string[]) => void,
      ) => void,
    ): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
}
