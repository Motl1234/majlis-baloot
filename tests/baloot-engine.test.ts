import assert from "node:assert/strict";
import test from "node:test";
import { createDeck, nextSeat } from "../lib/baloot/cards.ts";
import {
  applyGameAction,
  projectPublicView,
  startMatch,
  validateDeckIntegrity,
} from "../lib/baloot/engine.ts";
import { evaluateProjects } from "../lib/baloot/projects.ts";
import { legalCards, scoreRound } from "../lib/baloot/rules.ts";
import type {
  BalootGameState,
  Card,
  Contract,
  ProjectResult,
  Seat,
  Suit,
} from "../lib/baloot/types.ts";

function card(id: string): Card {
  const [suit, rank] = id.split("-") as [Suit, Card["rank"]];
  return { id, suit, rank };
}

function contract(kind: "sun" | "hokom", bidder: Seat = 0): Contract {
  return {
    bidder,
    receiver: bidder,
    kind,
    trump: kind === "hokom" ? "hearts" : null,
    multiplier: 1,
    riskTaker: bidder,
    doubler: null,
    locked: false,
    coffee: false,
    ashkal: false,
  };
}

function noProjects(): ProjectResult {
  return {
    all: [],
    counted: [],
    winningTeam: null,
    gamePoints: [0, 0],
    rawEquivalent: [0, 0],
  };
}

function scoringState(
  kind: "sun" | "hokom",
  raw: [number, number],
): BalootGameState {
  const state = startMatch(3, createDeck());
  state.contract = contract(kind, 0);
  state.phase = "round_end";
  state.trickRawPoints = raw;
  state.tricksWon = [4, 4];
  state.projects = noProjects();
  return state;
}

test("opening deal preserves all 32 unique cards", () => {
  const state = startMatch(0, createDeck());
  assert.deepEqual(state.hands.map((hand) => hand.length), [5, 5, 5, 5]);
  assert.equal(state.deck.length, 11);
  assert.equal(state.currentPlayer, nextSeat(0));
  assert.equal(validateDeckIntegrity(state), true);
});

test("two all-pass auction rounds redeal to the next dealer", () => {
  let state = startMatch(0, createDeck());
  for (let index = 0; index < 4; index += 1) {
    state = applyGameAction(state, state.currentPlayer, { type: "bid", call: "pass" });
  }
  assert.equal(state.auction.round, 2);
  for (let index = 0; index < 4; index += 1) {
    state = applyGameAction(state, state.currentPlayer, { type: "bid", call: "pass" });
  }
  assert.equal(state.dealer, 1);
  assert.equal(state.auction.round, 1);
  assert.equal(validateDeckIntegrity(state), true);
});

test("a provisional first-round hokom waits for confirmation", () => {
  let state = startMatch(0, createDeck());
  const bidder = state.currentPlayer;
  state = applyGameAction(state, bidder, {
    type: "bid",
    call: "hokom",
    suit: state.faceUpCard.suit,
  });
  for (let index = 0; index < 3; index += 1) {
    state = applyGameAction(state, state.currentPlayer, { type: "bid", call: "pass" });
  }
  assert.equal(state.auction.confirming, true);
  assert.equal(state.currentPlayer, bidder);
  state = applyGameAction(state, bidder, { type: "bid", call: "confirm_hokom" });
  assert.equal(state.phase, "doubling");
  assert.equal(state.contract?.kind, "hokom");
  assert.deepEqual(state.hands.map((hand) => hand.length), [8, 8, 8, 8]);
  assert.equal(validateDeckIntegrity(state), true);
});

test("following the led suit is mandatory", () => {
  const state = startMatch();
  state.phase = "playing";
  state.contract = contract("sun");
  state.currentPlayer = 0;
  state.hands[0] = [card("spades-7"), card("hearts-A")];
  state.currentTrick = {
    leadSeat: 3,
    plays: [{ seat: 3, card: card("spades-A") }],
    winner: null,
    points: 0,
  };
  assert.deepEqual(legalCards(state, 0).map((item) => item.id), ["spades-7"]);
});

