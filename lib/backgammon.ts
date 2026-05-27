export type Player = "white" | "black";

export type Difficulty = "easy" | "medium" | "hard";

export interface Move {
  from: number | "bar";
  to: number | "off";
  die: number;
  hit: boolean;
}

export interface GameState {
  points: number[];
  bar: {
    white: number;
    black: number;
  };
  off: {
    white: number;
    black: number;
  };
}

export interface TurnSequence {
  moves: Move[];
  endState: GameState;
}

export interface MatchResult {
  id: string;
  playedAt: string;
  winner: Player;
  durationSec: number;
  difficulty: Difficulty;
  source: "local";
}

const HOME_WHITE = [18, 19, 20, 21, 22, 23];
const HOME_BLACK = [0, 1, 2, 3, 4, 5];

export function createInitialState(): GameState {
  const points = new Array(24).fill(0);

  // Start position styled like the provided reference:
  // one full stack on each side ("head" style layout).
  // white (player, dark visuals) at bottom-left edge,
  // black (AI, light visuals) at top-right edge.
  points[11] = 15;
  points[23] = -15;

  return {
    points,
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 }
  };
}

export function cloneState(state: GameState): GameState {
  return {
    points: [...state.points],
    bar: { ...state.bar },
    off: { ...state.off }
  };
}

export function rollDice(): number[] {
  const a = 1 + Math.floor(Math.random() * 6);
  const b = 1 + Math.floor(Math.random() * 6);
  return a === b ? [a, a, a, a] : [a, b];
}

export function opponent(player: Player): Player {
  return player === "white" ? "black" : "white";
}

function checkerAt(state: GameState, index: number, player: Player): number {
  const value = state.points[index];
  return player === "white" ? Math.max(0, value) : Math.max(0, -value);
}

function isOpenFor(state: GameState, index: number, player: Player): boolean {
  const point = state.points[index];
  if (player === "white") {
    return point > -2;
  }
  return point < 2;
}

function allInHome(state: GameState, player: Player): boolean {
  if (state.bar[player] > 0) {
    return false;
  }

  if (player === "white") {
    for (let i = 0; i < 18; i += 1) {
      if (state.points[i] > 0) {
        return false;
      }
    }
    return true;
  }

  for (let i = 6; i < 24; i += 1) {
    if (state.points[i] < 0) {
      return false;
    }
  }
  return true;
}

