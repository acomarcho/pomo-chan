import { app, BrowserWindow, dialog, ipcMain, screen, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import Store from "electron-store";
import { log } from "./logger";
import type { AppConfig, IpcInvokeContract, IpcRendererEventContract, IpcSendContract } from "../src/shared/electron-contract";
import { IPC } from "../src/shared/electron-contract";

const activeWindowBinary = app.isPackaged
  ? path.join(process.resourcesPath, "active-window")
  : path.join(app.getAppPath(), "native", "active-window");

let activeWindowProc: ChildProcess | null = null;
let activeWindowPending = false;
const responseQueue: Array<(line: string) => void> = [];

const killActiveWindowProc = () => {
  activeWindowProc?.kill();
  activeWindowProc = null;
  activeWindowPending = false;
  for (const resolve of responseQueue.splice(0)) {
    resolve("");
  }
};

const spawnActiveWindowProc = (): Promise<{ screenRecording: boolean }> => {
  if (activeWindowProc) return Promise.resolve({ screenRecording: true });

  return new Promise((resolveStatus) => {
    try {
      const proc = spawn(activeWindowBinary, { stdio: ["pipe", "pipe", "pipe"] });
      activeWindowProc = proc;

      let gotStatus = false;
      const rl = createInterface({ input: proc.stdout! });
      rl.on("line", (line) => {
        if (!gotStatus) {
          gotStatus = true;
          try {
            const status = JSON.parse(line);
            resolveStatus({ screenRecording: Boolean(status.screenRecording) });
          } catch {
            resolveStatus({ screenRecording: false });
          }
          return;
        }
        const resolve = responseQueue.shift();
        if (resolve) resolve(line);
      });

      proc.stderr!.on("data", (chunk: Buffer) => {
        log.warn("active-window stderr", chunk.toString().trim());
      });

      proc.on("exit", (code, signal) => {
        log.warn("active-window process exited", { code, signal });
        killActiveWindowProc();
        if (!gotStatus) resolveStatus({ screenRecording: false });
      });

      proc.on("error", (error) => {
        log.error("active-window process error", error);
        killActiveWindowProc();
        if (!gotStatus) resolveStatus({ screenRecording: false });
      });

      log.info("active-window process spawned");
    } catch (error) {
      log.error("Failed to spawn active-window process", error);
      resolveStatus({ screenRecording: false });
    }
  });
};

const getActiveWindowNative = async (): Promise<{
  title?: string;
  owner?: { name?: string };
} | null> => {
  if (activeWindowPending) return null;
  if (!activeWindowProc) {
    await spawnActiveWindowProc();
    if (!activeWindowProc) return null;
  }

  activeWindowPending = true;
  try {
    const line = await new Promise<string>((resolve) => {
      const timeout = setTimeout(() => {
        const idx = responseQueue.indexOf(resolve);
        if (idx !== -1) responseQueue.splice(idx, 1);
        resolve("");
      }, 5000);

      responseQueue.push((data) => {
        clearTimeout(timeout);
        resolve(data);
      });

      activeWindowProc!.stdin!.write("\n");
    });

    if (!line.trim() || line.trim() === "null") return null;
    return JSON.parse(line);
  } catch (error) {
    log.error("active-window query failed", error);
    killActiveWindowProc();
    return null;
  } finally {
    activeWindowPending = false;
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
    log.error("getActiveAppInfo failed", error);
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
  deleteSession,
  getSessionFocusSummary,
  getSessionDetail,
  listAllSessions,
  listSessions,
  mergeSessions,
  replaceSessions
} from "./session-store";
import type { SessionAppUsage, SessionRecord } from "../src/lib/session-types";
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

const handle = <Channel extends keyof IpcInvokeContract>(
  channel: Channel,
  listener: (
    event: Electron.IpcMainInvokeEvent,
    ...args: IpcInvokeContract[Channel]["args"]
  ) => IpcInvokeContract[Channel]["return"] | Promise<IpcInvokeContract[Channel]["return"]>
) => {
  ipcMain.handle(channel, listener as (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown);
};

const onIpc = <Channel extends keyof IpcSendContract>(
  channel: Channel,
  listener: (event: Electron.IpcMainEvent, ...args: IpcSendContract[Channel]) => void
) => {
  ipcMain.on(channel, listener as (event: Electron.IpcMainEvent, ...args: unknown[]) => void);
};

const sendToWindow = <Channel extends keyof IpcRendererEventContract>(
  window: BrowserWindow,
  channel: Channel,
  ...args: IpcRendererEventContract[Channel]
) => {
  window.webContents.send(channel, ...args);
};

const broadcastConfig = (config: AppConfig) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      sendToWindow(window, IPC.config.changed, config);
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

handle(IPC.alwaysOnTop.get, () => {
  return mainWindow?.isAlwaysOnTop() ?? false;
});

handle(IPC.alwaysOnTop.set, (_event, value) => {
  if (!mainWindow) return false;
  mainWindow.setAlwaysOnTop(Boolean(value), "floating");
  syncAuxWindowsAlwaysOnTop();
  return mainWindow.isAlwaysOnTop();
});

handle(IPC.activeApp.get, async () => {
  const info = await getActiveAppInfo();
  return { title: info.title, ownerName: info.ownerName };
});

handle(IPC.activeApp.debug, async () => {
  return getActiveAppInfo();
});

onIpc(IPC.focusSession.setActive, (event, isActive) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow || senderWindow !== mainWindow) {
    return;
  }
  hasActiveFocusSession = Boolean(isActive);
});

handle(IPC.config.get, () => {
  return getConfig();
});

handle(IPC.config.set, (_event, value) => {
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

handle(IPC.config.open, () => {
  createConfigWindow();
  return true;
});

handle(IPC.history.open, () => {
  createHistoryWindow();
  return true;
});

handle(IPC.sessionDetails.open, (_event, sessionId) => {
  createSessionDetailsWindow(sessionId);
  return true;
});

handle(IPC.sessions.add, (_event, value) => {
  return addSession(value);
});

handle(IPC.sessions.list, (_event, value) => {
  return listSessions(value.page, value.pageSize, { startDate: value.startDate, endDate: value.endDate });
});

handle(IPC.sessions.detail, (_event, value) => {
  return getSessionDetail(value.id);
});

handle(IPC.sessions.summary, () => {
  return getSessionFocusSummary();
});

handle(IPC.sessions.delete, (_event, value) => {
  deleteSession(value.id);
  return { ok: true };
});

handle(IPC.sessions.clear, () => {
  try {
    const count = clearSessions();
    return { ok: true, count } as const;
  } catch (error) {
    log.error("Failed to clear sessions", error);
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

handle(IPC.sessions.export, async () => {
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
    log.error("Failed to export sessions", error);
    return { ok: false, reason: "write-failed" } as const;
  }
});

handle(IPC.sessions.import, async (_event, options) => {
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
    log.error("Failed to read sessions file", error);
    return { ok: false, reason: "read-failed" } as const;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    log.error("Failed to parse sessions file", error);
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
    log.error("Failed to import sessions", error);
    return { ok: false, reason: "write-failed" } as const;
  }
});

app.on("ready", () => {
  log.info("App started", {
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch
  });

  createWindow();

  // Spawn the active window binary and check permissions
  spawnActiveWindowProc().then(({ screenRecording }) => {
    log.info("active-window permissions", { screenRecording });
    if (!screenRecording && mainWindow && !mainWindow.isDestroyed()) {
      dialog
        .showMessageBox(mainWindow, {
          type: "info",
          buttons: ["Open System Settings", "Later"],
          defaultId: 0,
          cancelId: 1,
          title: "Screen Recording Permission",
          message: "Pomo-chan needs Screen Recording permission to detect active window titles.",
          detail:
            "Without this permission, the app can still detect which app is active, but window titles will be empty.\n\nGo to System Settings → Privacy & Security → Screen Recording and enable Pomo-chan."
        })
        .then(({ response }) => {
          if (response === 0) {
            shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
          }
        });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  log.info("App quitting");
  killActiveWindowProc();
  closeSessionStore();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
