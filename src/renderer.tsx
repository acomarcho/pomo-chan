import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

type Mode = "focus" | "break";

type ModeConfig = {
  label: string;
  seconds: number;
  accent: string;
};

const MODES: Record<Mode, ModeConfig> = {
  focus: { label: "Focus", seconds: 25 * 60, accent: "#ff6b4a" },
  break: { label: "Break", seconds: 5 * 60, accent: "#2ec4b6" },
};

const ACCENT_SOFT = "#ffd6b0";

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
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    setRemaining(total);
    setIsRunning(false);
  }, [mode, total]);

  const formattedTime = useMemo(() => formatTime(remaining), [remaining]);
  const progress = total === 0 ? 0 : 1 - remaining / total;

  const handleToggle = () => setIsRunning((prev) => !prev);
  const handleReset = () => {
    setIsRunning(false);
    setRemaining(total);
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-6 py-12">
      <div className="pointer-events-none absolute -left-16 -top-16 h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle,_rgba(255,214,176,0.85)_0%,_rgba(255,214,176,0)_70%)] opacity-50" />
      <div className="pointer-events-none absolute -bottom-28 -right-20 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,_rgba(46,196,182,0.28)_0%,_rgba(46,196,182,0)_70%)] opacity-50" />
      <div className="pointer-events-none absolute left-[18%] top-[12%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,_rgba(255,107,74,0.18)_0%,_rgba(255,107,74,0)_60%)]" />
      <div className="pointer-events-none absolute right-[6%] top-[6%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,_rgba(46,196,182,0.18)_0%,_rgba(46,196,182,0)_60%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-[960px] flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-6 animate-floatIn">
          <div>
            <p className="mb-3 text-[0.7rem] uppercase tracking-[0.22em] text-muted">
              Pomo-chan
            </p>
            <h1 className="mb-2 font-display text-[clamp(2.4rem,4vw,3.6rem)] leading-[1.05]">
              Pomodoro Focus
            </h1>
            <p className="max-w-[420px] text-muted">
              A calm timer to help you work in short, deliberate bursts.
            </p>
          </div>
          <div
            className="flex w-full items-center justify-between gap-3 rounded-full border border-black/10 bg-surface-strong p-2 shadow-soft sm:w-auto sm:justify-start"
            role="tablist"
            aria-label="Session mode"
          >
            {(Object.keys(MODES) as Mode[]).map((key) => {
              const isActive = mode === key;
              const activeClasses =
                key === "focus" ? "bg-accent" : "bg-accent-2";

              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold transition-all",
                    isActive
                      ? `${activeClasses} text-white shadow-glow`
                      : "text-text hover:bg-black/5",
                  ].join(" ")}
                  onClick={() => setMode(key)}
                >
                  {MODES[key].label}
                </button>
              );
            })}
          </div>
        </header>

        <main className="flex flex-col gap-6 rounded-[28px] border border-white/60 bg-surface p-6 shadow-soft animate-floatInDelayed sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="mb-1.5 text-[0.95rem] uppercase tracking-[0.16em] text-muted">
                {MODES[mode].label} session
              </p>
              <div
                className="text-[clamp(2.6rem,7vw,4.6rem)] font-semibold tracking-[0.08em] tabular-nums"
                aria-live="polite"
              >
                {formattedTime}
              </div>
            </div>
            <div className="grid min-w-[140px] gap-1 rounded-[18px] border border-black/10 bg-surface-strong px-4 py-3 text-left text-sm sm:text-right">
              <span className="text-muted">Session length</span>
              <strong className="text-xl font-semibold">
                {Math.round(total / 60)} min
              </strong>
            </div>
          </div>

          <div
            className="relative h-2.5 w-full overflow-hidden rounded-full bg-black/10"
            aria-hidden="true"
          >
            <div
              className="absolute inset-0 origin-left rounded-full transition-transform duration-200"
              style={{
                transform: `scaleX(${progress})`,
                backgroundImage: `linear-gradient(90deg, ${MODES[mode].accent}, ${ACCENT_SOFT})`,
              }}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full bg-gradient-to-br from-accent to-accent-2 px-6 py-3 text-sm font-semibold text-white shadow-button transition active:translate-y-[1px] active:scale-[0.98]"
              type="button"
              onClick={handleToggle}
            >
              {isRunning ? "Pause" : "Start"}
            </button>
            <button
              className="rounded-full border border-black/10 bg-transparent px-6 py-3 text-sm font-semibold text-text transition hover:bg-black/5 active:translate-y-[1px] active:scale-[0.98]"
              type="button"
              onClick={handleReset}
            >
              Reset
            </button>
          </div>

          <p className="text-muted">
            {remaining === 0
              ? "Session complete. Take a breather before the next round."
              : isRunning
                ? "Timer is running. Stay with the task."
                : "Ready when you are. Press start to begin."}
          </p>
        </main>
      </div>
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