function canBearOffFrom(state: GameState, player: Player, from: number, die: number): boolean {
  if (!allInHome(state, player)) {
    return false;
  }

  if (player === "white") {
    const target = from + die;
    if (target === 24) {
      return true;
    }
    if (target > 24) {
      // Overshoot is legal only when there are no checkers on higher points.
      for (let i = from + 1; i <= 23; i += 1) {
        if (state.points[i] > 0) {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  const target = from - die;
  if (target === -1) {
    return true;
  }
  if (target < -1) {
    // Overshoot is legal only when there are no checkers on lower points.
    for (let i = from - 1; i >= 0; i -= 1) {
      if (state.points[i] < 0) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function barEntryIndex(player: Player, die: number): number {
  if (player === "white") {
    return die - 1;
  }
  return 24 - die;
}

export function getLegalMovesForDie(state: GameState, player: Player, die: number): Move[] {
  const moves: Move[] = [];

  if (state.bar[player] > 0) {
    const entry = barEntryIndex(player, die);
    if (isOpenFor(state, entry, player)) {
      const hit = player === "white" ? state.points[entry] === -1 : state.points[entry] === 1;
      moves.push({ from: "bar", to: entry, die, hit });
    }
    return moves;
  }

  for (let from = 0; from < 24; from += 1) {
    if (checkerAt(state, from, player) < 1) {
      continue;
    }

    const to = player === "white" ? from + die : from - die;

    if (to >= 0 && to < 24) {
      if (isOpenFor(state, to, player)) {
        const hit = player === "white" ? state.points[to] === -1 : state.points[to] === 1;
        moves.push({ from, to, die, hit });
      }
      continue;
    }

    if (canBearOffFrom(state, player, from, die)) {
      moves.push({ from, to: "off", die, hit: false });
    }
  }

  return moves;
}

export function applyMove(state: GameState, player: Player, move: Move): GameState {
  const next = cloneState(state);

  if (move.from === "bar") {
    next.bar[player] -= 1;
  } else if (player === "white") {
    next.points[move.from] -= 1;
  } else {
    next.points[move.from] += 1;
  }

  if (move.to === "off") {
    next.off[player] += 1;
    return next;
  }

  if (player === "white") {
    if (next.points[move.to] === -1) {
      next.points[move.to] = 0;
      next.bar.black += 1;
    }
    next.points[move.to] += 1;
  } else {
    if (next.points[move.to] === 1) {
      next.points[move.to] = 0;
      next.bar.white += 1;
    }
    next.points[move.to] -= 1;
  }

  return next;
}

function removeDieAt(dice: number[], index: number): number[] {
  return [...dice.slice(0, index), ...dice.slice(index + 1)];
}

function exploreSequences(
  state: GameState,
  player: Player,
  dice: number[],
  path: Move[],
  result: TurnSequence[]
): void {
  if (dice.length === 0) {
    result.push({ moves: path, endState: state });
    return;
  }

  let moved = false;

  for (let i = 0; i < dice.length; i += 1) {
    const die = dice[i];
    const options = getLegalMovesForDie(state, player, die);
    if (options.length === 0) {
      continue;
    }

    moved = true;

    for (const move of options) {
      const after = applyMove(state, player, move);
      exploreSequences(after, player, removeDieAt(dice, i), [...path, move], result);
    }
  }

  if (!moved) {
    result.push({ moves: path, endState: state });
  }
}

export function getLegalTurnSequences(state: GameState, player: Player, dice: number[]): TurnSequence[] {
  const raw: TurnSequence[] = [];
  exploreSequences(cloneState(state), player, [...dice], [], raw);

  const maxMoves = raw.reduce((max, seq) => Math.max(max, seq.moves.length), 0);
  let best = raw.filter((seq) => seq.moves.length === maxMoves);

  if (best.length === 0) {
    best = [{ moves: [], endState: cloneState(state) }];
  }

  if (dice.length === 2 && dice[0] !== dice[1] && maxMoves === 1) {
    const high = Math.max(dice[0], dice[1]);
    const usingHigh = best.filter((seq) => seq.moves[0]?.die === high);
    if (usingHigh.length > 0) {
      return usingHigh;
    }
  }

  return best;
}

export function isFinished(state: GameState): Player | null {
  if (state.off.white >= 15) {
    return "white";
  }
  if (state.off.black >= 15) {
    return "black";
  }
  return null;
}

export function pipCount(state: GameState, player: Player): number {
  let score = 0;

  if (player === "white") {
    for (let i = 0; i < 24; i += 1) {
      const count = Math.max(0, state.points[i]);
      score += count * (24 - i);
    }
    score += state.bar.white * 25;
  } else {
    for (let i = 0; i < 24; i += 1) {
      const count = Math.max(0, -state.points[i]);
      score += count * (i + 1);
    }
    score += state.bar.black * 25;
  }

  return score;
}

export function evaluateStateForBlack(state: GameState): number {
  const blackPip = pipCount(state, "black");
  const whitePip = pipCount(state, "white");

  const barPressure = state.bar.white * 18 - state.bar.black * 18;
  const offBonus = state.off.black * 22 - state.off.white * 22;

  let anchorBonus = 0;
  for (const idx of HOME_BLACK) {
    if (state.points[idx] <= -2) {
      anchorBonus += 2;
    }
  }
  for (const idx of HOME_WHITE) {
    if (state.points[idx] >= 2) {
      anchorBonus -= 2;
    }
  }

  return whitePip - blackPip + barPressure + offBonus + anchorBonus;
}

export function chooseHeuristicSequence(
  sequences: TurnSequence[],
  difficulty: Difficulty,
  fallbackState: GameState,
  random: () => number = Math.random
): TurnSequence {
  if (sequences.length === 0) {
    return { moves: [], endState: cloneState(fallbackState) };
  }

  if (difficulty === "easy") {
    return sequences[Math.floor(random() * sequences.length)];
  }

  const scored = sequences.map((seq) => ({
    seq,
    score: evaluateStateForBlack(seq.endState)
  }));

  scored.sort((a, b) => b.score - a.score);

  if (difficulty === "medium") {
    const top = scored.slice(0, Math.min(3, scored.length));
    return top[Math.floor(random() * top.length)].seq;
  }

  return scored[0].seq;
}

export function serializeForAI(state: GameState): string {
  return JSON.stringify({
    points: state.points,
    bar: state.bar,
    off: state.off
  });
}

export function parseAiIndex(text: string, max: number): number | null {
  const match = text.match(/-?\d+/);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[0], 10);
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value < 0 || value >= max) {
    return null;
  }
  return value;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
