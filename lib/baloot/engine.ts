import {
  nextSeat,
  partnerOf,
  shuffleDeck,
  sortHand,
  teamOf,
} from "./cards.ts";
import { evaluateProjects } from "./projects.ts";
import {
  currentWinningPlay,
  isLegalBid,
  legalBids,
  legalCards,
  legalDoubleCalls,
  scoreRound,
  trickRawValue,
} from "./rules.ts";
import {
  RULESET_VERSION,
  type AuctionCall,
  type BalootGameState,
  type Card,
  type Contract,
  type GameAction,
  type Project,
  type ProjectResult,
  type PublicGameView,
  type Seat,
  type Suit,
  type Team,
  type Trick,
} from "./types.ts";

export class RuleViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleViolation";
  }
}

function emptyTrick(leadSeat: Seat): Trick {
  return { leadSeat, plays: [], winner: null, points: 0 };
}

function freshRound(
  matchScores: [number, number],
  dealer: Seat,
  roundNumber: number,
  suppliedDeck?: Card[],
): BalootGameState {
  const deck = suppliedDeck
    ? suppliedDeck.map((card) => ({ ...card }))
    : shuffleDeck();
  if (deck.length !== 32 || new Set(deck.map((card) => card.id)).size !== 32) {
    throw new Error("A Baloot deck must contain 32 unique cards");
  }

  const hands: [Card[], Card[], Card[], Card[]] = [[], [], [], []];
  const order: Seat[] = [
    nextSeat(dealer),
    nextSeat(dealer, 2),
    nextSeat(dealer, 3),
    dealer,
  ];
  for (const batch of [3, 2]) {
    for (const seat of order) hands[seat].push(...deck.splice(0, batch));
  }
  const faceUpCard = deck.shift();
  if (!faceUpCard) throw new Error("The face-up card is missing");
  const first = nextSeat(dealer);

  return {
    auction: {
      round: 1,
      turn: first,
      passes: 0,
      pendingHokom: null,
      confirming: false,
      history: [],
      passedSecond: [],
    },
    completedTricks: [],
    contract: null,
    currentPlayer: first,
    currentTrick: emptyTrick(first),
    dealer,
    deck,
    doubling: null,
    faceUpCard,
    hands,
    matchScores: [...matchScores] as [number, number],
    phase: "bidding",
    projects: null,
    roundNumber,
    roundResult: null,
    rulesetVersion: RULESET_VERSION,
    trickRawPoints: [0, 0],
    tricksWon: [0, 0],
  };
}

export function startMatch(dealer: Seat = 0, deck?: Card[]): BalootGameState {
  return freshRound([0, 0], dealer, 1, deck);
}

function completeDeal(state: BalootGameState, contract: Contract): void {
  const order: Seat[] = [
    nextSeat(state.dealer),
    nextSeat(state.dealer, 2),
    nextSeat(state.dealer, 3),
    state.dealer,
  ];
  for (const seat of order) {
    if (seat === contract.receiver) {
      state.hands[seat].push(state.faceUpCard, ...state.deck.splice(0, 2));
    } else {
      state.hands[seat].push(...state.deck.splice(0, 3));
    }
  }
  if (state.deck.length !== 0 || state.hands.some((hand) => hand.length !== 8)) {
    throw new Error("The closing deal did not produce four eight-card hands");
  }
  state.contract = contract;
  state.hands = state.hands.map((hand) => sortHand(hand, contract)) as [
    Card[],
    Card[],
    Card[],
    Card[],
  ];
  state.projects = evaluateProjects(state);
  const bidderTeam = teamOf(contract.bidder);
  const eligibleOpponents = order.filter(
    (seat) => teamOf(seat) !== bidderTeam,
  );
  state.doubling = {
    turn: eligibleOpponents[0],
    eligibleOpponents,
    passedOpponents: [],
    history: [],
  };
  state.currentPlayer = eligibleOpponents[0];
  state.phase = "doubling";
}

function contractFromBid(
  state: BalootGameState,
  bidder: Seat,
  kind: "sun" | "hokom",
  trump: Suit | null,
  receiver = bidder,
  ashkal = false,
): Contract {
  return {
    bidder,
    receiver,
    kind,
    trump,
    multiplier: 1,
    riskTaker: bidder,
    doubler: null,
    locked: false,
    coffee: false,
    ashkal,
  };
}

