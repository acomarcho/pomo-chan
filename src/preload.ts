// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";

type AudioLanguage = "en" | "jp";
type AmbientVolumes = {
  fire: number;
  rain: number;
  forest: number;
};

type AppConfig = {
  playTick: boolean;
  audioLanguage: AudioLanguage;
  ambientVolumes: AmbientVolumes;
};

const alwaysOnTop = {
  get: () => ipcRenderer.invoke("always-on-top:get"),
  set: (value: boolean) => ipcRenderer.invoke("always-on-top:set", value),
};

const activeApp = {
  get: () => ipcRenderer.invoke("active-app:get"),
  debug: () => ipcRenderer.invoke("active-app:debug"),
};

const config = {
  get: () => ipcRenderer.invoke("config:get") as Promise<AppConfig>,
  set: (value: Partial<AppConfig>) =>
    ipcRenderer.invoke("config:set", value) as Promise<AppConfig>,
  onChange: (callback: (value: AppConfig) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: AppConfig) => {
      callback(value);
    };
    ipcRenderer.on("config:changed", handler);
    return () => ipcRenderer.off("config:changed", handler);
  },
  openWindow: () => ipcRenderer.invoke("config:open"),
};

contextBridge.exposeInMainWorld("electronAPI", {
  alwaysOnTop,
  activeApp,
  config,
});
