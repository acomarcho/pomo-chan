import { useCallback, useEffect, useState } from "react";
import { DEFAULT_AMBIENT_VOLUMES, type AmbientSound } from "@/lib/ambient";
import {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_FOCUS_MINUTES,
  clampTimerMinutes,
} from "@/lib/pomodoro";

export type AppConfig = {
  playTick: boolean;
  audioLanguage: "en" | "jp";
  ambientVolumes: Record<AmbientSound, number>;
  focusMinutes: number;
  breakMinutes: number;
};

type AlwaysOnTopAPI = {
  get: () => Promise<boolean>;
  set: (value: boolean) => Promise<boolean>;
};

type ActiveAppAPI = {
  get: () => Promise<string>;
  debug?: () => Promise<unknown>;
};

type ConfigAPI = {
  get: () => Promise<AppConfig>;
  set: (value: Partial<AppConfig>) => Promise<AppConfig>;
  onChange?: (callback: (value: AppConfig) => void) => () => void;
  openWindow?: () => Promise<boolean>;
};

type SessionEntry = {
  id: number;
  startedAt: string;
  endedAt: string;
  focusSeconds?: number | null;
  hasUsage?: boolean;
};

type SessionAppUsage = {
  appName: string;
  startedAt: string;
  endedAt: string;
};

type SessionDetail = {
  id: number;
  startedAt: string;
  endedAt: string;
  focusSeconds?: number | null;
  appUsage: SessionAppUsage[];
};

type SessionList = {
  items: SessionEntry[];
  total: number;
};

type SessionTransferResult = {
  ok: boolean;
  count?: number;
  filePath?: string;
  reason?: "canceled" | "invalid-format" | "read-failed" | "write-failed";
};

type SessionAPI = {
  add?: (value: {
    startedAt: string;
    endedAt: string;
    focusSeconds?: number | null;
    appUsage?: SessionAppUsage[];
  }) => Promise<number>;
  list?: (value: { page: number; pageSize: number }) => Promise<SessionList>;
  detail?: (value: { id: number }) => Promise<SessionDetail | null>;
  export?: () => Promise<SessionTransferResult>;
  import?: () => Promise<SessionTransferResult>;
};

type HistoryAPI = {
  openWindow?: () => Promise<boolean>;
};

type SessionDetailsAPI = {
  openWindow?: (sessionId: number) => Promise<boolean>;
};

declare global {
  interface Window {
    electronAPI?: {
      alwaysOnTop?: AlwaysOnTopAPI;
      activeApp?: ActiveAppAPI;
      config?: ConfigAPI;
      history?: HistoryAPI;
      sessionDetails?: SessionDetailsAPI;
      sessions?: SessionAPI;
    };
  }
}

const DEFAULT_CONFIG: AppConfig = {
  playTick: false,
  audioLanguage: "jp",
  ambientVolumes: { ...DEFAULT_AMBIENT_VOLUMES },
  focusMinutes: DEFAULT_FOCUS_MINUTES,
  breakMinutes: DEFAULT_BREAK_MINUTES,
};

const mergeAmbientVolumes = (
  volumes?: Partial<Record<AmbientSound, number>>,
) => ({
  ...DEFAULT_AMBIENT_VOLUMES,
  ...(volumes ?? {}),
});

const normalizeConfig = (value?: Partial<AppConfig>): AppConfig => ({
  ...DEFAULT_CONFIG,
  ...value,
  focusMinutes: clampTimerMinutes(value?.focusMinutes ?? DEFAULT_FOCUS_MINUTES),
  breakMinutes: clampTimerMinutes(value?.breakMinutes ?? DEFAULT_BREAK_MINUTES),
  ambientVolumes: mergeAmbientVolumes(value?.ambientVolumes),
});

