// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";

const alwaysOnTop = {
  get: () => ipcRenderer.invoke("always-on-top:get"),
  set: (value: boolean) => ipcRenderer.invoke("always-on-top:set", value),
};

const activeApp = {
  get: () => ipcRenderer.invoke("active-app:get"),
};

contextBridge.exposeInMainWorld("electronAPI", {
  alwaysOnTop,
  activeApp,
});
