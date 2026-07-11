const ROOM_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ROOM_CODE_LENGTH = 6;

export const AVATARS = ["sword", "falcon", "palm", "coffee"] as const;
export type AvatarId = (typeof AVATARS)[number];

export function normalizeRoomCode(value: unknown): string {
  if (typeof value !== "string") return "";
  const code = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === ROOM_CODE_LENGTH ? code : "";
}

export function createRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join("");
}

export function createSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function hashSessionToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export function roomSessionCookieName(code: string): string {
  return `majlis_baloot_${code.toLowerCase()}`;
}

export function readRoomSession(request: Request, code: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const wanted = roomSessionCookieName(code);
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === wanted) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

export function roomSessionCookie(
  request: Request,
  code: string,
  token: string,
): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${roomSessionCookieName(code)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}

export function sanitizePlayerName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
}

export function sanitizeAvatar(value: unknown): AvatarId {
  return typeof value === "string" && AVATARS.includes(value as AvatarId)
    ? (value as AvatarId)
    : "sword";
}

export function requestHasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

export function acceptsJson(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  const length = Number(request.headers.get("content-length") ?? "0");
  return contentType.toLowerCase().includes("application/json") && length <= 16_384;
}
