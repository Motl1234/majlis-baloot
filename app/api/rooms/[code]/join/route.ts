import { apiErrorResponse, readJsonBody } from "../../../../../lib/server/http";
import { joinRoom, type CreateRoomInput } from "../../../../../lib/server/rooms";
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
    const input = await readJsonBody<CreateRoomInput>(request);
    const result = await joinRoom(request, code, input);
    const headers = result.cookie ? { "set-cookie": result.cookie } : undefined;
    return Response.json({ room: result.room }, { headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
