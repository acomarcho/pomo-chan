import { useCallback, useEffect, useState } from "react";
import { DEFAULT_AMBIENT_VOLUMES, type AmbientSound } from "@/lib/ambient";

export type AppConfig = {
  playTick: boolean;
  audioLanguage: "en" | "jp";
  ambientVolumes: Record<AmbientSound, number>;
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

declare global {
  interface Window {
    electronAPI?: {
      alwaysOnTop?: AlwaysOnTopAPI;
      activeApp?: ActiveAppAPI;
      config?: ConfigAPI;
    };
  }
}

const DEFAULT_CONFIG: AppConfig = {
  playTick: false,
  audioLanguage: "jp",
  ambientVolumes: { ...DEFAULT_AMBIENT_VOLUMES },
};

const mergeAmbientVolumes = (
  volumes?: Partial<Record<AmbientSound, number>>,
) => ({
  ...DEFAULT_AMBIENT_VOLUMES,
  ...(volumes ?? {}),
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
        setConfig({
          ...DEFAULT_CONFIG,
          ...stored,
          ambientVolumes: mergeAmbientVolumes(stored?.ambientVolumes),
        });
      })
      .catch((error) => {
        console.error("Failed to load config", error);
      });

    const unsubscribe = api.onChange?.((value) => {
      if (!isActive) return;
      setConfig({
        ...DEFAULT_CONFIG,
        ...value,
        ambientVolumes: mergeAmbientVolumes(value?.ambientVolumes),
      });
    });

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, [api]);

  const updateConfig = useCallback(
    (value: Partial<AppConfig>) => {
      setConfig((prev) => {
        const nextAmbient = value.ambientVolumes
          ? { ...prev.ambientVolumes, ...value.ambientVolumes }
          : prev.ambientVolumes;
        return { ...prev, ...value, ambientVolumes: nextAmbient };
      });
      if (!api) return;
      api.set(value).catch((error) => {
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

export const useActiveAppName = (pollInterval = 1000) => {
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
      } catch (error) {
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