test("hokom requires a winning trump when the opponent leads", () => {
  const state = startMatch();
  state.phase = "playing";
  state.contract = contract("hokom");
  state.currentPlayer = 0;
  state.hands[0] = [card("hearts-9"), card("clubs-A")];
  state.currentTrick = {
    leadSeat: 3,
    plays: [{ seat: 3, card: card("spades-A") }],
    winner: null,
    points: 0,
  };
  assert.deepEqual(legalCards(state, 0).map((item) => item.id), ["hearts-9"]);
});

test("official sun ties and purchase failure thresholds", () => {
  const tie = scoreRound(scoringState("sun", [65, 65]));
  assert.equal(tie.contractMade, true);
  assert.deepEqual(tie.roundPoints, [13, 13]);

  const failed = scoreRound(scoringState("sun", [64, 66]));
  assert.equal(failed.contractMade, false);
  assert.deepEqual(failed.roundPoints, [0, 26]);
});

test("official hokom ties and purchase failure thresholds", () => {
  const tie = scoreRound(scoringState("hokom", [81, 81]));
  assert.equal(tie.contractMade, true);
  assert.deepEqual(tie.roundPoints, [8, 8]);

  const failed = scoreRound(scoringState("hokom", [80, 82]));
  assert.equal(failed.contractMade, false);
  assert.deepEqual(failed.roundPoints, [0, 16]);
});

test("official kaboot values cancel ordinary multiplication", () => {
  const sun = scoringState("sun", [130, 0]);
  sun.tricksWon = [8, 0];
  sun.contract!.multiplier = 2;
  assert.deepEqual(scoreRound(sun).roundPoints, [44, 0]);

  const hokom = scoringState("hokom", [162, 0]);
  hokom.tricksWon = [8, 0];
  hokom.contract!.multiplier = 4;
  assert.deepEqual(scoreRound(hokom).roundPoints, [25, 0]);
});

test("public projection exposes only the requesting player's hand", () => {
  const state = startMatch(0, createDeck());
  const view = projectPublicView(state, 1);
  assert.equal(view.hand.length, 5);
  assert.deepEqual(view.handCounts, [5, 5, 5, 5]);
  assert.equal("hands" in view, false);
  assert.equal("deck" in view, false);
});

test("a sequential hundred outranks a four-kind hundred", () => {
  const state = startMatch(3, createDeck());
  state.contract = contract("sun", 0);
  state.hands = [
    [card("spades-7"), card("spades-8"), card("spades-9"), card("spades-10"), card("spades-J")],
    [card("spades-K"), card("hearts-K"), card("diamonds-K"), card("clubs-K")],
    [],
    [],
  ];
  const projects = evaluateProjects(state);
  assert.equal(projects.winningTeam, 0);
  assert.equal(projects.counted.length, 1);
  assert.equal(projects.counted[0].kind, "sequence_hundred");
  assert.deepEqual(projects.gamePoints, [20, 0]);
});

test("four aces are four hundred in sun", () => {
  const state = startMatch(3, createDeck());
  state.contract = contract("sun", 0);
  state.hands = [
    [card("spades-A"), card("hearts-A"), card("diamonds-A"), card("clubs-A")],
    [],
    [],
    [],
  ];
  const projects = evaluateProjects(state);
  assert.equal(projects.counted[0].kind, "four_hundred");
  assert.deepEqual(projects.gamePoints, [40, 0]);
});

test("public projects never expose their card identifiers", () => {
  const state = startMatch(3, createDeck());
  state.contract = contract("sun", 0);
  state.phase = "playing";
  state.hands = [
    [card("spades-7"), card("spades-8"), card("spades-9")],
    [],
    [],
    [],
  ];
  state.projects = evaluateProjects(state);
  assert.deepEqual(projectPublicView(state, 0).projects?.counted, []);
  state.completedTricks.push({
    leadSeat: 0,
    plays: [
      { seat: 0, card: card("clubs-7") },
      { seat: 1, card: card("clubs-8") },
      { seat: 2, card: card("clubs-9") },
      { seat: 3, card: card("clubs-10") },
    ],
    winner: 3,
    points: 10,
  });
  const visible = projectPublicView(state, 0).projects?.counted ?? [];
  assert.equal(visible.length, 1);
  assert.deepEqual(visible[0].cards, []);
});
