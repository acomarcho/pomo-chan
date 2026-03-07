import type { ElectronAPI } from "./shared/electron-contract";

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
