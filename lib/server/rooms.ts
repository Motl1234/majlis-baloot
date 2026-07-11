import { and, eq, lt, sql } from "drizzle-orm";
import { roomPlayers, rooms, type RoomPlayerRecord, type RoomRecord } from "../../db/schema";
import { getDb } from "../../db";
import { advanceBots } from "../baloot/bots";
import {
  applyGameAction,
  projectPublicView,
  RuleViolation,
  startMatch,
} from "../baloot/engine";
import type { BalootGameState, GameAction, Seat } from "../baloot/types";
import type {
  RoomActionEnvelope,
  RoomClientAction,
  RoomPlayerView,
  RoomView,
} from "../rooms/types";
import { ApiError } from "./http";
import {
  createRoomCode,
  createSessionToken,
  hashSessionToken,
  normalizeRoomCode,
  readRoomSession,
  roomSessionCookie,
  sanitizeAvatar,
  sanitizePlayerName,
  type AvatarId,
} from "./session";

interface StoredRoomState {
  game: BalootGameState | null;
  mode: "multiplayer" | "quick";
  recentActionIds: string[];
}

interface RoomContext {
  player: RoomPlayerRecord;
  players: RoomPlayerRecord[];
  record: RoomRecord;
  stored: StoredRoomState;
}

export interface CreateRoomInput {
  avatar?: unknown;
  displayName?: unknown;
  mode?: unknown;
}

const BOT_PROFILES: Array<{ avatar: AvatarId; displayName: string }> = [
  { avatar: "falcon", displayName: "نواف" },
  { avatar: "coffee", displayName: "سلمان" },
  { avatar: "palm", displayName: "تركي" },
];

function parseStoredRoom(record: RoomRecord): StoredRoomState {
  if (!record.stateJson) return { game: null, mode: "multiplayer", recentActionIds: [] };
  try {
    const parsed = JSON.parse(record.stateJson) as StoredRoomState;
    return {
      game: parsed.game ?? null,
      mode: parsed.mode === "quick" ? "quick" : "multiplayer",
      recentActionIds: Array.isArray(parsed.recentActionIds)
        ? parsed.recentActionIds.slice(-24)
        : [],
    };
  } catch {
    throw new ApiError("حالة الغرفة غير قابلة للقراءة.", 500, "corrupt_room");
  }
}

async function uniqueRoomCode(): Promise<string> {
  const db = getDb();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createRoomCode();
    const [existing] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code)).limit(1);
    if (!existing) return code;
  }
  throw new ApiError("تعذر إنشاء رمز غرفة فريد. حاول مجددًا.", 503, "code_exhausted");
}

async function cleanupExpiredRooms(): Promise<void> {
  const db = getDb();
  await db.delete(rooms).where(lt(rooms.expiresAt, new Date().toISOString()));
}

async function roomByCode(code: string): Promise<RoomRecord> {
  const db = getDb();
  const [record] = await db.select().from(rooms).where(eq(rooms.code, code)).limit(1);
  if (!record) throw new ApiError("الغرفة غير موجودة أو انتهت صلاحيتها.", 404, "room_not_found");
  return record;
}

async function playersForRoom(roomId: string): Promise<RoomPlayerRecord[]> {
  return getDb()
    .select()
    .from(roomPlayers)
    .where(eq(roomPlayers.roomId, roomId))
    .orderBy(roomPlayers.seat);
}

async function authenticateRoom(request: Request, rawCode: string): Promise<RoomContext> {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new ApiError("رمز الغرفة غير صحيح.", 400, "invalid_room_code");
  const record = await roomByCode(code);
  const token = readRoomSession(request, code);
  if (!token) throw new ApiError("انضم إلى الغرفة أولًا.", 401, "room_session_missing");
  const sessionHash = await hashSessionToken(token);
  const players = await playersForRoom(record.id);
  const player = players.find((candidate) => candidate.sessionHash === sessionHash);
  if (!player) throw new ApiError("جلسة الغرفة غير صالحة.", 401, "room_session_invalid");
  return { player, players, record, stored: parseStoredRoom(record) };
}

function roomStatus(value: string): "lobby" | "active" | "finished" {
  return value === "active" || value === "finished" ? value : "lobby";
}

function playerViews(context: RoomContext): RoomPlayerView[] {
  const connectedAfter = Date.now() - 25_000;
  return context.players.map((player) => ({
    avatar: sanitizeAvatar(player.avatar),
    connected: player.isBot || Date.parse(player.lastSeenAt) >= connectedAfter,
    displayName: player.displayName,
    isBot: player.isBot,
    isHost: player.id === context.record.hostPlayerId,
    isReady: player.isReady,
    seat: player.seat as Seat,
  }));
}

