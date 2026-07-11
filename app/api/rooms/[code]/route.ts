import { apiErrorResponse } from "../../../../lib/server/http";
import { getRoom } from "../../../../lib/server/rooms";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const room = await getRoom(request, code);
    const url = new URL(request.url);
    const gameVersion = Number(url.searchParams.get("sinceGame"));
    const presenceVersion = Number(url.searchParams.get("sincePresence"));
    if (
      Number.isInteger(gameVersion) &&
      Number.isInteger(presenceVersion) &&
      gameVersion === room.version &&
      presenceVersion === room.presenceVersion
    ) {
      return new Response(null, { status: 204 });
    }
    return Response.json({ room }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
