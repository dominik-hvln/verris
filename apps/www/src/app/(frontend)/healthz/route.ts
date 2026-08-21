// Healthcheck dla Dockera/Caddy. Osobna ścieżka /healthz, bo /api/* w www
// należy do Payload (route group (payload)).
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok', app: 'www' });
}
