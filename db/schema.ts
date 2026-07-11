import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    status: text("status").notNull().default("lobby"),
    hostPlayerId: text("host_player_id").notNull(),
    rulesetVersion: integer("ruleset_version").notNull().default(1),
    gameVersion: integer("game_version").notNull().default(0),
    presenceVersion: integer("presence_version").notNull().default(0),
    stateJson: text("state_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("rooms_code_unique").on(table.code),
    index("rooms_status_updated_idx").on(table.status, table.updatedAt),
  ],
);

export const roomPlayers = sqliteTable(
  "room_players",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    seat: integer("seat").notNull(),
    displayName: text("display_name").notNull(),
    avatar: text("avatar").notNull().default("sword"),
    sessionHash: text("session_hash"),
    isBot: integer("is_bot", { mode: "boolean" }).notNull().default(false),
    isReady: integer("is_ready", { mode: "boolean" }).notNull().default(true),
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    clientInstanceId: text("client_instance_id"),
  },
  (table) => [
    uniqueIndex("room_players_room_seat_unique").on(table.roomId, table.seat),
    uniqueIndex("room_players_session_hash_unique").on(table.sessionHash),
    index("room_players_room_idx").on(table.roomId),
    index("room_players_last_seen_idx").on(table.lastSeenAt),
  ],
);

export type RoomRecord = typeof rooms.$inferSelect;
export type RoomPlayerRecord = typeof roomPlayers.$inferSelect;
