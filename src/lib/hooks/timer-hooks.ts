import { useCallback, useEffect, useRef, useState } from "react";
import { getModeSeconds, type Mode } from "@/lib/pomodoro";
import type { AppConfig } from "@/lib/hooks/app-hooks";
import {
  AMBIENT_SOUNDS,
  AMBIENT_SOUND_FILES,
  type AmbientSound,
} from "@/lib/ambient";

type AudioEvent = "start" | "end";
type AudioKey = `${Mode}_${AudioEvent}`;

const AUDIO_BASE_URL = `${import.meta.env.BASE_URL}audio/`;
const REMINDER_INTERVAL_MS = 5 * 60 * 1000;

const buildAudioMap = (language: AppConfig["audioLanguage"]) => {
  const buildUrl = (audioMode: Mode, event: AudioEvent) =>
    `${AUDIO_BASE_URL}${audioMode}_${event}_${language}.mp3`;
  const map: Record<AudioKey, HTMLAudioElement> = {
    focus_start: new Audio(buildUrl("focus", "start")),
    focus_end: new Audio(buildUrl("focus", "end")),
    break_start: new Audio(buildUrl("break", "start")),
    break_end: new Audio(buildUrl("break", "end")),
  };
  Object.values(map).forEach((audio) => {
    audio.preload = "auto";
  });
  return map;
};

const createTickTockAudio = () => {
  const tick = new Audio(`${AUDIO_BASE_URL}tick.mp3`);
  const tock = new Audio(`${AUDIO_BASE_URL}tock.mp3`);
  tick.preload = "auto";
  tock.preload = "auto";
  return { tick, tock };
};

const createReminderAudio = (language: AppConfig["audioLanguage"]) => {
  const audio = new Audio(`${AUDIO_BASE_URL}reminder_${language}.mp3`);
  audio.preload = "auto";
  return audio;
};

type AmbientAudioMap = Record<AmbientSound, HTMLAudioElement>;

const createAmbientAudioMap = () => {
  const map = {} as AmbientAudioMap;
  AMBIENT_SOUNDS.forEach((sound) => {
    const audio = new Audio(`${AUDIO_BASE_URL}${AMBIENT_SOUND_FILES[sound]}`);
    audio.preload = "auto";
    audio.loop = true;
    map[sound] = audio;
  });
  return map;
};

const clampAmbientVolume = (value: number) =>
  Math.min(1, Math.max(0, value / 100));

type PomodoroTimerOptions = {
  onVoiceAudioPlay?: (audio: HTMLAudioElement) => void;
  onFocusComplete?: (value: { startedAt: string; endedAt: string }) => void;
};

