export const RULESET_VERSION = 1;

export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;
export type ContractKind = "sun" | "hokom";
export type GamePhase =
  | "bidding"
  | "doubling"
  | "playing"
  | "round_end"
  | "match_end";

export interface Card {
  id: string;
  rank: Rank;
  suit: Suit;
}

export type AuctionCall =
  | "pass"
  | "sun"
  | "hokom"
  | "ashkal"
  | "confirm_hokom"
  | "confirm_sun";

export interface BidRecord {
  call: AuctionCall;
  round: 1 | 2;
  seat: Seat;
  suit?: Suit;
}

export interface PendingHokom {
  bidder: Seat;
  receiver: Seat;
  suit: Suit;
}

export interface AuctionState {
  round: 1 | 2;
  turn: Seat;
  passes: number;
  pendingHokom: PendingHokom | null;
  confirming: boolean;
  history: BidRecord[];
  passedSecond: Seat[];
}

export interface Contract {
  bidder: Seat;
  receiver: Seat;
  kind: ContractKind;
  trump: Suit | null;
  multiplier: 1 | 2 | 3 | 4;
  riskTaker: Seat;
  doubler: Seat | null;
  locked: boolean;
  coffee: boolean;
  ashkal: boolean;
}

export type DoubleCall = "pass" | "double" | "triple" | "four" | "coffee";

export interface DoublingState {
  turn: Seat;
  eligibleOpponents: Seat[];
  passedOpponents: Seat[];
  history: Array<{ seat: Seat; call: DoubleCall; locked?: boolean }>;
}

export interface TrickPlay {
  card: Card;
  seat: Seat;
}

export interface Trick {
  leadSeat: Seat;
  plays: TrickPlay[];
  winner: Seat | null;
  points: number;
}

export type ProjectKind =
  | "sequence_three"
  | "sequence_four"
  | "sequence_hundred"
  | "four_kind_hundred"
  | "four_hundred"
  | "baloot";

export interface Project {
  cards: string[];
  gamePoints: number;
  highRank: Rank;
  kind: ProjectKind;
  seat: Seat;
  team: Team;
}

export interface ProjectResult {
  all: Project[];
  counted: Project[];
  winningTeam: Team | null;
  gamePoints: [number, number];
  rawEquivalent: [number, number];
}

export interface RoundResult {
  cardGamePoints: [number, number];
  cardRawPoints: [number, number];
  contractMade: boolean;
  kaboot: Team | null;
  matchWinner: Team | null;
  projectPoints: [number, number];
  reason: string;
  roundPoints: [number, number];
  winningTeam: Team | null;
}

export interface BalootGameState {
  auction: AuctionState;
  completedTricks: Trick[];
  contract: Contract | null;
  currentPlayer: Seat;
  currentTrick: Trick;
  dealer: Seat;
  deck: Card[];
  doubling: DoublingState | null;
  faceUpCard: Card;
  hands: [Card[], Card[], Card[], Card[]];
  matchScores: [number, number];
  phase: GamePhase;
  projects: ProjectResult | null;
  roundNumber: number;
  roundResult: RoundResult | null;
  rulesetVersion: number;
  trickRawPoints: [number, number];
  tricksWon: [number, number];
}

export type GameAction =
  | { type: "bid"; call: AuctionCall; suit?: Suit }
  | { type: "double"; call: DoubleCall; locked?: boolean }
  | { type: "play_card"; cardId: string }
  | { type: "next_round" };

export interface LegalBid {
  call: AuctionCall;
  suit?: Suit;
}

export interface PublicGameView {
  auction: AuctionState;
  completedTrick: Trick | null;
  contract: Contract | null;
  currentPlayer: Seat;
  currentTrick: Trick;
  dealer: Seat;
  doubling: DoublingState | null;
  faceUpCard: Card;
  hand: Card[];
  handCounts: [number, number, number, number];
  legalBids: LegalBid[];
  legalCardIds: string[];
  legalDoubleCalls: DoubleCall[];
  matchScores: [number, number];
  phase: GamePhase;
  projects: ProjectResult | null;
  roundNumber: number;
  roundResult: RoundResult | null;
  rulesetVersion: number;
  seat: Seat;
  tricksWon: [number, number];
}
