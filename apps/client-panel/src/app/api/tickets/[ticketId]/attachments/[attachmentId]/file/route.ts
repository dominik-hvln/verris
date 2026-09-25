import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3000";

export async function GET(
  _req: Request,
  context: { params: Promise<{ ticketId: string; attachmentId: string }> },
) {
  const { ticketId, attachmentId } = await context.params;
  // Identyfikatory trafiają do ścieżki zapytania do API — bez „../” i znaków spoza UUID.
  if (!/^[0-9a-f-]{36}$/i.test(ticketId) || !/^[0-9a-f-]{36}$/i.test(attachmentId)) {
    return new NextResponse("Bad request", { status: 400 });
  }
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const upstream = await fetch(
    `${API_URL}/tickets/${ticketId}/attachments/${attachmentId}/file`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (!upstream.ok || !upstream.body) {
    return new NextResponse(upstream.body, { status: upstream.status });
  }

  const headers = new Headers();
  const disposition = upstream.headers.get("content-disposition");
  const mime = upstream.headers.get("content-type");
  const length = upstream.headers.get("content-length");
  if (disposition) headers.set("content-disposition", disposition);
  if (mime) headers.set("content-type", mime);
  if (length) headers.set("content-length", length);

  return new NextResponse(upstream.body, { status: 200, headers });
}
