import { apiErrorResponse, readJsonBody } from "../../../lib/server/http";
import { createRoom, type CreateRoomInput } from "../../../lib/server/rooms";
import { requestHasValidOrigin } from "../../../lib/server/session";

export async function POST(request: Request) {
  try {
    if (!requestHasValidOrigin(request)) {
      return Response.json({ error: "مصدر الطلب غير مسموح." }, { status: 403 });
    }
    const input = await readJsonBody<CreateRoomInput>(request);
    const result = await createRoom(request, input);
    return Response.json(
      { room: result.room },
      { status: 201, headers: { "set-cookie": result.cookie } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
