"use client";

import type { PlaybackState, PlaybackControls } from "../hooks/use-playback-engine";

const SPEEDS = [0.5, 1, 2, 4] as const;

interface TransportControlsProps {
  state: PlaybackState;
  controls: PlaybackControls;
  traceIsRunning?: boolean;
}

export function TransportControls({
  state,
  controls,
  traceIsRunning,
}: TransportControlsProps) {
  const { allSpans, cursor, mode } = state;
  const max = allSpans.length - 1;
  const currentSpan = allSpans[cursor];

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#071018]/80 px-4 py-2 text-sm">
      {/* Step back */}
      <button
        type="button"
        disabled={cursor <= 0}
        onClick={() => controls.step(-1)}
        className="rounded px-2 py-1 text-slate-300 hover:bg-white/10 disabled:opacity-30"
        title="Step back"
      >
        ⏮
      </button>

      {/* Play / Pause */}
      <button
        type="button"
        onClick={() => (mode === "playing" ? controls.pause() : controls.play())}
        className="rounded px-2 py-1 text-slate-300 hover:bg-white/10"
        title={mode === "playing" ? "Pause" : "Play"}
      >
        {mode === "playing" ? "⏸" : "▶"}
      </button>

      {/* Step forward */}
      <button
        type="button"
        disabled={cursor >= max}
        onClick={() => controls.step(1)}
        className="rounded px-2 py-1 text-slate-300 hover:bg-white/10 disabled:opacity-30"
        title="Step forward"
      >
        ⏭
      </button>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={Math.max(max, 0)}
        value={cursor}
        onChange={(e) => controls.seekTo(Number(e.target.value))}
        className="mx-2 h-1 flex-1 cursor-pointer accent-ember"
      />

      {/* Span counter */}
      <span className="whitespace-nowrap text-xs text-slate-400">
        {allSpans.length > 0 ? `${cursor + 1} / ${allSpans.length}` : "0 / 0"}
      </span>

      {/* Speed selector */}
      <SpeedSelector
        currentMode={mode}
        onSelect={(speed) => controls.play(1000 / speed)}
      />

      {/* Current span name */}
      {currentSpan ? (
        <span className="max-w-[180px] truncate text-xs text-slate-300" title={currentSpan.name}>
          {currentSpan.name}
        </span>
      ) : null}

      {/* Go Live button */}
      {traceIsRunning && mode !== "live" ? (
        <button
          type="button"
          onClick={() => controls.goLive()}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/30"
        >
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
          Live
        </button>
      ) : null}
    </div>
  );
}

function SpeedSelector({
  currentMode,
  onSelect,
}: {
  currentMode: PlaybackState["mode"];
  onSelect: (speed: number) => void;
}) {
  return (
    <select
      className="rounded bg-white/5 px-2 py-1 text-xs text-slate-300"
      disabled={currentMode === "live"}
      defaultValue={1}
      onChange={(e) => onSelect(Number(e.target.value))}
    >
      {SPEEDS.map((speed) => (
        <option key={speed} value={speed}>
          {speed}x
        </option>
      ))}
    </select>
  );
}
