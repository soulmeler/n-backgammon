"use client";

import { GameState } from "@/lib/backgammon";

type CellRef = number | "bar" | "off";

interface Props {
  state: GameState;
  selectedFrom: number | "bar" | null;
  selectableFrom: Set<string>;
  selectableTo: Set<string>;
  onPointClick: (point: CellRef) => void;
  disabled?: boolean;
}

function checkerClass(value: number): string {
  // Visual mapping (to match provided reference style):
  // logical white -> dark checker, logical black -> light checker
  return value > 0 ? "checker checker-black" : "checker checker-white";
}

function pointOwnership(value: number): "white" | "black" | null {
  if (value > 0) {
    return "white";
  }
  if (value < 0) {
    return "black";
  }
  return null;
}

function PointColumn({
  point,
  state,
  isTop,
  isSelected,
  canFrom,
  canTo,
  onClick,
  disabled
}: {
  point: number;
  state: GameState;
  isTop: boolean;
  isSelected: boolean;
  canFrom: boolean;
  canTo: boolean;
  onClick: (point: number) => void;
  disabled?: boolean;
}) {
  const value = state.points[point];
  const count = Math.abs(value);
  const owner = pointOwnership(value);

  const tone = point % 2 === 0 ? "light" : "dark";
  const triangleClass = isTop
    ? tone === "light"
      ? "triangle-light-down"
      : "triangle-dark-down"
    : tone === "light"
      ? "triangle-light"
      : "triangle-dark";

  const ring = isSelected
    ? "ring-2 ring-[var(--accent)]"
    : canTo
      ? "ring-2 ring-amber-500"
      : canFrom
        ? "ring-2 ring-[var(--accent-soft)]"
        : "ring-1 ring-transparent";

  return (
    <button
      type="button"
      onClick={() => onClick(point)}
      disabled={disabled}
      className={`relative flex h-[260px] w-full flex-col items-center ${isTop ? "justify-start" : "justify-end"} overflow-hidden rounded-md bg-transparent p-1 transition ${ring} ${
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
      }`}
    >
      <div className={`h-[176px] ${triangleClass}`} />
      <div className={`absolute ${isTop ? "top-2" : "bottom-2"} flex w-full flex-col items-center gap-1`}>
        {owner &&
          [...Array(Math.min(count, 5))].map((_, i) => (
            <span
              key={`${point}-${i}`}
              className={checkerClass(owner === "white" ? 1 : -1)}
              style={{ transform: `translateY(${isTop ? i * 2 : -i * 2}px)` }}
            />
          ))}
        {count > 5 && (
          <span className="rounded-full bg-black/45 px-2 py-0.5 text-xs font-bold text-white">+{count - 5}</span>
        )}
      </div>
      <span className={`absolute ${isTop ? "bottom-0" : "top-0"} text-[10px] text-[var(--ink)]/70`}>{point + 1}</span>
    </button>
  );
}