function applyBid(state: BalootGameState, seat: Seat, call: AuctionCall, suit?: Suit): void {
  if (!isLegalBid(state, seat, call, suit)) {
    throw new RuleViolation("هذه المزايدة غير متاحة في هذا الدور.");
  }
  const auction = state.auction;
  auction.history.push({ call, round: auction.round, seat, ...(suit ? { suit } : {}) });

  if (call === "sun") {
    completeDeal(state, contractFromBid(state, seat, "sun", null));
    return;
  }
  if (call === "ashkal") {
    completeDeal(
      state,
      contractFromBid(state, seat, "sun", null, partnerOf(seat), true),
    );
    return;
  }
  if (call === "confirm_hokom" || call === "confirm_sun") {
    const pending = auction.pendingHokom;
    if (!pending) throw new RuleViolation("لا يوجد طلب حكم للتأكيد.");
    completeDeal(
      state,
      contractFromBid(
        state,
        pending.bidder,
        call === "confirm_sun" ? "sun" : "hokom",
        call === "confirm_sun" ? null : pending.suit,
        pending.receiver,
      ),
    );
    return;
  }
  if (call === "hokom") {
    if (!suit) throw new RuleViolation("يجب اختيار نوع الحكم.");
    auction.pendingHokom = { bidder: seat, receiver: seat, suit };
    auction.passes = 0;
    auction.confirming = false;
    auction.turn = nextSeat(seat);
    state.currentPlayer = auction.turn;
    return;
  }

  if (auction.round === 2 && !auction.passedSecond.includes(seat)) {
    auction.passedSecond.push(seat);
  }
  auction.passes += 1;
  if (auction.pendingHokom && auction.passes >= 3) {
    auction.confirming = true;
    auction.turn = auction.pendingHokom.bidder;
    state.currentPlayer = auction.turn;
    return;
  }
  if (!auction.pendingHokom && auction.passes >= 4) {
    if (auction.round === 1) {
      auction.round = 2;
      auction.turn = nextSeat(state.dealer);
      auction.passes = 0;
      auction.passedSecond = [];
      state.currentPlayer = auction.turn;
      return;
    }
    const redealt = freshRound(
      state.matchScores,
      nextSeat(state.dealer),
      state.roundNumber + 1,
    );
    Object.assign(state, redealt);
    return;
  }
  auction.turn = nextSeat(seat);
  state.currentPlayer = auction.turn;
}

function beginPlay(state: BalootGameState): void {
  const first = nextSeat(state.dealer);
  state.phase = "playing";
  state.currentPlayer = first;
  state.currentTrick = emptyTrick(first);
}

function applyDouble(
  state: BalootGameState,
  seat: Seat,
  call: "pass" | "double" | "triple" | "four" | "coffee",
  locked?: boolean,
): void {
  const contract = state.contract;
  const doubling = state.doubling;
  if (!contract || !doubling || !legalDoubleCalls(state, seat).includes(call)) {
    throw new RuleViolation("قرار التدبيل غير متاح الآن.");
  }
  doubling.history.push({ seat, call, ...(locked === undefined ? {} : { locked }) });

  if (contract.multiplier === 1 && call === "pass") {
    doubling.passedOpponents.push(seat);
    const next = doubling.eligibleOpponents.find(
      (candidate) => !doubling.passedOpponents.includes(candidate),
    );
    if (next !== undefined) {
      doubling.turn = next;
      state.currentPlayer = next;
    } else {
      beginPlay(state);
    }
    return;
  }
  if (call === "double") {
    contract.multiplier = 2;
    contract.doubler = seat;
    contract.riskTaker = seat;
    contract.locked = Boolean(locked);
    if (contract.kind === "sun") {
      beginPlay(state);
    } else {
      doubling.turn = contract.bidder;
      state.currentPlayer = contract.bidder;
    }
    return;
  }
  if (call === "triple") {
    contract.multiplier = 3;
    contract.riskTaker = contract.bidder;
    contract.locked = false;
    doubling.turn = contract.doubler!;
    state.currentPlayer = doubling.turn;
    return;
  }
  if (call === "four") {
    contract.multiplier = 4;
    contract.riskTaker = contract.doubler!;
    contract.locked = Boolean(locked);
    doubling.turn = contract.bidder;
    state.currentPlayer = doubling.turn;
    return;
  }
  if (call === "coffee") {
    contract.coffee = true;
    contract.riskTaker = contract.bidder;
    contract.locked = false;
    beginPlay(state);
    return;
  }
  beginPlay(state);
}

