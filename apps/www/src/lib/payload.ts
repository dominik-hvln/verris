import { getPayload } from 'payload';
import config from '@payload-config';

// Współdzielony klient Payload dla renderowania treści na froncie.
let cached: Awaited<ReturnType<typeof getPayload>> | null = null;

export async function getPayloadClient() {
  if (cached) return cached;
  cached = await getPayload({ config });
  return cached;
}
