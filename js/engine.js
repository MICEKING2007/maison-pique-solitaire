/**
 * Maison Pique — Klondike solitaire engine.
 * Pure, DOM-free state transitions so the rules can be tested independently.
 */

export const SUITS = ['S', 'H', 'C', 'D'];
export const FOUNDATION_SUITS = ['S', 'H', 'C', 'D'];

export const SUIT_META = {
  S: { name: '黑桃', symbol: '♠', color: 'ink' },
  H: { name: '红桃', symbol: '♥', color: 'red' },
  C: { name: '梅花', symbol: '♣', color: 'ink' },
  D: { name: '方块', symbol: '♦', color: 'red' },
};

export const RANK_LABELS = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
};

export const SCORE = {
  foundation: 10,
  wasteToTableau: 5,
  flip: 5,
  foundationToTableau: -15,
  recycle: -20,
};

export const SAVE_VERSION = 1;
export const DIFFICULTIES = ['easy', 'normal', 'hard'];

export function normalizeDifficulty(value) {
  return DIFFICULTIES.includes(value) ? value : 'normal';
}

const RANK_BY_LABEL = Object.fromEntries(
  Object.entries(RANK_LABELS).map(([rank, label]) => [label, Number(rank)]),
);

export function parseCard(id) {
  if (typeof id !== 'string' || !/^[SHCD](?:1[0-3]|[1-9])$/.test(id)) {
    throw new Error(`Invalid card id: ${String(id)}`);
  }
  return { id, suit: id[0], rank: Number(id.slice(1)) };
}

export function isRed(cardOrSuit) {
  const suit = typeof cardOrSuit === 'string' ? cardOrSuit : cardOrSuit.suit;
  return suit === 'H' || suit === 'D';
}

export function cardLabel(id) {
  const card = parseCard(id);
  return `${SUIT_META[card.suit].name} ${RANK_LABELS[card.rank]}`;
}

export function shortCardLabel(id) {
  const card = parseCard(id);
  return `${SUIT_META[card.suit].symbol}${RANK_LABELS[card.rank]}`;
}

export function foundationIndexForSuit(suit) {
  return FOUNDATION_SUITS.indexOf(suit);
}

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push(`${suit}${rank}`);
    }
  }
  return deck;
}

/** Small deterministic PRNG, handy for tests and saved seeds. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(deck, random) {
  const result = deck.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildDeal(seed, drawMode, difficulty) {
  const random = mulberry32(seed);
  const deck = shuffle(createDeck(), random);
  const tableau = Array.from({ length: 7 }, () => []);
  let cursor = 0;

  for (let column = 0; column < 7; column += 1) {
    for (let row = 0; row <= column; row += 1) {
      tableau[column].push({
        id: deck[cursor],
        up: row === column,
      });
      cursor += 1;
    }
  }

  return {
    version: SAVE_VERSION,
    seed,
    drawMode,
    difficulty,
    stock: deck.slice(cursor),
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    score: 0,
    moves: 0,
  };
}

function openingProfile(tableau) {
  const tops = tableau.map((pile) => pile.at(-1)?.id).filter(Boolean);
  const suits = new Set(tops.map((id) => id[0]));
  let moves = 0;

  for (const source of tops) {
    for (const target of tops) {
      if (source === target) continue;
      const from = parseCard(source);
      const to = parseCard(target);
      if (from.rank === to.rank - 1 && isRed(from) !== isRed(to)) moves += 1;
    }
  }

  const ranks = tops.map((id) => parseCard(id).rank);
  return {
    suits: suits.size,
    moves,
    aces: ranks.filter((rank) => rank === 1).length,
    lows: ranks.filter((rank) => rank <= 3).length,
    highs: ranks.filter((rank) => rank >= 11).length,
  };
}

function openingScore(profile) {
  return (
    profile.suits * 100 +
    Math.min(profile.moves, 4) * 24 +
    profile.aces * 18 +
    profile.lows * 4 -
    profile.highs * 3
  );
}

function matchesDifficulty(level, profile) {
  if (level === 'easy') return profile.suits >= 4 && profile.moves >= 2;
  if (level === 'hard') return profile.suits <= 3 && profile.moves === 1 && profile.aces === 0;
  return profile.suits >= 3 && profile.moves >= 1;
}

/**
 * Klondike deals are generated from a seed. Easy and hard levels retry the
 * deterministic shuffle until the opening tableau has the requested shape:
 * easy exposes four suits with at least two legal moves; hard exposes at most
 * three suits, exactly one legal move and no free ace. Normal keeps a lighter
 * floor so a new hand is not immediately stuck.
 */
