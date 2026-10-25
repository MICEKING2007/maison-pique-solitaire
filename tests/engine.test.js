import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMove,
  canPlaceOnFoundation,
  canPlaceOnTableau,
  cloneState,
  createDeck,
  draw,
  getAutoFinishPlan,
  getHints,
  getMovableRun,
  isWon,
  newGame,
  parseCard,
  validateState,
} from '../js/engine.js';

function makeState(overrides = {}) {
  return {
    version: 1,
    seed: 1,
    drawMode: 1,
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: Array.from({ length: 7 }, () => []),
    score: 0,
    moves: 0,
    ...overrides,
  };
}

function up(...ids) {
  return ids.map((id) => ({ id, up: true }));
}

function down(...ids) {
  return ids.map((id) => ({ id, up: false }));
}

test('new game deals 52 unique cards with seven valid columns', () => {
  const state = newGame({ seed: 42 });
  const all = [
    ...state.stock,
    ...state.waste,
    ...state.foundations.flat(),
    ...state.tableau.flat().map((card) => card.id),
  ];

  assert.equal(all.length, 52);
  assert.equal(new Set(all).size, 52);
  assert.deepEqual(new Set(all), new Set(createDeck()));
  assert.equal(state.stock.length, 24);
  state.tableau.forEach((pile, index) => {
    assert.equal(pile.length, index + 1);
    assert.equal(pile.at(-1).up, true);
    assert.equal(pile.slice(0, -1).every((card) => card.up === false), true);
  });
});