function viewFromContext(context: RoomContext): RoomView {
  const players = playerViews(context);
  const seat = context.player.seat as Seat;
  return {
    canStart:
      context.player.id === context.record.hostPlayerId &&
      context.record.status === "lobby" &&
      players.length === 4 &&
      players.every((player) => player.isReady),
    code: context.record.code,
    game: context.stored.game ? projectPublicView(context.stored.game, seat) : null,
    isHost: context.player.id === context.record.hostPlayerId,
    mode: context.stored.mode,
    players,
    presenceVersion: context.record.presenceVersion,
    serverTime: Date.now(),
    status: roomStatus(context.record.status),
    version: context.record.gameVersion,
  };
}

export async function createRoom(
  request: Request,
  input: CreateRoomInput,
): Promise<{ cookie: string; room: RoomView }> {
  const displayName = sanitizePlayerName(input.displayName);
  if (displayName.length < 2) {
    throw new ApiError("اكتب اسمًا من حرفين على الأقل.", 400, "invalid_name");
  }
  const mode = input.mode === "quick" ? "quick" : "multiplayer";
  const avatar = sanitizeAvatar(input.avatar);
  const db = getDb();
  await cleanupExpiredRooms();

  const roomId = crypto.randomUUID();
  const playerId = crypto.randomUUID();
  const code = await uniqueRoomCode();
  const token = createSessionToken();
  const sessionHash = await hashSessionToken(token);
  let game = mode === "quick" ? startMatch(3) : null;
  if (game) game = advanceBots(game, (seat) => seat !== 0);
  const stored: StoredRoomState = { game, mode, recentActionIds: [] };
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const recordValues = {
    id: roomId,
    code,
    status: mode === "quick" ? "active" : "lobby",
    hostPlayerId: playerId,
    stateJson: JSON.stringify(stored),
    expiresAt,
  };

  try {
    await db.insert(rooms).values(recordValues);
    await db.insert(roomPlayers).values({
      id: playerId,
      roomId,
      seat: 0,
      displayName,
      avatar,
      sessionHash,
      isBot: false,
      isReady: true,
    });
    if (mode === "quick") {
      for (const [index, profile] of BOT_PROFILES.entries()) {
        await db.insert(roomPlayers).values({
          id: crypto.randomUUID(),
          roomId,
          seat: index + 1,
          displayName: profile.displayName,
          avatar: profile.avatar,
          sessionHash: null,
          isBot: true,
          isReady: true,
        });
      }
    }
  } catch (error) {
    await db.delete(rooms).where(eq(rooms.id, roomId));
    throw error;
  }

  const record = await roomByCode(code);
  const players = await playersForRoom(roomId);
  const context: RoomContext = {
    player: players.find((player) => player.id === playerId)!,
    players,
    record,
    stored,
  };
  return {
    cookie: roomSessionCookie(request, code, token),
    room: viewFromContext(context),
  };
}

