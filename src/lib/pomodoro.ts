export type Mode = "focus" | "break";

export type ModeConfig = {
  label: string;
  seconds: number;
};

export const MIN_TIMER_MINUTES = 1;
export const MAX_TIMER_MINUTES = 120;
export const DEFAULT_FOCUS_MINUTES = 25;
export const DEFAULT_BREAK_MINUTES = 5;

export const MODES: Record<Mode, ModeConfig> = {
  focus: { label: "Focus", seconds: DEFAULT_FOCUS_MINUTES * 60 },
  break: { label: "Break", seconds: DEFAULT_BREAK_MINUTES * 60 }
};

export const clampTimerMinutes = (value: number) => {
  if (!Number.isFinite(value)) return MIN_TIMER_MINUTES;
  const rounded = Math.round(value);
  return Math.min(MAX_TIMER_MINUTES, Math.max(MIN_TIMER_MINUTES, rounded));
};

export const getModeSeconds = (mode: Mode, focusMinutes: number, breakMinutes: number) => {
  const minutes = mode === "focus" ? focusMinutes : breakMinutes;
  return clampTimerMinutes(minutes) * 60;
};

export const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};