test('new game is deterministic for a seed and changes with another', () => {
  const a = newGame({ seed: 99 });
  const b = newGame({ seed: 99 });
  const c = newGame({ seed: 100 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.stock, c.stock);
});

test('draw one cycles the stock and preserves deal order on recycle', () => {
  const state = makeState({ stock: ['S1', 'S2', 'S3'], waste: [], tableau: [[...up('H1')], ...Array.from({ length: 6 }, () => [])] });
  const first = draw(state);
  assert.equal(first.ok, true);
  assert.deepEqual(first.cards, ['S3']);
  const second = draw(first.state);
  const third = draw(second.state);
  assert.deepEqual(third.state.waste, ['S3', 'S2', 'S1']);
  const recycled = draw(third.state);
  assert.equal(recycled.recycled, true);
  assert.deepEqual(recycled.state.stock, ['S1', 'S2', 'S3']);
  const after = draw(recycled.state);
  assert.deepEqual(after.cards, ['S3']);
});

test('draw three stops cleanly at the end of the stock', () => {
  const state = makeState({ drawMode: 3, stock: ['H2', 'H3', 'H4', 'H5'] });
  const first = draw(state);
  assert.deepEqual(first.cards, ['H5', 'H4', 'H3']);
  const second = draw(first.state);
  assert.deepEqual(second.cards, ['H2']);
  assert.equal(second.state.stock.length, 0);
});

test('tableau runs require descending alternating colors and a valid landing card', () => {
  const state = makeState({
    tableau: [
      up('S7', 'H6', 'C5'),
      up('D8'),
      [],
      up('H7'),
      ...Array.from({ length: 3 }, () => []),
    ],
  });

  assert.deepEqual(getMovableRun(state, 0, 0), ['S7', 'H6', 'C5']);
  assert.equal(canPlaceOnTableau(state, ['S7', 'H6', 'C5'], 1), true);
  assert.equal(canPlaceOnTableau(state, ['H7'], 0), false);
  assert.equal(canPlaceOnTableau(state, ['S7'], 3), false);
  assert.equal(canPlaceOnTableau(state, ['H6', 'C5'], 2), false);

  const result = applyMove(state, {
    from: { type: 'tableau', pile: 0, index: 0 },
    to: { type: 'tableau', pile: 1 },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.tableau[0], []);
  assert.deepEqual(
    result.state.tableau[1].map((card) => card.id),
    ['D8', 'S7', 'H6', 'C5'],
  );
  assert.equal(result.state.moves, 1);
});

test('an empty tableau column accepts only a king', () => {
  const state = makeState({
    tableau: [up('S13'), up('H12'), ...Array.from({ length: 5 }, () => [])],
  });
  assert.equal(canPlaceOnTableau(state, ['H12'], 2), false);
  assert.equal(canPlaceOnTableau(state, ['S13'], 2), true);
});

test('moving a tableau run flips the newly exposed card and awards points', () => {
  const state = makeState({
    tableau: [
      [...down('D2'), ...up('S7', 'H6')],
      up('D8'),
      ...Array.from({ length: 5 }, () => []),
    ],
    score: 3,
  });
  const result = applyMove(state, {
    from: { type: 'tableau', pile: 0, index: 1 },
    to: { type: 'tableau', pile: 1 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.flipped, 'D2');
  assert.equal(result.state.tableau[0][0].up, true);
  assert.equal(result.state.score, 8);
  assert.equal(result.state.moves, 1);
});

test('foundations are suit-locked, start with aces and build upward', () => {
  const state = makeState({ foundations: [['S1'], [], [], []] });
  assert.equal(canPlaceOnFoundation(state, 'S2', 0), true);
  assert.equal(canPlaceOnFoundation(state, 'S3', 0), false);
  assert.equal(canPlaceOnFoundation(state, 'H2', 0), false);
  assert.equal(canPlaceOnFoundation(state, 'H1', 1), true);
  assert.equal(canPlaceOnFoundation(state, 'D1', 0), false);
});

test('foundation moves score correctly and foundation cards may return', () => {
  const state = makeState({
    foundations: [['S1'], [], [], []],
    tableau: [up('S2'), up('D3'), ...Array.from({ length: 5 }, () => [])],
  });
  const placed = applyMove(state, {
    from: { type: 'tableau', pile: 0, index: 0 },
    to: { type: 'foundation', pile: 0 },
  });
  assert.equal(placed.ok, true);
  assert.equal(placed.state.score, 10);
  assert.deepEqual(placed.state.foundations[0], ['S1', 'S2']);

  const returned = applyMove(placed.state, {
    from: { type: 'foundation', pile: 0 },
    to: { type: 'tableau', pile: 1 },
  });
  assert.equal(returned.ok, true);
  assert.equal(returned.state.score, 0);
  assert.deepEqual(returned.state.foundations[0], ['S1']);
  assert.deepEqual(returned.state.tableau[1].map((card) => card.id), ['D3', 'S2']);
});

test('waste cards move to the tableau and foundation', () => {
  const state = makeState({
    waste: ['H7'],
    tableau: [up('S8'), ...Array.from({ length: 6 }, () => [])],
  });
  const toTableau = applyMove(state, {
    from: { type: 'waste' },
    to: { type: 'tableau', pile: 0 },
  });
  assert.equal(toTableau.ok, true);
  assert.equal(toTableau.state.score, 5);
  assert.deepEqual(toTableau.state.waste, []);

  const aceState = makeState({ waste: ['H1'] });
  const toFoundation = applyMove(aceState, {
    from: { type: 'waste' },
    to: { type: 'foundation', pile: 1 },
  });
  assert.equal(toFoundation.ok, true);
  assert.equal(toFoundation.state.score, 10);
});

test('invalid moves are non-destructive', () => {
  const state = makeState({ tableau: [up('S7'), up('S6')] });
  const before = JSON.stringify(state);
  const result = applyMove(state, {
    from: { type: 'tableau', pile: 0, index: 0 },
    to: { type: 'tableau', pile: 1 },
  });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});

test('hints prioritize foundation moves and reveal useful tableau moves', () => {
  const state = makeState({
    foundations: [['S1'], [], [], []],
    tableau: [up('S2'), down('H9'), up('D7'), ...Array.from({ length: 4 }, () => [])],
  });
  const hints = getHints(state);
  assert.equal(hints[0].kind, 'foundation');
  assert.equal(hints[0].cardId, 'S2');

  const revealState = makeState({
    tableau: [
      [...down('H10'), ...up('S8', 'D7')],
      up('D9'),
      ...Array.from({ length: 5 }, () => []),
    ],
  });
  const revealHints = getHints(revealState);
  assert.equal(revealHints[0].kind, 'reveal');
  assert.equal(revealHints[0].from.index, 1);
});

test('auto finish completes a fully visible endgame', () => {
  const foundations = [0, 1, 2, 3].map((index) => {
    const suit = ['S', 'H', 'C', 'D'][index];
    return Array.from({ length: 12 }, (_, rank) => `${suit}${rank + 1}`);
  });
  const state = makeState({
    foundations,
    tableau: [up('S13'), up('H13'), up('C13'), up('D13'), [], [], []],
  });
  const plan = getAutoFinishPlan(state);
  assert.ok(plan);
  assert.equal(plan.length, 4);

  let final = state;
  for (const move of plan) {
    const result = applyMove(final, move);
    assert.equal(result.ok, true);
    final = result.state;
  }
  assert.equal(isWon(final), true);
  assert.equal(getAutoFinishPlan(final).length, 0);
});

test('auto finish is withheld while hidden cards remain', () => {
  const state = makeState({
    stock: ['S13'],
    foundations: [['S1'], ['H1'], ['C1'], ['D1']],
    tableau: [down('H9'), ...Array.from({ length: 6 }, () => [])],
  });
  assert.equal(getAutoFinishPlan(state), null);
});

test('card parsing is safe for all designed ids', () => {
  const card = parseCard('D10');
  assert.equal(card.suit, 'D');
  assert.equal(card.rank, 10);
  assert.throws(() => parseCard(''), /./);
});

test('saved state validator accepts complete games and rejects tampering', () => {
  const state = newGame({ seed: 7 });
  assert.equal(validateState(state), true);

  const duplicate = cloneState(state);
  duplicate.stock[0] = duplicate.stock[1];
  assert.equal(validateState(duplicate), false);

  const missing = cloneState(state);
  missing.stock.pop();
  assert.equal(validateState(missing), false);

  const badFoundation = cloneState(state);
  badFoundation.foundations[0].push('H1');
  assert.equal(validateState(badFoundation), false);

  const badOrder = cloneState(state);
  badOrder.tableau[1][0].up = true;
  badOrder.tableau[1][1].up = false;
  assert.equal(validateState(badOrder), false);
});

test('recycling the waste costs points but never drops below zero', () => {
  const state = makeState({ stock: [], waste: ['S2'], score: 5, tableau: [up('S3')] });
  const result = draw(state);
  assert.equal(result.ok, true);
  assert.equal(result.recycled, true);
  assert.equal(result.state.score, 0);
  assert.deepEqual(result.state.stock, ['S2']);
});