export default function BackgammonBoard({
  state,
  selectedFrom,
  selectableFrom,
  selectableTo,
  onPointClick,
  disabled
}: Props) {
  // Board orientation on screen:
  // top-left: 13..18, top-right: 19..24, bottom-left: 12..7, bottom-right: 6..1
  const topLeft = [12, 13, 14, 15, 16, 17];
  const topRight = [18, 19, 20, 21, 22, 23];
  const bottomLeft = [11, 10, 9, 8, 7, 6];
  const bottomRight = [5, 4, 3, 2, 1, 0];

  const barFrom = selectableFrom.has("bar");
  const barTo = selectableTo.has("bar");
  const offTo = selectableTo.has("off");

  return (
    <section className="board-panel mx-auto w-full max-w-[1050px] rounded-none p-3 sm:p-4">
      <div className="grid grid-cols-[1fr_88px_1fr] grid-rows-2 gap-x-2 gap-y-0">
        <div className="grid grid-cols-6 gap-1">
          {topLeft.map((point) => (
            <PointColumn
              key={point}
              point={point}
              state={state}
              isTop
              isSelected={selectedFrom === point}
              canFrom={selectableFrom.has(String(point))}
              canTo={selectableTo.has(String(point))}
              onClick={(p) => onPointClick(p)}
              disabled={disabled}
            />
          ))}
        </div>

        <div className="row-span-2 flex h-full min-h-[522px] flex-col overflow-hidden rounded-none border-x-2 border-[color:var(--accent)] bg-gradient-to-b from-[#d9d2c3] via-[#cfc6b5] to-[#d7cfbf]">
          <button
            type="button"
            onClick={() => onPointClick("bar")}
            disabled={disabled}
            className={`flex flex-1 flex-col items-center justify-between p-2 ${
              selectedFrom === "bar"
                ? "ring-2 ring-[var(--accent)]"
                : barTo
                  ? "ring-2 ring-amber-500"
                  : barFrom
                    ? "ring-2 ring-[var(--accent-soft)]"
                    : ""
            }`}
          >
            <span className="text-[11px] opacity-70">BAR</span>
            <div className="flex flex-col items-center gap-1">
              {[...Array(Math.min(4, state.bar.black))].map((_, i) => (
                <span key={`bb-${i}`} className="checker checker-white" />
              ))}
              {state.bar.black > 4 && <span className="text-xs">+{state.bar.black - 4}</span>}
            </div>
            <div className="flex flex-col items-center gap-1">
              {[...Array(Math.min(4, state.bar.white))].map((_, i) => (
                <span key={`bw-${i}`} className="checker checker-black" />
              ))}
              {state.bar.white > 4 && <span className="text-xs">+{state.bar.white - 4}</span>}
            </div>
          </button>

          <div className="border-t border-[var(--line)]" />

          <button
            type="button"
            onClick={() => onPointClick("off")}
            disabled={disabled}
            className={`flex flex-1 flex-col items-center justify-between p-2 ${offTo ? "ring-2 ring-amber-500" : ""}`}
          >
            <span className="text-[11px] opacity-70">OFF</span>
            <div className="flex flex-col items-center gap-1">
              {[...Array(Math.min(6, state.off.black))].map((_, i) => (
                <span key={`ob-${i}`} className="checker checker-white" />
              ))}
              {state.off.black > 6 && <span className="text-xs">+{state.off.black - 6}</span>}
            </div>
            <div className="flex flex-col items-center gap-1">
              {[...Array(Math.min(6, state.off.white))].map((_, i) => (
                <span key={`ow-${i}`} className="checker checker-black" />
              ))}
              {state.off.white > 6 && <span className="text-xs">+{state.off.white - 6}</span>}
            </div>
          </button>
        </div>

        <div className="grid grid-cols-6 gap-1">
          {topRight.map((point) => (
            <PointColumn
              key={point}
              point={point}
              state={state}
              isTop
              isSelected={selectedFrom === point}
              canFrom={selectableFrom.has(String(point))}
              canTo={selectableTo.has(String(point))}
              onClick={(p) => onPointClick(p)}
              disabled={disabled}
            />
          ))}
        </div>
        <div className="grid grid-cols-6 gap-1">
          {bottomLeft.map((point) => (
            <PointColumn
              key={point}
              point={point}
              state={state}
              isTop={false}
              isSelected={selectedFrom === point}
              canFrom={selectableFrom.has(String(point))}
              canTo={selectableTo.has(String(point))}
              onClick={(p) => onPointClick(p)}
              disabled={disabled}
            />
          ))}
        </div>

        <div className="grid grid-cols-6 gap-1">
          {bottomRight.map((point) => (
            <PointColumn
              key={point}
              point={point}
              state={state}
              isTop={false}
              isSelected={selectedFrom === point}
              canFrom={selectableFrom.has(String(point))}
              canTo={selectableTo.has(String(point))}
              onClick={(p) => onPointClick(p)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