export async function joinRoom(
  request: Request,
  rawCode: string,
  input: CreateRoomInput,
): Promise<{ cookie: string | null; room: RoomView }> {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new ApiError("رمز الغرفة غير صحيح.", 400, "invalid_room_code");
  const record = await roomByCode(code);
  const existingToken = readRoomSession(request, code);
  if (existingToken) {
    const hash = await hashSessionToken(existingToken);
    const existingPlayers = await playersForRoom(record.id);
    const existing = existingPlayers.find((player) => player.sessionHash === hash);
    if (existing) {
      return {
        cookie: null,
        room: viewFromContext({
          player: existing,
          players: existingPlayers,
          record,
          stored: parseStoredRoom(record),
        }),
      };
    }
  }
  if (record.status !== "lobby") {
    throw new ApiError("بدأت هذه المباراة بالفعل.", 409, "room_in_progress");
  }
  const displayName = sanitizePlayerName(input.displayName);
  if (displayName.length < 2) {
    throw new ApiError("اكتب اسمًا من حرفين على الأقل.", 400, "invalid_name");
  }
  const players = await playersForRoom(record.id);
  const occupied = new Set(players.map((player) => player.seat));
  const seat = ([0, 1, 2, 3] as Seat[]).find((candidate) => !occupied.has(candidate));
  if (seat === undefined) throw new ApiError("الغرفة مكتملة.", 409, "room_full");
  const token = createSessionToken();
  const playerId = crypto.randomUUID();
  await getDb().insert(roomPlayers).values({
    id: playerId,
    roomId: record.id,
    seat,
    displayName,
    avatar: sanitizeAvatar(input.avatar),
    sessionHash: await hashSessionToken(token),
    isBot: false,
    isReady: true,
  });
  await getDb()
    .update(rooms)
    .set({
      presenceVersion: sql`${rooms.presenceVersion} + 1`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(rooms.id, record.id));

  const refreshed = await roomByCode(code);
  const refreshedPlayers = await playersForRoom(record.id);
  return {
    cookie: roomSessionCookie(request, code, token),
    room: viewFromContext({
      player: refreshedPlayers.find((player) => player.id === playerId)!,
      players: refreshedPlayers,
      record: refreshed,
      stored: parseStoredRoom(refreshed),
    }),
  };
}

export async function getRoom(
  request: Request,
  rawCode: string,
): Promise<RoomView> {
  return viewFromContext(await authenticateRoom(request, rawCode));
}

export async function touchPresence(
  request: Request,
  rawCode: string,
  clientInstanceId: unknown,
): Promise<RoomView> {
  const context = await authenticateRoom(request, rawCode);
  const clientId =
    typeof clientInstanceId === "string" ? clientInstanceId.slice(0, 80) : null;
  await getDb()
    .update(roomPlayers)
    .set({ lastSeenAt: new Date().toISOString(), clientInstanceId: clientId })
    .where(eq(roomPlayers.id, context.player.id));
  await getDb()
    .update(rooms)
    .set({ presenceVersion: sql`${rooms.presenceVersion} + 1` })
    .where(eq(rooms.id, context.record.id));
  return getRoom(request, rawCode);
}

function isGameAction(action: RoomClientAction): action is GameAction {
  return ["bid", "double", "play_card", "next_round"].includes(action.type);
}

export async function applyRoomAction(
  request: Request,
  rawCode: string,
  envelope: RoomActionEnvelope,
): Promise<RoomView> {
  const context = await authenticateRoom(request, rawCode);
  const { action, clientActionId, expectedVersion } = envelope;
  if (
    !action ||
    typeof clientActionId !== "string" ||
    clientActionId.length < 8 ||
    clientActionId.length > 100 ||
    !Number.isInteger(expectedVersion)
  ) {
    throw new ApiError("بيانات الحركة غير مكتملة.", 400, "invalid_action");
  }
  if (context.stored.recentActionIds.includes(clientActionId)) {
    return viewFromContext(context);
  }
  if (expectedVersion !== context.record.gameVersion) {
    throw new ApiError("تغيرت المباراة؛ تم تحديثها إلى آخر حالة.", 409, "stale_state");
  }

  if (action.type === "ready") {
    if (context.record.status !== "lobby") {
      throw new ApiError("بدأت المباراة بالفعل.", 409, "room_in_progress");
    }
    await getDb()
      .update(roomPlayers)
      .set({ isReady: Boolean(action.ready) })
      .where(eq(roomPlayers.id, context.player.id));
    await getDb()
      .update(rooms)
      .set({ presenceVersion: sql`${rooms.presenceVersion} + 1` })
      .where(eq(rooms.id, context.record.id));
    return getRoom(request, rawCode);
  }

  let game = context.stored.game;
  if (action.type === "start") {
    if (context.player.id !== context.record.hostPlayerId) {
      throw new ApiError("المضيف فقط يمكنه بدء المباراة.", 403, "host_only");
    }
    if (context.players.length !== 4 || !context.players.every((player) => player.isReady)) {
      throw new ApiError("يجب اكتمال أربعة لاعبين واستعدادهم.", 409, "players_not_ready");
    }
    game = startMatch(Math.floor(Math.random() * 4) as Seat);
  } else if (isGameAction(action)) {
    if (!game) throw new ApiError("لم تبدأ المباراة بعد.", 409, "game_not_started");
    try {
      game = applyGameAction(game, context.player.seat as Seat, action);
    } catch (error) {
      if (error instanceof RuleViolation) {
        throw new ApiError(error.message, 409, "illegal_move");
      }
      throw error;
    }
  } else {
    throw new ApiError("نوع الحركة غير معروف.", 400, "unknown_action");
  }

  const botSeats = new Set(
    context.players.filter((player) => player.isBot).map((player) => player.seat),
  );
  if (game && botSeats.size) {
    game = advanceBots(game, (seat) => botSeats.has(seat));
  }
  const stored: StoredRoomState = {
    ...context.stored,
    game,
    recentActionIds: [...context.stored.recentActionIds, clientActionId].slice(-24),
  };
  const status = game?.phase === "match_end" ? "finished" : "active";
  const [updated] = await getDb()
    .update(rooms)
    .set({
      stateJson: JSON.stringify(stored),
      status,
      gameVersion: sql`${rooms.gameVersion} + 1`,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(rooms.id, context.record.id), eq(rooms.gameVersion, expectedVersion)))
    .returning();
  if (!updated) throw new ApiError("سبق لاعب آخر بهذه الحركة.", 409, "stale_state");

  const refreshedPlayers = await playersForRoom(context.record.id);
  return viewFromContext({
    player: refreshedPlayers.find((player) => player.id === context.player.id)!,
    players: refreshedPlayers,
    record: updated,
    stored,
  });
}
