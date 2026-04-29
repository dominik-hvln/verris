import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';

/**
 * RFC 6238 TOTP / RFC 4226 HOTP implementation.
 *
 * We deliberately avoid `otplib`/`speakeasy` deps so the API ships without an
 * extra crypto dependency and stays auditable in-tree.
 *
 * Defaults: SHA-1, 6-digit code, 30-second period, 32-byte secret. These match
 * what Google Authenticator / 1Password / Authy expect by default, so a stock
 * `otpauth://totp/...` URI works in every popular authenticator app.
 */
@Injectable()
export class TotpService {
  private readonly digits = 6;
  private readonly period = 30;
  private readonly algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1';
  /** ±1 30-second step tolerance — covers normal phone clock skew. */
  private readonly window = 1;

  /** Generates a new high-entropy secret and returns it base32-encoded. */
  generateSecret(): string {
    return base32Encode(randomBytes(20));
  }

  /**
   * Builds an `otpauth://totp/...` URI suitable for QR codes. The label and
   * issuer get URL-encoded; the issuer also appears as a query param so older
   * Android authenticator apps display it correctly.
   */
  buildUri(opts: { secret: string; label: string; issuer: string }): string {
    const issuer = encodeURIComponent(opts.issuer);
    const label = encodeURIComponent(opts.label);
    return (
      `otpauth://totp/${issuer}:${label}` +
      `?secret=${opts.secret}` +
      `&issuer=${issuer}` +
      `&algorithm=${this.algorithm.toUpperCase()}` +
      `&digits=${this.digits}` +
      `&period=${this.period}`
    );
  }

  /** Verifies a 6-digit TOTP code against a base32 secret with ±1 step skew. */
  verify(secret: string, code: string, atUnixSeconds: number = nowSeconds()): boolean {
    const cleaned = code.replace(/\D/g, '');
    if (cleaned.length !== this.digits) return false;
    const counter = Math.floor(atUnixSeconds / this.period);
    for (let drift = -this.window; drift <= this.window; drift += 1) {
      const candidate = this.hotp(secret, counter + drift);
      if (timingSafeStringEqual(candidate, cleaned)) return true;
    }
    return false;
  }

  /** Returns the current code — useful for tests / CLI tools, not endpoints. */
  current(secret: string, atUnixSeconds: number = nowSeconds()): string {
    return this.hotp(secret, Math.floor(atUnixSeconds / this.period));
  }

  /**
   * One-time recovery codes for when the user loses access to the
   * authenticator app. Each code is consumed at first use.
   */
  generateRecoveryCodes(count = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i += 1) {
      // 10 hex chars, formatted as `xxxxx-xxxxx` so they're easy to read.
      const raw = randomBytes(5).toString('hex');
      codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
    }
    return codes;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private hotp(secret: string, counter: number): string {
    const key = base32Decode(secret);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(counter));
    const hmac = createHmac(this.algorithm, key).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    const value = binary % 10 ** this.digits;
    return value.toString().padStart(this.digits, '0');
  }
}

// ---------------------------------------------------------------------------
// Base32 (RFC 4648) — required by Google Authenticator etc.
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i += 1) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) throw new Error('Invalid base32 character in TOTP secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
