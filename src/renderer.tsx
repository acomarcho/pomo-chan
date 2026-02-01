import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

type Mode = "focus" | "break";

type ModeConfig = {
  label: string;
  seconds: number;
};

const MODES: Record<Mode, ModeConfig> = {
  focus: { label: "Focus", seconds: 25 * 60 },
  break: { label: "Break", seconds: 5 * 60 },
};

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const App = () => {
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(MODES.focus.seconds);
  const [isRunning, setIsRunning] = useState(false);

  const total = MODES[mode].seconds;

  useEffect(() => {
    if (!isRunning) return undefined;

    const interval = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          const nextMode: Mode = mode === "focus" ? "break" : "focus";
          setMode(nextMode);
          return MODES[nextMode].seconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning, mode]);

  const formattedTime = useMemo(() => formatTime(remaining), [remaining]);
  const showResume = !isRunning && remaining !== total;
  const primaryLabel = isRunning ? "Pause" : showResume ? "Resume" : "Start";
  const switchLabel = mode === "focus" ? "Break" : "Focus";

  const handleToggle = () => setIsRunning((prev) => !prev);
  const handleSwitchMode = () => {
    const nextMode: Mode = mode === "focus" ? "break" : "focus";
    setIsRunning(false);
    setMode(nextMode);
    setRemaining(MODES[nextMode].seconds);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 py-6 text-gray-900">
      <section className="flex flex-1 items-center justify-center pb-6">
        <div className="flex h-[400px] w-full max-w-4xl items-center justify-center rounded-2xl bg-gray-200 text-sm font-medium text-gray-500">
          {/* Live2D canvas integration goes here. */}
          Live2D Canvas
        </div>
      </section>

      <section className="text-center">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
          {MODES[mode].label} Timer
        </h2>
        <h1
          className="mt-3 text-[clamp(3rem,8vw,5rem)] font-semibold tabular-nums"
          aria-live="polite"
        >
          {formattedTime}
        </h1>
      </section>

      <section className="flex items-center justify-center gap-4 pb-6 pt-8">
        <button
          className="rounded-full bg-gray-900 px-8 py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
          type="button"
          onClick={handleToggle}
        >
          {primaryLabel}
        </button>
        <button
          className="rounded-full border border-gray-300 px-8 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 active:scale-[0.98]"
          type="button"
          onClick={handleSwitchMode}
        >
          {switchLabel}
        </button>
      </section>
    </div>
  );
};

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
