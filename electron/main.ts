import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Store from "electron-store";

const execFileAsync = promisify(execFile);

const getWindowsBinary = app.isPackaged
  ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "get-windows", "main")
  : path.join(app.getAppPath(), "node_modules", "get-windows", "main");

const getActiveWindowNative = async (): Promise<{
  title?: string;
  owner?: { name?: string };
} | null> => {
  try {
    const { stdout } = await execFileAsync(getWindowsBinary);
    if (!stdout.trim()) return null;
    return JSON.parse(stdout);
  } catch {
    return null;
  }
};

const getActiveAppInfo = async (): Promise<ActiveAppInfo> => {
  try {
    const win = await getActiveWindowNative();
    if (!win) {
      return { title: "", ownerName: "" };
    }
    return {
      title: win.title || "",
      ownerName: win.owner?.name || ""
    };
  } catch (error) {
    return {
      title: "",
      ownerName: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
import {
  addSession,
  clearSessions,
  closeSessionStore,
  getSessionFocusSummary,
  getSessionDetail,
  listAllSessions,
  listSessions,
  mergeSessions,
  replaceSessions
} from "./session-store";
import type { SessionAppUsage, SessionImportMode, SessionRecord } from "../src/lib/session-types";
import { DEFAULT_BREAK_MINUTES, DEFAULT_FOCUS_MINUTES, clampTimerMinutes } from "../src/lib/pomodoro";

let mainWindow: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;
let historyWindow: BrowserWindow | null = null;
let sessionDetailsWindow: BrowserWindow | null = null;
let hasActiveFocusSession = false;
let isBypassingCloseConfirmation = false;

type ActiveAppInfo = {
  title: string;
  ownerName: string;
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
      forest: 0
    },
    focusMinutes: DEFAULT_FOCUS_MINUTES,
    breakMinutes: DEFAULT_BREAK_MINUTES
  }
});

const getConfig = (): AppConfig => {
  return {
    playTick: configStore.get("playTick"),
    audioLanguage: configStore.get("audioLanguage"),
    ambientVolumes: configStore.get("ambientVolumes"),
    focusMinutes: configStore.get("focusMinutes"),
    breakMinutes: configStore.get("breakMinutes")
  };
};

const broadcastConfig = (config: AppConfig) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("config:changed", config);
    }
  }
};

const syncFloatingWindowAlwaysOnTop = (window: BrowserWindow | null, shouldFloat: boolean) => {
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

const getDialogParent = () => historyWindow ?? mainWindow ?? BrowserWindow.getFocusedWindow();

const loadWindow = (window: BrowserWindow, windowName?: string, query: Record<string, string> = {}) => {
  const queryParams = { ...query };
  if (windowName) {
    queryParams.window = windowName;
  }
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    window.loadURL(url.toString());
  } else {
    const hasQuery = Object.keys(queryParams).length > 0;
    window.loadFile(path.join(__dirname, `../dist/index.html`), hasQuery ? { query: queryParams } : undefined);
  }
};

const showCloseConfirmationDialog = async (window: BrowserWindow) => {
  const { response } = await dialog.showMessageBox(window, {
    type: "warning",
    buttons: ["Keep Session", "Quit"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: "Quit Pomo-chan?",
    message: "A focus session is currently running or paused.",
    detail: "If you quit now, your in-progress focus session will be lost. Do you want to quit anyway?"
  });

  return response === 1;
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 500,
    minWidth: 360,
    minHeight: 500,
    maxWidth: 360,
    maxHeight: 500,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  loadWindow(mainWindow);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("close", (event) => {
    if (isBypassingCloseConfirmation || !hasActiveFocusSession) {
      return;
    }

    event.preventDefault();
    const window = mainWindow;
    if (!window || window.isDestroyed()) {
      return;
    }

    void (async () => {
      const shouldClose = await showCloseConfirmationDialog(window);
      if (!shouldClose) {
        return;
      }

      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }

      isBypassingCloseConfirmation = true;
      mainWindow.close();
    })();
  });

  mainWindow.on("closed", () => {
    hasActiveFocusSession = false;
    isBypassingCloseConfirmation = false;
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
      preload: path.join(__dirname, "preload.js")
    }
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
      preload: path.join(__dirname, "preload.js")
    }
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
      sessionId: String(safeId)
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
      preload: path.join(__dirname, "preload.js")
    }
  });

  loadWindow(sessionDetailsWindow, "session-details", {
    sessionId: String(safeId)
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
  return { title: info.title, ownerName: info.ownerName };
});

