export * from "./longNardy";

/*

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

// Длинные нарды: оба игрока двигаются в одну сторону (против часовой),
// с разных "голов" и выносят в разных домах.
// На текущей разметке доски:
// - голова белых: нижний-левый угол (index 11)
// - голова черных: верхний-правый угол (index 23)
// - дом белых / вынос: нижний-правый квадрант (index 0..5)
// - дом черных / вынос: верхний-левый квадрант (index 12..17)
const HOME_WHITE = [0, 1, 2, 3, 4, 5];
const HOME_BLACK = [12, 13, 14, 15, 16, 17];
const HEAD_WHITE = 11;
const HEAD_BLACK = 23;

const PATH_CCW: number[] = [
  11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12
];

const POS_IN_PATH: number[] = (() => {
  const res = new Array<number>(24).fill(-1);
  for (let i = 0; i < PATH_CCW.length; i += 1) {
    res[PATH_CCW[i]] = i;
  }
  return res;
})();

function homeSet(player: Player): Set<number> {
  return new Set(player === "white" ? HOME_WHITE : HOME_BLACK);
}

function pointNumberInHome(player: Player, index: number): number | null {
  // Возвращает 1..6 если index в доме игрока и соответствует "номеру пункта" при выносе.
  if (player === "white") {
    if (index < 0 || index > 5) return null;
    return index + 1;
  }
  if (index < 12 || index > 17) return null;
  return index - 11;
}

function moveAlongCcw(from: number, die: number): number {
  const pos = POS_IN_PATH[from];
  if (pos < 0) {
    return from;
  }
  return PATH_CCW[(pos + die) % 24];
}

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
    return point >= 0;
  }
  return point <= 0;
}

function allInHome(state: GameState, player: Player): boolean {
  if (state.bar[player] > 0) {
    return false;
  }

  const home = homeSet(player);
  for (let i = 0; i < 24; i += 1) {
    if (!home.has(i) && checkerAt(state, i, player) > 0) {
      return false;
    }
  }
  return true;
}

function canBearOffFrom(state: GameState, player: Player, from: number, die: number): boolean {
  if (!allInHome(state, player)) {
    return false;
  }

  const n = pointNumberInHome(player, from);
  if (n === null) {
    return false;
  }
  if (die === n) {
    return true;
  }
  if (die > n) {
    // Перебор разрешён только если нет шашек на "более высоких" пунктах дома.
    if (player === "white") {
      for (let idx = from + 1; idx <= 5; idx += 1) {
        if (state.points[idx] > 0) {
          return false;
        }
      }
      return true;
    }
    for (let idx = from + 1; idx <= 17; idx += 1) {
      if (state.points[idx] < 0) {
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

  // В длинных нардах нет ударов и нет бара.

  for (let from = 0; from < 24; from += 1) {
    if (checkerAt(state, from, player) < 1) {
      continue;
    }

    if (canBearOffFrom(state, player, from, die)) {
      moves.push({ from, to: "off", die, hit: false });
      continue;
    }

    const to = moveAlongCcw(from, die);
    if (to === from) {
      continue;
    }
    if (isOpenFor(state, to, player)) {
      moves.push({ from, to, die, hit: false });
    }
  }

  return moves;
}

export function applyMove(state: GameState, player: Player, move: Move): GameState {
  const next = cloneState(state);

  if (move.from === "bar") {
    // В длинных нардах не должно происходить входа с бара.
    return state;
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
    next.points[move.to] += 1;
  } else {
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
  result: TurnSequence[],
  movedFromHead: number,
  maxFromHead: number
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
      const headIndex = player === "white" ? HEAD_WHITE : HEAD_BLACK;
      const isFromHead = typeof move.from === "number" && move.from === headIndex;
      if (isFromHead && movedFromHead >= maxFromHead) {
        continue;
      }
      const after = applyMove(state, player, move);
      exploreSequences(after, player, removeDieAt(dice, i), [...path, move], result, movedFromHead + (isFromHead ? 1 : 0), maxFromHead);
    }
  }

  if (!moved) {
    result.push({ moves: path, endState: state });
  }
}

export function getLegalTurnSequences(state: GameState, player: Player, dice: number[]): TurnSequence[] {
  const raw: TurnSequence[] = [];
  exploreSequences(cloneState(state), player, [...dice], [], raw, 0, 1);
  return finalizeTurnSequences(state, player, dice, raw, false);
}

export function getLegalTurnSequencesWithContext(
  state: GameState,
  player: Player,
  dice: number[],
  ctx: { isFirstTurn: boolean }
): TurnSequence[] {
  const raw: TurnSequence[] = [];
  const isDouble = dice.length === 4 && dice.every((d) => d === dice[0]);
  const forcedTwoFromHead = ctx.isFirstTurn && isDouble && (dice[0] === 3 || dice[0] === 4 || dice[0] === 6);
  const maxFromHead = ctx.isFirstTurn ? 2 : 1;
  exploreSequences(cloneState(state), player, [...dice], [], raw, 0, maxFromHead);
  return finalizeTurnSequences(state, player, dice, raw, forcedTwoFromHead);
}

function finalizeTurnSequences(
  state: GameState,
  player: Player,
  dice: number[],
  raw: TurnSequence[],
  forcedTwoFromHead: boolean
): TurnSequence[] {
  const maxMoves = raw.reduce((max, seq) => Math.max(max, seq.moves.length), 0);
  let best = raw.filter((seq) => seq.moves.length === maxMoves);

  if (best.length === 0) {
    best = [{ moves: [], endState: cloneState(state) }];
  }

  if (dice.length === 2 && dice[0] !== dice[1] && maxMoves === 1) {
    const high = Math.max(dice[0], dice[1]);
    const usingHigh = best.filter((seq) => seq.moves[0]?.die === high);
    if (usingHigh.length > 0) {
      best = usingHigh;
    }
  }

  if (forcedTwoFromHead) {
    const headIndex = player === "white" ? HEAD_WHITE : HEAD_BLACK;
    const headMoves = (seq: TurnSequence) =>
      seq.moves.reduce((acc, m) => acc + (typeof m.from === "number" && m.from === headIndex ? 1 : 0), 0);
    const maxHead = best.reduce((acc, s) => Math.max(acc, headMoves(s)), 0);
    if (maxHead >= 2) {
      best = best.filter((s) => headMoves(s) >= 2);
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

  const bearOffEdge = player === "white" ? 0 : 12;
  const bearOffPos = POS_IN_PATH[bearOffEdge];

  for (let i = 0; i < 24; i += 1) {
    const count = checkerAt(state, i, player);
    if (count < 1) continue;

    const pos = POS_IN_PATH[i];
    if (pos < 0) continue;

    const stepsToEdge = (bearOffPos - pos + 24) % 24;
    const homeN = pointNumberInHome(player, i);
    const distance = homeN ? homeN : stepsToEdge + 1;
    score += count * distance;
  }

  return score;
}

export function evaluateStateForBlack(state: GameState): number {
  const blackPip = pipCount(state, "black");
  const whitePip = pipCount(state, "white");

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

  return whitePip - blackPip + offBonus + anchorBonus;
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

*/