export function newGame({
  drawMode = 1,
  seed = Math.floor(Math.random() * 2 ** 31),
  difficulty = 'normal',
} = {}) {
  if (drawMode !== 1 && drawMode !== 3) {
    throw new Error('drawMode must be 1 or 3');
  }
  const level = normalizeDifficulty(difficulty);
  const attempts = level === 'normal' ? 24 : 80;
  const baseSeed = seed >>> 0;
  let fallback = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidateSeed = (
      (baseSeed + Math.imul(attempt, 0x9e3779b1)) >>> 0
    ) & 0x7fffffff;
    const state = buildDeal(candidateSeed, drawMode, level);
    const profile = openingProfile(state.tableau);
    const score = openingScore(profile);

    if (
      !fallback ||
      (level === 'hard' ? score < fallback.score : score > fallback.score)
    ) {
      fallback = { state, score };
    }
    if (matchesDifficulty(level, profile)) return state;
  }

  return fallback.state;
}

export function cloneState(state) {
  return {
    ...state,
    stock: state.stock.slice(),
    waste: state.waste.slice(),
    foundations: state.foundations.map((pile) => pile.slice()),
    tableau: state.tableau.map((pile) => pile.map((entry) => ({ ...entry }))),
  };
}

export function serializeState(state) {
  return {
    ...state,
    stock: state.stock.slice(),
    waste: state.waste.slice(),
    foundations: state.foundations.map((pile) => pile.slice()),
    tableau: state.tableau.map((pile) => pile.map((entry) => ({ ...entry }))),
  };
}

export function validateState(state) {
  if (!state || state.version !== SAVE_VERSION) return false;
  if (![1, 3].includes(state.drawMode)) return false;
  if (state.difficulty !== undefined && !DIFFICULTIES.includes(state.difficulty)) return false;
  if (!Array.isArray(state.stock) || !Array.isArray(state.waste)) return false;
  if (!Array.isArray(state.foundations) || state.foundations.length !== 4) return false;
  if (!Array.isArray(state.tableau) || state.tableau.length !== 7) return false;
  if (!Number.isFinite(state.score) || state.score < 0) return false;
  if (!Number.isFinite(state.moves) || state.moves < 0) return false;

  const seen = new Set();
  const claim = (id) => {
    parseCard(id);
    if (seen.has(id)) throw new Error('duplicate card');
    seen.add(id);
    return id;
  };

  try {
    state.stock.forEach(claim);
    state.waste.forEach(claim);

    for (let index = 0; index < state.foundations.length; index += 1) {
      const pile = state.foundations[index];
      if (!Array.isArray(pile) || pile.length > 13) return false;
      const requiredSuit = FOUNDATION_SUITS[index];
      pile.forEach((id, rankIndex) => {
        claim(id);
        const card = parseCard(id);
        if (card.suit !== requiredSuit || card.rank !== rankIndex + 1) {
          throw new Error('invalid foundation');
        }
      });
    }

    for (const pile of state.tableau) {
      if (!Array.isArray(pile)) return false;
      let sawFaceUp = false;
      for (const entry of pile) {
        if (!entry || typeof entry !== 'object' || typeof entry.up !== 'boolean') return false;
        claim(entry.id);
        if (entry.up) sawFaceUp = true;
        else if (sawFaceUp) throw new Error('face-down card above face-up card');
      }
    }
  } catch {
    return false;
  }

  return seen.size === 52;
}

