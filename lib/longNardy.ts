// Длинные нарды — игровая логика (без UI).
//
// Поле: 24 пункта, у каждого игрока по 15 шашек.
// Реальные правила из переданного JS:
// - Голова: белые стартуют в пункте 24 (по маршруту 24..1), черные - в пункте 12.
// - Оба игрока двигаются по своему маршруту вперёд (по индексу в PLAYER_PATH).
// - Удары отсутствуют: нельзя становиться на пункт соперника.
// - Мост (трап-прим): нельзя построить непрерывный блок из 6 занятых пунктов,
//   если впереди него (по ходу соперника) нет ни одной шашки соперника.
// - Правило головы: за ход с головы можно снять только одну шашку, но на первом
//   ходе партии при дубле 3:3, 4:4 или 6:6 можно снять две.
// - Сброс возможен только после ввода всех 15 шашек в дом (последние 6 пунктов
//   маршрута). Перебор разрешён только для самой дальней (от сброса) шашки.
// - Максимальная игра: используются как можно больше костей; если можно сыграть
//   только одну из двух, то обязательно большую.

export type Player = "white" | "black";
export type Difficulty = "easy" | "medium" | "hard";

export interface Move {
  from: number | "bar";
  to: number | "off";
  die: number;
  hit: boolean;
}

export interface GameState {
  // points[index] где index = pointNumber - 1
  // points[index] > 0 => white checkers
  // points[index] < 0 => black checkers
  points: number[];
  // В длинных нардах нет бара; оставляем для совместимости с UI.
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

const BOARD_POINTS = 24;
const CHECKERS_PER_PLAYER = 15;
const HOME_ZONE_SIZE = 6;
const SPECIAL_HEAD_DOUBLES: number[] = [3, 4, 6];

// Маршрут (в терминах "номеров пунктов" 1..24)
const PLAYER_PATH: Record<Player, readonly number[]> = {
  white: [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  black: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13]
};

const HEAD_POINT: Record<Player, number> = {
  white: 24,
  black: 12
};

const HOME_WHITE_IDXS = [0, 1, 2, 3, 4, 5]; // points[index], индекс = pointNumber-1
const HOME_BLACK_IDXS = [12, 13, 14, 15, 16, 17];

function cloneState(state: GameState): GameState {
  return {
    points: [...state.points],
    bar: { ...state.bar },
    off: { ...state.off }
  };
}

function opponentOf(p: Player): Player {
  return p === "white" ? "black" : "white";
}

function idxToPoint(idx: number): number {
  return idx + 1;
}

function pointToIdx(point: number): number {
  return point - 1;
}

function checkerAt(state: GameState, idx: number): number {
  const v = state.points[idx];
  if (v === 0) return 0;
  return v;
}

function countFor(state: GameState, player: Player, idx: number): number {
  const v = state.points[idx];
  if (player === "white") return Math.max(0, v);
  return Math.max(0, -v);
}

type Cell = { player: Player | null; count: number };

class LongNardyGame {
  private board: Cell[]; // board[1..24]
  private borneOff: Record<Player, number>;
  private currentPlayer: Player;
  private dice: number[];
  private diceRolled = false;

  private headMovesUsed = 0;
  private headMovesLimit = 1;

  private winner: Player | null = null;

  constructor(args: { state: GameState; player: Player; dice: number[]; isFirstTurn: boolean }) {
    const { state, player, dice, isFirstTurn } = args;
    this.currentPlayer = player;
    this.dice = [...dice];
    this.diceRolled = true;

    this.board = Array.from({ length: BOARD_POINTS + 1 }, () => ({ player: null as Player | null, count: 0 }));
    for (let idx = 0; idx < BOARD_POINTS; idx += 1) {
      const v = state.points[idx];
      if (v > 0) {
        this.board[idxToPoint(idx)] = { player: "white", count: v };
      } else if (v < 0) {
        this.board[idxToPoint(idx)] = { player: "black", count: -v };
      }
    }

    this.borneOff = { white: state.off.white, black: state.off.black };
    this.winner = null;

    const isDouble = dice.length === 4 && dice.every((d) => d === dice[0]);
    const headIsAllowedToBe2 =
      isFirstTurn && isDouble && SPECIAL_HEAD_DOUBLES.includes(dice[0] as number);
    this.headMovesUsed = 0;
    this.headMovesLimit = headIsAllowedToBe2 ? 2 : 1;
  }

