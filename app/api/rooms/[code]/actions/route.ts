import type { RoomActionEnvelope } from "../../../../../lib/rooms/types";
import { apiErrorResponse, readJsonBody } from "../../../../../lib/server/http";
import { applyRoomAction } from "../../../../../lib/server/rooms";
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
    const input = await readJsonBody<RoomActionEnvelope>(request);
    const room = await applyRoomAction(request, code, input);
    return Response.json({ room });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
