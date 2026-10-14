/**
 * I-18 — minimalne typy `ssh2` (tylko to, czego używa preflight migracji i — od 14.10 — podgląd katalogów:
 * sftp.readdir/stat/readFile i exec do sprawdzenia rsync).
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

  export interface Stats {
    size: number;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export interface FileEntry {
    filename: string;
    longname: string;
    attrs: Stats;
  }

  export interface SFTPWrapper {
    readdir(path: string, cb: (err: Error | undefined, list: FileEntry[]) => void): void;
    stat(path: string, cb: (err: Error | undefined, stats: Stats) => void): void;
    readFile(path: string, cb: (err: Error | undefined, data: Buffer) => void): void;
    end(): void;
  }

  export interface ClientChannel extends EventEmitter {
    stderr: EventEmitter;
    on(event: 'data', listener: (data: Buffer) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export class Client extends EventEmitter {
    connect(config: ConnectConfig): this;
    sftp(cb: (err: Error | undefined, sftp: SFTPWrapper) => void): boolean;
    exec(command: string, cb: (err: Error | undefined, stream: ClientChannel) => void): boolean;
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