function matchWinnerAfter(scores: [number, number]): Team | null {
  if (scores[0] < 152 && scores[1] < 152) return null;
  if (scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 0 : 1;
}

function applyCard(state: BalootGameState, seat: Seat, cardId: string): void {
  const legal = legalCards(state, seat);
  const card = legal.find((candidate) => candidate.id === cardId);
  if (!card) throw new RuleViolation("يجب اختيار ورقة قانونية من يدك.");
  const handIndex = state.hands[seat].findIndex((candidate) => candidate.id === card.id);
  state.hands[seat].splice(handIndex, 1);
  state.currentTrick.plays.push({ card, seat });

  if (state.currentTrick.plays.length < 4) {
    state.currentPlayer = nextSeat(seat);
    return;
  }
  if (!state.contract) throw new Error("Missing contract during play");
  const winningPlay = currentWinningPlay(state.currentTrick, state.contract);
  if (!winningPlay) throw new Error("A complete trick must have a winner");
  const isLastTrick = state.hands.every((hand) => hand.length === 0);
  const points = trickRawValue(state.currentTrick, state.contract) + (isLastTrick ? 10 : 0);
  const completed: Trick = {
    ...state.currentTrick,
    plays: state.currentTrick.plays.map((play) => ({
      card: { ...play.card },
      seat: play.seat,
    })),
    winner: winningPlay.seat,
    points,
  };
  state.completedTricks.push(completed);
  const team = teamOf(winningPlay.seat);
  state.trickRawPoints[team] += points;
  state.tricksWon[team] += 1;

  if (!isLastTrick) {
    state.currentPlayer = winningPlay.seat;
    state.currentTrick = emptyTrick(winningPlay.seat);
    return;
  }

  const result = scoreRound(state);
  state.matchScores = [
    state.matchScores[0] + result.roundPoints[0],
    state.matchScores[1] + result.roundPoints[1],
  ];
  const winner = result.matchWinner ?? matchWinnerAfter(state.matchScores);
  state.roundResult = { ...result, matchWinner: winner };
  state.currentPlayer = winningPlay.seat;
  state.phase = winner === null ? "round_end" : "match_end";
}

export function applyGameAction(
  original: BalootGameState,
  seat: Seat,
  action: GameAction,
): BalootGameState {
  const state = structuredClone(original);
  if (action.type === "bid") {
    applyBid(state, seat, action.call, action.suit);
  } else if (action.type === "double") {
    applyDouble(state, seat, action.call, action.locked);
  } else if (action.type === "play_card") {
    applyCard(state, seat, action.cardId);
  } else if (action.type === "next_round") {
    if (state.phase !== "round_end") {
      throw new RuleViolation("لا يمكن بدء جولة جديدة الآن.");
    }
    return freshRound(
      state.matchScores,
      nextSeat(state.dealer),
      state.roundNumber + 1,
    );
  }
  return state;
}

export function projectPublicView(
  state: BalootGameState,
  seat: Seat,
): PublicGameView {
  return {
    auction: structuredClone(state.auction),
    completedTrick: state.completedTricks.at(-1) ?? null,
    contract: state.contract ? structuredClone(state.contract) : null,
    currentPlayer: state.currentPlayer,
    currentTrick: structuredClone(state.currentTrick),
    dealer: state.dealer,
    doubling: state.doubling ? structuredClone(state.doubling) : null,
    faceUpCard: { ...state.faceUpCard },
    hand: state.hands[seat].map((card) => ({ ...card })),
    handCounts: state.hands.map((hand) => hand.length) as [
      number,
      number,
      number,
      number,
    ],
    legalBids: legalBids(state, seat),
    legalCardIds: legalCards(state, seat).map((card) => card.id),
    legalDoubleCalls: legalDoubleCalls(state, seat),
    matchScores: [...state.matchScores] as [number, number],
    phase: state.phase,
    projects: publicProjects(state),
    roundNumber: state.roundNumber,
    roundResult: state.roundResult ? structuredClone(state.roundResult) : null,
    rulesetVersion: state.rulesetVersion,
    seat,
    tricksWon: [...state.tricksWon] as [number, number],
  };
}

function publicProjects(state: BalootGameState): ProjectResult | null {
  if (!state.projects || !state.contract) return null;
  const roundFinished = state.phase === "round_end" || state.phase === "match_end";
  const playedIds = new Set([
    ...state.completedTricks.flatMap((trick) => trick.plays.map((play) => play.card.id)),
    ...state.currentTrick.plays.map((play) => play.card.id),
  ]);
  const ordinaryAreVisible = state.completedTricks.length >= 1 || roundFinished;
  const visible = state.projects.counted.filter((project) => {
    if (project.kind !== "baloot") return ordinaryAreVisible;
    return roundFinished || project.cards.every((cardId) => playedIds.has(cardId));
  });
  const safeProjects: Project[] = visible.map((project) => ({
    ...project,
    cards: [],
  }));
  const gamePoints: [number, number] = [0, 0];
  for (const project of safeProjects) gamePoints[project.team] += project.gamePoints;
  const divisor = state.contract.kind === "sun" ? 5 : 10;
  return {
    all: safeProjects,
    counted: safeProjects,
    winningTeam: ordinaryAreVisible ? state.projects.winningTeam : null,
    gamePoints,
    rawEquivalent: [gamePoints[0] * divisor, gamePoints[1] * divisor],
  };
}

export function validateDeckIntegrity(state: BalootGameState): boolean {
  const cards = [
    ...state.deck,
    ...state.hands.flat(),
    ...(state.phase === "bidding" ? [state.faceUpCard] : []),
    ...state.completedTricks.flatMap((trick) => trick.plays.map((play) => play.card)),
    ...state.currentTrick.plays.map((play) => play.card),
  ];
  return cards.length === 32 && new Set(cards.map((card) => card.id)).size === 32;
}
