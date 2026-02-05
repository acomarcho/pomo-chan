import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import started from "electron-squirrel-startup";
import Store from "electron-store";
import {
  addSession,
  closeSessionStore,
  getSessionFocusSummary,
  getSessionDetail,
  listAllSessions,
  listSessions,
  replaceSessions,
} from "./session-store";
import type { SessionAppUsage, SessionRecord } from "./lib/session-types";
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
let sessionDetailsWindow: BrowserWindow | null = null;

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

// Keep all auxiliary windows in sync with the main always-on-top state.
const syncAuxWindowsAlwaysOnTop = () => {
  const shouldFloat = mainWindow?.isAlwaysOnTop() ?? false;
  syncFloatingWindowAlwaysOnTop(configWindow, shouldFloat);
  syncFloatingWindowAlwaysOnTop(historyWindow, shouldFloat);
  syncFloatingWindowAlwaysOnTop(sessionDetailsWindow, shouldFloat);
};

const getOffsetPositionFromMain = (size: { width: number; height: number }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return undefined;
  const offset = 24;
  const mainBounds = mainWindow.getBounds();
  const workArea = screen.getDisplayMatching(mainBounds).workArea;
  const maxX = workArea.x + workArea.width - size.width;
  const maxY = workArea.y + workArea.height - size.height;
  const x = Math.min(Math.max(mainBounds.x + offset, workArea.x), maxX);
  const y = Math.min(Math.max(mainBounds.y + offset, workArea.y), maxY);
  return { x, y };
};

const getDialogParent = () =>
  historyWindow ?? mainWindow ?? BrowserWindow.getFocusedWindow();

