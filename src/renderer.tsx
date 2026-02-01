import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

type Mode = 'focus' | 'break';

type ModeConfig = {
  label: string;
  seconds: number;
  accent: string;
};

const MODES: Record<Mode, ModeConfig> = {
  focus: { label: 'Focus', seconds: 25 * 60, accent: 'var(--accent)' },
  break: { label: 'Break', seconds: 5 * 60, accent: 'var(--accent-2)' },
};

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const App = () => {
  const [mode, setMode] = useState<Mode>('focus');
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
    <div className="app">
      <header className="app__header">
        <div>
          <p className="eyebrow">Pomo-chan</p>
          <h1>Pomodoro Focus</h1>
          <p className="subtitle">
            A calm timer to help you work in short, deliberate bursts.
          </p>
        </div>
        <div className="mode-toggle" role="tablist" aria-label="Session mode">
          {(Object.keys(MODES) as Mode[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              className={`mode-toggle__button${mode === key ? ' is-active' : ''}`}
              style={{ ['--mode-accent' as string]: MODES[key].accent }}
              onClick={() => setMode(key)}
            >
              {MODES[key].label}
            </button>
          ))}
        </div>
      </header>

      <main className="timer-card">
        <div className="timer-card__top">
          <div>
            <p className="timer-label">{MODES[mode].label} session</p>
            <div className="timer-display" aria-live="polite">
              {formattedTime}
            </div>
          </div>
          <div className="session-info">
            <span>Session length</span>
            <strong>{Math.round(total / 60)} min</strong>
          </div>
        </div>

        <div className="progress" aria-hidden="true">
          <div
            className="progress__bar"
            style={{
              transform: `scaleX(${progress})`,
              background: `linear-gradient(90deg, ${MODES[mode].accent}, var(--accent-soft))`,
            }}
          />
        </div>

        <div className="controls">
          <button className="button button--primary" type="button" onClick={handleToggle}>
            {isRunning ? 'Pause' : 'Start'}
          </button>
          <button className="button button--ghost" type="button" onClick={handleReset}>
            Reset
          </button>
        </div>

        <p className="status">
          {remaining === 0
            ? 'Session complete. Take a breather before the next round.'
            : isRunning
              ? 'Timer is running. Stay with the task.'
              : 'Ready when you are. Press start to begin.'}
        </p>
      </main>
    </div>
  );
};

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
