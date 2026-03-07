import { contextBridge, ipcRenderer } from "electron";
import type { ElectronAPI, IpcInvokeContract, IpcRendererEventContract, IpcSendContract } from "../src/shared/electron-contract";
import { IPC } from "../src/shared/electron-contract";

const invoke = <Channel extends keyof IpcInvokeContract>(
  channel: Channel,
  ...args: IpcInvokeContract[Channel]["args"]
): Promise<IpcInvokeContract[Channel]["return"]> => {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcInvokeContract[Channel]["return"]>;
};

const send = <Channel extends keyof IpcSendContract>(channel: Channel, ...args: IpcSendContract[Channel]) => {
  ipcRenderer.send(channel, ...args);
};

const on = <Channel extends keyof IpcRendererEventContract>(
  channel: Channel,
  callback: (...args: IpcRendererEventContract[Channel]) => void
) => {
  const handler = (_event: Electron.IpcRendererEvent, ...args: IpcRendererEventContract[Channel]) => {
    callback(...args);
  };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
};

const electronAPI: ElectronAPI = {
  alwaysOnTop: {
    get: () => invoke(IPC.alwaysOnTop.get),
    set: (value: boolean) => invoke(IPC.alwaysOnTop.set, value)
  },
  activeApp: {
    get: () => invoke(IPC.activeApp.get),
    debug: () => invoke(IPC.activeApp.debug)
  },
  config: {
    get: () => invoke(IPC.config.get),
    set: (value) => invoke(IPC.config.set, value),
    onChange: (callback) => on(IPC.config.changed, callback),
    openWindow: () => invoke(IPC.config.open)
  },
  history: {
    openWindow: () => invoke(IPC.history.open)
  },
  focusSession: {
    setActive: (value) => send(IPC.focusSession.setActive, value)
  },
  sessions: {
    add: (value) => invoke(IPC.sessions.add, value),
    list: (value) => invoke(IPC.sessions.list, value),
    detail: (value) => invoke(IPC.sessions.detail, value),
    summary: () => invoke(IPC.sessions.summary),
    export: () => invoke(IPC.sessions.export),
    import: (value) => invoke(IPC.sessions.import, value),
    delete: (value) => invoke(IPC.sessions.delete, value),
    clear: () => invoke(IPC.sessions.clear)
  },
  sessionDetails: {
    openWindow: (sessionId: number) => invoke(IPC.sessionDetails.open, sessionId)
  }
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
