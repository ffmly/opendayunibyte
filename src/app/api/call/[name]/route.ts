import { dispatch } from "@/lib/server/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ name: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  const { name } = await params;

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) {
    return Response.json(
      { error: { code: "invalid-argument", message: "Request body is too large." } },
      { status: 413 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  let body: unknown = {};
  try {
    const raw = await req.text();
    if (raw.length > 16_384) {
      return Response.json(
        { error: { code: "invalid-argument", message: "Request body is too large." } },
        { status: 413 },
      );
    }
    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: { code: "invalid-argument", message: "A valid JSON body is required." } },
      { status: 400 },
    );
  }

  return dispatch(name, token, body);
}
