export type Mode = "focus" | "break";

export type ModeConfig = {
  label: string;
  seconds: number;
};

export const MODES: Record<Mode, ModeConfig> = {
  focus: { label: "Focus", seconds: 5 * 60 },
  break: { label: "Break", seconds: 5 * 60 },
};

export const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};
