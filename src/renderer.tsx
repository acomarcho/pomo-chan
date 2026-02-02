import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Settings2 } from "lucide-react";
import "./styles/globals.css";

(window as typeof window & { PIXI?: typeof PIXI }).PIXI = PIXI;

type Mode = "focus" | "break";
type AudioLanguage = "en" | "jp";
type AudioEvent = "start" | "end";
type AudioKey = `${Mode}_${AudioEvent}`;

type ModeConfig = {
  label: string;
  seconds: number;
};

type AlwaysOnTopAPI = {
  get: () => Promise<boolean>;
  set: (value: boolean) => Promise<boolean>;
};

type ActiveAppAPI = {
  get: () => Promise<string>;
  debug?: () => Promise<unknown>;
};

type AppConfig = {
  playTick: boolean;
  audioLanguage: AudioLanguage;
};

type ConfigAPI = {
  get: () => Promise<AppConfig>;
  set: (value: Partial<AppConfig>) => Promise<AppConfig>;
  onChange?: (callback: (value: AppConfig) => void) => () => void;
  openWindow?: () => Promise<boolean>;
};

declare global {
  interface Window {
    electronAPI?: {
      alwaysOnTop?: AlwaysOnTopAPI;
      activeApp?: ActiveAppAPI;
      config?: ConfigAPI;
    };
  }
}

const MODES: Record<Mode, ModeConfig> = {
  focus: { label: "Focus", seconds: 25 * 60 },
  break: { label: "Break", seconds: 5 * 60 },
};

const REMINDER_INTERVAL_MS = 5 * 60 * 1000;
const AUDIO_BASE_URL = `${import.meta.env.BASE_URL}audio/`;

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const DEFAULT_CONFIG: AppConfig = {
  playTick: false,
  audioLanguage: "jp",
};

const useAppConfig = () => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const api = window.electronAPI?.config;

  useEffect(() => {
    if (!api) return;
    let isActive = true;

    api
      .get()
      .then((stored) => {
        if (!isActive) return;
        setConfig({ ...DEFAULT_CONFIG, ...stored });
      })
      .catch(() => {});

    const unsubscribe = api.onChange?.((value) => {
      if (!isActive) return;
      setConfig({ ...DEFAULT_CONFIG, ...value });
    });

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, [api]);

  const updateConfig = useCallback(
    (value: Partial<AppConfig>) => {
      setConfig((prev) => ({ ...prev, ...value }));
      if (!api) return;
      api.set(value).catch(() => {});
    },
    [api],
  );

  return { config, updateConfig, hasApi: Boolean(api) };
};

const LIVE2D_MODEL_URL = `${import.meta.env.BASE_URL}live2d/hiyori/hiyori_pro_t11.model3.json`;
const LIVE2D_ZOOM = 3;
const LIVE2D_Y_OFFSET = 0.9;

type Live2DStageProps = {
  activeAppName?: string;
  showActiveApp?: boolean;
};

const Live2DStage = ({ activeAppName, showActiveApp }: Live2DStageProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let destroyed = false;

    const app = new PIXI.Application({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resizeTo: container,
    });

    const canvas = app.view as HTMLCanvasElement;
    container.appendChild(canvas);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";

    let model: Live2DModel | null = null;
    const modelBaseSize = { width: 0, height: 0 };

    const fitModel = () => {
      if (!model) return;
      const { width, height } = app.renderer;
      if (!width || !height || !modelBaseSize.width || !modelBaseSize.height) {
        return;
      }
      const scale =
        Math.min(width / modelBaseSize.width, height / modelBaseSize.height) *
        LIVE2D_ZOOM;
      model.scale.set(scale);
      model.pivot.set(modelBaseSize.width / 2, modelBaseSize.height / 2);
      model.position.set(width / 2, height / 2 + height * LIVE2D_Y_OFFSET);
    };

    const loadModel = async () => {
      try {
        model = await Live2DModel.from(LIVE2D_MODEL_URL, {
          autoInteract: true,
        });
        if (destroyed) {
          model.destroy();
          return;
        }
        model.interactive = true;
        app.stage.addChild(model);
        const bounds = model.getBounds();
        modelBaseSize.width = bounds.width || model.width;
        modelBaseSize.height = bounds.height || model.height;
        fitModel();
        app.renderer.on("resize", fitModel);
        setIsLoaded(true);
      } catch (error) {
        console.error("Failed to load Live2D model", error);
      }
    };

    loadModel();

    return () => {
      destroyed = true;
      app.renderer.off("resize", fitModel);
      if (canvas && canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      app.destroy(true, { children: true, texture: true, baseTexture: true });
    };
  }, []);

  return (
    <div className="relative flex h-65 w-full max-w-3xl items-center justify-center overflow-hidden rounded-2xl bg-gray-200 sm:h-75">
      {/* Live2D canvas mounts into this container. */}
      {!isLoaded && (
        <span className="pointer-events-none relative z-10 text-sm font-medium text-gray-500">
          Loading model...
        </span>
      )}
      {showActiveApp && (
        <div className="absolute bottom-3 left-3 z-10 flex max-w-[70%] items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[0.65rem] font-semibold text-gray-600 shadow-sm backdrop-blur">
          <span className="uppercase tracking-[0.2em]">Active app</span>
          <span className="truncate text-[0.7rem] font-medium text-gray-900">
            {activeAppName || "Unknown"}
          </span>
        </div>
      )}
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
};

