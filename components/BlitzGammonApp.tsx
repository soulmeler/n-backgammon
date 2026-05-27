"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BackgammonBoard from "@/components/BackgammonBoard";
import { askGroqForMove } from "@/lib/ai";
import {
  Difficulty,
  MatchResult,
  Move,
  Player,
  applyMove,
  chooseHeuristicSequence,
  createInitialState,
  formatDuration,
  getLegalTurnSequences,
  isFinished,
  rollDice,
  serializeForAI
} from "@/lib/backgammon";

type TabId = "play" | "lobby" | "history" | "rating";
type CellRef = number | "bar" | "off";

const HISTORY_KEY = "blitzgammon-history-v1";
const THEME_KEY = "blitzgammon-theme-v1";

const tabs: Array<{ id: TabId; title: string; subtitle: string }> = [
  {
    id: "play",
    title: "Play vs AI",
    subtitle: "Настоящие быстрые нарды: короткие решения, высокий темп и post-game AI coaching."
  },
  {
    id: "lobby",
    title: "Lobby",
    subtitle: "Matchmaking lobby против реальных игроков по ELO (demo)."
  },
  {
    id: "history",
    title: "History",
    subtitle: "История всех матчей"
  },
  {
    id: "rating",
    title: "Rating",
    subtitle: "Рейтинг по стране и регионам Казахстана"
  }
];

function moveKey(move: Move): string {
  return `${move.from}-${move.to}-${move.die}-${move.hit ? 1 : 0}`;
}

function moveText(move: Move): string {
  const from = typeof move.from === "number" ? String(move.from + 1) : "bar";
  const to = typeof move.to === "number" ? String(move.to + 1) : "off";
  return `${from}/${to}${move.hit ? "*" : ""}`;
}

function removeOneDie(dice: number[], die: number): number[] {
  const idx = dice.indexOf(die);
  if (idx < 0) {
    return [...dice];
  }
  return [...dice.slice(0, idx), ...dice.slice(idx + 1)];
}

function toRefKey(ref: CellRef): string {
  return typeof ref === "number" ? String(ref) : ref;
}

function isSameCell(a: CellRef | null, b: CellRef): boolean {
  return a === b;
}

const kazakhstanRatings = [
  { rank: 1, player: "Ayan T.", elo: 2190, region: "Алматы" },
  { rank: 2, player: "Daniyar S.", elo: 2148, region: "Астана" },
  { rank: 3, player: "Miras K.", elo: 2106, region: "Шымкент" },
  { rank: 4, player: "Arman B.", elo: 2064, region: "Караганда" },
  { rank: 5, player: "Temirlan A.", elo: 2033, region: "Актобе" },
  { rank: 6, player: "Nurzhan R.", elo: 2012, region: "Павлодар" }
];