export function topCard(pile) {
  if (!pile || pile.length === 0) return null;
  const entry = pile[pile.length - 1];
  return typeof entry === 'string' ? entry : entry.id;
}

export function topEntry(pile) {
  if (!pile || pile.length === 0) return null;
  return pile[pile.length - 1];
}

export function isWon(state) {
  return state.foundations.reduce((sum, pile) => sum + pile.length, 0) === 52;
}

export function totalFoundationCards(state) {
  return state.foundations.reduce((sum, pile) => sum + pile.length, 0);
}

export function hiddenCardCount(state) {
  return state.tableau.reduce(
    (sum, pile) => sum + pile.filter((entry) => !entry.up).length,
    0,
  );
}

export function canPlaceOnFoundation(state, cardId, foundationIndex) {
  if (foundationIndex < 0 || foundationIndex > 3) return false;
  const card = parseCard(cardId);
  if (FOUNDATION_SUITS[foundationIndex] !== card.suit) return false;
  const pile = state.foundations[foundationIndex];
  if (pile.length === 0) return card.rank === 1;
  return card.rank === parseCard(pile[pile.length - 1]).rank + 1;
}

export function foundationIndexForCard(state, cardId) {
  const card = parseCard(cardId);
  const index = foundationIndexForSuit(card.suit);
  return canPlaceOnFoundation(state, cardId, index) ? index : -1;
}

export function canPlaceOnTableau(state, cardIds, targetIndex) {
  if (targetIndex < 0 || targetIndex > 6) return false;
  if (!Array.isArray(cardIds) || cardIds.length === 0) return false;
  const cards = cardIds.map(parseCard);
  for (let i = 1; i < cards.length; i += 1) {
    if (cards[i].rank !== cards[i - 1].rank - 1) return false;
    if (isRed(cards[i]) === isRed(cards[i - 1])) return false;
  }
  const target = state.tableau[targetIndex];
  const first = cards[0];
  if (target.length === 0) return first.rank === 13;
  const dest = target[target.length - 1];
  if (!dest.up) return false;
  const destCard = parseCard(dest.id);
  return destCard.rank === first.rank + 1 && isRed(destCard) !== isRed(first);
}

/** Returns the ids of the valid run beginning at `startIndex`, or [] if invalid. */
export function getMovableRun(state, pileIndex, startIndex) {
  const pile = state.tableau[pileIndex];
  if (!pile || startIndex < 0 || startIndex >= pile.length) return [];
  if (!pile[startIndex].up) return [];
  const run = [];
  for (let i = startIndex; i < pile.length; i += 1) {
    if (!pile[i].up) return [];
    run.push(pile[i].id);
  }
  for (let i = 1; i < run.length; i += 1) {
    const a = parseCard(run[i - 1]);
    const b = parseCard(run[i]);
    if (b.rank !== a.rank - 1 || isRed(a) === isRed(b)) return [];
  }
  return run;
}

/** All groups that may be picked up from a tableau column (one per face-up card). */
export function getMovableGroups(state, pileIndex) {
  const pile = state.tableau[pileIndex];
  const groups = [];
  for (let i = 0; i < pile.length; i += 1) {
    if (!pile[i].up) continue;
    const run = getMovableRun(state, pileIndex, i);
    if (run.length > 0) groups.push({ index: i, cards: run });
  }
  return groups;
}

export function getSourceCards(state, source) {
  if (!source) return [];
  if (source.type === 'waste') {
    return state.waste.length ? [topCard(state.waste)] : [];
  }
  if (source.type === 'foundation') {
    return state.foundations[source.pile]?.length
      ? [topCard(state.foundations[source.pile])]
      : [];
  }
  if (source.type === 'tableau') {
    return getMovableRun(state, source.pile, source.index);
  }
  return [];
}

