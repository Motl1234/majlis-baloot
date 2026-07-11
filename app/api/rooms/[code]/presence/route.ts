import { apiErrorResponse, readJsonBody } from "../../../../../lib/server/http";
import { touchPresence } from "../../../../../lib/server/rooms";
import { requestHasValidOrigin } from "../../../../../lib/server/session";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    if (!requestHasValidOrigin(request)) {
      return Response.json({ error: "مصدر الطلب غير مسموح." }, { status: 403 });
    }
    const { code } = await context.params;
    const input = await readJsonBody<{ clientInstanceId?: unknown }>(request);
    const room = await touchPresence(request, code, input.clientInstanceId);
    return Response.json({ room });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