export default function BlitzGammonApp() {
  const [tab, setTab] = useState<TabId>("play");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [hydrated, setHydrated] = useState(false);

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [phase, setPhase] = useState<"setup" | "playing" | "finished">("setup");
  const [gameState, setGameState] = useState(createInitialState());
  const [turn, setTurn] = useState<Player>("white");
  const [dice, setDice] = useState<number[]>([]);
  const [selectedFrom, setSelectedFrom] = useState<number | "bar" | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [statusText, setStatusText] = useState("Выберите сложность и начните матч");
  const [winner, setWinner] = useState<Player | null>(null);
  const [matchStartAt, setMatchStartAt] = useState<number | null>(null);
  const [finishedDurationSec, setFinishedDurationSec] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [moveLog, setMoveLog] = useState<string[]>([]);

  const [history, setHistory] = useState<MatchResult[]>([]);
  const aiTurnTokenRef = useRef(0);
  const aiTimeoutRef = useRef<number | null>(null);

  const clearPendingAiTimeout = useCallback(() => {
    if (aiTimeoutRef.current !== null) {
      window.clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    setHydrated(true);

    const savedTheme = window.localStorage.getItem(THEME_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }

    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as MatchResult[];
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      } catch {
        setHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history, hydrated]);

  useEffect(() => {
    return () => {
      aiTurnTokenRef.current += 1;
      clearPendingAiTimeout();
    };
  }, [clearPendingAiTimeout]);

  useEffect(() => {
    if (phase !== "playing" || !matchStartAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [phase, matchStartAt]);

  const elapsedSec = phase === "finished" ? finishedDurationSec : matchStartAt ? Math.floor((nowTick - matchStartAt) / 1000) : 0;

  const legalSequences = useMemo(() => {
    if (phase !== "playing" || turn !== "white") {
      return [];
    }
    return getLegalTurnSequences(gameState, "white", dice);
  }, [phase, turn, gameState, dice]);

  const firstMoves = useMemo(() => {
    const uniq = new Map<string, Move>();

    for (const seq of legalSequences) {
      if (seq.moves.length === 0) {
        continue;
      }
      const first = seq.moves[0];
      uniq.set(moveKey(first), first);
    }

    return [...uniq.values()];
  }, [legalSequences]);

  const selectableFrom = useMemo(() => {
    const set = new Set<string>();

    for (const move of firstMoves) {
      set.add(typeof move.from === "number" ? String(move.from) : move.from);
    }

    return set;
  }, [firstMoves]);

  const selectableTo = useMemo(() => {
    const set = new Set<string>();

    if (selectedFrom === null) {
      return set;
    }

    for (const move of firstMoves) {
      if (move.from === selectedFrom) {
        set.add(typeof move.to === "number" ? String(move.to) : move.to);
      }
    }

    return set;
  }, [firstMoves, selectedFrom]);

  const finishGame = useCallback(
    (gameWinner: Player) => {
      aiTurnTokenRef.current += 1;
      clearPendingAiTimeout();

      const duration = matchStartAt ? Math.max(0, Math.floor((Date.now() - matchStartAt) / 1000)) : 0;

      setPhase("finished");
      setWinner(gameWinner);
      setFinishedDurationSec(duration);
      setStatusText(gameWinner === "white" ? "Победа!" : "Поражение, но хороший разбор после игры.");

      const entry: MatchResult = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        playedAt: new Date().toISOString(),
        winner: gameWinner,
        durationSec: duration,
        difficulty,
        source: "local"
      };

      setHistory((prev) => [entry, ...prev].slice(0, 60));
    },
    [clearPendingAiTimeout, difficulty, matchStartAt]
  );

  const runBlackTurn = useCallback(
    async (stateAtBlackStart: ReturnType<typeof createInitialState>, token: number) => {
      if (token !== aiTurnTokenRef.current || phase !== "playing") {
        return;
      }

      setTurn("black");
      setAiThinking(true);

      const rolled = rollDice();
      setDice(rolled);
      setStatusText(`AI думает... Кубики: ${rolled.join("-")}`);

      await new Promise((resolve) => window.setTimeout(resolve, 420));
      if (token !== aiTurnTokenRef.current || phase !== "playing") {
        return;
      }

      const sequences = getLegalTurnSequences(stateAtBlackStart, "black", rolled);

      let chosen = chooseHeuristicSequence(sequences, difficulty, stateAtBlackStart);

      if (difficulty === "hard" && sequences.length > 1) {
        const aiIndex = await askGroqForMove({
          stateJson: serializeForAI(stateAtBlackStart),
          difficulty,
          dice: rolled,
          legalMoves: sequences.map((seq) => seq.moves.map((m) => moveText(m)).join(" ") || "pass")
        });
        if (token !== aiTurnTokenRef.current || phase !== "playing") {
          return;
        }

        if (typeof aiIndex === "number" && aiIndex >= 0 && aiIndex < sequences.length) {
          chosen = sequences[aiIndex];
        }
      }

      const resultingState = chosen.endState;

      if (chosen.moves.length === 0) {
        setMoveLog((prev) => [`AI: pass (${rolled.join("-")})`, ...prev].slice(0, 16));
      } else {
        setMoveLog((prev) => [`AI: ${rolled.join("-")} => ${chosen.moves.map((m) => moveText(m)).join(" ")}`, ...prev].slice(0, 16));
      }

      setGameState(resultingState);

      const gameWinner = isFinished(resultingState);
      if (gameWinner) {
        setAiThinking(false);
        finishGame(gameWinner);
        return;
      }

      const whiteRoll = rollDice();
      if (token !== aiTurnTokenRef.current || phase !== "playing") {
        return;
      }
      setTurn("white");
      setDice(whiteRoll);
      setSelectedFrom(null);
      setAiThinking(false);
      setStatusText(`Ваш ход. Кубики: ${whiteRoll.join("-")}`);
    },
    [difficulty, finishGame, phase]
  );

  const scheduleAiTurn = useCallback(
    (stateAtBlackStart: ReturnType<typeof createInitialState>, delayMs = 320) => {
      clearPendingAiTimeout();
      const token = aiTurnTokenRef.current + 1;
      aiTurnTokenRef.current = token;

      setTurn("black");
      setAiThinking(true);

      aiTimeoutRef.current = window.setTimeout(() => {
        aiTimeoutRef.current = null;
        void runBlackTurn(stateAtBlackStart, token);
      }, delayMs);
    },
    [clearPendingAiTimeout, runBlackTurn]
  );

  function startNewMatch() {
    aiTurnTokenRef.current += 1;
    clearPendingAiTimeout();

    const initial = createInitialState();
    const openingRoll = rollDice();

    setPhase("playing");
    setWinner(null);
    setGameState(initial);
    setTurn("white");
    setDice(openingRoll);
    setSelectedFrom(null);
    setAiThinking(false);
    setMoveLog([]);
    setMatchStartAt(Date.now());
    setNowTick(Date.now());
    setFinishedDurationSec(0);
    setStatusText(`Ваш ход. Кубики: ${openingRoll.join("-")}`);
  }

  function onBoardClick(ref: CellRef) {
    if (phase !== "playing" || turn !== "white" || aiThinking) {
      return;
    }

    const refKey = toRefKey(ref);

    if (selectedFrom === null) {
      if (ref !== "off" && selectableFrom.has(refKey)) {
        setSelectedFrom(ref);
      }
      return;
    }

    if (isSameCell(selectedFrom, ref)) {
      setSelectedFrom(null);
      return;
    }

    const pickedMove = firstMoves.find((move) => move.from === selectedFrom && move.to === ref);

    if (!pickedMove) {
      if (ref !== "off" && selectableFrom.has(refKey)) {
        setSelectedFrom(ref);
      }
      return;
    }

    const nextState = applyMove(gameState, "white", pickedMove);
    const nextDice = removeOneDie(dice, pickedMove.die);

    setGameState(nextState);
    setDice(nextDice);
    setSelectedFrom(null);
    setMoveLog((prev) => [`YOU: ${pickedMove.die} => ${moveText(pickedMove)}`, ...prev].slice(0, 16));

    const gameWinner = isFinished(nextState);
    if (gameWinner) {
      finishGame(gameWinner);
      return;
    }

    if (nextDice.length === 0) {
      setStatusText("Ход AI...");
      scheduleAiTurn(nextState, 300);
      return;
    }

    setStatusText(`Ваш ход. Осталось: ${nextDice.join("-")}`);
  }

  useEffect(() => {
    if (phase !== "playing" || turn !== "white" || aiThinking) {
      return;
    }

    if (firstMoves.length === 0) {
      setStatusText("Нет доступных ходов. Ход AI.");
      scheduleAiTurn(gameState, 320);
    }

    return;
  }, [phase, turn, aiThinking, firstMoves, gameState, scheduleAiTurn]);

  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];

  return (
    <main className="min-h-screen bg-[var(--bg)] px-3 py-3 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">BlitzGammon</p>
              <h1 className="text-lg font-semibold">Быстрые нарды нового темпа</h1>
            </div>

            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
              className="rounded-md border border-[var(--line)] px-3 py-1 text-sm hover:border-[var(--accent)]"
            >
              {theme === "light" ? "Dark" : "Light"} mode
            </button>
          </div>

          <nav className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tabs.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`rounded-md border px-2 py-1 text-left text-xs transition ${
                  tab === item.id
                    ? "border-[var(--accent)] bg-[color:var(--accent)]/10"
                    : "border-[var(--line)] hover:border-[var(--accent-soft)]"
                }`}
              >
                <span className="block font-semibold">{item.title}</span>
              </button>
            ))}
          </nav>
        </header>

        <section className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2">
          <p className="text-sm text-[var(--ink)]/85">{activeTab.subtitle}</p>
        </section>

        {tab === "play" && (
          <section className="space-y-3">
            <div className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <div className="text-sm">
                <p className="font-semibold">Режим: Llama 3.5 через Groq API (hard)</p>
                <p className="text-[var(--ink)]/75">Статус: {statusText}</p>
                <p className="text-[var(--ink)]/75">Цвета: Вы — темные, AI — светлые</p>
                <p className="text-[var(--ink)]/75">
                  Время: <span className="font-semibold">{formatDuration(elapsedSec)}</span>
                </p>
              </div>

              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                disabled={phase === "playing"}
              >
                <option value="easy">AI Difficulty: Easy</option>
                <option value="medium">AI Difficulty: Medium</option>
                <option value="hard">AI Difficulty: Hard (Groq)</option>
              </select>

              <button
                type="button"
                onClick={startNewMatch}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-soft)]"
              >
                {phase === "playing" ? "Restart" : "Start Match"}
              </button>
            </div>

            {phase !== "setup" && (
              <div className="grid items-stretch gap-3">
                <BackgammonBoard
                  state={gameState}
                  selectedFrom={selectedFrom}
                  selectableFrom={selectableFrom}
                  selectableTo={selectableTo}
                  onPointClick={onBoardClick}
                  disabled={turn !== "white" || aiThinking || phase !== "playing"}
                />

                <aside className="mx-auto flex min-h-[760px] w-[260px] flex-col rounded-none border border-[var(--line)] bg-[var(--card)] p-3 sm:w-[300px]">
                  <h3 className="text-sm font-semibold">Панель партии</h3>
                  <p className="mt-1 text-xs text-[var(--ink)]/80">Ход: {turn === "white" ? "Вы" : "AI"}</p>
                  <p className="text-xs text-[var(--ink)]/80">Кубики: {dice.length > 0 ? dice.join("-") : "-"}</p>
                  <p className="text-xs text-[var(--ink)]/80">AI модель: Llama 3.5 / Groq API</p>

                  <div className="mt-3 flex flex-1 flex-col rounded-none border border-[var(--line)] p-2">
                    <p className="text-xs font-semibold">Последние действия</p>
                    <div className="mt-1 flex-1 space-y-1 overflow-auto text-xs">
                      {moveLog.length === 0 && <p className="opacity-70">Пока пусто</p>}
                      {moveLog.map((line, idx) => (
                        <p key={`${line}-${idx}`} className="rounded bg-black/5 px-2 py-1 dark:bg-white/5">
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                </aside>
              </div>
            )}

            {phase === "finished" && winner && (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
                <h3 className="text-lg font-semibold">{winner === "white" ? "Матч выигран" : "Матч завершен"}</h3>
                <p className="text-sm text-[var(--ink)]/80">Длительность: {formatDuration(finishedDurationSec)}</p>
                <p className="text-sm text-[var(--ink)]/80">Сложность: {difficulty}</p>
                <p className="mt-2 text-sm text-[var(--ink)]/90">
                  Post-game coaching: {winner === "white" ? "Темп хороший, добавь контроль блоутов в середине." : "Сфокусируйся на безопасности одиночных шашек и тайминге входа в дом."}
                </p>
              </div>
            )}
          </section>
        )}

        {tab === "lobby" && (
          <section className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
            <h2 className="text-base font-semibold">Matchmaking Lobby (Demo)</h2>
            <p className="mt-1 text-sm text-[var(--ink)]/80">
              Вкладка в разработке: подбор соперника по ELO, фильтр по времени партии, региональный пул и smart queue.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-[var(--line)] p-2 text-xs">
                <p className="font-semibold">Ваш ELO</p>
                <p>1812 (demo)</p>
              </div>
              <div className="rounded-md border border-[var(--line)] p-2 text-xs">
                <p className="font-semibold">Очередь</p>
                <p>Поиск 30-60 сек (demo)</p>
              </div>
              <div className="rounded-md border border-[var(--line)] p-2 text-xs">
                <p className="font-semibold">Формат</p>
                <p>Blitz 5m + 2s (demo)</p>
              </div>
            </div>
          </section>
        )}

        {tab === "history" && (
          <section className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
            <h2 className="text-base font-semibold">История матчей</h2>
            <div className="mt-3 space-y-2">
              {history.length === 0 && <p className="text-sm text-[var(--ink)]/75">Сыграйте первый матч, и история появится здесь.</p>}
              {history.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between rounded-md border border-[var(--line)] px-3 py-2 text-sm">
                  <p>
                    {new Date(item.playedAt).toLocaleString()} · {item.winner === "white" ? "Win" : "Loss"}
                  </p>
                  <p className="text-[var(--ink)]/75">
                    {item.difficulty} · {formatDuration(item.durationSec)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "rating" && (
          <section className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
            <h2 className="text-base font-semibold">Рейтинг Казахстан / Регионы</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left">
                    <th className="py-2">#</th>
                    <th className="py-2">Игрок</th>
                    <th className="py-2">ELO</th>
                    <th className="py-2">Регион</th>
                  </tr>
                </thead>
                <tbody>
                  {kazakhstanRatings.map((row) => (
                    <tr key={row.rank} className="border-b border-[var(--line)]/70">
                      <td className="py-2">{row.rank}</td>
                      <td className="py-2">{row.player}</td>
                      <td className="py-2 font-semibold text-[var(--accent)]">{row.elo}</td>
                      <td className="py-2">{row.region}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {!hydrated && <div className="sr-only">loading</div>}
    </main>
  );
}