  // ─── Служебные проверки ──────────────────────────────────────────────────

  private allInHome(player: Player): boolean {
    const path = PLAYER_PATH[player];
    const preHomeLength = path.length - HOME_ZONE_SIZE;
    for (let i = 0; i < preHomeLength; i += 1) {
      const pos = path[i];
      if (this.board[pos].player === player && this.board[pos].count > 0) return false;
    }
    return true;
  }

  private furthestCheckerPathIndex(player: Player): number {
    const path = PLAYER_PATH[player];
    for (let i = 0; i < path.length; i += 1) {
      const pos = path[i];
      if (this.board[pos].player === player && this.board[pos].count > 0) return i;
    }
    return -1;
  }

  private _setPoint(pos: number, player: Player | null, count: number) {
    if (count <= 0) {
      this.board[pos] = { player: null, count: 0 };
    } else {
      this.board[pos] = { player, count };
    }
  }

  private _applyMove(player: Player, move: { from: number; to: number | "off"; isBearOff: boolean }) {
    this._setPoint(move.from, player, this.board[move.from].count - 1);
    if (move.isBearOff) {
      this.borneOff[player] += 1;
      return;
    }
    this._setPoint(move.to as number, player, this.board[move.to as number].count + 1);
  }

  private _undoMove(player: Player, move: { from: number; to: number | "off"; isBearOff: boolean }) {
    if (move.isBearOff) {
      this.borneOff[player] -= 1;
    } else {
      this._setPoint(move.to as number, player, this.board[move.to as number].count - 1);
    }
    this._setPoint(move.from, player, this.board[move.from].count + 1);
  }

  private _simulate<T>(player: Player, move: { from: number; to: number | "off"; isBearOff: boolean }, check: () => void): T | undefined {
    this._applyMove(player, move);
    try {
      check();
    } finally {
      this._undoMove(player, move);
    }
    return undefined;
  }

  // ─── Правило моста ─────────────────────────────────────────────────────

  private _buildsTrappingPrime(player: Player): boolean {
    const opp = opponentOf(player);
    const oppPath = PLAYER_PATH[opp];

    // 6-пункт. блок может находиться только внутри одной "полусекции" поля
    // (пункты 1–12 либо 13–24), т.к. 12 и 13 физически не соседи.
    const segments: Array<[number, number]> = [
      [1, 12],
      [13, 24]
    ];

    for (const [start, end] of segments) {
      let run: number[] = [];
      for (let p = start; p <= end; p += 1) {
        if (this.board[p].player === player && this.board[p].count > 0) {
          run.push(p);
        } else {
          if (run.length >= 6 && this._primeTraps(run, oppPath, opp)) return true;
          run = [];
        }
      }
      if (run.length >= 6 && this._primeTraps(run, oppPath, opp)) return true;
    }

    return false;
  }

  private _primeTraps(prime: number[], oppPath: readonly number[], opp: Player): boolean {
    let maxPrimeIdx = -1;
    for (const p of prime) {
      const i = oppPath.indexOf(p);
      if (i > maxPrimeIdx) maxPrimeIdx = i;
    }
    for (let i = maxPrimeIdx + 1; i < oppPath.length; i += 1) {
      const pos = oppPath[i];
      if (this.board[pos].player === opp && this.board[pos].count > 0) return false;
    }
    return true;
  }

  // ─── Валидация одной "кости" ────────────────────────────────────────────