const TimerWindow = () => {
  const { config } = useAppConfig();
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(MODES.focus.seconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [activeAppName, setActiveAppName] = useState("");
  const previousModeRef = useRef(mode);
  const previousRunningRef = useRef(isRunning);
  const isRunningRef = useRef(isRunning);
  const reminderTimeoutRef = useRef<number | null>(null);

  const isAlwaysOnTopAvailable = Boolean(window.electronAPI?.alwaysOnTop);
  const isActiveAppAvailable = Boolean(window.electronAPI?.activeApp);
  const isConfigAvailable = Boolean(window.electronAPI?.config?.openWindow);

  const total = MODES[mode].seconds;
  const audioMap = useMemo(() => {
    const audioLanguage = config.audioLanguage;
    const buildUrl = (audioMode: Mode, event: AudioEvent) =>
      `${AUDIO_BASE_URL}${audioMode}_${event}_${audioLanguage}.mp3`;
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
  }, [config.audioLanguage]);
  const tickTockAudio = useMemo(() => {
    const tick = new Audio(`${AUDIO_BASE_URL}tick.mp3`);
    const tock = new Audio(`${AUDIO_BASE_URL}tock.mp3`);
    tick.preload = "auto";
    tock.preload = "auto";
    return { tick, tock };
  }, []);
  const reminderAudio = useMemo(() => {
    const audio = new Audio(
      `${AUDIO_BASE_URL}reminder_${config.audioLanguage}.mp3`,
    );
    audio.preload = "auto";
    return audio;
  }, [config.audioLanguage]);
  const nextTickIsTickRef = useRef(true);

  const playSound = useCallback(
    (audioMode: Mode, event: AudioEvent) => {
      const key = `${audioMode}_${event}` as AudioKey;
      const audio = audioMap[key];
      if (!audio) return;
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    },
    [audioMap],
  );

  const playReminder = useCallback(() => {
    reminderAudio.currentTime = 0;
    void reminderAudio.play().catch(() => {});
  }, [reminderAudio]);

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
    if (!isRunning) return undefined;

    const interval = window.setInterval(() => {
      if (config.playTick) {
        const useTick = nextTickIsTickRef.current;
        const audio = useTick ? tickTockAudio.tick : tickTockAudio.tock;
        audio.currentTime = 0;
        void audio.play().catch(() => {});
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
  }, [config.playTick, isRunning, mode, playSound, tickTockAudio]);

  useEffect(() => {
    if (isRunning && !previousRunningRef.current) {
      playSound(mode, "start");
    }
    previousRunningRef.current = isRunning;
  }, [isRunning, mode, playSound]);

  useEffect(() => {
    isRunningRef.current = isRunning;
    scheduleReminder();
    return () => {
      clearReminderTimeout();
    };
  }, [clearReminderTimeout, isRunning, scheduleReminder]);

  useEffect(() => {
    if (isRunning && previousModeRef.current !== mode) {
      playSound(mode, "start");
    }
    previousModeRef.current = mode;
  }, [isRunning, mode, playSound]);

  useEffect(() => {
    if (!isConfirmOpen) {
      setPendingMode(null);
      return;
    }
    if (pendingMode && mode === pendingMode) {
      setIsConfirmOpen(false);
    }
  }, [isConfirmOpen, mode, pendingMode]);

  useEffect(() => {
    const api = window.electronAPI?.alwaysOnTop;
    if (!api) return;
    let isActive = true;
    api
      .get()
      .then((value) => {
        if (isActive) {
          setIsAlwaysOnTop(value);
        }
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const api = window.electronAPI?.activeApp;
    if (!api) return;
    let isActive = true;

    const pollActiveApp = async () => {
      try {
        const name = await api.get();
        if (!isActive) return;
        setActiveAppName(name || "Unknown");
      } catch (error) {
        if (isActive) {
          setActiveAppName("Unavailable");
        }
      }
    };

    void pollActiveApp();
    const interval = window.setInterval(pollActiveApp, 1000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const api = window.electronAPI?.activeApp;
    console.log("api", api);
    console.log("api.debug", api?.debug);
    if (!api?.debug) return;
    api
      .debug()
      .then((info) => {
        console.log("Active app debug", info);
      })
      .catch((err) => {
        console.error("Active app debug error", err);
      });
  }, []);

  const formattedTime = useMemo(() => formatTime(remaining), [remaining]);
  const showResume = !isRunning && remaining !== total;
  const primaryLabel = isRunning ? "Pause" : showResume ? "Resume" : "Start";
  const switchLabel = mode === "focus" ? "Break" : "Focus";
  const handleToggle = () => setIsRunning((prev) => !prev);
  const applyModeSwitch = (nextMode: Mode) => {
    setIsRunning(false);
    setMode(nextMode);
    setRemaining(MODES[nextMode].seconds);
  };
  const handleSwitchMode = () => {
    const nextMode: Mode = mode === "focus" ? "break" : "focus";
    if (isRunning || remaining !== total) {
      setPendingMode(nextMode);
      setIsConfirmOpen(true);
      return;
    }
    applyModeSwitch(nextMode);
  };
  const handleConfirmSwitch = () => {
    if (!pendingMode) return;
    applyModeSwitch(pendingMode);
    setIsConfirmOpen(false);
    setPendingMode(null);
  };
  const handleAlwaysOnTop = async (next: boolean) => {
    const api = window.electronAPI?.alwaysOnTop;
    if (!api) return;
    const previous = isAlwaysOnTop;
    setIsAlwaysOnTop(next);
    try {
      const confirmed = await api.set(next);
      setIsAlwaysOnTop(confirmed);
    } catch (error) {
      console.error("Failed to toggle always-on-top", error);
      setIsAlwaysOnTop(previous);
    }
  };
  const handleOpenConfig = async () => {
    const api = window.electronAPI?.config;
    if (!api?.openWindow) return;
    try {
      await api.openWindow();
    } catch (error) {
      console.error("Failed to open config window", error);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white px-4 py-4 text-gray-900">
      <div className="fixed right-3 top-3 z-20 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full bg-white/90 text-gray-600 shadow-sm backdrop-blur"
          onClick={handleOpenConfig}
          disabled={!isConfigAvailable}
          aria-label="Open settings"
        >
          <Settings2 />
        </Button>
        <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-gray-600 shadow-sm backdrop-blur">
          <span>Always on top</span>
          <Switch
            checked={isAlwaysOnTop}
            aria-label="Toggle always on top"
            disabled={!isAlwaysOnTopAvailable}
            onCheckedChange={handleAlwaysOnTop}
          />
        </div>
      </div>

      <section className="flex items-center justify-center pb-3">
        <Live2DStage
          activeAppName={activeAppName}
          showActiveApp={isActiveAppAvailable}
        />
      </section>

      <div className="flex flex-1 flex-col justify-end">
        <section className="text-center">
          <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
            {MODES[mode].label} Timer
          </h2>
          <h1
            className="mt-2 text-[clamp(2.4rem,6.5vw,4rem)] font-semibold leading-none tabular-nums"
            aria-live="polite"
          >
            {formattedTime}
          </h1>
        </section>

        <section className="flex items-center justify-center gap-3 pb-2 pt-4">
          <Button
            className="rounded-full px-6 py-2.5 text-sm font-semibold"
            type="button"
            onClick={handleToggle}
          >
            {primaryLabel}
          </Button>
          <Button
            className="rounded-full px-6 py-2.5 text-sm font-semibold"
            variant="outline"
            type="button"
            onClick={handleSwitchMode}
          >
            {switchLabel}
          </Button>
        </section>
      </div>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="text-left">
          <DialogHeader>
            <DialogTitle>
              Switch to {pendingMode ? MODES[pendingMode].label : switchLabel}{" "}
              timer?
            </DialogTitle>
            <DialogDescription>
              Your current timer progress will be lost if you switch modes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsConfirmOpen(false)}
            >
              Keep {MODES[mode].label}
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={handleConfirmSwitch}
            >
              Switch to {pendingMode ? MODES[pendingMode].label : switchLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ConfigWindow = () => {
  const { config, updateConfig } = useAppConfig();

  return (
    <div className="min-h-screen bg-white px-4 py-5 text-gray-900">
      <header className="space-y-2 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
          Preferences
        </p>
        <h1 className="text-2xl font-semibold">Pomodoro settings</h1>
        <p className="text-sm text-gray-500">
          Changes sync across the timer and this window.
        </p>
      </header>

      <section className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Clock ticking
              </h2>
              <p className="text-xs text-gray-500">
                Play a soft tick while the timer runs.
              </p>
            </div>
            <Switch
              checked={config.playTick}
              aria-label="Toggle clock ticking"
              onCheckedChange={(value) => updateConfig({ playTick: value })}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Voice language
              </h2>
              <p className="text-xs text-gray-500">
                Start and end announcements.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={config.audioLanguage === "en" ? "default" : "outline"}
                onClick={() => updateConfig({ audioLanguage: "en" })}
              >
                English
              </Button>
              <Button
                size="sm"
                variant={config.audioLanguage === "jp" ? "default" : "outline"}
                onClick={() => updateConfig({ audioLanguage: "jp" })}
              >
                Japanese
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const App = () => {
  const isConfigWindow =
    new URLSearchParams(window.location.search).get("window") === "config";
  return isConfigWindow ? <ConfigWindow /> : <TimerWindow />;
};

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
