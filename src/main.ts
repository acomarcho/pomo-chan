import { app, BrowserWindow, ipcMain } from "electron";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import started from "electron-squirrel-startup";
import Store from "electron-store";
import { addSession, closeSessionStore, listSessions } from "./session-store";
import {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_FOCUS_MINUTES,
  clampTimerMinutes,
} from "./lib/pomodoro";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;
let historyWindow: BrowserWindow | null = null;

const execFileAsync = promisify(execFile);

type ActiveAppInfo = {
  name: string;
  source?: "lsappinfo";
  error?: string;
};

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

const configStore = new Store<AppConfig>({
  defaults: {
    playTick: false,
    audioLanguage: "jp",
    ambientVolumes: {
      fire: 0,
      rain: 0,
      forest: 0,
    },
    focusMinutes: DEFAULT_FOCUS_MINUTES,
    breakMinutes: DEFAULT_BREAK_MINUTES,
  },
});

const parseLsappinfoName = (output: string) => {
  const match =
    output.match(/"LSDisplayName"="([^"]+)"/) ??
    output.match(/"DisplayName"="([^"]+)"/) ??
    output.match(/"Name"="([^"]+)"/);
  return match?.[1]?.trim() ?? "";
};

const getActiveAppNameFromLsappinfo = async () => {
  try {
    const front = await execFileAsync("lsappinfo", ["front"]);
    const asn = front.stdout.trim().split(/\s+/)[0];
    if (!asn) return "";
    const info = await execFileAsync("lsappinfo", [
      "info",
      "-only",
      "name",
      "-app",
      asn,
    ]);
    return parseLsappinfoName(info.stdout);
  } catch {
    return "";
  }
};

const getActiveAppInfo = async (): Promise<ActiveAppInfo> => {
  if (process.platform !== "darwin") {
    return { name: "" };
  }
  try {
    const name = await getActiveAppNameFromLsappinfo();
    if (name) {
      return { name, source: "lsappinfo" };
    }
    return { name: "", error: "lsappinfo returned empty" };
  } catch (error) {
    return {
      name: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const getConfig = (): AppConfig => {
  return {
    playTick: configStore.get("playTick"),
    audioLanguage: configStore.get("audioLanguage"),
    ambientVolumes: configStore.get("ambientVolumes"),
    focusMinutes: configStore.get("focusMinutes"),
    breakMinutes: configStore.get("breakMinutes"),
  };
};

const broadcastConfig = (config: AppConfig) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("config:changed", config);
    }
  }
};

const syncFloatingWindowAlwaysOnTop = (
  window: BrowserWindow | null,
  shouldFloat: boolean,
) => {
  if (!window || window.isDestroyed()) return;
  if (shouldFloat) {
    window.setAlwaysOnTop(true, "modal-panel");
  } else {
    window.setAlwaysOnTop(false);
  }
};

const syncAuxWindowsAlwaysOnTop = () => {
  const shouldFloat = mainWindow?.isAlwaysOnTop() ?? false;
  syncFloatingWindowAlwaysOnTop(configWindow, shouldFloat);
  syncFloatingWindowAlwaysOnTop(historyWindow, shouldFloat);
};

const loadWindow = (window: BrowserWindow, windowName?: string) => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (windowName) {
      url.searchParams.set("window", windowName);
    }
    window.loadURL(url.toString());
  } else {
    window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      windowName ? { query: { window: windowName } } : undefined,
    );
  }
};

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 360,
    height: 480,
    minWidth: 360,
    minHeight: 480,
    maxWidth: 360,
    maxHeight: 480,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // and load the index.html of the app.
  loadWindow(mainWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

const createConfigWindow = () => {
  if (configWindow && !configWindow.isDestroyed()) {
    syncAuxWindowsAlwaysOnTop();
    configWindow.focus();
    return;
  }

  configWindow = new BrowserWindow({
    width: 360,
    height: 520,
    minWidth: 360,
    minHeight: 520,
    maxWidth: 360,
    maxHeight: 520,
    resizable: false,
    title: "Settings",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  loadWindow(configWindow, "config");
  syncAuxWindowsAlwaysOnTop();

  configWindow.on("closed", () => {
    configWindow = null;
  });
};

const createHistoryWindow = () => {
  if (historyWindow && !historyWindow.isDestroyed()) {
    syncAuxWindowsAlwaysOnTop();
    historyWindow.focus();
    return;
  }

  historyWindow = new BrowserWindow({
    width: 520,
    height: 520,
    minWidth: 420,
    minHeight: 360,
    resizable: true,
    title: "Session History",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  loadWindow(historyWindow, "history");
  syncAuxWindowsAlwaysOnTop();

  historyWindow.on("closed", () => {
    historyWindow = null;
  });
};

ipcMain.handle("always-on-top:get", () => {
  return mainWindow?.isAlwaysOnTop() ?? false;
});

ipcMain.handle("always-on-top:set", (_event, value: boolean) => {
  if (!mainWindow) return false;
  mainWindow.setAlwaysOnTop(Boolean(value), "floating");
  syncAuxWindowsAlwaysOnTop();
  return mainWindow.isAlwaysOnTop();
});

ipcMain.handle("active-app:get", async () => {
  const info = await getActiveAppInfo();
  return info.name;
});

ipcMain.handle("active-app:debug", async () => {
  return getActiveAppInfo();
});

ipcMain.handle("config:get", () => {
  return getConfig();
});

ipcMain.handle("config:set", (_event, value: Partial<AppConfig>) => {
  const current = getConfig();
  const nextFocusMinutes =
    value.focusMinutes === undefined
      ? current.focusMinutes
      : clampTimerMinutes(value.focusMinutes);
  const nextBreakMinutes =
    value.breakMinutes === undefined
      ? current.breakMinutes
      : clampTimerMinutes(value.breakMinutes);
  const nextConfig = {
    ...current,
    ...value,
    focusMinutes: nextFocusMinutes,
    breakMinutes: nextBreakMinutes,
    ambientVolumes: {
      ...current.ambientVolumes,
      ...(value.ambientVolumes ?? {}),
    },
  };
  configStore.set(nextConfig);
  broadcastConfig(nextConfig);
  return nextConfig;
});

ipcMain.handle("config:open", () => {
  createConfigWindow();
  return true;
});

ipcMain.handle("history:open", () => {
  createHistoryWindow();
  return true;
});

ipcMain.handle(
  "session:add",
  (_event, value: { startedAt: string; endedAt: string }) => {
    return addSession(value.startedAt, value.endedAt);
  },
);

ipcMain.handle(
  "sessions:list",
  (_event, value: { page: number; pageSize: number }) => {
    return listSessions(value.page, value.pageSize);
  },
);

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  closeSessionStore();
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