export const usePomodoroTimer = (
  config: AppConfig,
  options: PomodoroTimerOptions = {},
) => {
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(() =>
    getModeSeconds("focus", config.focusMinutes, config.breakMinutes),
  );
  const [isRunning, setIsRunning] = useState(false);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);

  const onVoiceAudioPlayRef = useRef<PomodoroTimerOptions["onVoiceAudioPlay"]>(
    options.onVoiceAudioPlay,
  );

  const audioMapRef = useRef(buildAudioMap(config.audioLanguage));
  const tickTockRef = useRef(createTickTockAudio());
  const reminderAudioRef = useRef(createReminderAudio(config.audioLanguage));
  const ambientAudioRef = useRef(createAmbientAudioMap());
  const reminderTimeoutRef = useRef<number | null>(null);
  const isRunningRef = useRef(isRunning);
  const nextTickIsTickRef = useRef(true);
  const focusStartedAtRef = useRef<Date | null>(null);
  const modeSecondsRef = useRef({
    focus: getModeSeconds("focus", config.focusMinutes, config.breakMinutes),
    break: getModeSeconds("break", config.focusMinutes, config.breakMinutes),
  });

  // Sync duration changes while idle and avoid surprising jumps.
  // Sample cases:
  // - Focus is 25:00 and idle at 25:00, user sets focus to 30: remaining becomes 30:00.
  // - Focus is 25:00 and idle at 12:34, user sets focus to 30: remaining stays 12:34.
  // - Focus is 25:00 and idle at 20:00, user sets focus to 15: remaining clamps to 15:00.
  // - Break duration changes while in focus: only the stored totals update, remaining stays.
  useEffect(() => {
    audioMapRef.current = buildAudioMap(config.audioLanguage);
    reminderAudioRef.current = createReminderAudio(config.audioLanguage);
  }, [config.audioLanguage]);

  useEffect(() => {
    const map = ambientAudioRef.current;
    AMBIENT_SOUNDS.forEach((sound) => {
      const audio = map[sound];
      const volumeValue = config.ambientVolumes?.[sound] ?? 0;
      const volume = clampAmbientVolume(volumeValue);
      audio.volume = volume;

      if (!isRunning || volume === 0) {
        if (!audio.paused) {
          audio.pause();
        }
        return;
      }

      if (audio.paused) {
        void audio.play().catch((error) => {
          console.warn(`Ambient ${sound} play failed`, error);
        });
      }
    });
  }, [config.ambientVolumes, isRunning]);

  useEffect(() => {
    return () => {
      Object.values(ambientAudioRef.current).forEach((audio) => {
        audio.pause();
      });
    };
  }, []);

  useEffect(() => {
    onVoiceAudioPlayRef.current = options.onVoiceAudioPlay;
  }, [options.onVoiceAudioPlay]);

  const onFocusCompleteRef = useRef<PomodoroTimerOptions["onFocusComplete"]>(
    options.onFocusComplete,
  );

  useEffect(() => {
    onFocusCompleteRef.current = options.onFocusComplete;
  }, [options.onFocusComplete]);

  const getSecondsForMode = useCallback(
    (nextMode: Mode) =>
      getModeSeconds(nextMode, config.focusMinutes, config.breakMinutes),
    [config.breakMinutes, config.focusMinutes],
  );

  useEffect(() => {
    const next = {
      focus: getSecondsForMode("focus"),
      break: getSecondsForMode("break"),
    };
    const prev = modeSecondsRef.current;
    modeSecondsRef.current = next;

    if (isRunning) return;

    setRemaining((prevRemaining) => {
      const prevTotal = prev[mode];
      const nextTotal = next[mode];
      if (prevRemaining === prevTotal) return nextTotal;
      if (prevRemaining > nextTotal) return nextTotal;
      return prevRemaining;
    });
  }, [getSecondsForMode, isRunning, mode]);

  const playSound = useCallback((audioMode: Mode, event: AudioEvent) => {
    const key = `${audioMode}_${event}` as AudioKey;
    const audio = audioMapRef.current[key];
    if (!audio) return;
    audio.currentTime = 0;
    onVoiceAudioPlayRef.current?.(audio);
    void audio.play().catch((error) => {
      console.warn("Audio play failed", error);
    });
  }, []);

  const playReminder = useCallback(() => {
    const audio = reminderAudioRef.current;
    audio.currentTime = 0;
    onVoiceAudioPlayRef.current?.(audio);
    void audio.play().catch((error) => {
      console.warn("Reminder play failed", error);
    });
  }, []);

  const clearReminderTimeout = useCallback(() => {
    if (reminderTimeoutRef.current === null) return;
    window.clearTimeout(reminderTimeoutRef.current);
    reminderTimeoutRef.current = null;
  }, []);

  const scheduleReminder = useCallback(() => {
    clearReminderTimeout();
    if (isRunningRef.current) return;
    reminderTimeoutRef.current = window.setTimeout(() => {
      if (isRunningRef.current) return;
      playReminder();
      scheduleReminder();
    }, REMINDER_INTERVAL_MS);
  }, [clearReminderTimeout, playReminder]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      if (config.playTick) {
        const { tick, tock } = tickTockRef.current;
        const useTick = nextTickIsTickRef.current;
        const audio = useTick ? tick : tock;
        audio.currentTime = 0;
        void audio.play().catch((error) => {
          console.warn("Tick-tock play failed", error);
        });
        nextTickIsTickRef.current = !useTick;
      }

      setRemaining((prev) => {
        if (prev <= 1) {
          playSound(mode, "end");
          if (mode === "focus") {
            const startedAt = focusStartedAtRef.current;
            if (startedAt) {
              onFocusCompleteRef.current?.({
                startedAt: startedAt.toISOString(),
                endedAt: new Date().toISOString(),
              });
            }
            focusStartedAtRef.current = null;
          }
          const nextMode: Mode = mode === "focus" ? "break" : "focus";
          setIsRunning(false);
          setMode(nextMode);
          return getSecondsForMode(nextMode);
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [config.playTick, getSecondsForMode, isRunning, mode, playSound]);

  useEffect(() => {
    isRunningRef.current = isRunning;
    scheduleReminder();
    return () => {
      clearReminderTimeout();
    };
  }, [clearReminderTimeout, isRunning, scheduleReminder]);

  const applyModeSwitch = useCallback((nextMode: Mode) => {
    setIsRunning(false);
    setMode(nextMode);
    setRemaining(getSecondsForMode(nextMode));
    focusStartedAtRef.current = null;
  }, [getSecondsForMode]);

  const toggleRunning = useCallback(() => {
    setIsRunning((prev) => {
      const next = !prev;
      if (next) {
        playSound(mode, "start");
        if (
          mode === "focus" &&
          remaining === getSecondsForMode("focus") &&
          !focusStartedAtRef.current
        ) {
          focusStartedAtRef.current = new Date();
        }
      }
      return next;
    });
  }, [getSecondsForMode, mode, playSound, remaining]);

  const requestModeSwitch = useCallback(() => {
    const nextMode: Mode = mode === "focus" ? "break" : "focus";
    const total = getSecondsForMode(mode);
    if (isRunning || remaining !== total) {
      setPendingMode(nextMode);
      return;
    }
    applyModeSwitch(nextMode);
  }, [applyModeSwitch, getSecondsForMode, isRunning, mode, remaining]);

  const confirmModeSwitch = useCallback(() => {
    if (!pendingMode) return;
    applyModeSwitch(pendingMode);
    setPendingMode(null);
  }, [applyModeSwitch, pendingMode]);

  const cancelModeSwitch = useCallback(() => {
    setPendingMode(null);
  }, []);

  return {
    mode,
    remaining,
    isRunning,
    total: getSecondsForMode(mode),
    pendingMode,
    isConfirmOpen: Boolean(pendingMode),
    toggleRunning,
    requestModeSwitch,
    confirmModeSwitch,
    cancelModeSwitch,
  };
};