const loadWindow = (
  window: BrowserWindow,
  windowName?: string,
  query: Record<string, string> = {},
) => {
  const queryParams = { ...query };
  if (windowName) {
    queryParams.window = windowName;
  }
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    window.loadURL(url.toString());
  } else {
    const hasQuery = Object.keys(queryParams).length > 0;
    window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      hasQuery ? { query: queryParams } : undefined,
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

  const size = { width: 360, height: 520 };
  const position = getOffsetPositionFromMain(size);
  configWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: size.width,
    minHeight: size.height,
    maxWidth: size.width,
    maxHeight: size.height,
    ...(position ?? {}),
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

  const size = { width: 720, height: 680 };
  const position = getOffsetPositionFromMain(size);
  historyWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: 720,
    minHeight: 520,
    ...(position ?? {}),
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

const createSessionDetailsWindow = (sessionId: number) => {
  const safeId = Number(sessionId);
  if (!Number.isFinite(safeId)) return;

  if (sessionDetailsWindow && !sessionDetailsWindow.isDestroyed()) {
    syncAuxWindowsAlwaysOnTop();
    loadWindow(sessionDetailsWindow, "session-details", {
      sessionId: String(safeId),
    });
    sessionDetailsWindow.focus();
    return;
  }

  const size = { width: 720, height: 640 };
  const position = getOffsetPositionFromMain(size);
  sessionDetailsWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: 520,
    minHeight: 420,
    ...(position ?? {}),
    resizable: true,
    title: "Session Details",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  loadWindow(sessionDetailsWindow, "session-details", {
    sessionId: String(safeId),
  });
  syncAuxWindowsAlwaysOnTop();

  sessionDetailsWindow.on("closed", () => {
    sessionDetailsWindow = null;
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

ipcMain.handle("session-details:open", (_event, sessionId: number) => {
  createSessionDetailsWindow(sessionId);
  return true;
});

ipcMain.handle("session:add", (_event, value: SessionRecord) => {
  return addSession(value);
});

ipcMain.handle(
  "sessions:list",
  (_event, value: { page: number; pageSize: number }) => {
    return listSessions(value.page, value.pageSize);
  },
);

ipcMain.handle("sessions:detail", (_event, value: { id: number }) => {
  return getSessionDetail(value.id);
});

ipcMain.handle("sessions:summary", () => {
  return getSessionFocusSummary();
});

const extractSessionRecords = (
  payload: unknown,
): { records: SessionRecord[]; recognized: boolean; sourceCount: number } => {
  if (!payload || typeof payload !== "object") {
    return { records: [], recognized: false, sourceCount: 0 };
  }

  const root = payload as { sessions?: unknown };
  if (!Array.isArray(root.sessions)) {
    return { records: [], recognized: false, sourceCount: 0 };
  }

  const records = root.sessions
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as {
        startedAt?: unknown;
        endedAt?: unknown;
        focusSeconds?: unknown;
        appUsage?: unknown;
      };
      if (
        typeof candidate.startedAt !== "string" ||
        typeof candidate.endedAt !== "string"
      ) {
        return null;
      }
      const focusSeconds =
        typeof candidate.focusSeconds === "number" &&
        Number.isFinite(candidate.focusSeconds)
          ? candidate.focusSeconds
          : undefined;
      const appUsage = Array.isArray(candidate.appUsage)
        ? (candidate.appUsage
            .map((segment) => {
              if (!segment || typeof segment !== "object") return null;
              const usageCandidate = segment as {
                appName?: unknown;
                startedAt?: unknown;
                endedAt?: unknown;
              };
              if (
                typeof usageCandidate.appName !== "string" ||
                typeof usageCandidate.startedAt !== "string" ||
                typeof usageCandidate.endedAt !== "string"
              ) {
                return null;
              }
              return {
                appName: usageCandidate.appName,
                startedAt: usageCandidate.startedAt,
                endedAt: usageCandidate.endedAt,
              } satisfies SessionAppUsage;
            })
            .filter(Boolean) as SessionAppUsage[])
        : undefined;
      return {
        startedAt: candidate.startedAt,
        endedAt: candidate.endedAt,
        focusSeconds,
        appUsage,
      };
    })
    .filter(Boolean) as SessionRecord[];

  return {
    records,
    recognized: true,
    sourceCount: root.sessions.length,
  };
};

ipcMain.handle("sessions:export", async () => {
  const parent = getDialogParent();
  const now = new Date();
  const padded = (value: number) => String(value).padStart(2, "0");
  const timestamp = `${now.getFullYear()}${padded(now.getMonth() + 1)}${padded(
    now.getDate(),
  )}-${padded(now.getHours())}${padded(now.getMinutes())}${padded(
    now.getSeconds(),
  )}`;
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: "Export sessions",
    defaultPath: path.join(
      app.getPath("downloads"),
      `pomo-chan-sessions-${timestamp}.json`,
    ),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (canceled || !filePath) {
    return { ok: false, reason: "canceled" } as const;
  }

  const sessions = listAllSessions();
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    sessions,
  };

  try {
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return { ok: true, count: sessions.length, filePath } as const;
  } catch (error) {
    console.error("Failed to export sessions", error);
    return { ok: false, reason: "write-failed" } as const;
  }
});

ipcMain.handle("sessions:import", async () => {
  const parent = getDialogParent();
  const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
    title: "Import sessions",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (canceled || filePaths.length === 0) {
    return { ok: false, reason: "canceled" } as const;
  }

  let raw = "";
  try {
    raw = await fs.readFile(filePaths[0], "utf8");
  } catch (error) {
    console.error("Failed to read sessions file", error);
    return { ok: false, reason: "read-failed" } as const;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("Failed to parse sessions file", error);
    return { ok: false, reason: "invalid-format" } as const;
  }

  const { records, recognized, sourceCount } = extractSessionRecords(parsed);
  if (!recognized || (sourceCount > 0 && records.length === 0)) {
    return { ok: false, reason: "invalid-format" } as const;
  }

  try {
    replaceSessions(records);
    return { ok: true, count: records.length } as const;
  } catch (error) {
    console.error("Failed to import sessions", error);
    return { ok: false, reason: "write-failed" } as const;
  }
});

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
