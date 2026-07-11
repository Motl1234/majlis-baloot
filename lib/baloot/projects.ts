import { nextSeat, teamOf } from "./cards.ts";
import type {
  BalootGameState,
  Card,
  Contract,
  Project,
  ProjectKind,
  ProjectResult,
  Rank,
  Seat,
} from "./types.ts";

const SEQUENCE_RANKS: Rank[] = ["7", "8", "9", "10", "J", "Q", "K", "A"];
const FOUR_KIND_RANKS: Rank[] = ["10", "J", "Q", "K", "A"];

function projectPoints(kind: ProjectKind, contract: Contract): number {
  const sun = contract.kind === "sun";
  switch (kind) {
    case "sequence_three":
      return sun ? 4 : 2;
    case "sequence_four":
      return sun ? 10 : 5;
    case "sequence_hundred":
    case "four_kind_hundred":
      return sun ? 20 : 10;
    case "four_hundred":
      return 40;
    case "baloot":
      return 2;
  }
}

function projectPriority(project: Project): number {
  switch (project.kind) {
    case "four_hundred":
      return 500;
    case "sequence_hundred":
      return 410;
    case "four_kind_hundred":
      return 400;
    case "sequence_four":
      return 300;
    case "sequence_three":
      return 200;
    case "baloot":
      return 0;
  }
}

function cardsOverlap(left: Project, right: Project): boolean {
  return left.cards.some((card) => right.cards.includes(card));
}

function compareProjectStrength(left: Project, right: Project, dealer: Seat): number {
  const priority = projectPriority(left) - projectPriority(right);
  if (priority !== 0) return priority;
  const rank =
    SEQUENCE_RANKS.indexOf(left.highRank) - SEQUENCE_RANKS.indexOf(right.highRank);
  if (rank !== 0) return rank;
  const first = nextSeat(dealer);
  const leftDistance = (left.seat - first + 4) % 4;
  const rightDistance = (right.seat - first + 4) % 4;
  return rightDistance - leftDistance;
}

function sequenceCandidates(hand: Card[], seat: Seat, contract: Contract): Project[] {
  const candidates: Project[] = [];
  for (const suit of ["spades", "hearts", "diamonds", "clubs"] as const) {
    const cards = hand
      .filter((card) => card.suit === suit)
      .sort(
        (left, right) =>
          SEQUENCE_RANKS.indexOf(left.rank) - SEQUENCE_RANKS.indexOf(right.rank),
      );
    let run: Card[] = [];
    for (const card of cards) {
      const expected = run.length
        ? SEQUENCE_RANKS.indexOf(run[run.length - 1].rank) + 1
        : SEQUENCE_RANKS.indexOf(card.rank);
      if (!run.length || SEQUENCE_RANKS.indexOf(card.rank) === expected) {
        run.push(card);
      } else {
        if (run.length >= 3) candidates.push(sequenceProject(run, seat, contract));
        run = [card];
      }
    }
    if (run.length >= 3) candidates.push(sequenceProject(run, seat, contract));
  }
  return candidates;
}

function sequenceProject(cards: Card[], seat: Seat, contract: Contract): Project {
  const kind: ProjectKind =
    cards.length >= 5
      ? "sequence_hundred"
      : cards.length === 4
        ? "sequence_four"
        : "sequence_three";
  return {
    cards: cards.map((card) => card.id),
    gamePoints: projectPoints(kind, contract),
    highRank: cards[cards.length - 1].rank,
    kind,
    seat,
    team: teamOf(seat),
  };
}

function fourKindCandidates(hand: Card[], seat: Seat, contract: Contract): Project[] {
  return FOUR_KIND_RANKS.flatMap((rank) => {
    const cards = hand.filter((card) => card.rank === rank);
    if (cards.length !== 4) return [];
    const kind: ProjectKind =
      contract.kind === "sun" && rank === "A"
        ? "four_hundred"
        : "four_kind_hundred";
    return [
      {
        cards: cards.map((card) => card.id),
        gamePoints: projectPoints(kind, contract),
        highRank: rank,
        kind,
        seat,
        team: teamOf(seat),
      },
    ];
  });
}

