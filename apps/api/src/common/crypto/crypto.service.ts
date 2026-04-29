import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/**
 * Encrypts and decrypts small secrets at rest (DA passwords, etc.) using
 * AES-256-GCM with the application KMS key. The key is derived from
 * APP_KMS_KEY via SHA-256 so any string of sufficient entropy is acceptable.
 *
 * Format on disk: "v1.<ivB64>.<tagB64>.<cipherB64>"
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.get<string>('appKmsKey');
    if (!raw) throw new Error('appKmsKey is not configured');
    this.key = CryptoService.deriveKey(raw);
  }

  encrypt(plaintext: string): string {
    return CryptoService.encryptWithKey(plaintext, this.key);
  }

  decrypt(payload: string): string {
    return CryptoService.decryptWithKey(payload, this.key);
  }

  // ---------------------------------------------------------------------------
  // Static helpers — used by the F-11 rotation CLI to encrypt/decrypt with an
  // arbitrary passphrase (OLD_KMS_KEY / NEW_KMS_KEY) without spinning up the
  // full Nest container.
  // ---------------------------------------------------------------------------

  static deriveKey(passphrase: string): Buffer {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new Error('KMS passphrase must be a non-empty string');
    }
    return createHash('sha256').update(passphrase, 'utf8').digest();
  }

  static encryptWithKey(plaintext: string, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  static decryptWithKey(payload: string, key: Buffer): string {
    const parts = payload.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('Invalid ciphertext payload');
    }
    const [, ivB64, tagB64, cipherB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const ciphertext = Buffer.from(cipherB64, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }

  /** SHA-256 hex digest — used to store one-way hashes of bootstrap tokens. */
  sha256Hex(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  /**
   * Generates a high-entropy random token suitable for bootstrap / API auth.
   * Returns the plaintext (base64url) — only the SHA-256 hash should ever
   * be persisted server-side.
   */
  generateRandomToken(byteLength = 32): string {
    return randomBytes(byteLength).toString('base64url');
  }

  /** Constant-time equality for string secrets (e.g. bootstrap tokens). */
  safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  }
}
