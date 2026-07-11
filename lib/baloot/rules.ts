import {
  cardRawPoints,
  compareCards,
  nextSeat,
  partnerOf,
  rankStrength,
  teamOf,
} from "./cards.ts";
import type {
  AuctionCall,
  BalootGameState,
  Card,
  Contract,
  DoubleCall,
  LegalBid,
  RoundResult,
  Seat,
  Team,
  Trick,
  TrickPlay,
} from "./types.ts";

export function currentWinningPlay(trick: Trick, contract: Contract): TrickPlay | null {
  if (!trick.plays.length) return null;
  const leadSuit = trick.plays[0].card.suit;
  return trick.plays.reduce((winner, play) =>
    compareCards(play.card, winner.card, leadSuit, contract) > 0 ? play : winner,
  );
}

function topCardIsCertain(card: Card, contract: Contract): boolean {
  if (contract.kind === "hokom" && card.suit === contract.trump) {
    return card.rank === "J";
  }
  return card.rank === "A";
}

export function legalCards(state: BalootGameState, seat: Seat): Card[] {
  const contract = state.contract;
  const hand = state.hands[seat];
  if (state.phase !== "playing" || !contract || state.currentPlayer !== seat) return [];
  if (!state.currentTrick.plays.length) {
    if (contract.kind === "hokom" && contract.locked && contract.trump) {
      const nonTrump = hand.filter((card) => card.suit !== contract.trump);
      if (nonTrump.length) return nonTrump;
    }
    return hand;
  }

  const leadSuit = state.currentTrick.plays[0].card.suit;
  const sameSuit = hand.filter((card) => card.suit === leadSuit);
  const winner = currentWinningPlay(state.currentTrick, contract);
  if (sameSuit.length) {
    if (
      contract.kind === "hokom" &&
      leadSuit === contract.trump &&
      winner &&
      teamOf(winner.seat) !== teamOf(seat)
    ) {
      const higher = sameSuit.filter(
        (card) => rankStrength(card, contract) > rankStrength(winner.card, contract),
      );
      if (higher.length) return higher;
    }
    return sameSuit;
  }

  if (contract.kind === "sun" || !contract.trump || !winner) return hand;

  const partnerWinning = winner.seat === partnerOf(seat);
  const playerIsFourth = state.currentTrick.plays.length === 3;
  const playerIsThird = state.currentTrick.plays.length === 2;
  const partnerLedCertainTop =
    playerIsThird &&
    state.currentTrick.plays[0].seat === partnerOf(seat) &&
    topCardIsCertain(state.currentTrick.plays[0].card, contract);
  if (partnerWinning && (playerIsFourth || partnerLedCertainTop)) return hand;

  const trumps = hand.filter((card) => card.suit === contract.trump);
  if (!trumps.length) return hand;
  const trumpAlreadyWinning = winner.card.suit === contract.trump;
  const winningTrumps = trumpAlreadyWinning
    ? trumps.filter(
        (card) => rankStrength(card, contract) > rankStrength(winner.card, contract),
      )
    : trumps;
  return winningTrumps.length ? winningTrumps : hand;
}

function canAshkal(state: BalootGameState, seat: Seat): boolean {
  const pending = state.auction.pendingHokom;
  if (!pending || teamOf(pending.bidder) === teamOf(seat)) return false;
  const dealerLeft = nextSeat(state.dealer, 3);
  if (seat !== state.dealer && seat !== dealerLeft) return false;
  return !state.auction.passedSecond.includes(seat);
}

export function legalBids(state: BalootGameState, seat: Seat): LegalBid[] {
  if (state.phase !== "bidding" || state.auction.turn !== seat) return [];
  const auction = state.auction;
  const faceSuit = state.faceUpCard.suit;
  const first = nextSeat(state.dealer);

  if (auction.confirming && auction.pendingHokom?.bidder === seat) {
    const bids: LegalBid[] = [{ call: "confirm_hokom" }];
    if (state.faceUpCard.rank !== "A" || seat === first) {
      bids.push({ call: "confirm_sun" });
    }
    return bids;
  }

  const bids: LegalBid[] = [{ call: "pass" }, { call: "sun" }];
  if (auction.pendingHokom) {
    if (canAshkal(state, seat)) bids.push({ call: "ashkal" });
    return bids;
  }

  if (auction.round === 1) {
    bids.push({ call: "hokom", suit: faceSuit });
  } else {
    for (const suit of ["spades", "hearts", "diamonds", "clubs"] as const) {
      if (suit !== faceSuit) bids.push({ call: "hokom", suit });
    }
  }
  return bids;
}

export function isLegalBid(
  state: BalootGameState,
  seat: Seat,
  call: AuctionCall,
  suit?: string,
): boolean {
  return legalBids(state, seat).some(
    (bid) => bid.call === call && (bid.suit ?? null) === (suit ?? null),
  );
}

