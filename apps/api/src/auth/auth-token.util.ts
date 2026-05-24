import { createHash, randomBytes } from 'crypto';

export function hashAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateAuthToken(): string {
  return randomBytes(32).toString('base64url');
}
