import { cardRawPoints, rankStrength } from "./cards.ts";
import { applyGameAction } from "./engine.ts";
import { legalBids, legalCards, legalDoubleCalls } from "./rules.ts";
import type { BalootGameState, GameAction, LegalBid, Seat } from "./types.ts";

function chooseBid(state: BalootGameState, seat: Seat): GameAction {
  const legal = legalBids(state, seat);
  const confirmation = legal.find((bid) => bid.call === "confirm_hokom");
  if (confirmation) return { type: "bid", call: confirmation.call };

  const hand = state.hands[seat];
  const sunStrength = hand.reduce((sum, card) => {
    const values: Record<string, number> = { A: 6, "10": 5, K: 2, Q: 1, J: 1 };
    return sum + (values[card.rank] ?? 0);
  }, 0);
  const hokomBids = legal.filter((bid) => bid.call === "hokom");
  const bestHokom = hokomBids
    .map((bid) => ({ bid, value: trumpBidValue(hand, bid) }))
    .sort((left, right) => right.value - left.value)[0];
  const sun = legal.find((bid) => bid.call === "sun");

  if (sun && sunStrength >= 18) return { type: "bid", call: "sun" };
  if (bestHokom && bestHokom.value >= (state.auction.round === 2 ? 13 : 16)) {
    return { type: "bid", call: "hokom", suit: bestHokom.bid.suit };
  }
  return { type: "bid", call: "pass" };
}

function trumpBidValue(hand: BalootGameState["hands"][number], bid: LegalBid): number {
  if (!bid.suit) return 0;
  const values: Record<string, number> = {
    J: 9,
    "9": 7,
    A: 5,
    "10": 4,
    K: 2,
    Q: 1,
    "8": 1,
    "7": 1,
  };
  return hand
    .filter((card) => card.suit === bid.suit)
    .reduce((sum, card) => sum + values[card.rank], 0);
}

function chooseDouble(state: BalootGameState, seat: Seat): GameAction {
  const legal = legalDoubleCalls(state, seat);
  if (legal.includes("double") && state.hands[seat].filter((card) => {
    if (!state.contract) return false;
    return rankStrength(card, state.contract) >= 6;
  }).length >= 4) {
    return { type: "double", call: "double", locked: false };
  }
  return { type: "double", call: "pass" };
}

function chooseCard(state: BalootGameState, seat: Seat): GameAction {
  const legal = legalCards(state, seat);
  if (!state.contract || !legal.length) throw new Error("Bot has no legal card");
  const selected = [...legal].sort((left, right) => {
    const pointDelta =
      cardRawPoints(left, state.contract!) - cardRawPoints(right, state.contract!);
    return pointDelta || rankStrength(left, state.contract!) - rankStrength(right, state.contract!);
  })[0];
  return { type: "play_card", cardId: selected.id };
}

export function advanceBots(
  original: BalootGameState,
  isBotSeat: (seat: Seat) => boolean,
): BalootGameState {
  let state = original;
  for (let step = 0; step < 96; step += 1) {
    if (state.phase === "round_end" || state.phase === "match_end") return state;
    const seat = state.currentPlayer;
    if (!isBotSeat(seat)) return state;
    const action =
      state.phase === "bidding"
        ? chooseBid(state, seat)
        : state.phase === "doubling"
          ? chooseDouble(state, seat)
          : chooseCard(state, seat);
    state = applyGameAction(state, seat, action);
  }
  throw new Error("Bot action guard exceeded");
}