  private _validateMove(player: Player, from: number, steps: number): { from: number; to: number | "off"; isBearOff: boolean } {
    if (from === HEAD_POINT[player] && this.headMovesUsed >= this.headMovesLimit) {
      throw new Error("head limit exceeded");
    }

    const path = PLAYER_PATH[player];
    const fromIdx = path.indexOf(from);
    const toIdx = fromIdx + steps;

    let to: number | "off";
    let isBearOff = false;

    if (toIdx < path.length) {
      // Обычный ход внутри поля
      to = path[toIdx];
      const dst = this.board[to];
      if (dst.player && dst.player !== player && dst.count > 0) {
        throw new Error("blocked by opponent");
      }
    } else {
      // Попытка сброса
      if (!this.allInHome(player)) {
        throw new Error("bear off not allowed");
      }
      if (toIdx > path.length) {
        // Перебор разрешён только для самой дальней шашки
        const furthestIdx = this.furthestCheckerPathIndex(player);
        if (fromIdx !== furthestIdx) {
          throw new Error("overshoot only furthest checker");
        }
      }
      to = "off";
      isBearOff = true;
    }

    // Запрет "моста" проверяем на гипотетическом состоянии после хода.
    this._simulate(
      player,
      { from, to, isBearOff },
      () => {
        if (this._buildsTrappingPrime(player)) {
          throw new Error("bridge prime not allowed");
        }
      }
    );

    return { from, to, isBearOff };
  }

  private _getLegalMovesForCurrentDice(): Array<{ from: number; to: number | "off"; isBearOff: boolean; steps: number }> {
    if (!this.diceRolled || this.dice.length === 0 || this.winner) return [];

    const moves: Array<{ from: number; to: number | "off"; isBearOff: boolean; steps: number }> = [];
    const player = this.currentPlayer;
    const path = PLAYER_PATH[player];
    const uniqueDice = [...new Set(this.dice)];

    for (let fromIdx = 0; fromIdx < path.length; fromIdx += 1) {
      const from = path[fromIdx];
      const point = this.board[from];
      if (point.player !== player || point.count === 0) continue;

      for (const steps of uniqueDice) {
        try {
          const m = this._validateMove(player, from, steps);
          moves.push({ ...m, steps });
        } catch {
          // нелегальный ход
        }
      }
    }

    return moves;
  }

  private _snapshot() {
    return {
      board: this.board.map((c) => ({ player: c.player, count: c.count })),
      borneOff: { ...this.borneOff },
      dice: [...this.dice],
      headMovesUsed: this.headMovesUsed
    };
  }

  private _restore(s: ReturnType<LongNardyGame["_snapshot"]>) {
    this.board = s.board.map((c) => ({ player: c.player, count: c.count }));
    this.borneOff = { ...s.borneOff };
    this.dice = [...s.dice];
    this.headMovesUsed = s.headMovesUsed;
  }

  private _toGameState(): GameState {
    const points = new Array<number>(BOARD_POINTS).fill(0);
    for (let p = 1; p <= BOARD_POINTS; p += 1) {
      const cell = this.board[p];
      if (!cell.player) continue;
      points[pointToIdx(p)] = cell.player === "white" ? cell.count : -cell.count;
    }
    return {
      points,
      bar: { white: 0, black: 0 },
      off: { white: this.borneOff.white, black: this.borneOff.black }
    };
  }

  getLegalMoveSequences(): TurnSequence[] {
    const inputDice = [...this.dice];
    const all: TurnSequence[] = [];

    const currentMoves: Array<{ from: number; to: number | "off"; isBearOff: boolean; steps: number }> = [];

    const enumerate = () => {
      const moves = this._getLegalMovesForCurrentDice();
      if (moves.length === 0) {
        if (currentMoves.length > 0) {
          const endState = this._toGameState();
          const seqMoves: Move[] = currentMoves.map((m) => ({
            from: pointToIdx(m.from),
            to: m.isBearOff ? "off" : pointToIdx(m.to as number),
            die: m.steps,
            hit: false
          }));
          all.push({ moves: seqMoves, endState });
        }
        return;
      }

      for (const m of moves) {
        const snapshot = this._snapshot();

        this._applyMove(this.currentPlayer, { from: m.from, to: m.to, isBearOff: m.isBearOff });
        const di = this.dice.indexOf(m.steps);
        if (di >= 0) this.dice.splice(di, 1);
        if (m.from === HEAD_POINT[this.currentPlayer]) this.headMovesUsed++;

        currentMoves.push(m);
        enumerate();
        currentMoves.pop();

        this._restore(snapshot);
      }
    };

    enumerate();

    if (all.length === 0) return [];

    const maxMoves = all.reduce((mx, s) => Math.max(mx, s.moves.length), 0);
    let best = all.filter((s) => s.moves.length === maxMoves);

    // Если играется только одна кость и кости разные — обязательна бо́льшая
    if (maxMoves === 1 && inputDice.length === 2 && inputDice[0] !== inputDice[1]) {
      const highest = Math.max(...inputDice);
      const withHighest = best.filter((s) => s.moves[0]?.die === highest);
      if (withHighest.length > 0) best = withHighest;
    }

    return best;
  }
}

export function createInitialState(): GameState {
  const points = new Array<number>(BOARD_POINTS).fill(0);
  // По JS-логике: белые голова в пункте 24, черные голова в пункте 12
  points[pointToIdx(HEAD_POINT.white)] = CHECKERS_PER_PLAYER; // index 23
  points[pointToIdx(HEAD_POINT.black)] = -CHECKERS_PER_PLAYER; // index 11
  return {
    points,
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 }
  };
}