export function findAllFoundationTargets(state) {
  const moves = [];
  state.tableau.forEach((pile, pileIndex) => {
    const entry = topEntry(pile);
    if (!entry?.up) return;
    const target = foundationIndexForCard(state, entry.id);
    if (target !== -1) {
      moves.push({
        from: { type: 'tableau', pile: pileIndex, index: pile.length - 1 },
        to: { type: 'foundation', pile: target },
        cardId: entry.id,
        priority: 100,
      });
    }
  });
  const wasteTop = topCard(state.waste);
  if (wasteTop) {
    const target = foundationIndexForCard(state, wasteTop);
    if (target !== -1) {
      moves.push({
        from: { type: 'waste' },
        to: { type: 'foundation', pile: target },
        cardId: wasteTop,
        priority: 100,
      });
    }
  }
  return moves;
}

export function draw(state) {
  const next = cloneState(state);
  if (next.stock.length > 0) {
    const count = Math.min(next.drawMode, next.stock.length);
    const drawn = [];
    // Cards are flipped one at a time, so the last card drawn is on top.
    for (let i = 0; i < count; i += 1) {
      const card = next.stock.pop();
      drawn.push(card);
      next.waste.push(card);
    }
    next.moves += 1;
    return {
      ok: true,
      type: 'draw',
      state: next,
      cards: drawn,
      recycled: false,
    };
  }
  if (next.waste.length > 0) {
    // The waste stack is turned over as a unit, so the oldest discarded card
    // becomes the first card drawn after the recycle.
    next.stock = next.waste.slice().reverse();
    next.waste = [];
    next.score = Math.max(0, next.score + SCORE.recycle);
    next.moves += 1;
    return {
      ok: true,
      type: 'recycle',
      state: next,
      cards: [],
      recycled: true,
    };
  }
  return { ok: false, reason: 'empty', state };
}

function removeSource(next, from) {
  if (from.type === 'tableau') {
    const pile = next.tableau[from.pile];
    if (!pile) return null;
    const run = getMovableRun(next, from.pile, from.index);
    if (!run.length) return null;
    const removed = pile.splice(from.index).map((entry) => entry.id);
    let flipped = null;
    if (pile.length > 0 && !pile[pile.length - 1].up) {
      pile[pile.length - 1].up = true;
      flipped = pile[pile.length - 1].id;
    }
    return { cards: removed, flipped };
  }
  if (from.type === 'waste') {
    if (next.waste.length === 0) return null;
    return { cards: [next.waste.pop()], flipped: null };
  }
  if (from.type === 'foundation') {
    const pile = next.foundations[from.pile];
    if (!pile || pile.length === 0) return null;
    return { cards: [pile.pop()], flipped: null };
  }
  return null;
}