export function legalDoubleCalls(state: BalootGameState, seat: Seat): DoubleCall[] {
  const contract = state.contract;
  if (
    state.phase !== "doubling" ||
    !contract ||
    !state.doubling ||
    state.doubling.turn !== seat
  ) {
    return [];
  }

  if (contract.multiplier === 1) {
    const calls: DoubleCall[] = ["pass"];
    const bidderTeam = teamOf(contract.bidder);
    const opponentTeam = (1 - bidderTeam) as Team;
    const sunDoubleAllowed =
      contract.kind === "sun" &&
      state.matchScores[bidderTeam] > 100 &&
      state.matchScores[opponentTeam] <= 100;
    if (contract.kind === "hokom" || sunDoubleAllowed) calls.push("double");
    return calls;
  }
  if (contract.kind === "sun") return ["pass"];
  if (contract.multiplier === 2 && seat === contract.bidder) return ["pass", "triple"];
  if (contract.multiplier === 3 && seat === contract.doubler) return ["pass", "four"];
  if (contract.multiplier === 4 && seat === contract.bidder) return ["pass", "coffee"];
  return ["pass"];
}

export function trickRawValue(trick: Trick, contract: Contract): number {
  return trick.plays.reduce((sum, play) => sum + cardRawPoints(play.card, contract), 0);
}

function convertCountedRaw(raw: number, contract: Contract): number {
  if (contract.kind === "hokom") return Math.floor((raw + 4) / 10);
  const remainder = raw % 10;
  if (remainder === 5) return raw / 5;
  const rounded = remainder <= 4 ? raw - remainder : raw + (10 - remainder);
  return rounded / 5;
}

export function cardGamePoints(
  raw: [number, number],
  contract: Contract,
): [number, number] {
  const base = contract.kind === "sun" ? 26 : 16;
  const riskTeam = teamOf(contract.riskTaker);
  const countedTeam = (1 - riskTeam) as Team;
  const result: [number, number] = [0, 0];
  result[countedTeam] = convertCountedRaw(raw[countedTeam], contract);
  result[riskTeam] = base - result[countedTeam];
  return result;
}

function effectiveProjectPoints(state: BalootGameState): [number, number] {
  const points: [number, number] = [0, 0];
  if (!state.projects || !state.contract) return points;
  for (const project of state.projects.counted) {
    const multiplier =
      state.contract.multiplier >= 2 && project.kind !== "baloot" ? 2 : 1;
    points[project.team] += project.gamePoints * multiplier;
  }
  return points;
}

function projectRawForComparison(state: BalootGameState): [number, number] {
  return state.projects?.rawEquivalent ?? [0, 0];
}

function projectPointsForWinnerOnly(
  projects: [number, number],
  winner: Team,
): [number, number] {
  return winner === 0 ? [projects[0], 0] : [0, projects[1]];
}

export function scoreRound(state: BalootGameState): RoundResult {
  if (!state.contract) throw new Error("Cannot score a round without a contract");
  const contract = state.contract;
  const base = contract.kind === "sun" ? 26 : 16;
  const projects = effectiveProjectPoints(state);
  const projectRaw = projectRawForComparison(state);
  const rawTotals: [number, number] = [
    state.trickRawPoints[0] + projectRaw[0],
    state.trickRawPoints[1] + projectRaw[1],
  ];
  const converted = cardGamePoints(state.trickRawPoints, contract);
  const riskTeam = teamOf(contract.riskTaker);
  const otherTeam = (1 - riskTeam) as Team;
  const kaboot: Team | null =
    state.tricksWon[0] === 8 ? 0 : state.tricksWon[1] === 8 ? 1 : null;

  let winningTeam: Team | null =
    rawTotals[0] === rawTotals[1] ? null : rawTotals[0] > rawTotals[1] ? 0 : 1;
  let contractMade = rawTotals[teamOf(contract.bidder)] >= rawTotals[(1 - teamOf(contract.bidder)) as Team];
  let roundPoints: [number, number] = [0, 0];
  let reason = "تم احتساب الأبناط والمشاريع وفق لائحة البطولة السعودية.";

  if (kaboot !== null) {
    winningTeam = kaboot;
    contractMade = kaboot === teamOf(contract.bidder);
    const kabootValue = contract.kind === "sun" ? 44 : 25;
    const winnerProjects = projectPointsForWinnerOnly(projects, kaboot);
    roundPoints[kaboot] = kabootValue + winnerProjects[kaboot];
    reason = `كبوت كامل: ${kabootValue} نقطة قبل المشاريع.`;
  } else if (contract.multiplier >= 2) {
    if (winningTeam === null) winningTeam = otherTeam;
    roundPoints[winningTeam] = base * contract.multiplier + projects[winningTeam];
    contractMade = winningTeam === teamOf(contract.bidder);
    reason = `حُسمت اليد على مضاعفة ×${contract.multiplier}؛ الخاسر لا يسجل.`;
  } else {
    const bidderTeam = teamOf(contract.bidder);
    const bidderOther = (1 - bidderTeam) as Team;
    contractMade = rawTotals[bidderTeam] >= rawTotals[bidderOther];
    if (!contractMade) {
      winningTeam = bidderOther;
      roundPoints[bidderOther] = base + projects[bidderOther];
      reason = `سقط المشتري؛ سُجّل كامل ${base} للخصم مع مشاريعه.`;
    } else {
      roundPoints = [converted[0] + projects[0], converted[1] + projects[1]];
      if (winningTeam === null) {
        reason = "تعادل صحيح؛ سجّل كل فريق قيده والمشتري ناجح.";
      }
    }
  }

  return {
    cardGamePoints: converted,
    cardRawPoints: [...state.trickRawPoints] as [number, number],
    contractMade,
    kaboot,
    matchWinner: contract.coffee ? winningTeam : null,
    projectPoints: projects,
    reason,
    roundPoints,
    winningTeam,
  };
}