ipcMain.handle("active-app:debug", async () => {
  return getActiveAppInfo();
});

ipcMain.on("focus-session:set-active", (event, isActive: boolean) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow || senderWindow !== mainWindow) {
    return;
  }
  hasActiveFocusSession = Boolean(isActive);
});

ipcMain.handle("config:get", () => {
  return getConfig();
});

ipcMain.handle("config:set", (_event, value: Partial<AppConfig>) => {
  const current = getConfig();
  const nextFocusMinutes = value.focusMinutes === undefined ? current.focusMinutes : clampTimerMinutes(value.focusMinutes);
  const nextBreakMinutes = value.breakMinutes === undefined ? current.breakMinutes : clampTimerMinutes(value.breakMinutes);
  const nextConfig = {
    ...current,
    ...value,
    focusMinutes: nextFocusMinutes,
    breakMinutes: nextBreakMinutes,
    ambientVolumes: {
      ...current.ambientVolumes,
      ...(value.ambientVolumes ?? {})
    }
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

ipcMain.handle("sessions:list", (_event, value: { page: number; pageSize: number }) => {
  return listSessions(value.page, value.pageSize);
});

ipcMain.handle("sessions:detail", (_event, value: { id: number }) => {
  return getSessionDetail(value.id);
});

ipcMain.handle("sessions:summary", () => {
  return getSessionFocusSummary();
});

ipcMain.handle("sessions:clear", () => {
  try {
    const count = clearSessions();
    return { ok: true, count } as const;
  } catch (error) {
    console.error("Failed to clear sessions", error);
    return { ok: false, reason: "write-failed" } as const;
  }
});

const extractSessionRecords = (payload: unknown): { records: SessionRecord[]; recognized: boolean; sourceCount: number } => {
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
      if (typeof candidate.startedAt !== "string" || typeof candidate.endedAt !== "string") {
        return null;
      }
      const focusSeconds =
        typeof candidate.focusSeconds === "number" && Number.isFinite(candidate.focusSeconds)
          ? candidate.focusSeconds
          : undefined;
      const appUsage = Array.isArray(candidate.appUsage)
        ? (candidate.appUsage
            .map((segment) => {
              if (!segment || typeof segment !== "object") return null;
              const usageCandidate = segment as {
                appName?: unknown;
                windowTitle?: unknown;
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
                windowTitle:
                  typeof usageCandidate.windowTitle === "string" && usageCandidate.windowTitle.trim().length > 0
                    ? usageCandidate.windowTitle
                    : null,
                startedAt: usageCandidate.startedAt,
                endedAt: usageCandidate.endedAt
              } satisfies SessionAppUsage;
            })
            .filter(Boolean) as SessionAppUsage[])
        : undefined;
      return {
        startedAt: candidate.startedAt,
        endedAt: candidate.endedAt,
        focusSeconds,
        appUsage
      };
    })
    .filter(Boolean) as SessionRecord[];

  return {
    records,
    recognized: true,
    sourceCount: root.sessions.length
  };
};

ipcMain.handle("sessions:export", async () => {
  const parent = getDialogParent();
  const now = new Date();
  const padded = (value: number) => String(value).padStart(2, "0");
  const timestamp = `${now.getFullYear()}${padded(now.getMonth() + 1)}${padded(
    now.getDate()
  )}-${padded(now.getHours())}${padded(now.getMinutes())}${padded(now.getSeconds())}`;
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: "Export sessions",
    defaultPath: path.join(app.getPath("downloads"), `pomo-chan-sessions-${timestamp}.json`),
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (canceled || !filePath) {
    return { ok: false, reason: "canceled" } as const;
  }

  const sessions = listAllSessions();
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    sessions
  };

  try {
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return { ok: true, count: sessions.length, filePath } as const;
  } catch (error) {
    console.error("Failed to export sessions", error);
    return { ok: false, reason: "write-failed" } as const;
  }
});

ipcMain.handle("sessions:import", async (_event, options?: { mode?: SessionImportMode }) => {
  const parent = getDialogParent();
  const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
    title: "Import sessions",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
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

  const mode = options?.mode === "overwrite" ? "overwrite" : "merge";
  try {
    let count = 0;
    if (mode === "overwrite") {
      replaceSessions(records);
      count = records.length;
    } else {
      count = mergeSessions(records);
    }
    return { ok: true, count } as const;
  } catch (error) {
    console.error("Failed to import sessions", error);
    return { ok: false, reason: "write-failed" } as const;
  }
});

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  closeSessionStore();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
