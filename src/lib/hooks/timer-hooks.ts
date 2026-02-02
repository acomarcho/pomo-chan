import { useCallback, useEffect, useRef, useState } from "react";
import { MODES, type Mode } from "@/lib/pomodoro";
import type { AppConfig } from "@/lib/hooks/app-hooks";

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

type PomodoroTimerOptions = {
  onVoiceAudioPlay?: (audio: HTMLAudioElement) => void;
};

export const usePomodoroTimer = (
  config: AppConfig,
  options: PomodoroTimerOptions = {},
) => {
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(MODES.focus.seconds);
  const [isRunning, setIsRunning] = useState(false);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);

  const onVoiceAudioPlayRef = useRef<PomodoroTimerOptions["onVoiceAudioPlay"]>(
    options.onVoiceAudioPlay,
  );

  const audioMapRef = useRef(buildAudioMap(config.audioLanguage));
  const tickTockRef = useRef(createTickTockAudio());
  const reminderAudioRef = useRef(createReminderAudio(config.audioLanguage));
  const reminderTimeoutRef = useRef<number | null>(null);
  const isRunningRef = useRef(isRunning);
  const nextTickIsTickRef = useRef(true);

  useEffect(() => {
    audioMapRef.current = buildAudioMap(config.audioLanguage);
    reminderAudioRef.current = createReminderAudio(config.audioLanguage);
  }, [config.audioLanguage]);

  useEffect(() => {
    onVoiceAudioPlayRef.current = options.onVoiceAudioPlay;
  }, [options.onVoiceAudioPlay]);

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
          const nextMode: Mode = mode === "focus" ? "break" : "focus";
          setIsRunning(false);
          setMode(nextMode);
          return MODES[nextMode].seconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [config.playTick, isRunning, mode, playSound]);

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
    setRemaining(MODES[nextMode].seconds);
  }, []);

  const toggleRunning = useCallback(() => {
    setIsRunning((prev) => {
      const next = !prev;
      if (next) {
        playSound(mode, "start");
      }
      return next;
    });
  }, [mode, playSound]);

  const requestModeSwitch = useCallback(() => {
    const nextMode: Mode = mode === "focus" ? "break" : "focus";
    const total = MODES[mode].seconds;
    if (isRunning || remaining !== total) {
      setPendingMode(nextMode);
      return;
    }
    applyModeSwitch(nextMode);
  }, [applyModeSwitch, isRunning, mode, remaining]);

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
    total: MODES[mode].seconds,
    pendingMode,
    isConfirmOpen: Boolean(pendingMode),
    toggleRunning,
    requestModeSwitch,
    confirmModeSwitch,
    cancelModeSwitch,
  };
};