export const useAppConfig = () => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const api = window.electronAPI?.config;

  useEffect(() => {
    if (!api) return;
    let isActive = true;

    api
      .get()
      .then((stored) => {
        if (!isActive) return;
        setConfig(normalizeConfig(stored));
      })
      .catch((error) => {
        console.error("Failed to load config", error);
      });

    const unsubscribe = api.onChange?.((value) => {
      if (!isActive) return;
      setConfig(normalizeConfig(value));
    });

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, [api]);

  const updateConfig = useCallback(
    (value: Partial<AppConfig>) => {
      const sanitized: Partial<AppConfig> = { ...value };
      if (value.focusMinutes !== undefined) {
        sanitized.focusMinutes = clampTimerMinutes(value.focusMinutes);
      }
      if (value.breakMinutes !== undefined) {
        sanitized.breakMinutes = clampTimerMinutes(value.breakMinutes);
      }
      setConfig((prev) => {
        const nextAmbient = sanitized.ambientVolumes
          ? { ...prev.ambientVolumes, ...sanitized.ambientVolumes }
          : prev.ambientVolumes;
        return { ...prev, ...sanitized, ambientVolumes: nextAmbient };
      });
      if (!api) return;
      api.set(sanitized).catch((error) => {
        console.error("Failed to update config", error);
      });
    },
    [api],
  );

  return { config, updateConfig, hasApi: Boolean(api) };
};

export const useAlwaysOnTop = () => {
  const api = window.electronAPI?.alwaysOnTop;
  const [value, setValue] = useState(false);

  useEffect(() => {
    if (!api) return;
    let isActive = true;
    api
      .get()
      .then((nextValue) => {
        if (isActive) {
          setValue(nextValue);
        }
      })
      .catch((error) => {
        console.error("Failed to read always-on-top", error);
      });
    return () => {
      isActive = false;
    };
  }, [api]);

  const setAlwaysOnTop = useCallback(
    async (next: boolean) => {
      if (!api) return;
      const previous = value;
      setValue(next);
      try {
        const confirmed = await api.set(next);
        setValue(confirmed);
      } catch (error) {
        console.error("Failed to toggle always-on-top", error);
        setValue(previous);
      }
    },
    [api, value],
  );

  return { value, setValue: setAlwaysOnTop, isAvailable: Boolean(api) };
};

export const ACTIVE_APP_POLL_INTERVAL_MS = 1000;

export const useActiveAppName = (
  pollInterval = ACTIVE_APP_POLL_INTERVAL_MS,
) => {
  const api = window.electronAPI?.activeApp;
  const [name, setName] = useState("");

  useEffect(() => {
    if (!api) return;
    let isActive = true;

    const pollActiveApp = async () => {
      try {
        const nextName = await api.get();
        if (!isActive) return;
        setName(nextName || "Unknown");
      } catch {
        if (isActive) {
          setName("Unavailable");
        }
      }
    };

    void pollActiveApp();
    const interval = window.setInterval(pollActiveApp, pollInterval);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [api, pollInterval]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
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
  }, [api]);

  return { name, isAvailable: Boolean(api) };
};

export const useConfigWindowOpener = () => {
  const api = window.electronAPI?.config;
  const isAvailable = Boolean(api?.openWindow);

  const openConfigWindow = useCallback(async () => {
    if (!api?.openWindow) return;
    try {
      await api.openWindow();
    } catch (error) {
      console.error("Failed to open config window", error);
    }
  }, [api]);

  return { openConfigWindow, isAvailable };
};

export const useHistoryWindowOpener = () => {
  const api = window.electronAPI?.history;
  const isAvailable = Boolean(api?.openWindow);

  const openHistoryWindow = useCallback(async () => {
    if (!api?.openWindow) return;
    try {
      await api.openWindow();
    } catch (error) {
      console.error("Failed to open history window", error);
    }
  }, [api]);

  return { openHistoryWindow, isAvailable };
};

export const useSessionDetailsWindowOpener = () => {
  const api = window.electronAPI?.sessionDetails;
  const isAvailable = Boolean(api?.openWindow);

  const openSessionDetailsWindow = useCallback(
    async (sessionId: number) => {
      if (!api?.openWindow) return;
      try {
        await api.openWindow(sessionId);
      } catch (error) {
        console.error("Failed to open session details window", error);
      }
    },
    [api],
  );

  return { openSessionDetailsWindow, isAvailable };
};
