import { NextResponse } from 'next/server';

/**
 * Liveness endpoint for the client panel.
 *
 * Used by Docker healthcheck and the reverse proxy. We deliberately do not
 * check the upstream API here — that's a *readiness* signal and would cause
 * the panel container to flap if the API briefly hiccups.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'client-panel',
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
