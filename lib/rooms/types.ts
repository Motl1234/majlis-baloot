import type { GameAction, PublicGameView, Seat } from "../baloot/types";
import type { AvatarId } from "../server/session";

export interface RoomPlayerView {
  avatar: AvatarId;
  connected: boolean;
  displayName: string;
  isBot: boolean;
  isHost: boolean;
  isReady: boolean;
  seat: Seat;
}

export interface RoomView {
  canStart: boolean;
  code: string;
  game: PublicGameView | null;
  isHost: boolean;
  mode: "multiplayer" | "quick";
  players: RoomPlayerView[];
  presenceVersion: number;
  serverTime: number;
  status: "lobby" | "active" | "finished";
  version: number;
}

export type RoomClientAction =
  | { type: "ready"; ready: boolean }
  | { type: "start" }
  | GameAction;

export interface RoomActionEnvelope {
  action: RoomClientAction;
  clientActionId: string;
  expectedVersion: number;
}
