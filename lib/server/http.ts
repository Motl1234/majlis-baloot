export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "bad_request",
  ) {
    super(message);
  }
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  console.error("Unhandled Baloot API error", error);
  return Response.json(
    { error: "تعذر إكمال الطلب الآن. حاول مرة أخرى.", code: "server_error" },
    { status: 500 },
  );
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!contentType.toLowerCase().includes("application/json") || length > 16_384) {
    throw new ApiError("صيغة الطلب غير صحيحة.", 415, "invalid_content_type");
  }

  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError("تعذر قراءة بيانات الطلب.", 400, "invalid_json");
  }
}
