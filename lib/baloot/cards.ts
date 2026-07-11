import {
  RANKS,
  SUITS,
  type Card,
  type Contract,
  type Rank,
  type Seat,
  type Suit,
  type Team,
} from "./types.ts";

const SUN_ORDER: Rank[] = ["7", "8", "9", "J", "Q", "K", "10", "A"];
const TRUMP_ORDER: Rank[] = ["7", "8", "Q", "K", "10", "A", "9", "J"];

const PLAIN_POINTS: Record<Rank, number> = {
  "7": 0,
  "8": 0,
  "9": 0,
  "10": 10,
  J: 2,
  Q: 3,
  K: 4,
  A: 11,
};

const TRUMP_POINTS: Record<Rank, number> = {
  "7": 0,
  "8": 0,
  "9": 14,
  "10": 10,
  J: 20,
  Q: 3,
  K: 4,
  A: 11,
};

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({ id: `${suit}-${rank}`, rank, suit })),
  );
}

export function shuffleDeck(source = createDeck()): Card[] {
  const deck = source.map((card) => ({ ...card }));
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const swapIndex = random[0] % (index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function nextSeat(seat: Seat, steps = 1): Seat {
  return ((seat + steps) % 4) as Seat;
}

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function partnerOf(seat: Seat): Seat {
  return nextSeat(seat, 2);
}

export function rankStrength(card: Card, contract: Contract): number {
  const order =
    contract.kind === "hokom" && card.suit === contract.trump
      ? TRUMP_ORDER
      : SUN_ORDER;
  return order.indexOf(card.rank);
}

export function cardRawPoints(card: Card, contract: Contract): number {
  return contract.kind === "hokom" && card.suit === contract.trump
    ? TRUMP_POINTS[card.rank]
    : PLAIN_POINTS[card.rank];
}

export function compareCards(
  left: Card,
  right: Card,
  leadSuit: Suit,
  contract: Contract,
): number {
  const leftTrump = contract.kind === "hokom" && left.suit === contract.trump;
  const rightTrump = contract.kind === "hokom" && right.suit === contract.trump;
  if (leftTrump !== rightTrump) return leftTrump ? 1 : -1;
  if (left.suit !== right.suit) {
    if (left.suit === leadSuit) return 1;
    if (right.suit === leadSuit) return -1;
    return 0;
  }
  return rankStrength(left, contract) - rankStrength(right, contract);
}

export function sortHand(cards: Card[], contract: Contract | null): Card[] {
  return [...cards].sort((left, right) => {
    const suitDelta = SUITS.indexOf(left.suit) - SUITS.indexOf(right.suit);
    if (suitDelta !== 0) return suitDelta;
    if (!contract) return RANKS.indexOf(left.rank) - RANKS.indexOf(right.rank);
    return rankStrength(left, contract) - rankStrength(right, contract);
  });
}
