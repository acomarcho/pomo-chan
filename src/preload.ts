// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";
import type {
  SessionDetail,
  SessionList,
  SessionTransferResult,
} from "./lib/session-types";

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
  focusMinutes: number;
  breakMinutes: number;
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

const history = {
  openWindow: () => ipcRenderer.invoke("history:open"),
};

const sessions = {
  add: (value: {
    startedAt: string;
    endedAt: string;
    focusSeconds?: number | null;
    appUsage?: SessionDetail["appUsage"];
  }) => ipcRenderer.invoke("session:add", value) as Promise<number>,
  list: (value: { page: number; pageSize: number }) =>
    ipcRenderer.invoke("sessions:list", value) as Promise<SessionList>,
  detail: (value: { id: number }) =>
    ipcRenderer.invoke(
      "sessions:detail",
      value,
    ) as Promise<SessionDetail | null>,
  export: () =>
    ipcRenderer.invoke("sessions:export") as Promise<SessionTransferResult>,
  import: () =>
    ipcRenderer.invoke("sessions:import") as Promise<SessionTransferResult>,
};

const sessionDetails = {
  openWindow: (sessionId: number) =>
    ipcRenderer.invoke("session-details:open", sessionId),
};

contextBridge.exposeInMainWorld("electronAPI", {
  alwaysOnTop,
  activeApp,
  config,
  history,
  sessionDetails,
  sessions,
});