export function applyMove(state, move) {
  if (!move?.from || !move?.to) return { ok: false, reason: 'invalid-move', state };
  const from = move.from;
  const to = move.to;

  // Validate against a copy first so callers never see partial state.
  const sourceCards = getSourceCards(state, from);
  if (sourceCards.length === 0) return { ok: false, reason: 'empty-source', state };

  if (to.type === 'foundation') {
    if (sourceCards.length !== 1) return { ok: false, reason: 'single-card-only', state };
    if (from.type === 'foundation') return { ok: false, reason: 'invalid-foundation-origin', state };
    if (!canPlaceOnFoundation(state, sourceCards[0], to.pile)) {
      return { ok: false, reason: 'invalid-foundation', state };
    }
  } else if (to.type === 'tableau') {
    if (from.type === 'tableau' && from.pile === to.pile) {
      return { ok: false, reason: 'same-pile', state };
    }
    if (!canPlaceOnTableau(state, sourceCards, to.pile)) {
      return { ok: false, reason: 'invalid-tableau', state };
    }
  } else {
    return { ok: false, reason: 'unknown-target', state };
  }

  const next = cloneState(state);
  const removed = removeSource(next, from);
  if (!removed) return { ok: false, reason: 'empty-source', state };
  const cards = removed.cards;

  let scoreDelta = 0;
  if (to.type === 'foundation') {
    next.foundations[to.pile].push(cards[0]);
    scoreDelta += SCORE.foundation;
  } else {
    for (const id of cards) next.tableau[to.pile].push({ id, up: true });
    if (from.type === 'waste') scoreDelta += SCORE.wasteToTableau;
    if (from.type === 'foundation') scoreDelta += SCORE.foundationToTableau;
  }

  if (removed.flipped) scoreDelta += SCORE.flip;
  next.score = Math.max(0, next.score + scoreDelta);
  next.moves += 1;

  return {
    ok: true,
    state: next,
    cards,
    flipped: removed.flipped,
    scoreDelta,
    toFoundation: to.type === 'foundation',
  };
}

export function canUndo(state) {
  return state.moves > 0;
}

/** Stable identifier for a concrete from/to move. */
function hintMoveKey(move) {
  if (!move?.from || !move?.to) return '';
  const from = `${move.from.type}:${move.from.pile ?? ''}:${move.from.index ?? ''}`;
  const to = `${move.to.type}:${move.to.pile ?? ''}`;
  return `${from}->${to}`;
}

/**
 * Moves that make visible progress: send a card to a foundation, turn up a
 * hidden card, or bring the top waste card back into a tableau column. This
 * deliberately uses only information the player can see.
 */
function getDirectProgressMoves(state) {
  const moves = [];
  const seen = new Set();
  const add = (move) => {
    const key = hintMoveKey(move);
    if (!key || seen.has(key)) return;
    seen.add(key);
    moves.push(move);
  };

  for (const move of findAllFoundationTargets(state)) {
    add({ ...move, kind: 'foundation', priority: 1000 });
  }

  const wasteTop = topCard(state.waste);
  if (wasteTop) {
    for (let target = 0; target < 7; target += 1) {
      if (canPlaceOnTableau(state, [wasteTop], target)) {
        add({
          from: { type: 'waste' },
          to: { type: 'tableau', pile: target },
          cardId: wasteTop,
          kind: 'tableau',
          priority: 600,
        });
      }
    }
  }

  // A run move that exposes a face-down card is always an immediate gain.
  state.tableau.forEach((pile, sourceIndex) => {
    if (pile.length < 2 || pile[0].up) return;
    for (let start = 1; start < pile.length; start += 1) {
      if (!pile[start].up || pile[start - 1].up) continue;
      const cards = getMovableRun(state, sourceIndex, start);
      if (!cards.length) continue;
      for (let target = 0; target < 7; target += 1) {
        if (target === sourceIndex) continue;
        if (!canPlaceOnTableau(state, cards, target)) continue;
        add({
          from: { type: 'tableau', pile: sourceIndex, index: start },
          to: { type: 'tableau', pile: target },
          cardId: cards[0],
          kind: 'reveal',
          priority: 800,
        });
      }
    }
  });

  return moves;
}

/** All legal tableau-to-tableau runs, used to find one-move setups. */
function getTableauMoves(state) {
  const moves = [];
  const seen = new Set();
  state.tableau.forEach((pile, sourceIndex) => {
    for (let start = 0; start < pile.length; start += 1) {
      if (!pile[start].up) continue;
      const cards = getMovableRun(state, sourceIndex, start);
      if (!cards.length) continue;
      for (let target = 0; target < 7; target += 1) {
        if (target === sourceIndex) continue;
        if (!canPlaceOnTableau(state, cards, target)) continue;
        const move = {
          from: { type: 'tableau', pile: sourceIndex, index: start },
          to: { type: 'tableau', pile: target },
          cardId: cards[0],
        };
        const key = hintMoveKey(move);
        if (seen.has(key)) continue;
        seen.add(key);
        moves.push(move);
      }
    }
  });
  return moves;
}