function bestOrdinaryProjects(candidates: Project[], dealer: Seat): Project[] {
  const options: Project[][] = [[]];
  for (let first = 0; first < candidates.length; first += 1) {
    options.push([candidates[first]]);
    for (let second = first + 1; second < candidates.length; second += 1) {
      if (!cardsOverlap(candidates[first], candidates[second])) {
        options.push([candidates[first], candidates[second]]);
      }
    }
  }
  options.sort((left, right) => {
    const leftSorted = [...left].sort((a, b) => -compareProjectStrength(a, b, dealer));
    const rightSorted = [...right].sort((a, b) => -compareProjectStrength(a, b, dealer));
    const strongestLeft = leftSorted[0];
    const strongestRight = rightSorted[0];
    if (!strongestLeft || !strongestRight) return right.length - left.length;
    const strongest = compareProjectStrength(strongestRight, strongestLeft, dealer);
    if (strongest !== 0) return strongest;
    const totalLeft = left.reduce((sum, project) => sum + project.gamePoints, 0);
    const totalRight = right.reduce((sum, project) => sum + project.gamePoints, 0);
    return totalRight - totalLeft;
  });
  return options[0] ?? [];
}

function balootProject(
  hand: Card[],
  seat: Seat,
  contract: Contract,
  ordinary: Project[],
): Project | null {
  if (contract.kind !== "hokom" || !contract.trump) return null;
  const king = hand.find(
    (card) => card.suit === contract.trump && card.rank === "K",
  );
  const queen = hand.find(
    (card) => card.suit === contract.trump && card.rank === "Q",
  );
  if (!king || !queen) return null;
  const blockedByFourKind = ordinary.some(
    (project) =>
      project.kind === "four_kind_hundred" &&
      (project.highRank === "K" || project.highRank === "Q"),
  );
  if (blockedByFourKind) return null;
  return {
    cards: [king.id, queen.id],
    gamePoints: 2,
    highRank: "K",
    kind: "baloot",
    seat,
    team: teamOf(seat),
  };
}

export function evaluateProjects(state: BalootGameState): ProjectResult {
  if (!state.contract) {
    return {
      all: [],
      counted: [],
      winningTeam: null,
      gamePoints: [0, 0],
      rawEquivalent: [0, 0],
    };
  }

  const ordinary = state.hands.flatMap((hand, index) => {
    const seat = index as Seat;
    const candidates = [
      ...sequenceCandidates(hand, seat, state.contract!),
      ...fourKindCandidates(hand, seat, state.contract!),
    ];
    return bestOrdinaryProjects(candidates, state.dealer);
  });
  const baloot = state.hands.flatMap((hand, index) => {
    const project = balootProject(
      hand,
      index as Seat,
      state.contract!,
      ordinary.filter((item) => item.seat === index),
    );
    return project ? [project] : [];
  });

  const strongestByTeam = ([0, 1] as const).map((team) =>
    ordinary
      .filter((project) => project.team === team)
      .sort((left, right) => -compareProjectStrength(left, right, state.dealer))[0] ??
    null,
  );
  let winningTeam: 0 | 1 | null = null;
  if (strongestByTeam[0] && !strongestByTeam[1]) winningTeam = 0;
  if (strongestByTeam[1] && !strongestByTeam[0]) winningTeam = 1;
  if (strongestByTeam[0] && strongestByTeam[1]) {
    winningTeam =
      compareProjectStrength(strongestByTeam[0], strongestByTeam[1], state.dealer) >= 0
        ? 0
        : 1;
  }

  const counted = [
    ...ordinary.filter((project) => project.team === winningTeam),
    ...baloot,
  ];
  const gamePoints: [number, number] = [0, 0];
  for (const project of counted) gamePoints[project.team] += project.gamePoints;
  const divisor = state.contract.kind === "sun" ? 5 : 10;
  return {
    all: [...ordinary, ...baloot],
    counted,
    winningTeam,
    gamePoints,
    rawEquivalent: [gamePoints[0] * divisor, gamePoints[1] * divisor],
  };
}