export function rollDice(d1?: number, d2?: number): number[] {
  const a = d1 ?? (1 + Math.floor(Math.random() * 6));
  const b = d2 ?? (1 + Math.floor(Math.random() * 6));
  if (a === b) return [a, a, a, a];
  return [a, b];
}

export function opponent(player: Player): Player {
  return opponentOf(player);
}

export function applyMove(state: GameState, player: Player, move: Move): GameState {
  const next = cloneState(state);

  // long nardy: от bar не ходим
  if (typeof move.from !== "number") return state;

  const fromIdx = move.from;
  const to = move.to;

  if (player === "white") {
    next.points[fromIdx] -= 1;
  } else {
    next.points[fromIdx] += 1;
  }

  if (to === "off") {
    next.off[player] += 1;
    return next;
  }

  const toIdx = to;
  if (player === "white") {
    next.points[toIdx] += 1;
  } else {
    next.points[toIdx] -= 1;
  }

  return next;
}

export function getLegalTurnSequences(state: GameState, player: Player, dice: number[]): TurnSequence[] {
  return getLegalTurnSequencesWithContext(state, player, dice, { isFirstTurn: false });
}

export function getLegalTurnSequencesWithContext(
  state: GameState,
  player: Player,
  dice: number[],
  ctx: { isFirstTurn: boolean }
): TurnSequence[] {
  const game = new LongNardyGame({ state, player, dice, isFirstTurn: ctx.isFirstTurn });
  const seqs = game.getLegalMoveSequences();
  if (seqs.length === 0) {
    return [{ moves: [], endState: cloneState(state) }];
  }
  return seqs;
}

export function isFinished(state: GameState): Player | null {
  if (state.off.white >= CHECKERS_PER_PLAYER) return "white";
  if (state.off.black >= CHECKERS_PER_PLAYER) return "black";
  return null;
}

function pipCount(state: GameState, player: Player): number {
  // "Пипы" = сколько шагов по маршруту до точного выноса.
  // Для точки в позиции pathIndex расстояние = path.length - pathIndex.
  const path = PLAYER_PATH[player];
  const posIdx = new Array<number>(BOARD_POINTS + 1).fill(-1);
  for (let i = 0; i < path.length; i += 1) posIdx[path[i]] = i;

  let score = 0;
  for (let idx = 0; idx < BOARD_POINTS; idx += 1) {
    const p = idxToPoint(idx);
    const cnt = countFor(state, player, idx);
    if (cnt <= 0) continue;
    const i = posIdx[p];
    if (i < 0) continue;
    score += cnt * (path.length - i);
  }
  return score;
}

export function evaluateStateForBlack(state: GameState): number {
  const blackPip = pipCount(state, "black");
  const whitePip = pipCount(state, "white");
  const offBonus = state.off.black * 22 - state.off.white * 22;

  // Мелкий эвристический якорь: нравится когда у чёрных сильнее стек в их доме.
  let anchorBonus = 0;
  for (const idx of HOME_BLACK_IDXS) {
    if (state.points[idx] <= -2) anchorBonus += 2;
  }
  for (const idx of HOME_WHITE_IDXS) {
    if (state.points[idx] >= 2) anchorBonus -= 2;
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
  if (!match) return null;
  const value = Number.parseInt(match[0], 10);
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value >= max) return null;
  return value;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