function countEmptyTableauColumns(state) {
  return state.tableau.reduce((count, pile) => count + (pile.length === 0 ? 1 : 0), 0);
}

/**
 * Suggested moves, strongest first.
 *
 * The hint engine avoids the old "shuffle back and forth" behaviour by only
 * recommending a tableau rearrangement when it unlocks a visible follow-up
 * (a foundation move, a new reveal or a usable waste card) or, as a last
 * resort, when there is no stock or waste left and it creates an empty column.
 * It never peeks at face-down card values.
 */
export function getHints(state) {
  const directMoves = getDirectProgressMoves(state);
  const beforeProgress = new Set(directMoves.map(hintMoveKey));
  const beforeEmptyColumns = countEmptyTableauColumns(state);
  const qualityMoves = [...directMoves];
  const emptyColumnMoves = [];
  const directByKey = new Map(directMoves.map((move) => [hintMoveKey(move), move]));

  for (const move of getTableauMoves(state)) {
    const key = hintMoveKey(move);
    if (directByKey.has(key)) continue;
    const result = applyMove(state, move);
    if (!result.ok) continue;

    const afterDirect = getDirectProgressMoves(result.state);
    const hasNewOpportunity = afterDirect.some((next) => !beforeProgress.has(hintMoveKey(next)));
    const afterEmptyColumns = countEmptyTableauColumns(result.state);

    if (hasNewOpportunity) {
      qualityMoves.push({
        ...move,
        kind: 'setup',
        priority: 500,
      });
    } else if (afterEmptyColumns > beforeEmptyColumns) {
      emptyColumnMoves.push({
        ...move,
        kind: 'shuffle',
        priority: 300,
      });
    }
  }

  if (qualityMoves.length > 0) {
    return qualityMoves.sort((a, b) => b.priority - a.priority);
  }

  // With hidden cards still reachable, drawing is more useful than moving
  // cards around with no visible gain.
  if (state.stock.length > 0) {
    return [{ from: null, to: null, cardId: null, kind: 'draw', priority: 100 }];
  }
  if (state.waste.length > 0) {
    return [{ from: null, to: null, cardId: null, kind: 'recycle', priority: 90 }];
  }
  if (emptyColumnMoves.length > 0) {
    return emptyColumnMoves.sort((a, b) => b.priority - a.priority).slice(0, 1);
  }
  return [];
}

/**
 * A conservative auto-finish planner. It only offers the action when every
 * remaining card is visible and a pure top-to-foundation sweep can finish.
 */
export function getAutoFinishPlan(state, limit = 80) {
  if (state.stock.length > 0) return null;
  if (hiddenCardCount(state) > 0) return null;
  if (totalFoundationCards(state) === 52) return [];
  let sim = cloneState(state);
  const plan = [];

  for (let guard = 0; guard < limit; guard += 1) {
    const candidates = findAllFoundationTargets(sim).filter(
      (move) => move.from.type === 'tableau' || move.from.type === 'waste',
    );
    if (candidates.length === 0) break;
    // Prefer tableau tops so the remaining waste card can follow.
    candidates.sort((a, b) => {
      if (a.from.type === b.from.type) return 0;
      return a.from.type === 'tableau' ? -1 : 1;
    });
    let progressed = false;
    for (const candidate of candidates) {
      const result = applyMove(sim, candidate);
      if (result.ok) {
        sim = result.state;
        plan.push(candidate);
        progressed = true;
        break;
      }
    }
    if (!progressed) break;
    if (isWon(sim)) return plan;
  }
  return null;
}

export function parseRankLabel(label) {
  return RANK_BY_LABEL[label] ?? null;
}
